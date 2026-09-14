import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('.tmp/apk-www/index.html', 'utf8').replace('<script src="app.js"></script>', '');
const dom = new JSDOM(html, { url: 'file:///android_asset/www/index.html', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

// رسوم Canvas وهمية (كما في اختبارات المشروع)
const noop = () => {};
const gradient = { addColorStop: noop };
const ctx = { canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none',
  fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineJoin: 'miter', lineCap: 'butt', miterLimit: 10,
  font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: 'transparent',
  shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true,
  save: noop, restore: noop, setTransform: noop, transform: noop, translate: noop, rotate: noop, scale: noop,
  beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
  arc: noop, arcTo: noop, ellipse: noop, rect: noop, roundRect: noop, fill: noop, stroke: noop, clip: noop,
  fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop, strokeText: noop, setLineDash: noop,
  drawImage: noop, putImageData: noop, isPointInPath: () => false,
  measureText: (t) => ({ width: String(t).length * 8 }),
  createLinearGradient: () => gradient, createRadialGradient: () => gradient, createPattern: () => null,
  createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) };
window.HTMLCanvasElement.prototype.getContext = function () { return ctx; };
window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,x'; };
window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 0);
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: noop }));
const g = globalThis;
for (const k of ['window','document','navigator','HTMLElement','HTMLCanvasElement','HTMLInputElement','Image','CustomEvent','Event','Node','File','Blob','FileReader','requestAnimationFrame','cancelAnimationFrame','localStorage','location','getComputedStyle']) {
  try { g[k] = window[k] ?? g[k]; } catch {}
}
g.devicePixelRatio = 1;

// تشغيل الحزمة كسكربت كلاسيكي
const code = fs.readFileSync('.tmp/apk-www/app.js', 'utf8');
let failed = null;
try {
  window.eval(code);
} catch (e) { failed = e; }

await new Promise((r) => setTimeout(r, 400));
const app = window.MS_MOBILE_APP;
const doc = window.document;
console.log('خطأ التنفيذ:', failed ? failed.stack?.split('\n').slice(0,3).join('\n') : 'لا يوجد ✓');
console.log('MS_MOBILE_APP:', app ? '✓ موجود' : '✗ مفقود');
console.log('أزرار التنقل:', doc.querySelectorAll('#m-nav .m-nav-btn').length === 5 ? '✓ 5' : '✗');
console.log('بطاقات سريعة:', doc.querySelectorAll('#m-tab-home .m-quick').length >= 6 ? '✓' : '✗ ' + doc.querySelectorAll('#m-tab-home .m-quick').length);
console.log('طبقات:', doc.querySelectorAll('#m-tab-layers .m-layer-row').length >= 3 ? '✓' : '✗');
console.log('تأثيرات:', doc.querySelectorAll('#m-tab-effects .m-fx-item').length >= 20 ? '✓ (' + doc.querySelectorAll('#m-tab-effects .m-fx-item').length + ')' : '✗');
console.log('تصدير:', doc.querySelectorAll('#m-export-options .m-export-opt').length === 3 ? '✓' : '✗');
const ok = !failed && app && doc.querySelectorAll('#m-nav .m-nav-btn').length === 5;
console.log(ok ? 'النتيجة: الحزمة تعمل ✓' : 'النتيجة: فشل ✗');
process.exit(ok ? 0 : 1);
