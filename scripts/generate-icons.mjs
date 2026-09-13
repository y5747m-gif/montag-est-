/**
 * توليد أيقونات التطبيق لأندرويد (Launcher + Adaptive + Splash) وويندوز (Electron)
 * انطلاقًا من شعار التطبيق assets/favicon.svg — بدقة عالية عبر sharp/libvips.
 *
 * التشغيل: npm run icons   (قابلة لإعادة التشغيل في أي وقت)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_SVG = path.join(ROOT, 'assets', 'favicon.svg');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const BG_COLOR = '#14161a'; // خلفية الشعار — تُستخدم للأيقونة التكيفية وشاشة البداية

// فافيكون 64×64 → نرسمه على 1024×1024 (density = 1024/64 × 72)
const MASTER = 1024;
const base = await sharp(SRC_SVG, { density: (MASTER / 64) * 72 })
  .resize(MASTER, MASTER, { kernel: 'lanczos3' })
  .png()
  .toBuffer();

const round = (buf, size) => {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp(buf).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
};

/* ---------- 1) أيقونة عامة (ويندوز / المستودع) ---------- */
await sharp(base).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'assets', 'icon.png'));
console.log('✓ assets/icon.png (512×512)');

/* ---------- 2) أيقونات أندرويد ---------- */
if (!fs.existsSync(RES)) {
  console.warn('⚠ مجلد android غير موجود — نفّذ: npx cap add android ثم أعد تشغيل npm run icons');
} else {
  // Launcher مربّعة ومدوّرة — كثافات الشاشات القياسية
  const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  // Adaptive foreground — قياس 108dp لكل كثافة (المحتوى داخل المنطقة الآمنة ~60%)
  const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

  for (const [dpi, size] of Object.entries(LAUNCHER)) {
    const dir = path.join(RES, `mipmap-${dpi}`);
    if (!fs.existsSync(dir)) continue;
    await sharp(base).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
    await round(base, size).then((b) => fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), b));
    console.log(`✓ mipmap-${dpi}/ic_launcher*.png (${size}×${size})`);
  }

  for (const [dpi, size] of Object.entries(FOREGROUND)) {
    const dir = path.join(RES, `mipmap-${dpi}`);
    if (!fs.existsSync(dir)) continue;
    const inner = Math.round(size * 0.6);
    const icon = await sharp(base).resize(inner, inner).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: icon, gravity: 'center' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
    console.log(`✓ mipmap-${dpi}/ic_launcher_foreground.png (${size}×${size}، محتوى ${inner})`);
  }

  // لون خلفية الأيقونة التكيفية — نفس خلفية الشعار
  const bgXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG_COLOR}</color>\n</resources>\n`;
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), bgXml);
  console.log('✓ values/ic_launcher_background.xml');

  // شاشة البداية: الشعار في المنتصف على خلفية داكنة، بنفس أبعاد كل ملف موجود
  for (const dirName of fs.readdirSync(RES)) {
    if (!dirName.startsWith('drawable')) continue;
    const file = path.join(RES, dirName, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const meta = await sharp(file).metadata();
    const { width, height } = meta;
    const size = Math.round(Math.min(width, height) * 0.33);
    const icon = await sharp(base).resize(size, size).png().toBuffer();
    await sharp({ create: { width, height, channels: 4, background: BG_COLOR } })
      .composite([{ input: icon, gravity: 'center' }])
      .png({ compressionLevel: 9 })
      .toFile(file + '.tmp');
    fs.renameSync(file + '.tmp', file);
    console.log(`✓ ${dirName}/splash.png (${width}×${height})`);
  }
}

console.log('اكتمل توليد الأيقونات.');
