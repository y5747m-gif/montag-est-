/**
 * Montage Studio — نسخة الهاتف
 * واجهة تطبيق مخصّصة للمس وشاشات صغيرة، مختلفة تمامًا عن واجهة نسخة الكمبيوتر،
 * لكنها تعمل على نفس المحرّك: المخزن (Store) + العارض (Renderer) + الوسائط والصوت.
 *
 * البنية:
 *   شريط علوي (تراجع/إعادة/تصدير) ← معاينة بملء العرض ← شريط تشغيل
 *   ← لوحة سفلية بتبويبات (الرئيسية/الطبقات/الوسائط/التأثيرات/الخصائص) ← تنقّل سفلي
 */
import { Store } from './core/store.js';
import { MediaManager } from './media/media.js';
import { AudioEngine } from './media/audio.js';
import { Renderer } from './render/engine.js';
import { createLayer } from './core/model.js';
import { EFFECTS, EFFECT_CATEGORIES } from './core/effects.js';
import { createDemoProject, registerDemoMedia } from './project/demo.js';
import { toastOk, toastWarn, toastErr } from './ui/toast.js';
import { el, clear, icon } from './ui/dom.js';
import { clamp, framesToTimecode, downloadBlob } from './core/util.js';

const TAB_META = {
  home: { title: 'الرئيسية', sub: 'إضافة سريعة وأدوات عامة' },
  layers: { title: 'الطبقات', sub: 'حدّد طبقة للتحكم بها' },
  media: { title: 'الوسائط', sub: 'استيراد وإضافة الملفات' },
  effects: { title: 'التأثيرات', sub: 'اضغط تأثيرًا لتطبيقه على الطبقة المحددة' },
  props: { title: 'الخصائص', sub: 'خصائص الطبقة المحددة' },
};

const TYPE_INFO = {
  text: { label: 'نص', ico: 'i-text' },
  shape: { label: 'شكل', ico: 'i-shapes' },
  solid: { label: 'خلفية صلبة', ico: 'i-solid' },
  image: { label: 'صورة', ico: 'i-image' },
  video: { label: 'فيديو', ico: 'i-video' },
  audio: { label: 'صوت', ico: 'i-audio' },
  precomp: { label: 'تركيب مسبق', ico: 'i-folder' },
  adjustment: { label: 'طبقة ضبط', ico: 'i-adjust' },
  null: { label: 'كائن فارغ', ico: 'i-minus' },
  light: { label: 'إضاءة', ico: 'i-spark' },
  camera: { label: 'كاميرا', ico: 'i-video' },
  particles: { label: 'جزيئات', ico: 'i-spark' },
  visualizer: { label: 'موجّه صوتي', ico: 'i-wave' },
};

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || 'video/webm';
}

function safeName(name) {
  return String(name || 'project').replace(/[^\w\u0600-\u06FF-]+/g, '_');
}

