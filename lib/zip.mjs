/**
 * 零依赖 ZIP 读写。
 *
 * 整合包只需要"几个小 JSON/文本文件"装进一个 zip，为此引入依赖不值得：
 * 这里实现了 ZIP 的最小子集（store / deflate），UTF-8 文件名，CRC32 校验。
 * 不支持 zip64、加密、ZIP64 扩展、多卷；超过 32 MiB 的解压结果会被拒绝。
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const MAX_TOTAL_UNCOMPRESSED = 32 * 1024 * 1024;
const MAX_ENTRIES = 512;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  const year = Math.max(1980, d.getFullYear());
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const day = (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, day };
}

/**
 * @param {Array<{name: string, data: Buffer|string}>} files
 * @param {{deflate?: boolean, mtime?: Date}} [options]
 * @returns {Buffer}
 */
export function createZip(files, options = {}) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('zip 至少需要一个文件');
  if (files.length > MAX_ENTRIES) throw new Error(`zip 文件数超过上限 ${MAX_ENTRIES}`);
  const deflate = options.deflate !== false;
  const { time, day } = dosDateTime(options.mtime);

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  let totalUncompressed = 0;

  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !file.name || file.name.includes('\\')) {
      throw new Error('zip 条目的 name 必须是使用 / 的非空相对路径');
    }
    if (file.name.startsWith('/') || file.name.split('/').includes('..')) {
      throw new Error(`zip 条目路径非法：${file.name}`);
    }
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data ?? ''), 'utf8');
    totalUncompressed += data.length;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) throw new Error('zip 内容超过 32 MiB');
    const method = deflate && data.length >= 64 ? 8 : 0;
    const body = method === 8 ? deflateRawSync(data, { level: 9 }) : data;
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // bit 11: UTF-8 文件名
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirectory, eocd]);
}

function findEocd(buffer) {
  const start = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= start; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('不是有效的 zip：找不到中央目录结尾');
}

/**
 * @param {Buffer} buffer
 * @returns {Map<string, Buffer>}
 */
export function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('不是有效的 zip：文件过小');
  const eocdOffset = findEocd(buffer);
  const count = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('不支持 zip64 格式');
  }
  if (count > MAX_ENTRIES) throw new Error(`zip 条目数超过上限 ${MAX_ENTRIES}`);
  if (centralOffset + centralSize > buffer.length) throw new Error('zip 中央目录越界');

  const files = new Map();
  let p = centralOffset;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(p) !== CENTRAL_SIG) throw new Error('zip 中央目录损坏');
    const flags = buffer.readUInt16LE(p + 8);
    const method = buffer.readUInt16LE(p + 10);
    const checksum = buffer.readUInt32LE(p + 16);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const uncompressedSize = buffer.readUInt32LE(p + 24);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    p += 46 + nameLength + extraLength + commentLength;

    if (flags & 0x0001) throw new Error(`不支持加密的 zip 条目：${name}`);
    if (name.endsWith('/')) continue;
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error(`zip 条目路径非法：${name}`);
    if (localOffset + 30 > buffer.length) throw new Error(`zip 本地头越界：${name}`);

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`zip 本地头损坏：${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > buffer.length) throw new Error(`zip 数据越界：${name}`);
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = inflateRawSync(raw);
      } catch {
        throw new Error(`zip 条目解压失败：${name}`);
      }
    } else {
      throw new Error(`不支持的 zip 压缩方式 ${method}：${name}`);
    }
    if (data.length !== uncompressedSize) throw new Error(`zip 条目长度不符：${name}`);
    if (crc32(data) !== checksum) throw new Error(`zip 条目 CRC 校验失败：${name}`);
    total += data.length;
    if (total > MAX_TOTAL_UNCOMPRESSED) throw new Error('zip 解压内容超过 32 MiB');
    files.set(name, data);
  }
  return files;
}
