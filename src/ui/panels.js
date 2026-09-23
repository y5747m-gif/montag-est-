/**
 * لوحات الواجهة — المشروع (الوسائط)، متصفح التأثيرات، القوالب، والسجل
 */
import { el, clear, icon } from './dom.js';
import { prettyBytes, framesToTimecode, clamp } from '../core/util.js';
import { EFFECTS, EFFECT_CATEGORIES } from '../core/effects.js';
import { PRESETS } from '../core/presets.js';
import { TRANSITIONS, applyTransition } from '../core/transitions.js';
import { SOUND_EFFECTS, previewSoundEffect, addSoundEffectToTimeline } from '../media/soundfx.js';
import { showContextMenu } from './menu.js';
import { toast, toastOk, toastWarn } from './toast.js';
import { promptDialog, confirmDialog, colorDialog } from './dialog.js';

export class ProjectPanel {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.media = app.media;
    this.listEl = document.getElementById('asset-list');
    this.effectsEl = document.getElementById('effects-browser');
    this.presetsEl = document.getElementById('presets-browser');
    this.transitionsEl = document.getElementById('transitions-browser');
    this.soundfxEl = document.getElementById('soundfx-browser');
    this.search = '';
    this.selectedAssetId = null;
    this.collapsedCategories = new Set();
    this.lastClickedLayer = null;
    this.bindTabs();
    this.bindSearch();
    this.bindButtons();
    this.store.on('assets', () => this.renderAssets());
    this.store.on('project', () => this.renderAssets());
    this.store.on('selection', () => this.renderEffectsHeader());
    this.store.on('jobs', () => this.renderAssets());
    this.renderEffects();
    this.renderPresets();
    this.renderTransitions();
    this.renderSoundFX();
    this.renderAssets();
  }

  bindTabs() {
    document.querySelectorAll('[data-tabs="project"] .ptab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-tabs="project"] .ptab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll('#panel-project .tab-body').forEach((body) => {
          body.classList.toggle('active', body.dataset.tabbody === tab.dataset.tab);
        });
      });
    });
  }

  bindSearch() {
    document.getElementById('assets-search')?.addEventListener('input', (e) => {
      this.search = e.target.value.trim().toLowerCase();
      this.renderAssets();
    });
    document.getElementById('effects-search')?.addEventListener('input', (e) => {
      this.renderEffects(e.target.value.trim().toLowerCase());
    });
  }

  bindButtons() {
    document.getElementById('btn-new-comp')?.addEventListener('click', () => this.app.newComposition());
    document.getElementById('btn-new-folder')?.addEventListener('click', async () => {
      const name = await promptDialog({ title: 'مجلد جديد', label: 'اسم المجلد', value: 'مجلد' });
      if (name) this.store.createFolder(name);
    });
    document.getElementById('btn-add-media')?.addEventListener('click', () => this.app.openImportDialog());
    document.getElementById('asset-list')?.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    });
    document.getElementById('asset-list')?.addEventListener('drop', (e) => {
      if (e.dataTransfer.files?.length) {
        e.preventDefault();
        this.app.importFiles([...e.dataTransfer.files]);
      }
    });
  }

  /* --------------------------- الوسائط --------------------------- */
  renderAssets() {
    const host = this.listEl;
    if (!host) return;
    clear(host);
    const assets = this.store.project.assets.filter((a) => !this.search || a.name.toLowerCase().includes(this.search));
    const folders = assets.filter((a) => a.kind === 'folder');
    const loose = assets.filter((a) => a.kind !== 'folder' && !a.folderId);
    if (!assets.length) {
      host.appendChild(el('div', { class: 'empty-state' }, [
        el('b', { text: 'لا توجد وسائط بعد' }),
        el('div', { text: 'اسحب الملفات إلى هنا أو استخدم زر الاستيراد' }),
        el('div', { html: 'يدعم: فيديو (MP4/WebM) · صوت (MP3/WAV/OGG) · صور · مشروع <span class="k">.mgeproj</span>' }),
        el('div', { style: { marginTop: '10px' } }, [
          el('button', { class: 'btn sm primary', onclick: () => this.app.openImportDialog(), text: 'استيراد ملفات' }),
          el('button', { class: 'btn sm', style: { marginInlineStart: '6px' }, onclick: () => this.app.createDemoProject(), text: 'مشروع تجريبي' }),
        ]),
      ]));
      return;
    }
    const renderAsset = (asset) => { host.appendChild(this.assetRow(asset)); };
    const groupHead = (title, iconName, count) => el('div', { class: 'asset-group-head' }, [
      icon(iconName, 13), el('span', { text: title }), el('span', { class: 'grow', style: { flex: '1' } }),
      el('span', { class: 'muted', text: String(count) }),
    ]);
    host.appendChild(groupHead('كل الوسائط', 'i-folder', assets.length));
    folders.forEach((folder) => {
      host.appendChild(el('div', { class: 'asset-group-head', style: { paddingInlineStart: '18px' } }, [icon('i-folder', 12), el('span', { text: folder.name })]));
      assets.filter((a) => a.folderId === folder.id).forEach(renderAsset);
    });
    loose.forEach(renderAsset);
    this.renderEffectsHeader();
  }

  assetRow(asset) {
    const kindIcon = { image: 'i-image', video: 'i-video', audio: 'i-audio', folder: 'i-folder', other: 'i-comp' }[asset.kind] || 'i-comp';
    const selected = this.selectedAssetId === asset.id;
    const row = el('div', {
      class: `asset-row ${selected ? 'selected' : ''}`,
      draggable: 'true',
      onclick: () => { this.selectedAssetId = asset.id; this.renderAssets(); },
      ondblclick: () => this.app.addAssetLayer(asset, this.store.playhead),
      oncontextmenu: (e) => { e.preventDefault(); this.assetMenu(e, asset); },
      ondragstart: (e) => {
        e.dataTransfer.setData('application/x-ms-asset', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      },
      onkeydown: (e) => { if (e.key === 'Enter') this.app.addAssetLayer(asset, this.store.playhead); },
      tabindex: 0,
    }, [
      asset.thumb ? el('img', { class: 'asset-thumb', src: asset.thumb }) : el('span', { class: 'icon' }, [icon(kindIcon, 14)]),
      el('span', { class: 'name', text: asset.name, title: asset.name }),
      el('span', { class: 'meta', text: this.assetMeta(asset) }),
      asset.offline ? el('span', { class: 'tag-pill', style: { color: 'var(--red)' }, text: 'غير متصل', title: 'أعد استيراد الملف لربطه' }) : null,
    ]);
    return row;
  }

  assetMeta(asset) {
    if (asset.kind === 'folder') return '';
    const parts = [];
    if (asset.width && asset.height) parts.push(`${asset.width}×${asset.height}`);
    if (asset.durationFrames) parts.push(framesToTimecode(asset.durationFrames, asset.fps || this.store.fps));
    if (asset.size) parts.push(prettyBytes(asset.size));
    return parts.join(' · ');
  }

  assetMenu(e, asset) {
    if (asset.kind === 'folder') {
      showContextMenu([
        { label: 'إعادة تسمية', action: async () => { const n = await promptDialog({ title: 'إعادة تسمية', label: 'الاسم', value: asset.name }); if (n) this.store.renameAsset(asset.id, n); } },
        { label: 'حذف المجلد', action: () => this.store.removeAsset(asset.id) },
      ], { x: e.clientX, y: e.clientY });
      return;
    }
    const used = this.store.project.comps.some((c) => c.layers.some((l) => l.props.assetId?.value === asset.id));
    showContextMenu([
      { label: 'إضافة إلى التركيبة', icon: 'i-plus', action: () => this.app.addAssetLayer(asset, this.store.playhead) },
      { label: 'استبدال الطبقة المحدّدة', disabled: !this.store.primaryLayer, action: () => {
        const layer = this.store.primaryLayer;
        const key = layer.type === 'audio' ? 'assetId' : 'assetId';
        this.store.setProp(layer.id, `props.${key}`, asset.id, { label: 'استبدال الوسائط' });
      } },
      { type: 'sep' },
      { label: 'إعادة تسمية', icon: 'i-text', action: async () => { const n = await promptDialog({ title: 'إعادة تسمية', label: 'الاسم', value: asset.name }); if (n) this.store.renameAsset(asset.id, n); } },
      { label: 'نقل إلى مجلد…', submenu: [
        { label: 'بدون مجلد', checked: !asset.folderId, action: () => { asset.folderId = null; this.store.commit('نقل وسائط'); this.renderAssets(); } },
        ...this.store.project.assets.filter((a) => a.kind === 'folder').map((f) => ({
          label: f.name, checked: asset.folderId === f.id,
          action: () => { asset.folderId = f.id; this.store.commit('نقل وسائط'); this.renderAssets(); },
        })),
      ] },
      { type: 'sep' },
      { label: 'إعادة استيراد الملف (ربط)', action: () => this.app.openImportDialog({ replaceId: asset.id }) },
      { label: 'حذف من المشروع', icon: 'i-trash', action: async () => {
        if (used) {
          const ok = await confirmDialog({ title: 'الملف مستخدم', message: 'هذا الملف مستخدم في طبقات داخل التركيبة. هل تريد حذفه مع الطبقات؟', danger: true, okLabel: 'حذف الكل' });
          if (!ok) return;
          this.store.project.comps.forEach((c) => {
            c.layers.filter((l) => l.props.assetId?.value === asset.id).forEach((l) => this.store.removeLayers([l.id]));
          });
        }
        this.store.removeAsset(asset.id, { removeUsed: true });
      } },
    ], { x: e.clientX, y: e.clientY });
  }

  /* --------------------------- التأثيرات --------------------------- */
  renderEffectsHeader() { /* يُستخدم للتحديث فقط */ }

  renderEffects(filter = '') {
    const host = this.effectsEl;
    if (!host) return;
    clear(host);
    const grouped = EFFECT_CATEGORIES.map((cat) => [cat, Object.values(EFFECTS).filter((fx) => fx.cat === cat.key)]).filter(([c, list]) => list.length);
    host.appendChild(el('div', { class: 'form-hint', style: { padding: '4px 8px' }, text: 'انقر مرتين على تأثير لإضافته إلى الطبقة المحدّدة، أو اسحبه إلى الخط الزمني.' }));
    grouped.forEach(([cat, list]) => {
      const filtered = list.filter((fx) => !filter || fx.name.ar.toLowerCase().includes(filter) || fx.id.includes(filter) || fx.name.en.toLowerCase().includes(filter));
      if (!filtered.length) return;
      const body = el('div', { class: 'fx-cat-body' }, filtered.map((fx) => {
        const item = el('div', {
          class: 'fx-item',
          draggable: 'true',
          title: fx.desc?.ar || fx.name.ar,
          ondblclick: () => theApp().addEffectToSelection(fx.id),
          onclick: () => {
            const layer = this.store.primaryLayer;
            if (!layer) { toastWarn('حدّد طبقة أولًا من الخط الزمني'); return; }
            this.store.addEffect(layer.id, fx.id);
            toastOk(`أُضيف: ${fx.name.ar}`);
          },
          ondragstart: (e) => { e.dataTransfer.setData('application/x-ms-effect', fx.id); e.dataTransfer.effectAllowed = 'copy'; },
        }, [
          el('span', { class: 'fx-dot', style: { background: fx.dom === 'canvas-only' ? 'var(--amber)' : 'var(--violet)' } }),
          el('span', { text: fx.name.ar }),
          fx.dom === 'canvas-only' ? el('span', { class: 'preset-badge', text: 'تصدير دقيق' }) : null,
        ]);
        return item;
      }));
      const catEl = el('div', { class: `fx-cat ${this.collapsedCategories.has(cat.key) ? 'collapsed' : ''}` }, [
        el('div', {
          class: 'fx-cat-head',
          onclick: (e) => {
            const node = e.currentTarget.parentElement;
            node.classList.toggle('collapsed');
            if (node.classList.contains('collapsed')) this.collapsedCategories.add(cat.key);
            else this.collapsedCategories.delete(cat.key);
          },
        }, [icon('i-chevron', 12), el('span', { text: cat.ar }), el('span', { class: 'grow', style: { flex: '1' } }), el('span', { class: 'muted', text: String(filtered.length) })]),
        body,
      ]);
      host.appendChild(catEl);
    });
  }

  /* --------------------------- القوالب --------------------------- */
  renderPresets() {
    const host = this.presetsEl;
    if (!host) return;
    clear(host);
    host.appendChild(el('div', { class: 'form-hint', style: { padding: '6px 8px' }, text: 'قوالب جاهزة تُضاف بضغطة — بعضها يحتاج تحديد طبقة أولًا.' }));
    const grid = el('div', { class: 'preset-grid', style: { padding: '4px 8px' } }, PRESETS.map((preset) => el('div', {
      class: 'preset-card',
      onclick: () => {
        const msg = preset.apply(this.app);
        if (msg) toastOk(msg); else toastWarn('هذا القالب يحتاج تحديد طبقة أولًا');
      },
    }, [
      el('b', { text: preset.name }),
      el('span', { text: preset.desc }),
    ])));
    host.appendChild(grid);
  }

  /* --------------------------- الانتقالات --------------------------- */
  renderTransitions(filter = '') {
    const host = this.transitionsEl;
    if (!host) return;
    clear(host);
    host.appendChild(el('div', { class: 'form-hint', style: { padding: '6px 8px' }, text: 'انقر على انتقال لتطبيقه مباشرة على المقطع أو الطبقة المحددة في الخط الزمني.' }));
    const filtered = TRANSITIONS.filter((t) => !filter || t.name.ar.toLowerCase().includes(filter) || t.name.en.toLowerCase().includes(filter));
    const grid = el('div', { class: 'preset-grid', style: { padding: '4px 8px' } }, filtered.map((trans) => el('div', {
      class: 'preset-card transition-card',
      title: trans.desc.ar,
      onclick: () => applyTransition(this.app, trans.id),
    }, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
        icon(trans.icon, 14),
        el('b', { text: trans.name.ar }),
      ]),
      el('span', { text: trans.desc.ar }),
    ])));
    host.appendChild(grid);
  }

  /* --------------------------- مؤثرات الصوت --------------------------- */
  renderSoundFX() {
    const host = this.soundfxEl;
    if (!host) return;
    clear(host);
    host.appendChild(el('div', { class: 'form-hint', style: { padding: '6px 8px' }, text: 'مؤثرات صوتية مدمجة وسينمائية — معاينة بالنقر على زر التشغيل، وإدراج بالضغط على (+).' }));
    const list = el('div', { class: 'sfx-browser-list', style: { padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '6px' } }, SOUND_EFFECTS.map((sfx) => {
      return el('div', { class: 'sfx-card' }, [
        el('button', {
          class: 'tb-btn ghost sm',
          title: 'معاينة التأثير الصوتي',
          onclick: () => previewSoundEffect(sfx.id),
        }, [icon('i-play', 13)]),
        el('div', { class: 'sfx-meta', style: { flex: '1' } }, [
          el('b', { text: sfx.name, style: { display: 'block', fontSize: '12px' } }),
          el('span', { text: `${sfx.desc} (${sfx.duration}ث)`, style: { fontSize: '11px', color: 'var(--txt-dim)' } }),
        ]),
        el('button', {
          class: 'btn sm primary',
          title: 'إدراج بالخط الزمني',
          onclick: () => addSoundEffectToTimeline(this.app, sfx.id),
        }, [icon('i-plus', 11), el('span', { text: 'إضافة' })]),
      ]);
    }));
    host.appendChild(list);
  }
}

/* --------------------------- سجل التعديلات --------------------------- */
export class HistoryPanel {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.root = document.getElementById('history-list');
    this.store.on('history', () => this.render());
    this.store.on('project', () => this.render());
    this.render();
  }

  render() {
    const host = this.root;
    if (!host) return;
    clear(host);
    const h = this.store.history;
    h.stack.forEach((entry, i) => {
      host.appendChild(el('div', {
        class: `history-row ${i === h.index ? 'current' : ''}`,
        onclick: () => this.store.jumpHistory(i),
      }, [
        el('span', { class: 'idx', text: String(i) }),
        el('span', { class: 'grow', style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' }, text: entry.label }),
      ]));
    });
    if (!h.stack.length) host.appendChild(el('div', { class: 'empty-state', text: 'لا يوجد سجل بعد' }));
    host.scrollTop = host.scrollHeight;
  }
}

function theApp() { return window.MS_APP; }
