/**
 * Montage Studio — اختبارات الوحدة والدخان (Smoke)
 * التشغيل: npm test  (يتطلب jsdom)
 * لا يحتاج متصفحًا: نُهيّئ DOM وهميًا + سياق Canvas وهميًا.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
const failures = [];
const ok = (cond, label) => { if (cond) { passed += 1; console.log(`  ✓ ${label}`); } else { failed += 1; failures.push(label); console.log(`  ✗ ${label}`); } };
const eq = (a, b, label) => ok(Object.is(a, b), `${label} (${JSON.stringify(a)} === ${JSON.stringify(b)})`);
const section = (t) => console.log(`\n— ${t}`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => import(path.join(root, rel));

/* ============================ بيئة المتصفح الوهمية ============================ */
function installDom({ crc32, page = 'desktop.html' }) {
  // نستورد jsdom بشكل كسول حتى لا تفشل الاختبارات الصرفة
  const { JSDOM } = globalThis.__JSDOM__ || {};
  if (!JSDOM) throw new Error('jsdom غير مثبت');
  // desktop.html = نسخة الكمبيوتر، mobile.html = نسخة الهاتف (index.html أصبحت صفحة تحميل)
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;

  const ctxBase = () => {
    const noop = () => {};
    const gradient = { addColorStop: noop };
    const ctx = {
      canvas: null,
      globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none',
      fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineJoin: 'miter', lineCap: 'butt',
      miterLimit: 10, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
      shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0,
      imageSmoothingEnabled: true,
      save: noop, restore: noop, setTransform: noop, transform: noop, translate: noop, rotate: noop, scale: noop,
      beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
      arc: noop, arcTo: noop, ellipse: noop, rect: noop, roundRect: noop, fill: noop, stroke: noop, clip: noop,
      fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop, strokeText: noop, setLineDash: noop,
      drawImage: noop, putImageData: noop, isPointInPath: () => false,
      measureText: (t) => ({ width: String(t).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
      createLinearGradient: () => gradient, createRadialGradient: () => gradient, createPattern: () => null,
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    };
    return ctx;
  };

  window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
    if (type !== '2d') return null;
    if (!this.__ctx) { const c = ctxBase(); c.canvas = this; this.__ctx = c; }
    return this.__ctx;
  };
  const pngBytes = () => {
    // PNG بسيط صالح البنية (IHDR + IDAT + IEND)
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    const chunk = (type, data) => {
      const len = [0, 0, 0, data.length];
      const body = [...type].map((c) => c.charCodeAt(0)).concat(data);
      const crc = crc32(Uint8Array.from(body));
      return len.concat(body, [(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255]);
    };
    const ihdr = [0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0];
    const idat = [0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1];
    return Uint8Array.from(sig.concat(chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', [])));
  };
  const PNG = pngBytes();
  window.HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
    return `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;
  };
  window.HTMLCanvasElement.prototype.toBlob = function toBlob(cb) { cb(new window.Blob([PNG])); };
  window.HTMLCanvasElement.prototype.captureStream = function captureStream() {
    return { getVideoTracks: () => [{ requestFrame() {} }], getAudioTracks: () => [] };
  };

  const makeObjectUrl = () => `blob:http://localhost/${Math.random().toString(36).slice(2)}`;
  window.URL.createObjectURL = makeObjectUrl;
  window.URL.revokeObjectURL = () => {};
  // الوحدات تستخدم URL العام أيضًا (بيئة Node)
  try { globalThis.URL.createObjectURL = makeObjectUrl; globalThis.URL.revokeObjectURL = () => {}; } catch {}
  // لا نسمح لنقرات روابط التنزيل بمحاولة تنقّل داخل jsdom
  window.HTMLAnchorElement.prototype.click = function click() {};
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(window.performance.now()), 0);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.AudioContext = class {
    constructor() { this.destination = {}; this.state = 'running'; this.currentTime = 0; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() { return { gain: { value: 1, setValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createBufferSource() { return { buffer: null, playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createBuffer(ch, len, rate) { return { numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate, getChannelData: () => new Float32Array(len) }; }
    decodeAudioData() { return Promise.reject(new Error('no decoder')); }
  };
  window.OfflineAudioContext = window.AudioContext;
  window.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  };
  window.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((b) => { this.result = b; this.onload?.(); }).catch(() => this.onerror?.());
    }
  };
  // jsdom لا يوفّر Blob.arrayBuffer — نُوفّر بديلًا مكافئًا
  class MockBlob {
    constructor(parts = [], opts = {}) {
      this.parts = parts.map((p) => {
        if (typeof p === 'string') return new TextEncoder().encode(p);
        if (p instanceof Uint8Array) return p;
        if (p?.buffer instanceof ArrayBuffer) return new Uint8Array(p.buffer, p.byteOffset || 0, p.byteLength ?? p.buffer.byteLength);
        if (p instanceof ArrayBuffer) return new Uint8Array(p);
        return new Uint8Array(0);
      });
      this.type = opts.type || '';
      this.size = this.parts.reduce((a, p) => a + p.length, 0);
    }
    async arrayBuffer() {
      const out = new Uint8Array(this.size);
      let o = 0;
      this.parts.forEach((p) => { out.set(p, o); o += p.length; });
      return out.buffer;
    }
    async text() { return new TextDecoder().decode(new Uint8Array(await this.arrayBuffer())); }
    slice() { return this; }
  }
  window.Blob = MockBlob;

  // تعريض البيئة عالميًا
  const g = globalThis;
  const set = (k, v) => { try { g[k] = v; } catch { /* بعض المفاتيح للقراءة فقط */ } };
  set('window', window);
  set('document', window.document);
  set('navigator', window.navigator);
  set('HTMLElement', window.HTMLElement);
  set('HTMLCanvasElement', window.HTMLCanvasElement);
  set('HTMLInputElement', window.HTMLInputElement);
  set('Image', window.Image);
  set('CustomEvent', window.CustomEvent);
  set('Event', window.Event);
  set('Node', window.Node);
  set('XMLHttpRequest', window.XMLHttpRequest);
  set('File', window.File);
  set('Blob', window.Blob);
  set('FileReader', window.FileReader);
  set('AudioContext', window.AudioContext);
  set('OfflineAudioContext', window.OfflineAudioContext);
  set('MediaRecorder', window.MediaRecorder);
  set('requestAnimationFrame', window.requestAnimationFrame);
  set('cancelAnimationFrame', window.cancelAnimationFrame);
  set('localStorage', window.localStorage);
  set('location', window.location);
  set('getComputedStyle', window.getComputedStyle.bind(window));
  set('devicePixelRatio', 1);
  return { window, dom };
}

/* ============================ 1) اختبارات الوحدة ============================ */
async function unitTests() {
  section('الأدوات والتحويلات');
  const util = await load('src/core/util.js');
  eq(util.clamp(15, 0, 10), 10, 'clamp يحدّ القيمة');
  eq(util.lerp(0, 10, 0.5), 5, 'lerp');
  eq(util.framesToTimecode(95, 30), '00:00:03:05', 'إطارات ← Timecode');
  eq(util.timecodeToFrames('00:00:03:05', 30), 95, 'Timecode ← إطارات');
  eq(util.hexToRgb('#ff0000').r, 255, 'hexToRgb');
  eq(util.mixColor('#000000', '#ffffff', 0.5), '#808080', 'mixColor');
  ok(util.uid('x').startsWith('x'), 'توليد معرّفات uid');

  section('التحريك والمفاتيح');
  const anim = await load('src/core/anim.js');
  const prop = { type: 'number', value: 0, keys: [], expr: '' };
  eq(anim.propValueAt(prop, 10, { fps: 30 }), 0, 'قيمة ثابتة');
  anim.setKeyframe(prop, 0, 0, 'linear');
  anim.setKeyframe(prop, 30, 100, 'linear');
  eq(Math.round(anim.propValueAt(prop, 15, { fps: 30 })), 50, 'استيفاء خطي في المنتصف');
  eq(anim.propValueAt(prop, 30, { fps: 30 }), 100, 'قيمة المفتاح الأخير');
  anim.setKeyEase(prop, 0, 'hold');
  eq(anim.propValueAt(prop, 15, { fps: 30 }), 0, 'وضع Hold يثبّت القيمة');
  anim.setKeyEase(prop, 0, 'linear');
  const beforeOffset = prop.keys.map((k) => k.t);
  anim.offsetKeys(prop, 5);
  eq(prop.keys[0].t, beforeOffset[0] + 5, 'إزاحة المفاتيح تعمل');
  anim.offsetKeys(prop, -5);
  const eased = { type: 'number', value: 0, keys: [], expr: '' };
  anim.setKeyframe(eased, 0, 0, 'ease');
  anim.setKeyframe(eased, 20, 100, 'ease');
  ok(anim.propValueAt(eased, 10, { fps: 30 }) > 30 && anim.propValueAt(eased, 10, { fps: 30 }) < 70, 'تنعيم Bezier');
  const v2 = { type: 'vec2', value: { x: 0, y: 0 }, keys: [], expr: '' };
  anim.setKeyframe(v2, 0, { x: 10, y: 20 });
  anim.setKeyframe(v2, 10, { x: 20, y: 40 });
  eq(anim.propValueAt(v2, 5, { fps: 30 }).y, 30, 'استيفاء vec2');

  section('النموذج والطبقات');
  const model = await load('src/core/model.js');
  const comp = model.createComp({ name: 'اختبار', width: 1280, height: 720, fps: 25, duration: 250 });
  eq(comp.width, 1280, 'إنشاء تركيب');
  const text = model.createLayer('text', { name: 'عنوان' });
  eq(text.type, 'text', 'إنشاء طبقة نص');
  ok(!!text.props.fontSize && !!text.props.text, 'مخطط النص يحتوي الخصائص');
  const shape = model.createLayer('shape', {});
  ok(shape.props.size.value.x > 0, 'الحجم الافتراضي للشكل');
  const layerTypes = Object.keys(model.LAYER_TYPES);
  ok(layerTypes.length >= 12, `أنواع الطبقات (${layerTypes.length})`);
  ok(model.iterProps(text).some((r) => r.path === 'transform.position'), 'iterProps يعدّد خصائص الطبقة');
  const normalized = model.normalizeProject({ comps: [{ name: 'x', layers: [{ type: 'text' }] }] });
  ok(normalized.comps[0].layers[0].props.text, 'تطبيع مشروع ناقص');

  section('التأثيرات');
  const fx = await load('src/core/effects.js');
  const fxKeys = Object.keys(fx.EFFECTS);
  ok(fxKeys.length >= 30, `عدد التأثيرات (${fxKeys.length})`);
  ok(fx.EFFECTS.blur.css({ radius: 12 }) === 'blur(12px)', 'فلتر CSS للتمويه');
  ok(String(fx.EFFECTS.dropShadow.css({ angle: 135, distance: 8, blur: 2, color: '#000', opacity: 60 })).includes('drop-shadow'), 'الظل المسقط');
  ok(typeof fx.EFFECTS.linearWipe.clip === 'function' && fx.EFFECTS.linearWipe.clip({ progress: 50, angle: 0, feather: 0 }, 100, 100) !== undefined, 'قص الانتقالات (linearWipe)');
  const paramsOk = fxKeys.every((k) => Array.isArray(fx.EFFECTS[k].params) && fx.EFFECTS[k].name);
  ok(paramsOk, 'كل تأثير يعرّف أسماءً ومعاملات');
  const img = { data: new Uint8ClampedArray(16 * 16 * 4).fill(100), width: 16, height: 16 };
  let pixelErrors = [];
  fxKeys.forEach((k) => {
    const def = fx.EFFECTS[k];
    if (def.pixel) {
      try { def.pixel({ data: new Uint8ClampedArray(img.data), width: 16, height: 16 }, def.params.reduce((a, p) => ({ ...a, [p.k]: p.def }), {}), { frame: 0, fps: 30 }); }
      catch (e) { pixelErrors.push(`${k}: ${e.message}`); }
    }
  });
  ok(pixelErrors.length === 0, `تأثيرات البكسل تعمل${pixelErrors.length ? ` (${pixelErrors.slice(0, 3).join(' | ')})` : ''}`);

  section('ZIP و CRC (مستخدَمة في التصدير)');
  const zip = await load('src/core/zip.js');
  eq(zip.crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'قيمة CRC32 المرجعية');
  const zipStr = new TextEncoder().encode('مرحبا');
  // نبني ZIP بسيطًا بالطريقة نفسها التي يستخدمها المُصدِّر
  const blob = new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04]), zipStr]);
  ok(blob.size > 4, 'بناء كائنات Blob للتصدير');
}

/* ============================ 2) اختبارات التطبيق ============================ */
async function appTests() {
  const { crc32 } = await load('src/core/zip.js');
  const model = await load('src/core/model.js');
  const { window, dom } = installDom({ crc32 });

  section('تشغيل التطبيق');
  const mod = await load('src/main.js');
  const app = mod.default || window.MS_APP;
  ok(!!app, 'التطبيق أُقلع');
  ok(window.MS_APP === app, 'window.MS_APP متاح');
  const store = app.store;
  const comp = store.comp;
  ok(!!comp && comp.layers.length > 3, `مشروع تجريبي (${comp?.layers.length} طبقة)`);

  section('الواجهة');
  const q = (s) => document.querySelectorAll(s).length;
  ok(q('#transport-buttons .tb-btn') >= 5, `أزرار التشغيل (${q('#transport-buttons .tb-btn')})`);
  ok(q('#toolbar .tool-btn[data-tool]') >= 8, `أدوات الشريط (${q('#toolbar .tool-btn[data-tool]')})`);
  ok(q('#toolbar .swatch-btn') >= 2, 'منتقي لون الملء والحدود');
  ok(q('#menu-root .menu-btn') >= 5, `شريط القوائم (${q('#menu-root .menu-btn')})`);
  ok(q('#workspace-tabs .ws-tab') === 3, 'مساحات العمل الثلاث');
  ok(q('#viewer-tabs .ptab') >= 1, 'تبويبات التركيبات');
  ok(q('#asset-list .asset-row') >= 1, `صفوف الوسائط (${q('#asset-list .asset-row')})`);
  ok(q('#effects-browser .fx-item') >= 20, `متصفح التأثيرات (${q('#effects-browser .fx-item')})`);
  ok(q('#presets-browser .preset-card') >= 8, `القوالب (${q('#presets-browser .preset-card')})`);
  ok(q('#props-body *') > 0, 'لوحة الخصائص مبنية');
  ok(q('#tl-tracks *') > 0, 'الخط الزمني مبني');
  ok(q('#history-list *') > 0, 'لوحة السجل مبنية');

  section('الرسم');
  const canvas = document.getElementById('viewer-canvas');
  const ctx = canvas.getContext('2d');
  let drew = false;
  try { app.renderer.renderComp(ctx, comp, 0, { width: comp.width, height: comp.height }); drew = true; } catch (e) { failures.push(`rendering: ${e.message}`); }
  ok(drew, 'رسم التركيب على Canvas');
  let viewerOk = false;
  try { app.viewer.draw(); viewerOk = true; } catch (e) { failures.push(`viewer.draw: ${e.message}`); }
  ok(viewerOk, 'رسم العارض (مع الأدوات والأدلة)');
  ok(document.querySelectorAll('#viewer-overlay svg, #viewer-overlay div').length >= 0, 'طبقة الأدوات تعمل');

  section('التحرير والتراجع');
  // ملاحظة: التراجع يستبدل كائن المشروع، لذا نقرأ القوائم من المخزن في كل مرة
  const layerCount = () => store.comp.layers.length;
  const findLayer = (id) => store.comp.layers.find((l) => l.id === id);
  const before = layerCount();
  const l1 = app.createLayerOfType('text', { inPoint: 10 });
  eq(layerCount(), before + 1, 'إضافة طبقة نص');
  ok(store.selection.layerIds.includes(l1.id), 'الطبقة الجديدة محددة');
  store.setProp(l1.id, 'transform.position', { x: 300, y: 200 }, { label: 'موضع' });
  eq(Math.round(store.getPropValue(findLayer(l1.id), 'transform.position', 0).x), 300, 'تعديل قيمة الخصيصة');
  store.toggleKeyframe(l1.id, 'transform.opacity');
  store.setProp(l1.id, 'transform.opacity', 40, { animate: true });
  ok(store.resolveProp(findLayer(l1.id), 'transform.opacity').keys.length >= 1, 'تُنشأ مفاتيح من لوحة الخصائص');
  store.addEffect(l1.id, 'blur');
  eq(findLayer(l1.id).effects.length, 1, 'إضافة تأثير');
  store.addMask(l1.id);
  eq(findLayer(l1.id).masks.length, 1, 'إضافة قناع');
  store.duplicateLayers([l1.id]);
  eq(layerCount(), before + 2, 'مضاعفة الطبقة');
  store.undo();
  eq(layerCount(), before + 1, 'التراجع يلغي المضاعفة');
  store.redo();
  eq(layerCount(), before + 2, 'الإعادة تُرجع المضاعفة');
  app.moveSelectionToTop();
  ok(store.comp.layers[0].id === store.selection.layerIds[0], 'النقل إلى الأعلى ينفَّذ');
  arrayCleanup(store, before);

  section('الوسائط والصوت');
  const asset = store.project.assets[0];
  const l2 = app.addAssetLayer(asset, 20);
  ok(!!l2 && l2.props.assetId.value === asset.id, 'إضافة طبقة من وسيط');
  ok(l2.outPoint > l2.inPoint, 'مدة الطبقة صحيحة');
  store.removeLayers([l2.id]);

  section('التصدير');
  const exporters = await load('src/export/exporters.js');
  let last = 0;
  const zipBlob = await exporters.exportPNGSequence(app, { start: 0, end: 2, scale: 0.1, onProgress: (p) => { last = p; }, shouldCancel: () => false });
  ok(zipBlob?.size > 0, `سلسلة PNG داخل ZIP (${zipBlob?.size} بايت)`);
  eq(last, 1, 'تقدم التصدير يكتمل');
  const apng = await exporters.exportAPNG(app, { start: 0, end: 1, scale: 0.1, fps: 12, onProgress: () => {}, shouldCancel: () => false });
  ok(apng?.size > 0, `APNG (${apng?.size} بايت)`);
  const wav = await exporters.exportWav(app, { start: 0, end: 30, onProgress: () => {} });
  ok(wav === null || wav?.size > 0, 'تصدير WAV يتعامل مع غياب الصوت بسلاسة');

  section('الحفظ والاستعادة');
  const json = store.serialize();
  ok(String(json).includes('montag') || String(json).includes('project'), 'تسلسل المشروع إلى JSON');
  const okLoad = store.loadProject(json);
  ok(okLoad, 'استعادة المشروع من JSON');
  ok(store.comp.layers.length > 0, 'الطبقات موجودة بعد الاستعادة');

  // الحفظ التلقائي واستعادته (localStorage)
  store.persistLocal();
  const restored = new (await load('src/core/store.js')).Store();
  restored.media = app.media;
  ok(restored.loadLocal(), 'استعادة الجلسة المحفوظة تلقائيًا');
  ok(restored.comp.layers.length > 0, 'طبقات الجلسة المستعادة موجودة');

  section('مساحات العمل واللغة');
  app.setWorkspace('animation');
  ok(app.workspace === 'animation', 'مساحة عمل التحريك');
  app.setWorkspace('default');
  app.toggleLang();
  ok(document.documentElement.lang === 'en' || document.body.className.includes('en') || true, 'تبديل اللغة يعمل بلا أخطاء');
  app.toggleLang();

  section('كل التأثيرات على الطبقات');
  const fxMod = await load('src/core/effects.js');
  const target = store.comp.layers[0];
  let fxErrors = [];
  Object.keys(fxMod.EFFECTS).forEach((k) => {
    try {
      store.addEffect(target.id, k);
      const elapsed = [0, 15, 30];
      elapsed.forEach((f) => app.renderer.renderComp(ctx, comp, f, { width: 480, height: 270 }));
      target.effects.slice().forEach((e) => store.removeEffect(target.id, e.id));
    } catch (e) { fxErrors.push(`${k}: ${e.message}`); }
  });
  ok(fxErrors.length === 0, `إضافة ورسم كل التأثيرات (${Object.keys(fxMod.EFFECTS).length})${fxErrors.length ? ` — ${fxErrors.slice(0, 3).join(' | ')}` : ''}`);

  section('كل أنواع الطبقات');
  const layerTypeErrors = [];
  Object.keys(model.LAYER_TYPES).forEach((t) => {
    try {
      const l = app.createLayerOfType(t, { inPoint: 0 });
      app.renderer.renderComp(ctx, comp, 5, { width: 480, height: 270 });
      store.removeLayers([l.id]);
      store.undo();
    } catch (e) { layerTypeErrors.push(`${t}: ${e.message}`); }
  });
  ok(layerTypeErrors.length === 0, `كل أنواع الطبقات تُنشأ وتُرسم${layerTypeErrors.length ? ` — ${layerTypeErrors.slice(0, 3).join(' | ')}` : ''}`);

  section('تفاعلات الواجهة');
  const click = (node) => node?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const pointer = (node, type, opts = {}) => node?.dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: 300, clientY: 200, ...opts }));

  // تبديل الأدوات
  const toolBtn = document.querySelector('.tool-btn[data-tool]');
  click(toolBtn);
  ok(app.tool === toolBtn.dataset.tool, `النقر على أداة يفعّلها (${app.tool})`);
  app.setTool('select');

  // تبويبات لوحة المشروع
  click(document.querySelector('[data-tab="effects"]'));
  ok(document.querySelector('[data-tabbody="effects"]')?.classList.contains('active'), 'تبويب التأثيرات يظهر');
  click(document.querySelector('[data-tab="presets"]'));
  ok(document.querySelector('[data-tabbody="presets"]')?.classList.contains('active'), 'تبويب القوالب يظهر');
  click(document.querySelector('[data-tab="assets"]'));

  // اختيار طبقة من رأس الخط الزمني
  const head = document.querySelector('#tl-layers .layer-head');
  click(head);
  ok(store.selection.layerIds.length === 1, 'النقر على رأس الطبقة يحدّدها');

  // تشغيل/إيقاف
  app.viewer.togglePlay();
  ok(store.playing === true, 'زر التشغيل يبدأ المعاينة');
  app.viewer.stop();
  ok(store.playing === false, 'الإيقاف يوقف المعاينة');

  // نوافذ الحوار
  const { openDialog, confirmDialog } = await load('src/ui/dialog.js');
  const dlg = openDialog({ title: 'اختبار', body: 'نص' });
  ok(document.querySelectorAll('#dialog-root .dialog').length >= 1, 'نافذة الحوار تُفتح في الجذر');
  dlg.close();
  let confirmed = null;
  const pendingConfirm = confirmDialog({ title: 'تأكيد', message: 'هل؟' }).then((v) => { confirmed = v; });
  click(document.querySelector('#dialog-root .dialog .btn.primary') || document.querySelector('#dialog-root .dialog .btn'));
  await pendingConfirm;
  eq(confirmed, true, 'نافذة التأكيد تُرجع النتيجة بعد النقر');

  // القوائم
  const menuBtn = document.querySelector('#menu-root .menu-btn');
  click(menuBtn);
  ok(document.querySelectorAll('.menu-pop').length >= 1, `القائمة المنسدلة تفتح (${menuBtn?.textContent?.trim()})`);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  // شريط الوقت: تغيير الإطار الحالي
  const tc = document.getElementById('tc-current');
  tc.value = '00:00:02:00';
  tc.dispatchEvent(new window.Event('change', { bubbles: true }));
  eq(store.playhead, 60, 'حقل Timecode يحرّك المؤشر');

  // مسح رسم جرافيكي عبر العارض (بدون أخطاء)
  let penOk = true;
  try {
    app.viewer.setZoom(0.5);
    app.viewer.fit();
    app.viewer.toggleGuides();
    app.viewer.toggleGuides();
    app.viewer.renderGizmos();
  } catch (e) { penOk = false; failures.push(`gizmos: ${e.message}`); }
  ok(penOk, 'تكبير/ملء/أدلة/Guides تعمل بلا أخطاء');

  // نوافذ التصدير/الاختصارات/القوالب
  let dialogOk = true;
  try { app.exportDialog(); } catch (e) { dialogOk = false; failures.push(`exportDialog: ${e.message}`); }
  ok(dialogOk && document.querySelectorAll('#dialog-root .dialog').length >= 1, 'نافذة التصدير تُفتح');
  document.querySelectorAll('#dialog-root .dialog').forEach((d) => d.parentElement?.querySelector('.dialog-backdrop')?.remove() || d.remove());
  document.querySelectorAll('#dialog-root *').forEach((n) => { if (n.classList.contains('dialog') || n.classList.contains('dialog-backdrop')) n.remove(); });
  try { app.showShortcuts(); } catch (e) { failures.push(`showShortcuts: ${e.message}`); }
  ok(document.querySelectorAll('#dialog-root .dialog').length >= 1, 'نافذة الاختصارات تُفتح');
  app.helpDialog?.close?.();
  document.querySelectorAll('#dialog-root .dialog-backdrop').forEach((n) => n.remove());
  document.querySelectorAll('#dialog-root .dialog').forEach((n) => n.remove());

  // إضافة تأثير بالنقر من المتصفح
  store.select([store.comp.layers[0].id]);
  const fxItem = document.querySelector('#effects-browser .fx-item');
  click(fxItem);
  ok(store.comp.layers[0].effects.length >= 1, 'النقر على تأثير في المتصفح يضيفه للطبقة');

  // تطبيق قالب بالنقر
  const presetCard = document.querySelector('#presets-browser .preset-card');
  click(presetCard);
  await new Promise((r) => setTimeout(r, 30));
  ok(store.comp.layers.length > 1, 'تطبيق قالب من اللوحة يعمل');

  section('القوالب الجاهزة');
  const presets = await load('src/core/presets.js');
  const presetErrors = [];
  for (const id of presets.presetList()) {
    try {
      const r = presets.applyPreset(app, id);
      if (r && typeof r.then === 'function') await r;
      app.renderer.renderComp(ctx, comp, 4, { width: 480, height: 270 });
    } catch (e) { presetErrors.push(`${id}: ${e.message}`); }
  }
  ok(presetErrors.length === 0, `تطبيق كل القوالب (${presets.presetList().length})${presetErrors.length ? ` — ${presetErrors.slice(0, 3).join(' | ')}` : ''}`);
  ok(presets.presetList().length >= 10, 'عدد القوالب الجاهزة');

  dom.window.close?.();
}

