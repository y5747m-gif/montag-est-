/**
 * مجمّع الوحدات — يحوّل تطبيق ES Modules إلى سكربت كلاسيكي واحد
 * ليعمل داخل WebView أندرويد عبر file:// (حيث تُحظر الوحدات بسبب CORS).
 *
 * الاستخدام:  node tools/bundle-site.mjs [mobile|desktop] [مجلد الإخراج]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || 'mobile';
const outDir = process.argv[3] || path.join(ROOT, '.tmp', 'apk-www');
const entryFile = target === 'desktop' ? 'src/main.js' : 'src/mobile.js';
const sourceHtml = target === 'desktop' ? 'desktop.html' : 'mobile.html';

/* --------------------------- حل المسارات --------------------------- */
function resolvePath(fromFile, rel) {
  const base = path.posix.dirname(fromFile.split(path.sep).join('/'));
  const parts = (base + '/' + rel).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

/* --------------------------- التحليل والتحويل --------------------------- */
function parseImports(code) {
  // يدعم الاستيرادات أحادية ومتعددة الأسطر
  const imports = [];
  const re = /import\s+([\s\S]*?)\s*from\s*['"]([^'"\n]+)['"]\s*;|import\s*['"]([^'"\n]+)['"]\s*;/g;
  let m;
  while ((m = re.exec(code))) {
    if (m[3] != null) {
      imports.push({ raw: m[0], source: m[3], kind: 'bare' });
    } else {
      const clause = m[1].replace(/\s+/g, ' ').trim();
      const source = m[2];
      const info = { raw: m[0], source, kind: 'named', names: [], defaultName: null, namespace: null };
      const ns = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
      const defWithNames = clause.match(/^([A-Za-z_$][\w$]*)\s*,\s*\{([^}]*)\}$/);
      const defOnly = clause.match(/^([A-Za-z_$][\w$]*)$/);
      const namedOnly = clause.match(/^\{([^}]*)\}$/);
      if (ns) { info.kind = 'namespace'; info.namespace = ns[1]; }
      else if (defWithNames) {
        info.defaultName = defWithNames[1];
        info.names = defWithNames[2].split(',').map((s) => s.trim()).filter(Boolean);
      } else if (defOnly) { info.kind = 'default'; info.defaultName = defOnly[1]; }
      else if (namedOnly) { info.names = namedOnly[1].split(',').map((s) => s.trim()).filter(Boolean); }
      else throw new Error(`بند استيراد غير مدعوم: ${clause}`);
      imports.push(info);
    }
  }
  return imports;
}

function importReplacement(info, resolved) {
  const req = `__req(${JSON.stringify(resolved)})`;
  if (info.kind === 'bare') return `${req};`;
  if (info.kind === 'namespace') return `const ${info.namespace} = ${req};`;
  if (info.kind === 'default') return `const ${info.defaultName} = ${req}.default;`;
  const parts = [];
  if (info.defaultName) parts.push(`default: ${info.defaultName}`);
  for (const n of info.names) {
    const [orig, alias] = n.split(/\s+as\s+/);
    parts.push(alias ? `${orig}: ${alias}` : orig);
  }
  return `const { ${parts.join(', ')} } = ${req};`;
}

function transformExports(code, exportNames) {
  let out = code;
  // export default <expr>;
  out = out.replace(/^export\s+default\s+/gm, 'exports.default = ');
  // export async function NAME
  out = out.replace(/^export\s+async\s+function\s+([A-Za-z_$][\w$]*)/gm, (_, n) => { exportNames.push(n); return `async function ${n}`; });
  // export function NAME
  out = out.replace(/^export\s+function\s+([A-Za-z_$][\w$]*)/gm, (_, n) => { exportNames.push(n); return `function ${n}`; });
  // export class NAME
  out = out.replace(/^export\s+class\s+([A-Za-z_$][\w$]*)/gm, (_, n) => { exportNames.push(n); return `class ${n}`; });
  // export const/let/var NAME =
  out = out.replace(/^export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm, (_, _k, n) => { exportNames.push(n); return `${_k} ${n} =`; });
  // export { A, B as C };
  out = out.replace(/^export\s*\{([^}]*)\}\s*;?\s*$/gm, (_, list) => {
    for (const item of list.split(',')) {
      const t = item.trim();
      if (!t) continue;
      const [orig, alias] = t.split(/\s+as\s+/);
      exportNames.push(alias ? { name: orig.trim(), as: alias.trim() } : t);
    }
    return '';
  });
  return out;
}

