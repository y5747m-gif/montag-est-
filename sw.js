/**
 * Montage Studio — عامل الخدمة (Service Worker)
 * يجعل الموقع قابلًا للتثبيت كتطبيق (PWA) ويعمل بلا اتصال بعد أول زيارة:
 * - عند التثبيت: يخزّن هيكل التطبيق كاملًا (HTML/CSS/JS/الأيقونات).
 * - عند الجلب: Cache-first ثم الشبكة، مع تخزين أي ملف جديد تلقائيًا.
 * زيادة رقم الإصدار CACHE فرض التحديث على الأجهزة.
 */
const CACHE = 'montage-studio-v1';

const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'styles/app.css',
  'styles/timeline.css',
  'styles/viewer.css',
  'assets/favicon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-192.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png',
  'src/main.js',
  'src/core/anim.js',
  'src/core/effects.js',
  'src/core/i18n.js',
  'src/core/model.js',
  'src/core/presets.js',
  'src/core/pwa.js',
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
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // تخزين كل ملف على حدة: لا يفشل التثبيت كله إن تعذّر أحد الملفات
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    })().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let sameOrigin = false;
  try {
    sameOrigin = new URL(req.url).origin === location.origin;
  } catch { /* تجاهل */ }
  if (!sameOrigin) return;

  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        // وضع بلا اتصال: التنقّل يعود للصفحة الرئيسة المخزّنة
        if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
        throw err;
      }
    })()
  );
});