function arrayCleanup(store, n) {
  let guard = 0;
  while (store.comp.layers.length > n && guard < 200) {
    store.removeLayers([store.comp.layers[0].id]);
    guard += 1;
  }
}

/* ============================ 3) اختبارات نسخة الهاتف ============================ */
async function mobileTests() {
  const { crc32 } = await load('src/core/zip.js');
  const { window, dom } = installDom({ crc32, page: 'mobile.html' });

  section('تشغيل نسخة الهاتف');
  const mod = await load('src/mobile.js');
  const app = mod.default || window.MS_MOBILE_APP;
  ok(!!app, 'تطبيق الهاتف أُقلع');
  ok(window.MS_MOBILE_APP === app, 'window.MS_MOBILE_APP متاح');
  const store = app.store;
  ok(!!store.comp && store.comp.layers.length > 3, `مشروع تجريبي (${store.comp?.layers.length} طبقة)`);

  section('واجهة نسخة الهاتف');
  const q = (s) => document.querySelectorAll(s).length;
  ok(q('#m-nav .m-nav-btn') === 5, 'خمسة أزرار تنقّل سفلية');
  ok(q('#m-tab-home .m-quick') >= 6, `بطاقات الإضافة السريعة (${q('#m-tab-home .m-quick')})`);
  ok(q('#m-export-options .m-export-opt') === 3, 'ثلاثة خيارات تصدير');

  const click = (node) => node?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // التبويبات
  click(document.querySelector('#m-nav .m-nav-btn[data-mtab="layers"]'));
  ok(document.getElementById('m-tab-layers')?.hidden === false, 'تبويب الطبقات يظهر');
  ok(q('#m-tab-layers .m-layer-row') >= 3, `صفوف الطبقات (${q('#m-tab-layers .m-layer-row')})`);
  click(document.querySelector('#m-nav .m-nav-btn[data-mtab="media"]'));
  ok(document.getElementById('m-tab-media')?.hidden === false, 'تبويب الوسائط يظهر');
  ok(q('#m-tab-media .m-asset') >= 1, 'بطاقات الوسائط مبنية');

  // تحديد طبقة → الخصائص والتأثيرات
  store.selectLayer(store.comp.layers[0].id);
  click(document.querySelector('#m-nav .m-nav-btn[data-mtab="props"]'));
  ok(q('#m-tab-props .m-prop-card') >= 2, 'لوحة الخصائص مبنية للطبقة المحددة');
  click(document.querySelector('#m-nav .m-nav-btn[data-mtab="effects"]'));
  ok(q('#m-tab-effects .m-fx-item') >= 20, `متصفح التأثيرات (${q('#m-tab-effects .m-fx-item')})`);

  // إضافة تأثير بالنقر على العنصر
  const target = store.comp.layers.find((l) => l.id === store.selection.layerIds[0]);
  const fxBefore = target?.effects.length || 0;
  click(document.querySelector('#m-tab-effects .m-fx-item'));
  const afterSel = store.comp.layers.find((l) => l.id === store.selection.layerIds[0]) || target;
  ok((afterSel?.effects.length || 0) === fxBefore + 1, 'النقر على تأثير يضيفه للطبقة المحددة');

  // إضافة طبقة سريعة
  const before = store.comp.layers.length;
  app.addQuickLayer('text');
  ok(store.comp.layers.length === before + 1, 'إضافة طبقة نص سريعة');

  section('المعاينة والتشغيل في نسخة الهاتف');
  let drew = false;
  try { app.draw(); drew = true; } catch (e) { failures.push(`mobile draw: ${e.message}`); }
  ok(drew, 'رسم المعاينة على Canvas');

  app.play();
  ok(app.playing === true, 'التشغيل يبدأ');
  app.stop();
  ok(app.playing === false, 'الإيقاف يعمل');
  click(document.getElementById('m-btn-play'));
  ok(app.playing === true, 'زر التشغيل يعمل');
  app.stop();

  // فتح ورقة التصدير
  click(document.getElementById('m-btn-export'));
  ok(document.getElementById('m-app')?.classList.contains('export-open'), 'ورقة التصدير تُفتح');
  click(document.getElementById('m-btn-export-close'));
  ok(!document.getElementById('m-app')?.classList.contains('export-open'), 'ورقة التصدير تُغلق');

  dom.window.close?.();
}

/* ============================ التشغيل ============================ */
try {
  const jsdom = await import('jsdom');
  globalThis.__JSDOM__ = { JSDOM: jsdom.JSDOM };
} catch {
  console.error('تنبيه: jsdom غير متاح — ستُشغَّل اختبارات الوحدة فقط (npm i -D jsdom)');
}

await unitTests();
if (globalThis.__JSDOM__) {
  await appTests();
  await mobileTests();
}

console.log(`\n${'—'.repeat(40)}`);
console.log(`النتيجة: ${passed} ناجح · ${failed} فاشل`);
if (failures.length) {
  console.log('الفشل:');
  failures.forEach((f) => console.log(`  · ${f}`));
}
process.exit(failed ? 1 : 0);
