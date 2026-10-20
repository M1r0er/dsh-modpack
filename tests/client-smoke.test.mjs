import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

/** 极简 React 替身：只为验证模块能否加载、apply 能否注册设置页、Panel 首帧能否渲染。 */
function makeReact() {
  const createElement = (type, props, ...children) => ({ type, props: { ...(props || {}), children } });
  const hooks = [];
  let cursor = 0;
  const reset = () => {
    cursor = 0;
  };
  const React = {
    createElement,
    Component: class Component {
      constructor(props) {
        this.props = props;
      }
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (next) => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect() {
      cursor += 1;
    },
    useMemo(factory) {
      cursor += 1;
      return factory();
    },
    useCallback(fn) {
      cursor += 1;
      return fn;
    },
  };
  return { React, reset };
}

test('client.js：模块可加载、apply 注册 settings.section、Panel 首帧可渲染', async () => {
  const { React, reset } = makeReact();
  let definition = null;
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  };
  const nav = { language: 'zh-CN', clipboard: { writeText: async () => {} } };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      profile: 'desktop',
      dshVersion: '0.2.1-rc.2',
      outDir: 'C:/Users/x/.dsh/modpacks',
      plugins: [
        { name: 'dsh-ops', version: '0.3.0', spec: 'dsh-ops@0.3.0', installable: true, local: false, enabled: true, rows: [] },
        { name: 'local-x', version: '1.0.0', spec: 'link:D:/x', installable: false, local: true, enabled: true, rows: [] },
        {
          name: 'dsh-workspace-gate',
          version: '0.1.1',
          spec: 'dsh-workspace-gate@0.1.1',
          installable: true,
          local: true,
          published: true,
          enabled: true,
          rows: [],
        },
      ],
      stats: { total: 3, installable: 2, local: 2 },
    }),
  });

  // 在隔离的 VM 里执行，避免污染全局；window 通过参数注入
  const { runInNewContext } = await import('node:vm');
  runInNewContext(source, {
    window: globalThis.window,
    navigator: nav,
    fetch: globalThis.fetch,
    console,
    setTimeout,
    clearTimeout,
    document: undefined,
  });

  assert.ok(definition, '调用了 __ModuleLoader__.load');
  assert.equal(definition.id, 'dsh-modpack');
  const mod = definition.factory((id) => {
    if (id === 'react') return React;
    throw new Error(`unexpected require: ${id}`);
  });
  assert.equal(mod.name, 'modpack');
  assert.equal(typeof mod.isShareable, 'function');

  // 勾选可行性：本地链接只有在 npm 同版本已发布时才可选（本次修复的核心回归点）
  assert.equal(mod.isShareable({ name: 'dsh-ops', installable: true, local: false }), true);
  assert.equal(mod.isShareable({ name: 'dsh-workspace-gate', installable: true, local: true, published: true }), true);
  assert.equal(mod.isShareable({ name: 'local-x', installable: false, local: true }), false);
  assert.equal(mod.isShareable({ name: 'not-installable', installable: false }), false);
  assert.equal(mod.isShareable({ name: '', installable: true }), false);
  assert.equal(typeof mod.isEmbeddable, 'function');
  assert.equal(mod.isEmbeddable({ name: 'local-x', local: true, installable: false }), true);
  assert.equal(mod.isEmbeddable({ name: 'dsh-workspace-gate', local: true, installable: true, published: true }), false);
  assert.equal(mod.isEmbeddable({ name: 'dsh-ops', local: false, installable: true }), false);

  let registered = null;
  const ctx = {
    slots: {
      inject(channel, callback) {
        assert.equal(channel, 'settings.section');
        callback();
        return () => {};
      },
      register(options, Panel) {
        registered = { options, Panel };
        return () => {};
      },
    },
    inject(_services, callback) {
      callback({ get: () => undefined });
    },
  };
  mod.apply(ctx);
  assert.ok(registered, '注册了设置页');
  assert.equal(registered.options.name, 'settings.section');
  assert.equal(registered.options.id, 'modpack');
  assert.equal(registered.options.order, 45);
  assert.equal(typeof registered.options.label(), 'string');

  reset();
  const element = registered.Panel();
  assert.ok(element && typeof element === 'object', 'Panel 返回 React 元素');
  // 首帧是 loading（fetch 尚未完成），不应抛异常
  delete globalThis.window;
});
