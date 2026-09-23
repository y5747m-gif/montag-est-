/**
 * Montage Studio — نقطة البداية
 * تربط المخزن، المحرّك، العارض، الخط الزمني، اللوحات، القوائم، التصدير والاختصارات.
 */
import { Store } from './core/store.js';
import { MediaManager } from './media/media.js';
import { AudioEngine } from './media/audio.js';
import { Renderer } from './render/engine.js';
import { createLayer } from './core/model.js';
import { Viewer } from './ui/viewer.js';
import { Timeline } from './ui/timeline.js';
import { PropsPanel } from './ui/props.js';
import { ProjectPanel, HistoryPanel } from './ui/panels.js';
import { buildToolbar, buildMenus } from './ui/toolbar.js';
import { MenuBar, showContextMenu } from './ui/menu.js';
import { installShortcuts } from './ui/shortcuts.js';
import { shortcutsDialog, confirmDialog, promptDialog } from './ui/dialog.js';
import { exportDialog } from './export/exporters.js';
import { openShowcaseDialog } from './ui/showcase.js';
import { openVoiceoverRecorder, openScreenRecorder } from './media/recorder.js';
import { createDemoProject, registerDemoMedia } from './project/demo.js';
import { toastOk, toastWarn, toastErr } from './ui/toast.js';
import { applyI18n, setLang, getLang } from './core/i18n.js';
import { el, clear, icon } from './ui/dom.js';
import { clamp, framesToTimecode, timecodeToFrames, downloadBlob } from './core/util.js';

const VIEWER_ZOOMS = [['fit', 'ملء'], ['0.25', '25%'], ['0.5', '50%'], ['1', '100%'], ['2', '200%'], ['4', '400%']];
const VIEWER_RES = [['1', 'كاملة'], ['0.5', 'نصف (افتراضي)'], ['0.33', 'ثلث'], ['0.25', 'ربع (أسرع)']];
const WS_TABS = [['default', 'افتراضي'], ['animation', 'تحريك'], ['preview', 'معاينة']];

class App {
  constructor() {
    this.store = new Store();
    this.media = new MediaManager(this.store);
    this.store.media = this.media;
    this.audio = new AudioEngine(this.store, this.media);
    this.renderer = new Renderer(this.store, this.media);
    this.tool = 'select';
    this.fillColor = '#4a9dff';
    this.strokeColor = '#ffffff';
    this.workspace = 'default';
    this.animatedOnly = false;
    this.helpDialog = null;
  }

  /* ============================ التهيئة ============================ */
  init() {
    const boot = document.getElementById('boot-splash');
    const setBoot = (msg) => { const s = document.getElementById('boot-status'); if (s) s.textContent = msg; };

    setBoot('تحميل الوسائط…');
    registerDemoMedia(this.media);
    const restored = this.store.loadLocal();
    if (!restored) {
      const project = createDemoProject();
      this.store.loadProject(project, { resetHistory: true, silent: true });
      this.store.setStatus('مرحبًا بك في Montage Studio — اضغط مسافة للتشغيل');
    }

    setBoot('بناء الواجهة…');
    this.viewer = new Viewer(this);
    this.timeline = new Timeline(this);
    this.propsPanel = new PropsPanel(this);
    this.projectPanel = new ProjectPanel(this);
    this.historyPanel = new HistoryPanel(this);
    buildToolbar(this);
    this.menuBar = new MenuBar(document.getElementById('menu-root'), buildMenus(this));
    this.buildTransport();
    this.buildWorkspaceTabs();
    this.buildViewerSelects();
    this.bindUI();
    installShortcuts(this);
    this.bindSplitters();
    this.syncCompFields();
    this.updateToggleStates();
    this.updateStatusStats();
    this.viewer.layout(true);
    this.timeline.rebuild();
    this.propsPanel.render();
    this.startVUMeterLoop();

    setBoot('جاهز');
    if (boot) {
      const bar = document.getElementById('boot-progress');
      if (bar) {
        bar.classList.add('done');
        bar.style.width = '100%';
      }
      setTimeout(() => boot.remove(), 480);
    }
    document.body.classList.add('ready');
    if (!restored) toastOk('مشروع تجريبي جاهز — جرّب الأدوات ومساحة العمل');
  }

