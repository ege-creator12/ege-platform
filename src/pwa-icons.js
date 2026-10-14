// Public install icons for ОСНОВА, generated once per process without binary build artifacts.
const { deflateSync } = require('node:zlib');
const cached = new Map();
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const b of buffer) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data = Buffer.alloc(0)) {
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  const bytes = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  size.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(bytes), 0);
  return Buffer.concat([size, bytes, checksum]);
}
function roundedRect(x, y, cx, cy, hw, hh, radius) {
  const dx = Math.abs(x - cx) - (hw - radius);
  const dy = Math.abs(y - cy) - (hh - radius);
  return Math.hypot(Math.max(0, dx), Math.max(0, dy)) + Math.min(Math.max(dx, dy), 0) - radius;
}
function buildIcon(size) {
  const width = size, height = size, scan = width * 4 + 1;
  const pixels = Buffer.alloc(scan * height);
  for (let row = 0; row < height; row++) {
    pixels[row * scan] = 0; // PNG filter: None.
    for (let col = 0; col < width; col++) {
      const x = (col + 0.5) / width, y = (row + 0.5) / height;
      let color = [9, 20, 17, 255];
      if (roundedRect(x, y, 0.5, 0.5, 0.40, 0.40, 0.185) < 0) color = [27, 68, 53, 255];
      const circle = Math.hypot(x - 0.5, y - 0.45);
      if (circle < 0.257 && circle > 0.156) color = [229, 249, 237, 255];
      if (roundedRect(x, y, 0.5, 0.765, 0.19, 0.022, 0.021) < 0) color = [134, 220, 174, 255];
      const index = row * scan + 1 + col * 4;
      for (let n = 0; n < 4; n++) pixels[index + n] = color[n];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND')
  ]);
}
function getPwaIcon(size) {
  if (size !== 192 && size !== 512) throw new RangeError('Unexpected icon size');
  if (!cached.has(size)) cached.set(size, buildIcon(size));
  return cached.get(size);
}
module.exports = { getPwaIcon };
