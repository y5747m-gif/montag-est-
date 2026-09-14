/**
 * معالج أيقونات التطبيق (PWA) — يأخذ التصميم الرئيسي assets/icon-master.png
 * ويُنتج كل المقاسات الاحترافية:
 *   icon-192.png / icon-512.png        زوايا مستديرة شفافة (purpose: any)
 *   icon-maskable-512.png              ملء كامل بلا شفافية (purpose: maskable)
 *   icon-apple-180.png                 ملء كامل لأيقونة iOS (apple-touch-icon)
 *
 * المعالجة: فك ترميز PNG (بدون اعتماديات) ← قصّ مربع مركزي ← تصغير Lanczos3
 *           مع ألفا مُضاعَفة مسبقًا (بلا هالات) ← زوايا مستديرة بحواف ناعمة.
 * التشغيل:  node tools/make-icons.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { crc32 } from '../src/core/zip.js';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = path.join(ROOT, 'assets', 'icon-master.png');

/* ============================ PNG: كتابة ============================ */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // عمق البت
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ============================ PNG: قراءة ============================ */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('ليست صورة PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idatParts = [];
  let palette = null, trns = null;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idatParts.push(data);
    else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`PNG غير مدعوم: عمق ${bitDepth}، تداخل ${interlace}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`نوع لون غير مدعوم: ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);

  // فك ترشيح الأسطر
  const lines = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
    cur.copy(lines, y * stride);
    prev = cur;
  }

  // توسيع إلى RGBA
  for (let i = 0; i < width * height; i += 1) {
    const s = i * channels, d = i * 4;
    if (colorType === 6) { out[d] = lines[s]; out[d + 1] = lines[s + 1]; out[d + 2] = lines[s + 2]; out[d + 3] = lines[s + 3]; }
    else if (colorType === 2) { out[d] = lines[s]; out[d + 1] = lines[s + 1]; out[d + 2] = lines[s + 2]; out[d + 3] = 255; }
    else if (colorType === 0) { out[d] = out[d + 1] = out[d + 2] = lines[s]; out[d + 3] = 255; }
    else if (colorType === 4) { out[d] = out[d + 1] = out[d + 2] = lines[s]; out[d + 3] = lines[s + 1]; }
    else if (colorType === 3) {
      const p = lines[s] * 3;
      out[d] = palette[p]; out[d + 1] = palette[p + 1]; out[d + 2] = palette[p + 2];
      out[d + 3] = trns && lines[s] < trns.length ? trns[lines[s]] : 255;
    }
  }
  return { width, height, rgba: out };
}

/* ============================ Lanczos3 resize ============================ */
const LANCZOS_A = 3;
function lanczos(x) {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax >= LANCZOS_A) return 0;
  const px = Math.PI * x, px2 = px * px;
  return (LANCZOS_A * Math.sin(px) * Math.sin(px / LANCZOS_A)) / px2;
}

