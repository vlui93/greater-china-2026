const zlib = require('zlib'), fs = require('fs'), path = require('path');

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// icon: warm red->amber diagonal gradient, three vertical strokes (川)
function icon(S) {
  const buf = Buffer.alloc(S * S * 4);
  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const sa = a / 255, da = buf[i + 3] / 255, oa = sa + da * (1 - sa);
    if (oa === 0) return;
    buf[i]     = Math.round((r * sa + buf[i]     * da * (1 - sa)) / oa);
    buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
    buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  };
  // background gradient
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = (x / S * 0.45 + y / S * 0.55);
    px(x, y, Math.round(158 + 70 * t), Math.round(27 + 78 * t), Math.round(30 + 12 * t), 255);
  }
  // soft vignette top-left highlight
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S * 0.25) / S, dy = (y - S * 0.2) / S;
    const d = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - d * 2.4) * 38;
    if (a > 0) px(x, y, 255, 225, 190, Math.round(a));
  }
  // three strokes of 川, rounded caps, antialiased
  const strokes = [
    { cx: 0.285, top: 0.30, bot: 0.74 },
    { cx: 0.500, top: 0.24, bot: 0.78 },
    { cx: 0.715, top: 0.28, bot: 0.70 }
  ];
  const wHalf = S * 0.047;
  for (const s of strokes) {
    const cx = s.cx * S, y0 = s.top * S, y1 = s.bot * S;
    for (let y = Math.floor(y0 - wHalf - 2); y <= Math.ceil(y1 + wHalf + 2); y++) {
      for (let x = Math.floor(cx - wHalf - 2); x <= Math.ceil(cx + wHalf + 2); x++) {
        const py = Math.min(Math.max(y + 0.5, y0), y1);
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - py);
        const a = Math.max(0, Math.min(1, (wHalf - d) + 0.5));
        if (a > 0) px(x, y, 255, 248, 240, Math.round(a * 252));
      }
    }
  }
  return png(S, S, buf);
}

const out = path.join(__dirname, '..');
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
for (const s of [32, 180, 192, 512]) {
  const f = path.join(out, 'icons', `icon-${s}.png`);
  fs.writeFileSync(f, icon(s));
  console.log('wrote', f, fs.statSync(f).size, 'bytes');
}