  /* ============================ شريط التشغيل ============================ */
  buildTransport() {
    const host = document.getElementById('transport-buttons');
    if (!host) return;
    clear(host);
    const mk = (iconName, title, fn) => el('button', { class: 'tb-btn', title, onclick: fn }, [icon(iconName, 15)]);
    const store = this.store;
    host.append(
      mk('i-start', 'إلى البداية (Home)', () => { this.viewer.stop(); store.gotoStart(); this.timeline.updatePlayhead(); }),
      mk('i-prev', 'الإطار السابق (←)', () => { this.viewer.stop(); store.stepFrame(-1); this.timeline.updatePlayhead(); }),
      el('button', {
        class: 'tb-btn play', title: 'تشغيل / إيقاف (مسافة)',
        onclick: () => this.viewer.togglePlay(),
      }, [icon('i-play', 17)]),
      mk('i-next', 'الإطار التالي (→)', () => { this.viewer.stop(); store.stepFrame(1); this.timeline.updatePlayhead(); }),
      mk('i-end', 'إلى النهاية (End)', () => { this.viewer.stop(); store.gotoEnd(); this.timeline.updatePlayhead(); }),
      mk('i-loop', 'تكرار التشغيل', () => { store.loop = !store.loop; this.updateToggleStates(); }),
    );
    this.playBtn = host.querySelector('.play');
    store.on('playing', () => {
      if (!this.playBtn) return;
      clear(this.playBtn);
      this.playBtn.appendChild(icon(store.playing ? 'i-pause' : 'i-play', 17));
      this.playBtn.classList.toggle('on', store.playing);
    });
  }

  buildWorkspaceTabs() {
    const host = document.getElementById('workspace-tabs');
    if (!host) return;
    clear(host);
    WS_TABS.forEach(([id, label]) => {
      host.appendChild(el('button', {
        class: `ws-tab ${this.workspace === id ? 'active' : ''}`,
        dataset: { ws: id },
        title: `مساحة العمل: ${label}`,
        text: label,
        onclick: () => this.setWorkspace(id),
      }));
    });
  }

  buildViewerSelects() {
    const zoom = document.getElementById('viewer-zoom');
    if (zoom) {
      clear(zoom);
      VIEWER_ZOOMS.forEach(([v, label]) => zoom.appendChild(el('option', { value: v, text: label })));
      zoom.value = 'fit';
      zoom.addEventListener('change', () => { if (zoom.value === 'fit') this.viewer.fit(); else this.viewer.setZoom(parseFloat(zoom.value)); });
    }
    const res = document.getElementById('viewer-res');
    if (res) {
      clear(res);
      VIEWER_RES.forEach(([v, label]) => res.appendChild(el('option', { value: v, text: label })));
      // افتراضيًا نصف الدقة لمعاينة سلسة — يمكن رفعها إلى "كاملة" عند الحاجة
      res.value = '0.5';
      this.viewer.resolution = 0.5;
      res.addEventListener('change', () => { this.viewer.resolution = parseFloat(res.value); this.viewer.layout(); this.viewer.requestRender(); });
    }
    const tabs = document.getElementById('viewer-tabs');
    if (tabs) {
      const rebuild = () => {
        clear(tabs);
        this.store.project.comps.forEach((c) => {
          tabs.appendChild(el('button', {
            class: `ptab ${c.id === this.store.comp.id ? 'active' : ''}`,
            title: `${c.name} — ${c.width}×${c.height} · ${c.fps}fps`,
            onclick: () => { this.store.setActiveComp(c.id); rebuild(); this.timeline.rebuild(); },
            ondblclick: () => { const n = promptDialog({ title: 'اسم التركيب', label: 'الاسم', value: c.name }); if (n) this.store.updateComp({ name: n }, 'إعادة تسمية التركيب'); },
          }, [icon('i-comp', 13), el('span', { text: c.name })]));
        });
        tabs.appendChild(el('button', {
          class: 'ptab', title: 'تركيب جديد (Ctrl+K)',
          onclick: () => this.newComposition(),
        }, [icon('i-plus', 13)]));
      };
      this.syncCompTabs = rebuild;
      rebuild();
      this.store.on('project', rebuild);
      this.store.on('comp', rebuild);
    }
  }

  /* ============================ الواجهة ============================ */
  bindUI() {
    const store = this.store;
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportDialog());
    document.getElementById('btn-help')?.addEventListener('click', () => this.showShortcuts());
    document.getElementById('btn-lang')?.addEventListener('click', () => this.toggleLang());
    document.getElementById('btn-showcase')?.addEventListener('click', () => this.openShowcase());
    document.getElementById('btn-voiceover')?.addEventListener('click', () => this.openVoiceover());
    document.getElementById('btn-screenrec')?.addEventListener('click', () => this.openScreenRecorder());
    document.getElementById('select-aspect-ratio')?.addEventListener('change', (e) => this.setAspectRatio(e.target.value));
    document.getElementById('master-vol-slider')?.addEventListener('input', (e) => this.audio.setMasterVolume(parseFloat(e.target.value) / 100));
    document.getElementById('btn-panel-menu')?.addEventListener('click', (e) => this.panelMenu(e));
    document.getElementById('btn-props-menu')?.addEventListener('click', (e) => this.propsMenu(e));
    document.getElementById('tl-columns-btn')?.addEventListener('click', (e) => this.panelMenu(e));

