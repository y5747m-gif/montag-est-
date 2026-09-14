/**
 * Service Worker — Montage Studio
 * يعمل بلا إنترنت: يخزّن ملفات النسختين (الهاتف/الكمبيوتر) وصفحة التحميل مسبقًا،
 * ثم يقدّمها من الذاكرة مع تحديث في الخلفية (stale-while-revalidate).
 */
const VERSION = 'ms-v2';
const PRECACHE = [
  './',
  'index.html',
  'mobile.html',
  'desktop.html',
  'manifest-mobile.webmanifest',
  'manifest-desktop.webmanifest',
  'styles/app.css',
  'styles/timeline.css',
  'styles/viewer.css',
  'styles/mobile.css',
  'src/main.js',
  'src/mobile.js',
  'src/core/anim.js',
  'src/core/effects.js',
  'src/core/i18n.js',
  'src/core/model.js',
  'src/core/presets.js',
  'src/core/store.js',
  'src/core/util.js',
  'src/core/zip.js',
  'src/export/exporters.js',
  'src/media/audio.js',
  'src/media/media.js',
  'src/project/demo.js',
  'src/render/engine.js',
  'src/render/filters.js',
  'src/render/shapes.js',
  'src/ui/dialog.js',
  'src/ui/dom.js',
  'src/ui/graphs.js',
  'src/ui/menu.js',
  'src/ui/panels.js',
  'src/ui/props.js',
  'src/ui/shortcuts.js',
  'src/ui/timeline.js',
  'src/ui/toast.js',
  'src/ui/toolbar.js',
  'src/ui/viewer.js',
  'assets/favicon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/icon-apple-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // خزّن كل ملف على حدة حتى لا يفشل الكل بسبب ملف واحد
    await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.headers.get('range')) return; // طلبات الميديا الجزئية تُترك للشبكة

  // stale-while-revalidate: الرد من الذاكرة فورًا + تحديث في الخلفية
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' ? false : true });
    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    if (cached) {
      network.catch(() => {});
      return cached;
    }
    // غير موجود في الذاكرة: انتظر الشبكة، ولو فشل التنقل قدّم صفحة مخزنة بديلة
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') {
      const url = new URL(req.url);
      const page = /desktop\.html/.test(url.pathname) ? 'desktop.html' : /mobile\.html/.test(url.pathname) ? 'mobile.html' : 'index.html';
      return (await cache.match(page)) || (await cache.match('./')) || Response.error();
    }
    return Response.error();
  })());
});
