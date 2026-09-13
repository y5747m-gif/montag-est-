/**
 * تجهيز حزمة الويب (dist/) المستخدمة في تطبيق أندرويد (Capacitor).
 * ينسخ فقط الملفات التي يحتاجها التطبيق للعمل — بلا الاختبارات ولا أدوات البناء —
 * ليبقى حجم APK صغيرًا قدر الإمكان.
 *
 * التشغيل: node scripts/prep-web.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/** الملفات والمجلدات التي يتكوّن منها التطبيق فعليًا */
const INCLUDE = ['index.html', 'src', 'styles', 'assets'];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let copied = 0;
for (const entry of INCLUDE) {
  const from = path.join(ROOT, entry);
  const to = path.join(DIST, entry);
  if (!fs.existsSync(from)) {
    console.warn(`⚠ تخطّي ${entry} (غير موجود)`);
    continue;
  }
  fs.cpSync(from, to, { recursive: true });
  copied += 1;
}

const size = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const p = path.join(dir, e.name);
    return sum + (e.isDirectory() ? size(p) : fs.statSync(p).size);
  }, 0);

console.log(`✓ جُهّزت حزمة الويب في dist/ (${(size(DIST) / 1024).toFixed(0)} كيبايت، ${copied} عناصر)`);
