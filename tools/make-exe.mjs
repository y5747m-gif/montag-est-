/**
 * بناء نسخة Windows (EXE) — ملف تنفيذي واحد يحمل الموقع كاملًا
 *
 * السلسلة: تجميع الموقع (بلا وحدات ES) ← تضمين الملفات ← bun build --compile
 * النواتج:
 *   dist/MontageStudio-win64.exe      نسخة Windows (ملف واحد)
 *   dist/MontageStudio-linux          نسخة تجريبية للفحص المحلي
 *
 * الاستخدام: node tools/make-exe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, '.tmp');
const DIST = path.join(ROOT, 'dist');
const BUN = path.join(ROOT, 'node_modules', '.bin', 'bun');

function sh(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
}

/* ---------------- 1) تجهيز حزم الموقع (نسختا الهاتف والكمبيوتر) ---------------- */
console.log('— تجميع الموقع للنسختين —');
execFileSync('node', [path.join(ROOT, 'tools', 'bundle-site.mjs'), 'desktop', path.join(TMP, 'exe-www-desktop')], { cwd: ROOT, stdio: 'inherit' });
execFileSync('node', [path.join(ROOT, 'tools', 'bundle-site.mjs'), 'mobile', path.join(TMP, 'exe-www-mobile')], { cwd: ROOT, stdio: 'inherit' });

const desktopDir = path.join(TMP, 'exe-www-desktop');
const mobileDir = path.join(TMP, 'exe-www-mobile');

// index.html = نسخة الكمبيوتر، ونسخة الهاتف في mobile.html
fs.copyFileSync(path.join(desktopDir, 'index.html'), path.join(desktopDir, 'desktop.html'));
fs.copyFileSync(path.join(mobileDir, 'index.html'), path.join(desktopDir, 'mobile.html'));
fs.copyFileSync(path.join(mobileDir, 'app.js'), path.join(desktopDir, 'mobile-app.js'));
fs.renameSync(path.join(desktopDir, 'app.js'), path.join(desktopDir, 'desktop-app.js'));
// دمج CSS (نفس أسماء مجلد styles)
for (const css of ['mobile.css']) {
  fs.copyFileSync(path.join(mobileDir, 'styles', css), path.join(desktopDir, 'styles', css));
}
// تعديل نسخة الهاتف داخل الحزمة لتستخدم أسماءها المدمجة
let mobileHtml = fs.readFileSync(path.join(desktopDir, 'mobile.html'), 'utf8');
mobileHtml = mobileHtml.replace('app.js', 'mobile-app.js');
fs.writeFileSync(path.join(desktopDir, 'mobile.html'), mobileHtml);

/* ---------------- 2) تضمين الملفات ---------------- */
console.log('— تضمين الملفات —');
const files = [];
const walk = (dir, base = '') => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) walk(full, rel);
    else files.push(rel);
  }
};
walk(desktopDir);

const entries = files.map((rel) => {
  const data = fs.readFileSync(path.join(desktopDir, rel));
  const isText = /\.(html|js|css|svg|json)$/.test(rel);
  return `  ${JSON.stringify(rel)}: { data: ${JSON.stringify(isText ? data.toString('utf8') : data.toString('base64'))}, encoding: ${isText ? "'utf8'" : "'base64'"} },`;
});
fs.writeFileSync(path.join(ROOT, 'tools', 'exe-assets.mjs'), `/* مولَّد تلقائيًا — أصول الموقع المضمّنة في EXE */\nexport const ASSETS = {\n${entries.join('\n')}\n};\n`);
console.log(`  ${files.length} ملفًا مضمّنًا`);

/* ---------------- 3) أيقونة Windows ---------------- */
const icoPath = path.join(ROOT, 'assets', 'icon.ico');
if (!fs.existsSync(icoPath)) {
  execFileSync('node', [path.join(ROOT, 'tools', 'make-ico.mjs'), icoPath], { cwd: ROOT, stdio: 'inherit' });
}

/* ---------------- 4) بناء EXE ---------------- */
fs.mkdirSync(DIST, { recursive: true });
const exeOut = path.join(DIST, 'MontageStudio-win64.exe');
console.log('— بناء نسخة Windows (قد يستغرق دقيقة) —');
try {
  sh(BUN, ['build', path.join(ROOT, 'tools', 'exe-server.mjs'), '--compile', '--target=bun-windows-x64', `--windows-icon=${icoPath}`, '--outfile', exeOut]);
} catch (e) {
  console.log('  تعذّر تضمين الأيقونة — إعادة البناء بدونها…');
  sh(BUN, ['build', path.join(ROOT, 'tools', 'exe-server.mjs'), '--compile', '--target=bun-windows-x64', '--outfile', exeOut]);
}
console.log(`✓ ${path.relative(ROOT, exeOut)} (${(fs.statSync(exeOut).size / 1024 / 1024).toFixed(1)} ميجابايت)`);

/* ---------------- 5) نسخة Linux للفحص المحلي ---------------- */
console.log('— بناء نسخة فحص Linux —');
const linuxOut = path.join(DIST, 'MontageStudio-linux');
sh(BUN, ['build', path.join(ROOT, 'tools', 'exe-server.mjs'), '--compile', '--outfile', linuxOut]);
fs.chmodSync(linuxOut, 0o755);
console.log(`✓ ${path.relative(ROOT, linuxOut)}`);
console.log('\nاكتمل البناء. جرّب:  dist/MontageStudio-linux  ثم افتح الرابط المطبوع');
