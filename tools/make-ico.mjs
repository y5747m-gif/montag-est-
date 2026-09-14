/**
 * مولّد ملفات ICO — يبني أيقونة Windows متعددة الدقات من التصميم الرئيسي
 * الإدخالات: BMP للأحجام الصغيرة + PNG لحجم 256 (المعيار الحديث)
 * الاستخدام: node tools/make-ico.mjs [خرج]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { crc32 } from '../src/core/zip.js';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, 'assets', 'icon.ico');

/* ---------- PNG (قراءة) ---------- */
function paeth(a, b, c) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, channels = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = { 2: 3, 6: 4 }[data[9]]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
    if (channels === 4) cur.copy(out, y * width * 4);
    else for (let x = 0; x < width; x += 1) { out[(y * width + x) * 4] = cur[x * 3]; out[(y * width + x) * 4 + 1] = cur[x * 3 + 1]; out[(y * width + x) * 4 + 2] = cur[x * 3 + 2]; out[(y * width + x) * 4 + 3] = 255; }
    prev = cur;
  }
  return { width, height, rgba: out };
}

/* ---------- تصغير Lanczos3 ---------- */
const LA = 3;
function lanczos(x) { if (x === 0) return 1; const ax = Math.abs(x); if (ax >= LA) return 0; const p = Math.PI * x; return (LA * Math.sin(p) * Math.sin(p / LA)) / (p * p); }
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function resize(src, sw, sh, dw, dh) {
  const tmp = Buffer.alloc(dw * sh * 4);
  for (let y = 0; y < sh; y += 1) for (let x = 0; x < dw; x += 1) {
    const c0 = (x + 0.5) * sw / dw - 0.5, s0 = Math.max(0, Math.floor(c0 - LA + 1)), s1 = Math.min(sw - 1, Math.ceil(c0 + LA));
    let r = 0, g = 0, b = 0, a = 0, w = 0;
    for (let sx = s0; sx <= s1; sx += 1) { const k = lanczos((sx - c0) * Math.min(1, dw / sw)); if (!k) continue; const si = (y * sw + sx) * 4; r += src[si] * k; g += src[si + 1] * k; b += src[si + 2] * k; a += src[si + 3] * k; w += k; }
    const di = (y * dw + x) * 4;
    tmp[di] = cl(r / w); tmp[di + 1] = cl(g / w); tmp[di + 2] = cl(b / w); tmp[di + 3] = cl(a / w);
  }
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const c0 = (y + 0.5) * sh / dh - 0.5, s0 = Math.max(0, Math.floor(c0 - LA + 1)), s1 = Math.min(sh - 1, Math.ceil(c0 + LA));
    for (let x = 0; x < dw; x += 1) {
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let sy = s0; sy <= s1; sy += 1) { const k = lanczos((sy - c0) * Math.min(1, dh / sh)); if (!k) continue; const si = (sy * dw + x) * 4; r += tmp[si] * k; g += tmp[si + 1] * k; b += tmp[si + 2] * k; a += tmp[si + 3] * k; w += k; }
      const di = (y * dw + x) * 4;
      out[di] = cl(r / w); out[di + 1] = cl(g / w); out[di + 2] = cl(b / w); out[di + 3] = cl(a / w);
    }
  }
  return out;
}

/* ---------- إدخالات BMP (BGRA + قناع AND) ---------- */
function bmpEntry(size, rgba) {
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const si = (y * size + x) * 4;
      const di = ((size - 1 - y) * size + x) * 4; // صفوف من الأسفل لأعلى
      xor[di] = rgba[si + 2]; xor[di + 1] = rgba[si + 1]; xor[di + 2] = rgba[si]; xor[di + 3] = rgba[si + 3];
    }
  }
  const maskStride = Math.ceil(size / 8 / 4) * 4;
  const and = Buffer.alloc(maskStride * size); // أقنعة صفرية — الألفا في XOR تكفي
  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0);
  bih.writeInt32LE(size, 4);
  bih.writeInt32LE(size * 2, 8); // ضِعف الارتفاع (XOR + AND)
  bih.writeUInt16LE(1, 12);
  bih.writeUInt16LE(32, 14); // 32bpp BGRA
  return Buffer.concat([bih, xor, and]);
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crcBuf]);
}
function pngEntry(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ---------- ICO ---------- */
const master = decodePNG(fs.readFileSync(path.join(ROOT, 'assets', 'icon-512.png')));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((s) => {
  const rgba = resize(master.rgba, master.width, master.height, s, s);
  return s >= 256 ? pngEntry(s, rgba) : bmpEntry(s, rgba);
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // ICON
header.writeUInt16LE(1, 2); // نوع
header.writeUInt16LE(sizes.length, 4);
const dirSize = 16 * sizes.length;
const dir = Buffer.alloc(dirSize);
let offset = 6 + dirSize;
sizes.forEach((s, i) => {
  const e = dir.subarray(i * 16, i * 16 + 16);
  e[0] = s >= 256 ? 0 : s;          // العرض (0 = 256)
  e[1] = s >= 256 ? 0 : s;          // الارتفاع
  e[2] = 0; e[3] = 0;               // الألوان
  e.writeUInt16LE(1, 4);            // الطائرات
  e.writeUInt16LE(32, 6);           // عمق البت
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
});
fs.writeFileSync(OUT, Buffer.concat([header, dir, ...images]));
console.log(`✓ ${path.relative(ROOT, OUT)} (${sizes.join(', ')}) — ${(fs.statSync(OUT).size / 1024).toFixed(1)} كيلوبايت`);
