import test from 'node:test';
import assert from 'node:assert/strict';

import { createZip, readZip, crc32 } from '../lib/zip.mjs';

test('zip 往返：文本、JSON、二进制、中文名、空文件', () => {
  const files = [
    { name: 'dshpack.json', data: JSON.stringify({ a: 1, b: '中文' }) },
    { name: 'README.md', data: '# 整合包\n' },
    { name: 'bin/data.bin', data: Buffer.from([0, 1, 2, 255, 254, 0]) },
    { name: 'empty.txt', data: '' },
    { name: '目录/说明 文件.txt', data: '中文文件名与空格' },
  ];
  const archive = createZip(files);
  const decoded = readZip(archive);
  assert.equal(decoded.size, files.length);
  for (const file of files) {
    const expected = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    assert.deepEqual(decoded.get(file.name), expected, file.name);
  }
});

test('zip 解压后 CRC 不匹配会被拒绝', () => {
  const archive = createZip([{ name: 'a.txt', data: 'hello world hello world hello world hello world' }]);
  // 找到本地数据（deflate 流）并翻转一个字节；中央目录仍应报 CRC 失败
  const corrupted = Buffer.from(archive);
  const dataStart = 30 + Buffer.byteLength('a.txt');
  corrupted[dataStart + 2] ^= 0xff;
  assert.throws(() => readZip(corrupted), /CRC|解压/);
});

test('zip 生成时拒绝绝对路径与 ..', () => {
  assert.throws(() => createZip([{ name: '../evil.txt', data: 'x' }]), /路径非法/);
  assert.throws(() => createZip([{ name: '/abs.txt', data: 'x' }]), /路径非法/);
  assert.throws(() => createZip([{ name: 'a\\b.txt', data: 'x' }]), /name/);
  assert.throws(() => createZip([]), /至少/);
});

test('crc32 与已知值一致', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('非 zip 数据给出可读错误', () => {
  assert.throws(() => readZip(Buffer.from('这不是 zip')), /zip/);
});