function resample(src, sw, sh, dw, dh) {
  // ألفا مُضاعَفة مسبقًا لتجنّب الهالات حول الحواف الشفافة
  const pre = Buffer.alloc(sw * sh * 4);
  for (let i = 0; i < sw * sh; i += 1) {
    const a = src[i * 4 + 3] / 255;
    pre[i * 4] = src[i * 4] * a;
    pre[i * 4 + 1] = src[i * 4 + 1] * a;
    pre[i * 4 + 2] = src[i * 4 + 2] * a;
    pre[i * 4 + 3] = src[i * 4 + 3];
  }
  // تمرير أفقي ثم رأسي (فصل النواة)
  const tmp = Buffer.alloc(dw * sh * 4);
  const scaleX = dw / sw;
  const xSupport = LANCZOS_A / Math.min(1, scaleX);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const center = (x + 0.5) / scaleX - 0.5;
      const start = Math.max(0, Math.floor(center - xSupport));
      const end = Math.min(sw - 1, Math.ceil(center + xSupport));
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sx = start; sx <= end; sx += 1) {
        const w = lanczos((sx - center) * Math.min(1, scaleX));
        if (w === 0) continue;
        const si = (y * sw + sx) * 4;
        r += pre[si] * w; g += pre[si + 1] * w; b += pre[si + 2] * w; a += pre[si + 3] * w;
        wsum += w;
      }
      const di = (y * dw + x) * 4;
      tmp[di] = clamp255(r / wsum);
      tmp[di + 1] = clamp255(g / wsum);
      tmp[di + 2] = clamp255(b / wsum);
      tmp[di + 3] = clamp255(a / wsum);
    }
  }
  const out = Buffer.alloc(dw * dh * 4);
  const scaleY = dh / sh;
  const ySupport = LANCZOS_A / Math.min(1, scaleY);
  for (let y = 0; y < dh; y += 1) {
    const center = (y + 0.5) / scaleY - 0.5;
    const start = Math.max(0, Math.floor(center - ySupport));
    const end = Math.min(sh - 1, Math.ceil(center + ySupport));
    for (let x = 0; x < dw; x += 1) {
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sy = start; sy <= end; sy += 1) {
        const w = lanczos((sy - center) * Math.min(1, scaleY));
        if (w === 0) continue;
        const si = (sy * dw + x) * 4;
        r += tmp[si] * w; g += tmp[si + 1] * w; b += tmp[si + 2] * w; a += tmp[si + 3] * w;
        wsum += w;
      }
      const di = (y * dw + x) * 4;
      out[di] = clamp255(r / wsum);
      out[di + 1] = clamp255(g / wsum);
      out[di + 2] = clamp255(b / wsum);
      out[di + 3] = clamp255(a / wsum);
    }
  }
  // إلغاء الضرب المسبق
  for (let i = 0; i < dw * dh; i += 1) {
    const a = out[i * 4 + 3] / 255;
    if (a > 0) {
      out[i * 4] = clamp255(out[i * 4] / a);
      out[i * 4 + 1] = clamp255(out[i * 4 + 1] / a);
      out[i * 4 + 2] = clamp255(out[i * 4 + 2] / a);
    }
  }
  return out;
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

/* ============================ قصّ + زوايا مستديرة ============================ */
function centerCrop(img, size) {
  const s = Math.min(img.width, img.height);
  const ox = Math.floor((img.width - s) / 2);
  const oy = Math.floor((img.height - s) / 2);
  const scale = size / s;
  const cropped = { width: s, height: s, rgba: Buffer.alloc(s * s * 4) };
  for (let y = 0; y < s; y += 1) {
    img.rgba.copy(cropped.rgba, y * s * 4, ((oy + y) * img.width + ox) * 4, ((oy + y) * img.width + ox + s) * 4);
  }
  return scale === 1 ? cropped : { width: size, height: size, rgba: resample(cropped.rgba, s, s, size, size) };
}

/** زوايا مستديرة بنصف قطر نسبي (0.225 ≈ iOS) مع حافة ناعمة 1.5px */
function roundCorners(img, radiusRatio = 0.225) {
  const { width: w, height: h, rgba } = img;
  const r = Math.min(w, h) * radiusRatio;
  const feather = Math.max(1, Math.min(w, h) / 340);
  const out = Buffer.from(rgba);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.max(r - x, x - (w - 1 - r), 0);
      const dy = Math.max(r - y, y - (h - 1 - r), 0);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        const cov = Math.max(0, Math.min(1, (r - d) / feather + 0.5));
        const i = (y * w + x) * 4 + 3;
        out[i] = clamp255(out[i] * cov);
      }
    }
  }
  return { width: w, height: h, rgba: out };
}

/* ============================ التنفيذ ============================ */
const masterBuf = fs.readFileSync(MASTER);
const master = decodePNG(masterBuf);
console.log(`التصميم الرئيسي: ${master.width}×${master.height}`);

const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(OUT, { recursive: true });

const jobs = [
  // [اسم الملف، الحجم، زوايا مستديرة؟]
  ['icon-512.png', 512, true],
  ['icon-192.png', 192, true],
  ['icon-maskable-512.png', 512, false], // ملء كامل — القناع من النظام (المحتوى الأساسي داخل المنطقة الآمنة)
  ['icon-apple-180.png', 180, false],    // apple-touch-icon: ملء كامل، iOS يقصّ الزوايا بنفسه
];
for (const [name, size, rounded] of jobs) {
  let img = centerCrop(master, size);
  if (rounded) img = roundCorners(img);
  const png = encodePNG(size, size, img.rgba);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`✓ ${name} (${size}×${size}${rounded ? '، زوايا مستديرة' : '، ملء كامل'}، ${(png.length / 1024).toFixed(1)} كيلوبايت)`);
}
console.log('اكتملت معالجة الأيقونات.');