/* ========================================================================== */
class MobileApp {
  constructor() {
    this.store = new Store();
    this.media = new MediaManager(this.store);
    this.store.media = this.media;
    this.audio = new AudioEngine(this.store, this.media);
    this.renderer = new Renderer(this.store, this.media);
    this.tab = 'home';
    this.playing = false;
    this._raf = null;
    this._lastT = 0;
    this.renderQueued = false;
    this.canvas = document.getElementById('m-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
  }

  /* ============================ الإقلاع ============================ */
  init() {
    const boot = document.getElementById('m-boot');

    registerDemoMedia(this.media);
    const restored = this.store.loadLocal();
    if (!restored) {
      const project = createDemoProject();
      this.store.loadProject(project, { resetHistory: true, silent: true });
      this.store.setStatus('مرحبًا بك في نسخة الهاتف');
    }

    this.bindTopbar();
    this.bindNav();
    this.bindTransport();
    this.bindExport();
    this.bindStoreEvents();

    this.syncMeta();
    this.renderAll();
    this.layout();

    if (boot) {
      const bar = document.getElementById('m-boot-bar');
      if (bar) bar.style.width = '100%';
      setTimeout(() => {
        boot.style.opacity = '0';
        setTimeout(() => boot.remove(), 420);
      }, 240);
    }
    if (!restored) toastOk('مشروع تجريبي جاهز — جرّب التبويبات في الأسفل');
    this.setupPreviewMode();
  }

  /* ============================ ربط الأحداث ============================ */
  bindTopbar() {
    document.getElementById('m-btn-undo')?.addEventListener('click', () => this.store.undo());
    document.getElementById('m-btn-redo')?.addEventListener('click', () => this.store.redo());
    document.getElementById('m-btn-export')?.addEventListener('click', () => this.openExport());
  }

  bindNav() {
    const app = document.getElementById('m-app');
    document.querySelectorAll('#m-nav .m-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setTab(btn.dataset.mtab);
        // فتح اللوحة إن كانت مطوية
        app.classList.remove('sheet-collapsed');
      });
    });
    document.getElementById('m-sheet-head')?.addEventListener('click', (e) => {
      if (e.target.closest('#m-btn-collapse')) return;
      app.classList.add('sheet-collapsed');
    });
    document.getElementById('m-btn-collapse')?.addEventListener('click', () => {
      app.classList.toggle('sheet-collapsed');
    });
  }

  bindTransport() {
    document.getElementById('m-playfab')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('m-btn-play')?.addEventListener('click', () => this.togglePlay());
    // لمس المعاينة يشغّل / يوقف — سلوك تطبيقات الهاتف
    document.getElementById('m-canvas-wrap')?.addEventListener('click', () => this.togglePlay());
    const loop = document.getElementById('m-btn-loop');
    if (loop) {
      loop.addEventListener('click', () => {
        this.store.loop = !this.store.loop;
        loop.classList.toggle('on', this.store.loop);
      });
      loop.classList.toggle('on', this.store.loop);
    }
    const scrubber = document.getElementById('m-scrubber');
    if (scrubber) {
      scrubber.addEventListener('input', () => {
        if (this.playing) this.stop();
        this.store.setPlayhead(parseInt(scrubber.value || '0', 10));
      });
    }
  }

  bindExport() {
    document.getElementById('m-btn-export-close')?.addEventListener('click', () => this.closeExport());
    document.getElementById('m-overlay')?.addEventListener('click', () => this.closeExport());
    document.querySelectorAll('#m-export-options .m-export-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.mexport;
        if (kind === 'png') this.exportPNG();
        else if (kind === 'webm') this.exportWebM(btn);
        else if (kind === 'json') this.exportProject();
      });
    });
    const input = document.getElementById('m-file-input');
    if (input) {
      input.addEventListener('change', async () => {
        const files = [...(input.files || [])];
        input.value = '';
        if (files.length) await this.importFiles(files);
      });
    }
  }

  bindStoreEvents() {
    const store = this.store;
    store.on('time', () => { this.updateTimeUI(); this.queueRender(); });
    store.on('selection', () => { this.renderLayersTab(); this.renderEffectsTab(); this.renderPropsTab(); this.queueRender(); });
    store.on('project', () => { this.syncMeta(); this.renderAll(); this.layout(); });
    store.on('change', () => { this.renderAll(); this.queueRender(); });
    store.on('history', () => this.updateHistoryButtons());
    store.on('playing', (v) => this.updatePlayUI(v));
    // نتائج الحفظ عبر جسر أندرويد الأصلي (داخل APK)
    document.addEventListener('ms:file-saved', (e) => {
      if (e.detail?.ok) toastOk(`حُفظ «${e.detail.name}» في مجلد التنزيلات`);
      else toastErr(`تعذّر حفظ «${e.detail?.name || 'الملف'}»`);
    });
  }

  /* ============================ أدوات عامة ============================ */
  get selectedLayer() {
    const id = this.store.selection.layerIds[0];
    if (!id) return null;
    return this.store.comp.layers.find((l) => l.id === id) || null;
  }

  setStatus(msg) {
    this.store.setStatus(msg);
  }

  /* ============================ المعاينة والتشغيل ============================ */
  layout() {
    const comp = this.store.comp;
    if (!comp || !this.canvas) return;
    const stage = document.getElementById('m-stage');
    if (!stage) return;
    const availW = Math.max(80, stage.clientWidth - 28);
    const availH = Math.max(80, stage.clientHeight - 16);
    const fit = Math.min(availW / comp.width, availH / comp.height);
    const dispW = Math.max(60, Math.floor(comp.width * fit));
    const dispH = Math.max(60, Math.floor(comp.height * fit));
    // دقة داخلية معقولة لأداء سلس على الهاتف
    const res = Math.min(1, 1000 / Math.max(1, comp.width));
    this.canvas.width = Math.max(2, Math.round(comp.width * res));
    this.canvas.height = Math.max(2, Math.round(comp.height * res));
    this.canvas.style.width = `${dispW}px`;
    this.canvas.style.height = `${dispH}px`;
    this.queueRender();
  }

  queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.draw();
    });
  }

  draw() {
    const comp = this.store.comp;
    if (!comp || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    try {
      this.renderer.renderComp(this.ctx, comp, this.store.playhead, { width: w, height: h, transparent: true });
    } catch (e) {
      console.error('فشل رسم الإطار', e);
    }
  }

  togglePlay() { if (this.playing) this.stop(); else this.play(); }

  play() {
    if (this.playing) return;
    const comp = this.store.comp;
    if (!comp) return;
    if (this.store.playhead >= this.store.duration) this.store.setPlayhead(0);
    this.playing = true;
    this.store.setPlaying(true);
    this.audio.play(this.store.playhead);
    this._lastT = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      const dt = Math.min(0.25, (now - this._lastT) / 1000);
      this._lastT = now;
      const dur = this.store.duration;
      let f = this.store.playhead + dt * this.store.fps;
      if (f >= dur) {
        if (this.store.loop) f = 0;
        else { this.store.setPlayhead(dur); this.stop(); return; }
      }
      this.store.setPlayhead(f);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (!this.playing && !this._raf) { this.audio.stop(); return; }
    this.playing = false;
    this.store.setPlaying(false);
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this.audio.stop();
  }

  updatePlayUI(playing) {
    const app = document.getElementById('m-app');
    app?.classList.toggle('is-playing', !!playing);
    const set = (id) => {
      const node = document.getElementById(id);
      if (!node) return;
      clear(node).appendChild(icon(playing ? 'i-pause' : 'i-play', 22));
    };
    set('m-btn-play');
    set('m-playfab');
  }

  updateTimeUI() {
    const store = this.store;
    const cur = document.getElementById('m-tc-current');
    if (cur) cur.textContent = framesToTimecode(store.playhead, store.fps);
    const scrubber = document.getElementById('m-scrubber');
    if (scrubber && document.activeElement !== scrubber) {
      scrubber.value = String(store.playhead);
      const pct = store.duration ? (store.playhead / store.duration) * 100 : 0;
      scrubber.style.setProperty('--fill', `${pct}%`);
    }
  }

  syncMeta() {
    const comp = this.store.comp;
    if (!comp) return;
    const name = document.getElementById('m-project-name');
    if (name) name.textContent = this.store.project?.name || 'مشروع';
    const badge = document.getElementById('m-stage-badge');
    if (badge) badge.textContent = `${comp.width}×${comp.height} · ${Math.round(comp.fps)}fps`;
    const dur = document.getElementById('m-tc-duration');
    if (dur) dur.textContent = framesToTimecode(comp.duration, comp.fps);
    const scrubber = document.getElementById('m-scrubber');
    if (scrubber) scrubber.max = String(comp.duration);
    this.updateTimeUI();
  }

  updateHistoryButtons() {
    const undo = document.getElementById('m-btn-undo');
    const redo = document.getElementById('m-btn-redo');
    if (undo) undo.disabled = !this.store.canUndo();
    if (redo) redo.disabled = !this.store.canRedo();
  }

  /* ============================ التبويبات ============================ */
  setTab(tab) {
    if (!TAB_META[tab]) return;
    this.tab = tab;
    document.querySelectorAll('#m-nav .m-nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mtab === tab);
    });
    const bodies = { home: 'm-tab-home', layers: 'm-tab-layers', media: 'm-tab-media', effects: 'm-tab-effects', props: 'm-tab-props' };
    Object.entries(bodies).forEach(([key, id]) => {
      const node = document.getElementById(id);
      if (node) node.hidden = key !== tab;
    });
    const title = document.getElementById('m-sheet-title');
    const sub = document.getElementById('m-sheet-sub');
    if (title) title.textContent = TAB_META[tab].title;
    if (sub) sub.textContent = TAB_META[tab].sub;
    this.renderTab(tab);
  }

  renderTab(tab) {
    if (tab === 'home') this.renderHomeTab();
    else if (tab === 'layers') this.renderLayersTab();
    else if (tab === 'media') this.renderMediaTab();
    else if (tab === 'effects') this.renderEffectsTab();
    else if (tab === 'props') this.renderPropsTab();
  }

  renderAll() {
    Object.keys(TAB_META).forEach((tab) => {
      const id = { home: 'm-tab-home', layers: 'm-tab-layers', media: 'm-tab-media', effects: 'm-tab-effects', props: 'm-tab-props' }[tab];
      const node = document.getElementById(id);
      if (node && !node.hidden) this.renderTab(tab);
    });
  }

  /* --------------------------- الرئيسية --------------------------- */
  renderHomeTab() {
    const host = document.getElementById('m-tab-home');
    if (!host) return;
    clear(host);
    const fileBtn = el('button', { class: 'm-quick wide', onclick: () => document.getElementById('m-file-input')?.click() }, [
      icon('i-open', 20), el('span', { text: 'استيراد فيديو / صوت / صور' }),
    ]);
    const add = (ico, label, type, opts = {}) => el('button', {
      class: 'm-quick',
      onclick: () => this.addQuickLayer(type, opts),
    }, [icon(ico, 22), el('span', { text: label })]);

    host.append(
      fileBtn,
      el('div', { class: 'm-section-title', text: 'إضافة طبقات' }),
      el('div', { class: 'm-quick-grid' },
        [
          add('i-text', 'نص', 'text'),
          add('i-rect', 'مستطيل', 'shape', { kind: 'rect' }),
          add('i-ellipse', 'بيضاوي', 'shape', { kind: 'ellipse' }),
          add('i-star', 'نجمة', 'shape', { kind: 'star' }),
          add('i-solid', 'خلفية', 'solid'),
          add('i-adjust', 'ضبط', 'adjustment'),
          add('i-spark', 'جزيئات', 'particles'),
          add('i-wave', 'موجّه', 'visualizer'),
        ],
      ),
      el('div', { class: 'm-section-title', text: 'أدوات' }),
      el('div', { class: 'm-quick-grid' }, [
        el('button', {
          class: 'm-quick',
          title: 'تنزيل ملف APK للتثبيت الدائم',
          onclick: () => {
            if (window.AndroidBridge) {
              // داخل التطبيق: افتح رابط التنزيل في المتصفح النظامي
              window.location.href = 'download/apk';
            } else {
              const a = document.createElement('a');
              a.href = 'download/apk';
              a.download = 'MontageStudio.apk';
              document.body.appendChild(a);
              a.click();
              a.remove();
              toastOk('جارٍ تنزيل ملف APK — ثبّته من التنزيلات');
            }
          },
        }, [icon('i-phone', 22), el('span', { text: 'تنزيل APK' })]),
        el('button', {
          class: 'm-quick',
          onclick: () => { this.store.saveToFile(); toastOk('تم حفظ المشروع'); },
        }, [icon('i-save', 22), el('span', { text: 'حفظ المشروع' })]),
        el('button', {
          class: 'm-quick',
          onclick: () => this.openExport(),
        }, [icon('i-export', 22), el('span', { text: 'تصدير' })]),
        el('a', { class: 'm-quick', href: 'desktop.html', style: { textDecoration: 'none' } }, [
          icon('i-monitor', 22), el('span', { text: 'نسخة الكمبيوتر' }),
        ]),
        el('a', { class: 'm-quick', href: 'index.html', style: { textDecoration: 'none' } }, [
          icon('i-phone', 22), el('span', { text: 'صفحة التحميل' }),
        ]),
      ]),
    );
  }

  addQuickLayer(type, opts = {}) {
    const comp = this.store.comp;
    const start = this.store.playhead;
    const layer = createLayer(type, { inPoint: start });
    const isGlobal = type === 'adjustment' || type === 'null' || type === 'camera';
    layer.inPoint = isGlobal ? 0 : start;
    layer.outPoint = comp.duration;
    layer.transform.position.value = { x: comp.width / 2, y: comp.height / 2 };
    if (type === 'text') {
      layer.props.text.value = 'نصّك هنا';
      layer.props.fill.value = '#c084fc';
      layer.transform.anchor.value = { x: comp.width / 2, y: comp.height / 2 };
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 5);
    } else if (type === 'shape') {
      layer.props.kind.value = opts.kind || 'rect';
      layer.props.fill.value = '#8b5cf6';
      layer.props.strokeColor.value = '#ffffff';
      layer.props.size.value = { x: Math.round(comp.width * 0.3), y: Math.round(comp.width * 0.3) };
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 5);
    } else if (type === 'solid') {
      layer.props.color.value = '#7c3aed';
      layer.props.color2 && (layer.props.color2.value = '#ec4899');
    } else if (type === 'particles' || type === 'visualizer') {
      layer.props.color.value = '#e879f9';
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 8);
      if (type === 'visualizer') {
        const asset = this.store.project.assets.find((a) => a.kind === 'audio' || a.kind === 'video');
        if (asset && layer.props.assetId) layer.props.assetId.value = asset.id;
      }
    }
    this.store.addLayer(layer);
    this.store.setStatus(`أُضيفت طبقة: ${TYPE_INFO[type]?.label || type}`);
    toastOk(`أُضيفت طبقة: ${TYPE_INFO[type]?.label || type}`);
    this.setTab('layers');
  }

  /* --------------------------- الطبقات --------------------------- */
  renderLayersTab() {
    const host = document.getElementById('m-tab-layers');
    if (!host) return;
    clear(host);
    const comp = this.store.comp;
    if (!comp) return;
    const layers = comp.layers; // [0] = الأعلى

    if (!layers.length) {
      host.appendChild(el('div', { class: 'm-empty-hint', text: 'لا توجد طبقات بعد — أضف طبقة من تبويب «الرئيسية»' }));
      return;
    }

    const selId = this.store.selection.layerIds[0];
    layers.forEach((layer, index) => {
      const info = TYPE_INFO[layer.type] || { label: layer.type, ico: 'i-shapes' };
      const selected = layer.id === selId;
      const row = el('div', {
        class: `m-layer-row ${selected ? 'selected' : ''}`,
        onclick: () => { this.store.selectLayer(layer.id); this.store.setStatus(`تم تحديد: ${layer.name}`); },
      }, [
        el('span', { class: 'm-layer-ico' }, [icon(info.ico, 18)]),
        el('div', { class: 'm-layer-main' }, [
          el('b', { text: layer.name || info.label }),
          el('span', { text: `${info.label} · ${layer.inPoint}–${layer.outPoint} إطار` }),
        ]),
        el('button', {
          class: `m-layer-act ${layer.enabled ? '' : 'off'}`,
          title: 'إظهار / إخفاء',
          onclick: (e) => { e.stopPropagation(); this.store.setLayerFlag(layer.id, 'enabled', !layer.enabled); },
        }, [icon(layer.enabled ? 'i-eye' : 'i-eye-off', 18)]),
      ]);
      host.appendChild(row);
    });

    if (selId) {
      const idx = layers.findIndex((l) => l.id === selId);
      const tools = el('div', { class: 'm-layer-tools' }, [
        el('button', {
          class: 'm-chipbtn', title: 'لأعلى',
          onclick: () => idx > 0 && this.store.reorderLayer(selId, idx - 1),
        }, [icon('i-up', 16), el('span', { text: 'لأعلى' })]),
        el('button', {
          class: 'm-chipbtn', title: 'لأسفل',
          onclick: () => idx < layers.length - 1 && this.store.reorderLayer(selId, idx + 1),
        }, [icon('i-down', 16), el('span', { text: 'لأسفل' })]),
        el('button', {
          class: 'm-chipbtn', title: 'مضاعفة',
          onclick: () => { this.store.duplicateLayers([selId]); toastOk('تمت المضاعفة'); },
        }, [icon('i-copy', 16), el('span', { text: 'مضاعفة' })]),
        el('button', {
          class: 'm-chipbtn danger', title: 'حذف',
          onclick: () => { this.store.removeLayers([selId]); toastOk('حُذفت الطبقة'); },
        }, [icon('i-trash', 16), el('span', { text: 'حذف' })]),
      ]);
      host.prepend(tools);
    }
  }

  /* --------------------------- الوسائط --------------------------- */
  renderMediaTab() {
    const host = document.getElementById('m-tab-media');
    if (!host) return;
    clear(host);
    const assets = this.store.project?.assets || [];

    host.appendChild(el('button', {
      class: 'm-import-card',
      onclick: () => document.getElementById('m-file-input')?.click(),
    }, [
      icon('i-open', 26),
      el('b', { text: 'استيراد ملفات' }),
      el('span', { text: 'فيديو • صوت • صور — من جهازك' }),
    ]));

    if (!assets.length) {
      host.appendChild(el('div', { class: 'm-empty-hint', text: 'لا توجد وسائط في المشروع بعد' }));
      return;
    }

    const kindLabel = { video: 'فيديو', audio: 'صوت', image: 'صورة' };
    const grid = el('div', { class: 'm-media-grid' });
    assets.forEach((asset) => {
      const kind = kindLabel[asset.kind] || asset.kind;
      const thumb = el('div', { class: 'm-asset-thumb' });
      if (asset.thumb) thumb.appendChild(el('img', { src: asset.thumb, alt: '' }));
      else thumb.appendChild(icon(asset.kind === 'audio' ? 'i-audio' : asset.kind === 'video' ? 'i-video' : 'i-image', 22));
      grid.appendChild(el('button', {
        class: 'm-asset',
        title: `إضافة "${asset.name}" كطبقة`,
        onclick: () => this.addAssetLayer(asset),
      }, [
        thumb,
        el('div', { class: 'm-asset-meta' }, [
          el('b', { text: asset.name }),
          el('span', { text: kind }),
        ]),
      ]));
    });
    host.appendChild(grid);
    host.appendChild(el('div', { class: 'm-empty-hint', text: 'اضغط على أي وسيط لإضافته كطبقة في موضع المؤشر' }));
  }

  async importFiles(files) {
    try {
      const out = await this.media.importFiles(files, { fps: this.store.fps });
      const media = out.filter((o) => o.kind !== 'project');
      if (media.length) {
        toastOk(`استُوردت ${media.length} وسائط — اضغط عليها لإضافتها`);
        this.setTab('media');
      }
    } catch (e) {
      toastErr(`تعذّر الاستيراد: ${e.message}`);
    }
  }

  addAssetLayer(asset) {
    if (!asset) return;
    const comp = this.store.comp;
    const start = this.store.playhead;
    const typeByKind = { image: 'image', video: 'video', audio: 'audio' };
    const type = typeByKind[asset.kind] || 'image';
    const layer = createLayer(type, { name: asset.name, inPoint: start });
    layer.props.assetId.value = asset.id;
    const dur = asset.durationFrames || (type === 'image' ? comp.fps * 5 : comp.duration);
    layer.outPoint = clamp(start + dur, start + 1, comp.duration);
    layer.transform.position.value = { x: comp.width / 2, y: comp.height / 2 };
    this.store.addLayer(layer);
    toastOk(`أُضيفت طبقة: ${asset.name}`);
    this.store.setStatus(`أُضيفت طبقة: ${asset.name}`);
  }

  /* --------------------------- التأثيرات --------------------------- */
  renderEffectsTab() {
    const host = document.getElementById('m-tab-effects');
    if (!host) return;
    clear(host);
    const layer = this.selectedLayer;

    if (layer) {
      host.appendChild(el('div', { class: 'm-section-title', text: `تأثيرات الطبقة: ${layer.name}` }));
      if (!layer.effects.length) {
        host.appendChild(el('div', { class: 'm-empty-hint', text: 'لا توجد تأثيرات على هذه الطبقة — اختر من القائمة أدناه' }));
      }
      layer.effects.forEach((fx) => {
        host.appendChild(el('div', { class: 'm-layer-row selected', style: { padding: '8px 12px' } }, [
          el('span', { class: 'm-layer-ico' }, [icon('i-effects', 17)]),
          el('div', { class: 'm-layer-main' }, [
            el('b', { text: fx.name }),
            el('span', { text: fx.enabled ? 'مفعّل' : 'معطّل' }),
          ]),
          el('button', {
            class: `m-layer-act ${fx.enabled ? '' : 'off'}`,
            onclick: () => this.store.toggleEffect(layer.id, fx.id),
          }, [icon(fx.enabled ? 'i-eye' : 'i-eye-off', 17)]),
          el('button', {
            class: 'm-layer-act off',
            onclick: () => this.store.removeEffect(layer.id, fx.id),
          }, [icon('i-trash', 17)]),
        ]));
      });
    } else {
      host.appendChild(el('div', { class: 'm-empty-hint', text: 'حدّد طبقة أولًا من تبويب «الطبقات» ثم اختر تأثيرًا' }));
    }

    // فهرس التأثيرات مع بحث
    const searchWrap = el('div', { class: 'm-search' }, [
      icon('i-search', 17),
    ]);
    const searchInput = el('input', { placeholder: 'ابحث عن تأثير…', spellcheck: 'false' });
    searchWrap.appendChild(searchInput);
    host.appendChild(el('div', { class: 'm-section-title', text: `كل التأثيرات (${Object.keys(EFFECTS).length})` }));
    host.appendChild(searchWrap);

    const listHost = el('div');
    host.appendChild(listHost);

    const renderList = (query = '') => {
      clear(listHost);
      const q = query.trim().toLowerCase();
      const layerId = this.store.selection.layerIds[0];
      for (const cat of EFFECT_CATEGORIES) {
        const items = Object.entries(EFFECTS).filter(([, def]) => def.cat === cat.key)
          .filter(([key, def]) => !q || key.toLowerCase().includes(q) || def.name.ar.includes(query) || def.name.en.toLowerCase().includes(q));
        if (!items.length) continue;
        listHost.appendChild(el('div', { class: 'm-section-title', text: cat.ar }));
        items.forEach(([key, def]) => {
          listHost.appendChild(el('button', {
            class: 'm-fx-item',
            onclick: () => {
              if (!this.store.selection.layerIds[0]) { toastWarn('حدّد طبقة أولًا من تبويب «الطبقات»'); return; }
              this.store.addEffect(layerId, key);
              toastOk(`أُضيف تأثير: ${def.name.ar}`);
              this.renderEffectsTab();
            },
          }, [
            el('span', { class: 'm-fx-cat', text: cat.ar.trim()[0] || '✦' }),
            el('span', { style: { minWidth: '0' } }, [
              el('b', { text: def.name.ar }),
              el('span', { text: def.name.en }),
            ]),
            el('span', { class: 'add-ico' }, [icon('i-plus', 17)]),
          ]));
        });
      }
      if (!listHost.childElementCount) listHost.appendChild(el('div', { class: 'm-empty-hint', text: 'لا نتائج مطابقة' }));
    };
    searchInput.addEventListener('input', () => renderList(searchInput.value));
    renderList();
  }

  /* --------------------------- الخصائص --------------------------- */
  renderPropsTab() {
    const host = document.getElementById('m-tab-props');
    if (!host) return;
    clear(host);
    const layer = this.selectedLayer;
    if (!layer) {
      host.appendChild(el('div', { class: 'm-empty-hint', text: 'لا توجد طبقة محددة — اختر طبقة من تبويب «الطبقات»' }));
      return;
    }
    const store = this.store;
    const comp = this.store.comp;
    const frame = store.playhead;

    // الاسم
    const nameInput = el('input', { class: 'm-textfield', value: layer.name || '', spellcheck: 'false' });
    nameInput.addEventListener('change', () => store.renameLayer(layer.id, nameInput.value || 'طبقة'));
    host.appendChild(el('div', { class: 'm-prop-card' }, [
      el('b', { text: 'الاسم' }),
      nameInput,
    ]));

    // التحويل
    const pos = store.getPropValue(layer, 'transform.position', frame) || { x: 0, y: 0 };
    const scale = store.getPropValue(layer, 'transform.scale', frame) || { x: 100, y: 100 };
    const rot = store.getPropValue(layer, 'transform.rotation', frame) || 0;
    const opa = store.getPropValue(layer, 'transform.opacity', frame) ?? 100;

    const slider = ({ label, min, max, step = 1, value, fmt = (v) => String(Math.round(v)), onInput }) => {
      const val = el('span', { class: 'm-prop-val', text: fmt(value) });
      const range = el('input', { class: 'm-range', type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
      const paint = () => {
        const pct = ((parseFloat(range.value) - min) / (max - min)) * 100;
        range.style.setProperty('--fill', `${clamp(pct, 0, 100)}%`);
      };
      range.addEventListener('input', () => { val.textContent = fmt(parseFloat(range.value)); paint(); onInput(parseFloat(range.value)); });
      paint();
      return el('div', { class: 'm-prop-row' }, [el('label', { text: label }), range, val]);
    };

    const setVec = (path, axis, v) => {
      const cur = store.getPropValue(layer, path, frame) || { x: 0, y: 0 };
      store.setProp(layer.id, path, { ...cur, [axis]: v }, { coalesce: `m-${path}-${axis}` });
    };

    host.appendChild(el('div', { class: 'm-prop-card' }, [
      el('b', { text: 'التحويل' }),
      slider({
        label: 'أفقي', min: -comp.width, max: comp.width * 2, value: pos.x,
        onInput: (v) => setVec('transform.position', 'x', v),
      }),
      slider({
        label: 'رأسي', min: -comp.height, max: comp.height * 2, value: pos.y,
        onInput: (v) => setVec('transform.position', 'y', v),
      }),
      slider({
        label: 'المقياس', min: 1, max: 400, value: scale.x, fmt: (v) => `${Math.round(v)}%`,
        onInput: (v) => store.setProp(layer.id, 'transform.scale', { x: v, y: v }, { coalesce: 'm-scale' }),
      }),
      slider({
        label: 'الدوران', min: -180, max: 180, value: rot, fmt: (v) => `${Math.round(v)}°`,
        onInput: (v) => store.setProp(layer.id, 'transform.rotation', v, { coalesce: 'm-rot' }),
      }),
      slider({
        label: 'الشفافية', min: 0, max: 100, value: opa, fmt: (v) => `${Math.round(v)}%`,
        onInput: (v) => store.setProp(layer.id, 'transform.opacity', v, { coalesce: 'm-opa' }),
      }),
    ]));

    // خصائص النوع
    if (layer.type === 'text') {
      const textInput = el('textarea', { class: 'm-textfield', rows: '2', spellcheck: 'false' });
      textInput.value = store.getPropValue(layer, 'props.text', frame) || '';
      textInput.addEventListener('change', () => store.setProp(layer.id, 'props.text', textInput.value, { coalesce: 'm-text' }));
      const size = store.getPropValue(layer, 'props.fontSize', frame) || 72;
      const fill = store.getPropValue(layer, 'props.fill', frame) || '#ffffff';
      const colorInput = el('input', { type: 'color', value: this.toHex6(fill) });
      colorInput.addEventListener('input', () => store.setProp(layer.id, 'props.fill', colorInput.value, { coalesce: 'm-fill' }));
      host.appendChild(el('div', { class: 'm-prop-card' }, [
        el('b', { text: 'النص' }),
        textInput,
        el('div', { style: { height: '10px' } }),
        slider({
          label: 'الحجم', min: 8, max: 300, value: size,
          onInput: (v) => store.setProp(layer.id, 'props.fontSize', v, { coalesce: 'm-fontsize' }),
        }),
        el('div', { class: 'm-colorrow' }, [el('label', { text: 'اللون', style: { fontSize: '12px', color: 'var(--m-txt-2)' } }), colorInput]),
      ]));
    } else if (layer.type === 'shape') {
      const fill = store.getPropValue(layer, 'props.fill', frame) || '#8b5cf6';
      const stroke = store.getPropValue(layer, 'props.strokeColor', frame) || '#ffffff';
      const sw = store.getPropValue(layer, 'props.strokeWidth', frame) || 0;
      const fillInput = el('input', { type: 'color', value: this.toHex6(fill) });
      fillInput.addEventListener('input', () => store.setProp(layer.id, 'props.fill', fillInput.value, { coalesce: 'm-fill' }));
      const strokeInput = el('input', { type: 'color', value: this.toHex6(stroke) });
      strokeInput.addEventListener('input', () => store.setProp(layer.id, 'props.strokeColor', strokeInput.value, { coalesce: 'm-stroke' }));
      host.appendChild(el('div', { class: 'm-prop-card' }, [
        el('b', { text: 'الشكل' }),
        el('div', { class: 'm-colorrow' }, [el('label', { text: 'الملء', style: { fontSize: '12px', color: 'var(--m-txt-2)' } }), fillInput]),
        el('div', { style: { height: '10px' } }),
        el('div', { class: 'm-colorrow' }, [el('label', { text: 'الحدود', style: { fontSize: '12px', color: 'var(--m-txt-2)' } }), strokeInput]),
        el('div', { style: { height: '10px' } }),
        slider({
          label: 'السماكة', min: 0, max: 60, value: sw,
          onInput: (v) => store.setProp(layer.id, 'props.strokeWidth', v, { coalesce: 'm-sw' }),
        }),
      ]));
    } else if (layer.type === 'solid') {
      const color = store.getPropValue(layer, 'props.color', frame) || '#7c3aed';
      const colorInput = el('input', { type: 'color', value: this.toHex6(color) });
      colorInput.addEventListener('input', () => store.setProp(layer.id, 'props.color', colorInput.value, { coalesce: 'm-color' }));
      host.appendChild(el('div', { class: 'm-prop-card' }, [
        el('b', { text: 'الخلفية الصلبة' }),
        el('div', { class: 'm-colorrow' }, [el('label', { text: 'اللون', style: { fontSize: '12px', color: 'var(--m-txt-2)' } }), colorInput]),
      ]));
    } else if (layer.type === 'audio' || layer.type === 'video') {
      const vol = store.getPropValue(layer, 'audio.volume', frame) ?? 100;
      host.appendChild(el('div', { class: 'm-prop-card' }, [
        el('b', { text: 'الصوت' }),
        slider({
          label: 'مستوى', min: 0, max: 200, value: vol, fmt: (v) => `${Math.round(v)}%`,
          onInput: (v) => store.setProp(layer.id, 'audio.volume', v, { coalesce: 'm-vol' }),
        }),
      ]));
    }

    host.appendChild(el('div', { class: 'm-empty-hint', text: 'نصيحة: استخدم تبويب «التأثيرات» لإضافة توهّج أو تمويه أو انتقالات' }));
  }

  toHex6(c) {
    if (!c || typeof c !== 'string') return '#ffffff';
    if (c.length === 9 && c.startsWith('#')) return c.slice(0, 7); // #RRGGBBAA → #RRGGBB
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    return '#ffffff';
  }

  /* ============================ التصدير ============================ */
  openExport() {
    document.getElementById('m-app')?.classList.add('export-open');
  }

  closeExport() {
    document.getElementById('m-app')?.classList.remove('export-open');
  }

  exportProgress(pct, label) {
    const bar = document.querySelector('#m-export-progress');
    const fill = bar?.querySelector('i');
    const lab = document.getElementById('m-export-label');
    if (bar) bar.classList.toggle('show', pct != null);
    if (fill && pct != null) fill.style.width = `${Math.round(clamp(pct, 0, 1) * 100)}%`;
    if (lab) lab.textContent = label || '';
  }

  exportPNG() {
    const comp = this.store.comp;
    const url = this.renderer.renderToDataURL(comp, this.store.playhead, { scale: 1 });
    fetch(url).then((r) => r.blob()).then((b) => {
      downloadBlob(b, `${safeName(comp.name)}_${this.store.playhead}.png`);
      toastOk('تم تصدير الصورة');
      this.closeExport();
    }).catch(() => toastErr('تعذّر تصدير الصورة'));
  }

  exportProject() {
    this.store.saveToFile();
    toastOk('تم حفظ ملف المشروع');
    this.closeExport();
  }

  async exportWebM(btn) {
    if (this._exporting) { toastWarn('هناك تصدير جارٍ بالفعل'); return; }
    if (!window.MediaRecorder) { toastErr('المتصفح لا يدعم تسجيل الفيديو'); return; }
    const comp = this.store.comp;
    const fps = comp.fps;
    const total = this.store.duration;
    const scale = Math.min(1, 720 / Math.max(comp.width, comp.height));
    const w = Math.max(2, Math.round((comp.width * scale) / 2) * 2);
    const h = Math.max(2, Math.round((comp.height * scale) / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    let stream;
    try {
      stream = canvas.captureStream(fps);
    } catch (e) {
      toastErr('تعذّر بدء التسجيل');
      return;
    }
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: 5_000_000 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = () => res(); });

    this._exporting = true;
    if (btn) btn.disabled = true;
    this.stop();
    this.exportProgress(0, 'جارٍ التسجيل…');
    rec.start(200);
    const startT = performance.now();
    const step = () => {
      if (!this._exporting) return;
      const elapsed = (performance.now() - startT) / 1000;
      const f = Math.min(total, Math.round(elapsed * fps));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      try { this.renderer.renderComp(ctx, comp, f, { width: w, height: h }); } catch (e) { /* تجاهل */ }
      this.exportProgress(f / total, `جارٍ التسجيل… ${Math.round((f / total) * 100)}%`);
      if (f >= total) {
        setTimeout(() => { try { rec.stop(); } catch (e) { /* تجاهل */ } }, 150);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    await done;
    this._exporting = false;
    if (btn) btn.disabled = false;
    this.exportProgress(null, '');
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (blob.size) {
      downloadBlob(blob, `${safeName(comp.name)}.webm`);
      toastOk('تم تصدير الفيديو');
    } else {
      toastErr('لم يُسجَّل أي محتوى');
    }
    this.closeExport();
  }

  /* ============================ وضع المعاينة (?preview=1) ============================ */
  /** تشغيل تلقائي داخل إطار الهاتف في صفحة التحميل */
  setupPreviewMode() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('preview') !== '1') return;
      this.previewMode = true;
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) { if (!this.playing) this.play(); }
            else if (this.playing) this.stop();
          });
        }, { threshold: 0.3 });
        io.observe(this.canvas);
      } else {
        setTimeout(() => this.play(), 300);
      }
    } catch (e) { /* تجاهل */ }
  }
}

/* ---------------------------- التشغيل ---------------------------- */
const app = new MobileApp();
window.MS_MOBILE_APP = app;
try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => app.init());
  else app.init();
} catch (err) {
  console.error(err);
}

export default app;
export { MobileApp };
