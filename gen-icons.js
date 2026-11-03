// 用 zlib 手写 PNG：圆角渐变底 + 白色循环箭头（与网页 favicon 同形）
const zlib = require('zlib');
const fs = require('fs');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size, draw) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size);
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 背景：#4f6ef7 → #8a6cf7 斜向渐变，圆角；遮罩版铺满不留圆角
function makeIcon(size, maskable) {
  const S = size;
  const radius = maskable ? 0 : S * 0.22;
  const pad = maskable ? S * 0.12 : 0; // maskable 需要安全区
  return (x, y) => {
    const t = (x + y) / (2 * S);
    let r = Math.round(0x4f + (0x8a - 0x4f) * t);
    let g = Math.round(0x6e + (0x6c - 0x6e) * t);
    let b = Math.round(0xf7 + (0xf7 - 0xf7) * t);

    // 圆角裁切
    if (!maskable) {
      const corners = [[radius, radius], [S - radius, radius], [radius, S - radius], [S - radius, S - radius]];
      for (const [cx, cy] of corners) {
        const inX = (cx < S / 2) ? x < radius : x > S - radius;
        const inY = (cy < S / 2) ? y < radius : y > S - radius;
        if (inX && inY) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];
        }
      }
    }

    // 白色循环箭头：一段圆弧 + 箭头三角 + 起点圆点
    const cx = S / 2, cy = S / 2;
    const R = (S - pad * 2) * 0.26;
    const lw = (S - pad * 2) * 0.075;
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 圆弧：右侧 180° → 左侧，偏上
    const ang = Math.atan2(dy, dx);
    const inArc = Math.abs(dist - R) < lw && Math.abs(ang) < Math.PI * 0.82 && dy < R * 0.55;
    // 箭头三角（圆弧右上端，指向右下）
    const ax = cx + R * Math.cos(-Math.PI * 0.82), ay = cy + R * Math.sin(-Math.PI * 0.82);
    const tr = S * 0.085;
    const nearArrow = Math.abs(x - ax) < tr && Math.abs(y - ay) < tr &&
                      (x - ax) + (y - ay) > -tr * 0.5;
    // 起点圆点（左端）
    const px = cx + R * Math.cos(Math.PI * 0.82), py = cy + R * Math.sin(Math.PI * 0.82);
    const nearDot = (x - px) ** 2 + (y - py) ** 2 < (lw * 0.95) ** 2;

    if (inArc || nearArrow || nearDot) return [255, 255, 255, 255];
    return [r, g, b, 255];
  };
}

[[192, false, 'icons/icon-192.png'],
 [512, false, 'icons/icon-512.png'],
 [512, true,  'icons/icon-maskable-512.png']].forEach(([size, mask, out]) => {
  fs.writeFileSync(out, png(size, makeIcon(size, mask)));
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
});