    // عارض: أزرار الرأس
    document.querySelectorAll('[data-viewer-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.viewerAction;
        if (a === 'zoom-in') this.viewer.setZoom(this.viewer.zoom * 1.25);
        else if (a === 'zoom-out') this.viewer.setZoom(this.viewer.zoom / 1.25);
        else if (a === 'fit') { this.viewer.fit(); const z = document.getElementById('viewer-zoom'); if (z) z.value = 'fit'; }
        else if (a === 'guides') this.viewer.toggleGuides();
        else if (a === 'transparency') { store.viewer.checkerboard = !store.viewer.checkerboard; this.viewer.bodyEl.classList.toggle('no-checker', !store.viewer.checkerboard); }
        else if (a === 'snapshot') this.viewer.snapshot();
      });
    });
    // الخط الزمني: أزرار الرأس
    document.querySelectorAll('[data-tl-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.tlAction;
        if (a === 'zoom-in') this.timeline.setZoom(this.timeline.zoom * 1.3);
        else if (a === 'zoom-out') this.timeline.setZoom(this.timeline.zoom / 1.3);
        else if (a === 'fit') this.timeline.fitView();
        else if (a === 'snap') { store.timeline.snap = !store.timeline.snap; this.updateToggleStates(); }
        else if (a === 'split') store.splitLayersAt(store.playhead);
        else if (a === 'add-layer') this.timeline.addLayerMenu();
        else if (a === 'add-keyframe') {
          const layer = store.primaryLayer;
          const path = store.selection.props[0]?.split('::')[1];
          if (!layer) { toastWarn('حدّد طبقة أولًا'); return; }
          if (path) store.toggleKeyframe(layer.id, path);
          else this.propsPanel.scrollToGroup('transform');
        } else if (a === 'deselect') store.deselectAll();
      });
    });
    document.getElementById('tl-zoom')?.addEventListener('input', (e) => this.timeline.setZoom(parseFloat(e.target.value)));
    document.getElementById('tab-timeline')?.addEventListener('click', () => this.timeline.showGraphMode(false));
    document.getElementById('tab-graph')?.addEventListener('click', () => this.timeline.showGraphMode(true));

    // حقول التركيب والزمن
    document.getElementById('comp-fps')?.addEventListener('change', (e) => store.updateComp({ fps: clamp(Math.round(+e.target.value) || 30, 1, 120) }));
    document.getElementById('comp-duration')?.addEventListener('change', (e) => {
      const f = timecodeToFrames(e.target.value, store.fps);
      store.updateComp({ duration: clamp(f || store.duration, 1, 108000) }, 'مدة التركيب');
      this.syncCompFields();
    });
    document.getElementById('workarea-dur')?.addEventListener('change', (e) => {
      const f = clamp(timecodeToFrames(e.target.value, store.fps) || store.duration, 1, store.duration);
      store.setWorkArea(0, f);
      this.syncCompFields();
    });
    document.getElementById('tc-current')?.addEventListener('change', (e) => {
      store.setPlayhead(clamp(timecodeToFrames(e.target.value, store.fps), 0, store.duration));
      this.timeline.updatePlayhead();
    });

    // استيراد الملفات
    const fileInput = document.getElementById('file-input');
    fileInput?.addEventListener('change', async () => {
      if (!fileInput.files?.length) return;
      const files = [...fileInput.files];
      fileInput.value = '';
      await this.importFiles(files);
    });

    // سحب وإفلات الملفات على النافذة
    const overlay = document.getElementById('drop-overlay');
    let depth = 0;
    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      depth += 1;
      overlay?.classList.add('on');
    });
    window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    window.addEventListener('dragleave', () => { depth -= 1; if (depth <= 0) { depth = 0; overlay?.classList.remove('on'); } });
    window.addEventListener('drop', async (e) => {
      depth = 0;
      overlay?.classList.remove('on');
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      await this.importFiles([...e.dataTransfer.files]);
    });

    // أحداث المخزن
    store.on('status', (m) => this.setStatus(m));
    store.on('time', () => this.syncTimeFields());
    store.on('change', () => { this.updateStatusStats(); this.syncTimeFields(); });
    store.on('project', () => { this.syncCompFields(); this.updateToggleStates(); });
    store.on('history', () => this.updateStatusStats());
    store.on('autosave', () => this.flashAutosave());
    store.on('loaded', () => { this.syncCompFields(); this.viewer.syncMeta(); this.timeline.rebuild(); });
    window.addEventListener('beforeunload', (e) => {
      if (this.store.dirty) { this.store.persistLocal(); e.preventDefault(); e.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.store.persistLocal(); });
  }

  bindSplitters() {
    const workspace = document.getElementById('workspace');
    document.querySelectorAll('.splitter-h').forEach((sp) => {
      sp.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const side = sp.dataset.split; // left | right
        const startX = e.clientX;
        const style = getComputedStyle(workspace);
        const startLeft = parseFloat(style.getPropertyValue('--w-left')) || 300;
        const startRight = parseFloat(style.getPropertyValue('--w-right')) || 330;
        document.body.classList.add('resizing');
        const move = (ev) => {
          const dx = ev.clientX - startX;
          // في RTL: السحب يمينًا يزيد عرض العمود الأيسر (المعروض يمينًا)
          const dir = document.dir === 'rtl' ? 1 : -1;
          if (side === 'left') workspace.style.setProperty('--w-left', `${clamp(startLeft + dx * dir, 180, 620)}px`);
          else workspace.style.setProperty('--w-right', `${clamp(startRight - dx * dir, 200, 700)}px`);
          this.viewer.layout();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.classList.remove('resizing');
          this.timeline.rebuild();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    });
    document.querySelectorAll('.splitter-v').forEach((sp) => {
      sp.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const target = sp.dataset.split === 'center-vertical' ? 'center' : 'left';
        const startY = e.clientY;
        const colCenter = document.getElementById('col-center');
        const panelA = target === 'center' ? document.getElementById('panel-viewer') : document.getElementById('panel-project');
        const startH = panelA?.getBoundingClientRect().height || 300;
        document.body.classList.add('resizing');
        const move = (ev) => {
          const next = clamp(startH + (ev.clientY - startY), 120, 1400);
          if (panelA) panelA.style.flex = `0 0 ${next}px`;
          colCenter?.classList.add('has-flex');
          this.viewer.layout();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.classList.remove('resizing');
          this.timeline.rebuild();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    });
  }

  /* ============================ الأدوات ============================ */
  setTool(tool) {
    this.tool = tool;
    if (document.body) document.body.dataset.tool = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    if (this.viewer) {
      this.viewer.canvas.style.cursor = ({
        hand: 'grab', zoom: 'zoom-in', rotate: 'crosshair', 'pan-behind': 'move',
        select: 'default', pen: 'crosshair',
      })[tool] || 'crosshair';
    }
    this.setStatus(`الأداة: ${tool}`);
  }

  createLayerOfType(type, { inPoint = null, name = null, position = null, size = null } = {}) {
    const comp = this.store.comp;
    const start = inPoint == null ? this.store.playhead : Math.max(0, Math.round(inPoint));
    const layer = createLayer(type, { name: name || undefined, inPoint: start });
    const isGlobal = type === 'adjustment' || type === 'null' || type === 'camera';
    layer.inPoint = isGlobal ? 0 : start;
    layer.outPoint = comp.duration;
    if (!isGlobal && size) {
      layer.props.size.value = { x: Math.max(8, size.x), y: Math.max(8, size.y) };
      layer.transform.position.value = position ? { ...position } : { x: comp.width / 2, y: comp.height / 2 };
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 5);
    } else if (type === 'text') {
      layer.props.text.value = 'نصّك هنا';
      layer.props.fill.value = this.fillColor;
      layer.transform.position.value = position ? { ...position } : { x: comp.width / 2, y: comp.height / 2 };
      layer.transform.anchor.value = { x: comp.width / 2, y: comp.height / 2 };
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 5);
    } else if (type === 'shape') {
      layer.props.kind.value = this.tool === 'ellipse' ? 'ellipse' : this.tool === 'star' ? 'star' : this.tool === 'polygon' ? 'polygon' : 'rect';
      layer.props.fill.value = this.fillColor;
      layer.props.strokeColor.value = this.strokeColor;
      layer.transform.position.value = position ? { ...position } : { x: comp.width / 2, y: comp.height / 2 };
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 5);
    } else if (type === 'solid') {
      layer.props.color.value = this.fillColor;
      layer.transform.position.value = { x: comp.width / 2, y: comp.height / 2 };
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 5);
    } else if (type === 'light') {
      layer.props.color.value = this.fillColor;
      layer.transform.position.value = position ? { ...position } : { x: comp.width / 2, y: comp.height / 2 };
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 5);
    } else if (type === 'particles' || type === 'visualizer') {
      layer.props.color.value = this.fillColor;
      layer.transform.position.value = { x: comp.width / 2, y: comp.height / 2 };
      layer.outPoint = Math.min(comp.duration, start + comp.fps * 8);
      const asset = this.store.project.assets.find((a) => a.kind === 'audio' || a.kind === 'video');
      if (asset && type === 'visualizer' && layer.props.assetId) layer.props.assetId.value = asset.id;
    } else if (type === 'precomp') {
      layer.outPoint = comp.duration;
    }
    this.store.addLayer(layer);
    this.propsPanel.expanded?.add('transform');
    this.propsPanel.requestRender();
    return layer;
  }

  createLayerFromTool(tool, { position = null, size = null, inPoint = null } = {}) {
    const map = {
      rect: 'shape', ellipse: 'shape', star: 'shape', polygon: 'shape',
      text: 'text', solid: 'solid', particles: 'particles', visualizer: 'visualizer',
      adjustment: 'adjustment', null: 'null', light: 'light', camera: 'camera',
    };
    const type = map[tool] || 'shape';
    const savedTool = this.tool;
    this.tool = tool;
    const layer = this.createLayerOfType(type, { inPoint, position, size });
    this.setTool('select');
    void savedTool;
    return layer;
  }

  /* ============================ الوسائط ============================ */
  assetLayerType(asset) {
    if (asset.kind === 'audio') return 'audio';
    if (asset.kind === 'video') return 'video';
    if (asset.kind === 'comp') return 'precomp';
    return 'image';
  }

  addAssetLayer(asset, frame = null) {
    if (!asset) return null;
    const comp = this.store.comp;
    const start = frame == null ? this.store.playhead : Math.max(0, Math.round(frame));
    const type = this.assetLayerType(asset);
    const layer = createLayer(type, { name: asset.name, inPoint: start });
    layer.props.assetId.value = asset.id;
    const dur = asset.durationFrames || (type === 'image' ? comp.fps * 5 : comp.duration);
    layer.outPoint = clamp(start + dur, start + 1, comp.duration);
    layer.transform.position.value = { x: comp.width / 2, y: comp.height / 2 };
    if (type === 'audio') layer.transform.position.value = { x: comp.width / 2, y: comp.height / 2 };
    this.store.addLayer(layer);
    if (asset.offline) toastWarn(`"${asset.name}" غير متصل — أعد استيراده`);
    this.setStatus(`أُضيفت طبقة: ${asset.name}`);
    return layer;
  }

  addSelectedAssetAsLayer(frame = null) {
    const asset = this.projectPanel?.selectedAsset;
    if (!asset) { toastWarn('اختر وسيطًا من لوحة المشروع أولًا'); return null; }
    return this.addAssetLayer(asset, frame);
  }

  openImportDialog({ atFrame = null, folderId = null, replaceId = null } = {}) {
    const input = document.getElementById('file-input');
    if (!input) return;
    this.pendingImport = { atFrame, folderId, replaceId };
    input.value = '';
    input.click();
  }

  async importFiles(files, { atFrame = null, folderId = null } = {}) {
    const opts = this.pendingImport || {};
    this.pendingImport = null;
    let list = [];
    try {
      list = await this.media.importFiles(files, { fps: this.store.fps, folderId: folderId || opts.folderId });
    } catch (e) {
      console.error(e);
      toastErr('تعذّر استيراد بعض الملفات');
    }
    const opened = (list || []).some((a) => a?.kind === 'project');
    const assets = (list || []).filter((a) => a && a.kind !== 'project');
    if (opened) {
      this.timeline.rebuild();
      this.viewer.layout();
      this.syncCompTabs?.();
      this.syncCompFields();
      toastOk('تم فتح ملف المشروع');
    }
    if (!assets.length) return [];
    const frame = atFrame == null ? opts.atFrame : atFrame;
    if (frame != null) assets.forEach((a) => this.addAssetLayer(a, frame));
    this.projectPanel?.renderAssets();
    this.setStatus(`تم استيراد ${assets.length} ملف`);
    toastOk(`استُورد ${assets.length} ملف إلى المشروع`);
    return assets;
  }

  /* ============================ الملفات ============================ */
  newProject() {
    confirmDialog({ title: 'مشروع جديد', message: 'سيتم إنشاء مشروع فارغ. هل تريد المتابعة؟' }).then((yes) => {
      if (!yes) return;
      this.store.newProject({ name: 'مشروع جديد' });
      registerDemoMedia(this.media);
      this.timeline.rebuild();
      this.viewer.layout();
      this.propsPanel.render();
      this.syncCompFields();
      toastOk('تم إنشاء مشروع جديد');
    });
  }

  newComposition() {
    promptDialog({
      title: 'تركيب جديد',
      label: 'الصيغة: الاسم / العرض×الارتفاع / المدة بالثواني',
      value: `تركيب ${this.store.project.comps.length + 1}`,
      hint: 'مثال: إعلان / 1080x1920 / 8',
    }).then((v) => {
      if (!v) return;
      const parts = String(v).split('/').map((s) => s.trim());
      const name = parts[0] || 'تركيب جديد';
      let width = this.store.width;
      let height = this.store.height;
      let seconds = 10;
      const dim = parts.find((p) => /\d+\s*[x×]\s*\d+/.test(p));
      if (dim) {
        const [w, h] = dim.split(/[x×]/).map((n) => parseInt(n, 10));
        width = clamp(w || 1920, 16, 8192);
        height = clamp(h || 1080, 16, 8192);
      }
      const sec = parts.find((p) => /^[\d.]+$/.test(p) && parts.indexOf(p) > 0);
      if (sec) seconds = clamp(parseFloat(sec) || 10, 0.2, 3600);
      const comp = this.store.addComp({ name, width, height, fps: this.store.fps, duration: Math.round(seconds * this.store.fps) });
      this.timeline.rebuild();
      this.viewer.layout();
      this.syncCompTabs?.();
      toastOk(`تم إنشاء ${comp.name}`);
    });
  }

  openProjectFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mgeproj,.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (this.store.loadProject(text)) {
        this.media.syncOffline?.(this.store.project);
        this.timeline.rebuild();
        this.viewer.layout();
        this.syncCompTabs?.();
        toastOk('تم فتح المشروع');
      } else toastErr('تعذّر قراءة ملف المشروع');
    };
    input.click();
  }

  createDemoProject() {
    this.store.loadProject(createDemoProject(), { resetHistory: true });
    registerDemoMedia(this.media);
    this.media.syncOffline?.(this.store.project);
    this.timeline.rebuild();
    this.viewer.layout();
    this.propsPanel.render();
    this.syncCompFields();
    toastOk('تم تحميل المشروع التجريبي');
  }

  exportDialog() { exportDialog(this); }
  openShowcase() { openShowcaseDialog(this); }
  openVoiceover() { openVoiceoverRecorder(this); }
  openScreenRecorder() { openScreenRecorder(this); }

  setAspectRatio(ratioStr) {
    if (!ratioStr || !ratioStr.includes('x')) return;
    const [w, h] = ratioStr.split('x').map(Number);
    if (!w || !h) return;
    this.store.updateComp({ width: w, height: h }, `تغيير المقاس إلى ${ratioStr}`);
    this.viewer.layout();
    this.viewer.fit();
    toastOk(`تم ضبط أبعاد الفيديو على ${w}×${h}`);
  }

  startVUMeterLoop() {
    const barL = document.getElementById('vu-bar-l');
    const barR = document.getElementById('vu-bar-r');
    const dbText = document.getElementById('vu-db-text');
    if (!barL || !barR) return;
    const update = () => {
      if (this.store.playing) {
        const levels = this.audio.getAudioLevels();
        barL.style.height = `${Math.min(100, Math.round(levels.left * 100))}%`;
        barR.style.height = `${Math.min(100, Math.round(levels.right * 100))}%`;
        if (dbText) dbText.textContent = levels.db > -80 ? `${levels.db} dB` : '-∞ dB';
      } else {
        barL.style.height = '0%';
        barR.style.height = '0%';
        if (dbText) dbText.textContent = '-∞ dB';
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  /* ============================ التحرير ============================ */
  addEffectToSelection(fxId) {
    const ids = this.store.selection.layerIds;
    if (!ids.length) { toastWarn('حدّد طبقة أولًا'); return; }
    ids.forEach((id) => this.store.addEffect(id, fxId));
    this.propsPanel.expanded?.add('effects');
    this.propsPanel.requestRender();
    this.setStatus('تمت إضافة التأثير');
  }

  copyEffectsToSelection() {
    const src = this.store.primaryLayer;
    if (!src?.effects?.length) { toastWarn('الطبقة الأساسية بلا تأثيرات'); return; }
    const types = src.effects.map((f) => f.type);
    this.store.selection.layerIds.filter((id) => id !== src.id).forEach((id) => types.forEach((t) => this.store.addEffect(id, t)));
    toastOk('تم نسخ التأثيرات إلى الطبقات المحددة');
  }

  moveSelectionToTop() {
    const ids = this.store.selection.layerIds;
    if (!ids.length) return;
    [...ids].reverse().forEach((id) => this.store.reorderLayer(id, 0, { commit: false }));
    this.store.commit('ترتيب الطبقات');
    this.timeline.rebuild();
  }

  moveSelectionToBottom() {
    const ids = this.store.selection.layerIds;
    if (!ids.length) return;
    ids.forEach((id) => this.store.reorderLayer(id, this.store.comp.layers.length - 1, { commit: false }));
    this.store.commit('ترتيب الطبقات');
    this.timeline.rebuild();
  }

  moveSelection(dir) {
    const ids = this.store.selection.layerIds;
    if (!ids.length) return;
    const layers = this.store.comp.layers;
    ids.forEach((id) => {
      const i = layers.findIndex((l) => l.id === id);
      const next = clamp(i + dir, 0, layers.length - 1);
      if (i !== -1 && next !== i) this.store.reorderLayer(id, next, { commit: false });
    });
    this.store.commit('ترتيب الطبقات');
    this.timeline.rebuild();
  }

  toggleAnimatedOnly() {
    this.animatedOnly = !this.animatedOnly;
    document.body.classList.toggle('animated-only', this.animatedOnly);
    this.timeline.rebuild();
    this.setStatus(this.animatedOnly ? 'عرض الخصائص المتحركة فقط (U)' : 'عرض كل الخصائص');
  }

  selectPropertyShortcut(path) {
    const layer = this.store.primaryLayer;
    if (!layer) return;
    this.store.selectProp(`${layer.id}::${path}`);
    const grp = path.startsWith('transform') ? 'transform' : path.startsWith('effects') ? 'effects' : null;
    if (grp) this.propsPanel.expanded?.add(grp);
    this.propsPanel.requestRender();
    this.setStatus(`خصيصة محددة: ${path}`);
    this.propsPanel.scrollToGroup?.(grp || 'transform');
  }

  focusLayerProps(layer) {
    if (!layer) return;
    this.store.select([layer.id]);
    this.propsPanel.render();
  }

  focusCompSettings() {
    this.store.deselectAll();
    this.propsPanel.render();
  }

  openLayerInViewer(layer) {
    if (layer?.type === 'precomp' && layer.props.compId?.value) {
      this.store.setActiveComp(layer.props.compId.value);
      this.timeline.rebuild();
      this.viewer.layout();
      this.syncCompTabs?.();
      toastOk('تم فتح التركيب المسبق');
    } else this.focusLayerProps(layer);
  }

  beginGesture(label = '') { this.gestureLabel = label; if (label) this.setStatus(label); }
  endGesture() {
    this.gestureLabel = '';
    this.store.commit('تعديل');
    this.updateStatusStats();
  }

  /* ============================ مساحات العمل ============================ */
  setWorkspace(name) {
    this.workspace = name;
    document.querySelectorAll('.ws-tab').forEach((b) => b.classList.toggle('active', b.dataset.ws === name));
    const ws = document.getElementById('workspace');
    if (!ws) return;
    if (name === 'animation') { ws.style.setProperty('--w-left', '260px'); ws.style.setProperty('--w-right', '360px'); }
    else if (name === 'preview') { ws.style.setProperty('--w-left', '0px'); ws.style.setProperty('--w-right', '0px'); }
    else { ws.style.removeProperty('--w-left'); ws.style.removeProperty('--w-right'); }
    const left = document.getElementById('col-left');
    const right = document.getElementById('col-right');
    if (left) left.style.display = name === 'preview' ? 'none' : '';
    if (right) right.style.display = name === 'preview' ? 'none' : '';
    requestAnimationFrame(() => { this.viewer.layout(); this.timeline.rebuild(); });
    this.setStatus(`مساحة العمل: ${name}`);
  }

  toggleLang() {
    const next = getLang() === 'ar' ? 'en' : 'ar';
    setLang(next);
    applyI18n(document);
    const label = document.getElementById('lang-label');
    if (label) label.textContent = next === 'ar' ? 'EN' : 'ع';
    this.menuBar?.setDefs(buildMenus(this));
    this.setStatus(next === 'ar' ? 'اللغة: العربية' : 'Language: English');
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }

  showShortcuts() { this.helpDialog?.close?.(); this.helpDialog = shortcutsDialog(); }
  showQuickGuide() { shortcutsDialog(); }
  showPresets() { document.querySelector('[data-tab="presets"]')?.click(); }

  panelMenu(e) {
    const at = this.popupPoint(e);
    showContextMenu([
      { label: 'استيراد وسائط…', icon: 'i-open', action: () => this.openImportDialog() },
      { label: 'مجلد جديد…', icon: 'i-folder', action: async () => {
        const name = await promptDialog({ title: 'مجلد جديد', label: 'اسم المجلد', value: 'مجلد' });
        if (name) { this.store.createFolder(name); this.projectPanel.renderAssets(); }
      } },
      { label: 'تركيب جديد…', icon: 'i-comp', action: () => this.newComposition() },
      { type: 'sep' },
      { label: 'مشروع تجريبي', icon: 'i-star2', action: () => this.createDemoProject() },
      { label: 'مشروع فارغ جديد', icon: 'i-plus', action: () => this.newProject() },
      { type: 'sep' },
      { label: 'حفظ المشروع (.mgeproj)', icon: 'i-save', shortcut: 'Ctrl+S', action: () => this.store.saveToFile() },
    ], at);
  }

  propsMenu(e) {
    const at = this.popupPoint(e);
    const layer = this.store.primaryLayer;
    const propPath = this.store.selection.props[0]?.split('::')[1] || null;
    showContextMenu([
      { label: 'إظهار كل المجموعات', icon: 'i-chevron', action: () => {
        ['transform', '3d', 'effects', 'masks', 'audio', 'schema', 'text'].forEach((k) => this.propsPanel.expanded.add(k));
        this.propsPanel.render();
      } },
      { label: 'طي كل المجموعات', icon: 'i-caret', action: () => { this.propsPanel.expanded.clear(); this.propsPanel.render(); } },
      { type: 'sep' },
      { label: 'إضافة تعبير للخاصية المحددة', icon: 'i-code', disabled: !layer || !propPath, action: () => {
        if (layer && propPath) this.propsPanel.editExpression(layer, propPath, this.store.resolveProp(layer, propPath));
      } },
      { label: 'حذف تحريك الخاصية المحددة', icon: 'i-trash', disabled: !layer || !propPath, action: () => {
        if (layer && propPath) this.store.deleteAnimation(layer.id, propPath);
      } },
      { label: 'إعادة ضبط الخاصية', icon: 'i-undo', disabled: !layer || !propPath, action: () => {
        if (layer && propPath) this.store.resetProp(layer.id, propPath);
      } },
    ], at);
  }

  popupPoint(e) {
    const rect = e?.currentTarget?.getBoundingClientRect?.();
    if (!rect) return { x: e?.clientX || 60, y: e?.clientY || 60 };
    return { x: rect.left + 8, y: rect.bottom + 4 };
  }

  /* ============================ الحالة ============================ */
  setStatus(msg) {
    const node = document.getElementById('status-message');
    if (node && typeof msg === 'string' && msg) node.textContent = msg;
  }

  syncTimeFields() {
    const cur = document.getElementById('tc-current');
    if (cur && document.activeElement !== cur) cur.value = framesToTimecode(this.store.playhead, this.store.fps);
    const dur = document.getElementById('tc-duration');
    if (dur) dur.value = framesToTimecode(this.store.duration, this.store.fps);
  }

  syncCompFields() {
    const comp = this.store.comp;
    if (!comp) return;
    const fps = document.getElementById('comp-fps');
    if (fps && document.activeElement !== fps) fps.value = comp.fps;
    const dur = document.getElementById('comp-duration');
    if (dur && document.activeElement !== dur) dur.value = framesToTimecode(comp.duration, comp.fps);
    const wa = document.getElementById('workarea-dur');
    if (wa && document.activeElement !== wa) wa.value = framesToTimecode(comp.workArea?.[1] ?? comp.duration, comp.fps);
    this.syncTimeFields();
    this.updateToggleStates();
  }

  updateToggleStates() {
    document.querySelector('[data-tl-action="snap"]')?.classList.toggle('on', !!this.store.timeline?.snap);
    const loop = document.querySelector('#transport-buttons .tb-btn:last-child');
    if (loop) loop.classList.toggle('on', !!this.store.loop);
  }

  updateStatusStats() {
    const node = document.getElementById('status-stats');
    if (!node) return;
    const comp = this.store.comp;
    if (!comp) { node.textContent = ''; return; }
    const visible = comp.layers.filter((l) => l.enabled && this.store.playhead >= l.inPoint && this.store.playhead <= l.outPoint).length;
    node.textContent = `${comp.layers.length} طبقة · ${visible} مرئية · ${this.store.selection.layerIds.length} محددة · ${framesToTimecode(this.store.playhead, comp.fps)}`;
  }

  flashAutosave() {
    const dot = document.getElementById('status-autosave');
    if (!dot) return;
    dot.classList.add('saving');
    setTimeout(() => { dot.classList.remove('saving'); dot.classList.add('saved'); }, 500);
  }
}

/* ---------------------------- التشغيل ---------------------------- */
const app = new App();
window.MS_APP = app;
try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => app.init());
  else app.init();
} catch (err) {
  console.error(err);
  const status = document.getElementById('boot-status');
  if (status) status.textContent = `تعذّر التشغيل: ${err.message}`;
}

export default app;
export { App, downloadBlob };