function buildModule(file) {
  const abs = path.join(ROOT, file);
  let code = fs.readFileSync(abs, 'utf8');
  const exportNames = [];

  const imports = parseImports(code);
  let depFiles = [];
  for (const info of imports) {
    const resolved = resolvePath(file, info.source);
    depFiles.push(resolved);
    code = code.split(info.raw).join(importReplacement(info, resolved));
  }
  code = transformExports(code, exportNames);

  const tail = exportNames.map((e) => {
    if (typeof e === 'object') return `exports[${JSON.stringify(e.as)}] = ${e.name};`;
    return `exports[${JSON.stringify(e)}] = ${e};`;
  }).join('\n');

  const wrapped = `__modules[${JSON.stringify(file)}] = { deps: ${JSON.stringify(depFiles)}, factory: function (exports, __req) {\n"use strict";\n${code}\n${tail}\n} };\n`;
  return { file, depFiles, wrapped };
}

/* --------------------------- بناء الرسم البياني --------------------------- */
function collect(entry) {
  const order = [];
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const abs = path.join(ROOT, file);
    const code = fs.readFileSync(abs, 'utf8');
    const files = parseImports(code).map((i) => resolvePath(file, i.source));
    order.push({ file, files });
    for (const f of files) stack.push(f);
  }
  return order;
}

/* ----------------=========== التجميع =================== */
const modules = collect(entryFile);
const parts = [];
parts.push('/* Montage Studio — حزمة مولّدة تلقائيًا (لا تُعدّل يدويًا) */\n');
parts.push('var __modules = {};\nvar __cache = {};\nfunction __req(file) {\n  var m = __cache[file];\n  if (m) return m.exports;\n  m = { exports: {} };\n  __cache[file] = m;\n  __modules[file].factory(m.exports, __req);\n  return m.exports;\n}\n');
for (const { file } of modules) {
  const { wrapped } = buildModule(file);
  parts.push(wrapped);
}
parts.push(`__req(${JSON.stringify(entryFile)});\n`);
const bundle = parts.join('\n');

/* ----------------=========== ملفات الموقع =================== */
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'styles'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'app.js'), bundle);

// CSS
for (const css of target === 'desktop' ? ['app.css', 'timeline.css', 'viewer.css'] : ['mobile.css']) {
  fs.copyFileSync(path.join(ROOT, 'styles', css), path.join(outDir, 'styles', css));
}
// الأيقونات
for (const a of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-apple-180.png', 'favicon.svg']) {
  fs.copyFileSync(path.join(ROOT, 'assets', a), path.join(outDir, 'assets', a));
}

// HTML مكيَّف: استبدال سكربت الوحدات بالحزمة وإزالة روابط PWA
let html = fs.readFileSync(path.join(ROOT, sourceHtml), 'utf8');
html = html.replace(/<script src="src\/install\.js" defer><\/script>\s*/g, '');
html = html.replace(/<script[^>]*type="module"[^>]*src="src\/[^"]+"[^>]*><\/script>/, '<script src="app.js"></script>');
html = html.replace(/<script>\s*\n?\s*\/\/ تسجيل العامل الخدمي[\s\S]*?<\/script>\s*/g, '');
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, '');
html = html.replace(/<link rel="apple-touch-icon"[^>]*>\s*/g, '');
fs.writeFileSync(path.join(outDir, 'index.html'), html);

const kb = (n) => `${(n / 1024).toFixed(1)} كيلوبايت`;
console.log(`✓ الحزمة: ${target} → ${outDir}`);
console.log(`  app.js: ${kb(Buffer.byteLength(bundle))} · ${modules.length} وحدة`);
