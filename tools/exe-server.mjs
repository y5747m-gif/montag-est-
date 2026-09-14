/**
 * خادم تطبيق Montage Studio المضمّن — نقطة دخول نسخة Windows (EXE)
 * يُبنى عبر: bun build --compile → ملف EXE واحد يحمل الموقع كاملًا بداخله.
 */
import { ASSETS } from './exe-assets.mjs';

const INDEX = 'index.html';

function contentType(name) {
  if (name.endsWith('.html')) return 'text/html; charset=utf-8';
  if (name.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (name.endsWith('.css')) return 'text/css; charset=utf-8';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function resolvePath(urlPath) {
  let p = decodeURIComponent(new URL(urlPath, 'http://x').pathname).replace(/^\/+/, '');
  if (p === '' || p === '/') p = INDEX;
  if (ASSETS[p]) return p;
  if (ASSETS[p + '/index.html']) return p + '/index.html';
  if (p === 'mobile') return 'mobile.html';
  if (p === 'desktop') return 'desktop.html';
  return null;
}

const server = Bun.serve({
  port: 0, // منفذ عشوائي متاح
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    const file = resolvePath(url.pathname);
    if (!file) return new Response('<h1>404</h1>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const entry = ASSETS[file];
    const body = entry.encoding === 'base64' ? Buffer.from(entry.data, 'base64') : entry.data;
    return new Response(body, { headers: { 'Content-Type': contentType(file), 'Cache-Control': 'no-cache' } });
  },
});

const url = `http://127.0.0.1:${server.port}/`;
console.log('');
console.log('  ✔ Montage Studio يعمل الآن على: ' + url);
console.log('  يمكنك تصغير هذه النافذة — إغلاقها يوقف التطبيق.');
console.log('');

// فتح نافذة تطبيق مستقلة (بلا واجهة متصفح) — وضع app في Edge/Chrome
const appUrl = url;
const openers = process.platform === 'win32'
  ? [
      ['cmd', ['/c', 'start', 'msedge', `--app=${appUrl}`]],
      ['cmd', ['/c', 'start', 'chrome', `--app=${appUrl}`]],
      ['cmd', ['/c', 'start', '', appUrl]],
    ]
  : process.platform === 'darwin'
    ? [
        ['open', ['-a', 'Microsoft Edge', `--args`, `--app=${appUrl}`]],
        ['open', ['-a', 'Google Chrome', `--args`, `--app=${appUrl}`]],
        ['open', [appUrl]],
      ]
    : [
        ['chromium', [`--app=${appUrl}`]],
        ['chromium-browser', [`--app=${appUrl}`]],
        ['google-chrome', [`--app=${appUrl}`]],
        ['xdg-open', [appUrl]],
      ];
let opened = false;
for (const [cmd, args] of openers) {
  try {
    Bun.spawn([cmd, args], { stdout: 'ignore', stderr: 'ignore' });
    opened = true;
    break;
  } catch (e) { /* جرّب التالي */ }
}
void opened;

const shutdown = () => process.exit(0);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
