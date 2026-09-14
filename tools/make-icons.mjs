/**
 * مولّد أيقونات التطبيق (PWA) — يرسم شعار M بتدرج بنفسجي/وردي وينشئ PNG بأحجام 192/512 + maskable
 * التشغيل:  node tools/make-icons.mjs
 * بدون أي اعتماديات: zlib مدمج + crc32 من src/core/zip.js
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { crc32 } from '../src/core/zip.js';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');

/* ------------------------------ PNG ------------------------------ */
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
  ihdr[8] = 8;   // عمق البت
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // أسطر مرشّحة (filter=0) قبل كل سطر
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ------------------------------ الرسم ------------------------------ */
const C1 = [139, 92, 246];   // بنفسجي
const C2 = [236, 72, 153];   // وردي

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

/** نقاط حرف M في فضاء وحدوي [0..1] */
function glyphPoints(scale) {
  const cx = 0.5, cy = 0.5;
  const raw = [
    [0.28, 0.72], [0.28, 0.30], [0.50, 0.57], [0.72, 0.30], [0.72, 0.72],
  ];
  const pts = raw.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]);
  return [
    [pts[0], pts[1]], [pts[1], pts[2]], [pts[2], pts[3]], [pts[3], pts[4]],
  ];
}

function renderIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // أخذ عينات فائقة للتنعيم
  const r = size * 0.225;           // نصف قطر الزوايا
  const strokeHalf = size * (maskable ? 0.038 : 0.048);
  const glyphScale = maskable ? 0.74 : 1.0;
  const segs = glyphPoints(glyphScale);
  const inset = maskable ? 0 : 0;   // الخلفية ملء الأيقونة (قناع النظام يقصّها)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const u = px / size, v = py / size;

          // قناع الشكل (مربع بزوايا مستديرة أو ملء للمسنن maskable)
          let inside = true;
          if (!maskable) {
            const dx = Math.max(r - px, px - (size - r), 0);
            const dy = Math.max(r - py, py - (size - r), 0);
            inside = dx * dx + dy * dy <= r * r;
          } else {
            inside = px >= inset && py >= inset && px < size - inset && py < size - inset;
          }

          // تدرج قطري بنفسجي → وردي مع لمعة خفيفة أعلى اليسار
          const t = clamp01((u + v) / 2);
          const hl = (1 - t) * 0.12;
          let cr = C1[0] + (C2[0] - C1[0]) * t;
          let cg = C1[1] + (C2[1] - C1[1]) * t;
          let cb = C1[2] + (C2[2] - C1[2]) * t;
          cr = cr + (255 - cr) * hl;
          cg = cg + (255 - cg) * hl;
          cb = cb + (255 - cb) * hl;

          // حرف M أبيض بأسطر مستديرة الأطراف
          let m = false;
          if (inside) {
            for (const [[ax, ay], [bx, by]] of segs) {
              if (distSeg(px, py, ax * size, ay * size, bx * size, by * size) <= strokeHalf) { m = true; break; }
            }
          }
          if (m) { cr = 255; cg = 255; cb = 255; }

          R += cr; G += cg; B += cb; A += inside ? 255 : 0;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(R / n);
      rgba[i + 1] = Math.round(G / n);
      rgba[i + 2] = Math.round(B / n);
      rgba[i + 3] = Math.round(A / n);
    }
  }
  return encodePNG(size, size, rgba);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ------------------------------ الإخراج ------------------------------ */
fs.mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];
for (const [name, size, maskable] of targets) {
  const png = renderIcon(size, { maskable });
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`✓ ${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} كيلوبايت)`);
}
