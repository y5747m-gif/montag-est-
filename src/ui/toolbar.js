/**
 * شريط الأدوات وشريط القوائم
 */
import { el, icon, clear } from './dom.js';
import { toast } from './toast.js';
import { openDialog, shortcutsDialog, aboutDialog, confirmDialog, promptDialog, colorDialog, button } from './dialog.js';
import { EFFECTS, EFFECT_CATEGORIES } from '../core/effects.js';
import { LAYER_TYPES } from '../core/model.js';
import { showContextMenu } from './menu.js';

const TOOLS = {
  main: [
    ['select', 'i-select', 'أداة التحديد (V)'],
    ['hand', 'i-hand', 'تحريك العرض (H)'],
    ['zoom', 'i-zoom', 'تكبير/تصغير (Z)'],
    ['rotate', 'i-rotate', 'أداة التدوير (W)'],
    ['pan-behind', 'i-panbehind', 'تحريك نقطة الارتكاز (Y)'],
  ],
  shapes: [
    ['rect', 'i-rect', 'مستطيل'],
    ['ellipse', 'i-ellipse', 'بيضاوي'],
    ['star', 'i-star', 'نجمة'],
    ['pen', 'i-pen', 'قلم القناع (G)'],
    ['text', 'i-text', 'أداة النص (Ctrl+T)'],
    ['solid', 'i-solid', 'خلفية صلبة'],
  ],
  misc: [
    ['adjustment', 'i-adjust', 'طبقة ضبط'],
    ['null', 'i-null', 'كائن فارغ'],
    ['camera', 'i-camera', 'كاميرا'],
    ['light', 'i-star2', 'إضاءة'],
    ['particles', 'i-effects', 'جزيئات'],
    ['visualizer', 'i-wave', 'موجّه صوتي'],
  ],
};

// أدوات تُنشئ طبقتها فورًا عند الضغط (سلوك احترافي مثل After Effects)
const INSTANT_TOOLS = new Set(['adjustment', 'null', 'camera', 'light', 'particles', 'visualizer']);

export function buildToolbar(app) {
  const host = document.getElementById('toolbar');
  if (!host) return;
  Object.entries(TOOLS).forEach(([group, tools]) => {
    const groupEl = host.querySelector(`[data-toolgroup="${group}"]`);
    if (!groupEl) return;
    tools.forEach(([id, iconName, title]) => {
      const activate = () => {
        if (INSTANT_TOOLS.has(id)) {
          const layer = app.createLayerFromTool(id);
          toast(`تمت إضافة «${layer.name}» على مسار التشغيل`, 'ok');
        } else {
          app.setTool(id);
        }
      };
      const btn = el('button', {
        class: `tool-btn ${app.tool === id ? 'active' : ''}`,
        dataset: { tool: id },
        title,
        onclick: activate,
        oncontextmenu: (e) => {
          e.preventDefault();
          showContextMenu([
            { label: title, type: 'title' },
            { label: 'تفعيل', action: activate },
          ], { x: e.clientX, y: e.clientY });
        },
      }, [icon(iconName, 17)]);
      groupEl.appendChild(btn);
    });
  });
  // لوحة الألوان
  const spacer = host.querySelector('.tool-spacer');
  const colors = el('div', { class: 'tool-group', style: { alignItems: 'center' } }, [
    el('button', {
      class: 'swatch-btn', title: 'لون الملء (Fill) — تدرّج/لون الأشكال والنصوص',
      onclick: async () => { const c = await colorDialog(app.fillColor, { title: 'لون الملء' }); if (c) { app.fillColor = c; refreshSwatches(); } },
    }, [el('i', { class: 'swatch', style: { background: app.fillColor } })]),
    el('button', {
      class: 'swatch-btn', title: 'لون الحدود (Stroke)',
      onclick: async () => { const c = await colorDialog(app.strokeColor, { title: 'لون الحدود' }); if (c) { app.strokeColor = c; refreshSwatches(); } },
    }, [el('i', { class: 'swatch', style: { background: app.strokeColor } })]),
    el('button', {
      class: 'tb-btn ghost', title: 'تبديل اللونين (X)',
      onclick: () => { const t = app.fillColor; app.fillColor = app.strokeColor; app.strokeColor = t; refreshSwatches(); },
    }, [el('span', { text: '⇄' })]),
  ]);
  host.insertBefore(colors, spacer);
  const refreshSwatches = () => {
    const sw = colors.querySelectorAll('.swatch');
    sw[0].style.background = app.fillColor;
    sw[1].style.background = app.strokeColor;
  };
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  app.store.on('history', () => {
    undoBtn.disabled = !app.store.canUndo();
    redoBtn.disabled = !app.store.canRedo();
  });
  undoBtn.addEventListener('click', () => app.store.undo());
  redoBtn.addEventListener('click', () => app.store.redo());
}

/* --------------------------- القوائم --------------------------- */
export function buildMenus(app) {
  const store = app.store;
  const withSel = (fn) => () => {
    const layer = store.primaryLayer;
    if (!layer) { toast('حدّد طبقة أولًا', 'warn'); return; }
    fn(layer);
  };
  return [
    {
      label: 'ملف',
      items: () => [
        { label: 'مشروع جديد', shortcut: 'Ctrl+N', icon: 'i-plus', action: () => app.newProject() },
        { label: 'فتح مشروع…', shortcut: 'Ctrl+O', icon: 'i-open', action: () => app.openProjectFile() },
        { label: 'استيراد وسائط…', shortcut: 'Ctrl+I', icon: 'i-import', action: () => app.openImportDialog() },
        { type: 'sep' },
        { label: 'حفظ المشروع (.mgeproj)', shortcut: 'Ctrl+S', icon: 'i-save', action: () => { store.saveToFile(); toast('تم حفظ المشروع', 'ok'); } },
        { label: 'حفظ نسخة JSON', action: () => {
          const blob = new Blob([store.serialize({ pretty: true })], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${store.project.name || 'project'}.json`;
          a.click();
        } },
        { type: 'sep' },
        { label: 'تصدير فيديو/صور…', shortcut: 'Ctrl+Shift+E', icon: 'i-export', action: () => app.exportDialog() },
        { label: 'تصدير الإطار الحالي (PNG)', icon: 'i-image', action: () => app.viewer.snapshot() },
        { type: 'sep' },
        { label: 'فتح المشروع التجريبي', action: () => app.createDemoProject() },
        { label: 'مسح البيانات المحفوظة محليًا', action: async () => {
          const ok = await confirmDialog({ title: 'مسح البيانات', message: 'سيُحذف الحفظ التلقائي المحلي. هل تريد المتابعة؟', danger: true });
          if (ok) { store.clearLocal(); toast('تم المسح', 'ok'); }
        } },
      ],
    },
    {
      label: 'تحرير',
      items: () => [
        { label: 'تراجع', shortcut: 'Ctrl+Z', icon: 'i-undo', disabled: !store.canUndo(), action: () => store.undo() },
        { label: 'إعادة', shortcut: 'Ctrl+Shift+Z', icon: 'i-redo', disabled: !store.canRedo(), action: () => store.redo() },
        { type: 'sep' },
        { label: 'نسخ', shortcut: 'Ctrl+C', icon: 'i-copy', disabled: !store.selection.layerIds.length, action: () => store.copySelection() },
        { label: 'قص', shortcut: 'Ctrl+X', disabled: !store.selection.layerIds.length, action: () => store.cutSelection() },
        { label: 'لصق', shortcut: 'Ctrl+V', disabled: !store.clipboard, action: () => store.pasteLayers() },
        { label: 'مضاعفة', shortcut: 'Ctrl+D', disabled: !store.selection.layerIds.length, action: () => store.duplicateLayers(store.selection.layerIds) },
        { label: 'حذف', shortcut: 'Del', icon: 'i-trash', disabled: !store.selection.layerIds.length, action: () => store.removeLayers(store.selection.layerIds) },
        { type: 'sep' },
        { label: 'تحديد الكل', shortcut: 'Ctrl+A', action: () => store.selectAll() },
        { label: 'إلغاء التحديد', shortcut: 'Ctrl+Shift+A', action: () => store.deselectAll() },
        { type: 'sep' },
        { label: 'تقسيم الطبقات عند المؤشر', shortcut: 'Ctrl+Shift+D', icon: 'i-razor', action: () => store.splitLayersAt(store.playhead) },
        { label: 'تحديد كل المفاتيح في الطبقة', disabled: !store.primaryLayer, action: withSel((l) => toast('استخدم محرّر المنحنيات لتحرير المفاتيح', 'warn')) },
      ],
    },
    {
      label: 'تركيب',
      items: () => [
        { label: 'تركيب جديد…', shortcut: 'Ctrl+K', icon: 'i-comp', action: () => app.newComposition() },
        { label: 'إعدادات التركيب…', action: () => app.timeline.setZoom(app.timeline.zoom) || app.focusCompSettings() },
        { label: 'قائمة التركيبات', type: 'title' },
        ...store.project.comps.map((c) => ({
          label: c.name, checked: store.comp?.id === c.id, action: () => store.setActiveComp(c.id),
        })),
        { type: 'sep' },
        { label: 'حذف التركيب الحالي', action: () => store.removeComp(store.comp.id) },
        { label: 'إضافة علامة عند المؤشر', icon: 'i-diamond', action: () => store.addMarker(store.playhead, `علامة ${store.comp.markers.length + 1}`) },
        { type: 'sep' },
        { label: 'تركيب مسبق للطبقات المحدّدة', disabled: !store.selection.layerIds.length, action: () => store.precompose(store.selection.layerIds, 'تركيب مسبق') },
        { label: 'منطقة العمل: تبدأ من المؤشر', action: () => store.setWorkArea(store.playhead, store.comp.workArea[1]) },
        { label: 'منطقة العمل: تنتهي عند المؤشر', action: () => store.setWorkArea(store.comp.workArea[0], store.playhead) },
        { label: 'إعادة ضبط منطقة العمل', action: () => store.setWorkArea(0, store.comp.duration) },
      ],
    },
    {
      label: 'طبقة',
      items: () => [
        { label: 'طبقة نص', shortcut: 'Ctrl+Alt+Shift+T', icon: 'i-text', action: () => app.createLayerOfType('text', { inPoint: store.playhead }) },
        { label: 'خلفية صلبة', shortcut: 'Ctrl+Y', icon: 'i-solid', action: () => app.createLayerOfType('solid', { inPoint: store.playhead }) },
        { label: 'شكل', icon: 'i-rect', action: () => app.createLayerOfType('shape', { inPoint: store.playhead }) },
        { label: 'طبقة ضبط', icon: 'i-adjust', action: () => app.createLayerOfType('adjustment', { inPoint: store.playhead }) },
        { label: 'كائن فارغ', icon: 'i-null', action: () => app.createLayerOfType('null', { inPoint: store.playhead }) },
        { label: 'كاميرا', icon: 'i-camera', action: () => app.createLayerOfType('camera', { inPoint: 0, outPoint: store.duration }) },
        { label: 'إضاءة', icon: 'i-star2', action: () => app.createLayerOfType('light', { inPoint: store.playhead }) },
        { label: 'جزيئات', icon: 'i-effects', action: () => app.createLayerOfType('particles', { inPoint: store.playhead }) },
        { label: 'موجّه صوتي', icon: 'i-wave', action: () => app.createLayerOfType('visualizer', { inPoint: store.playhead }) },
        { type: 'sep' },
        { label: 'إضافة من الوسائط المحدّدة', icon: 'i-video', action: () => app.addSelectedAssetAsLayer(store.playhead) },
        { type: 'sep' },
        { label: 'ترتيب الطبقات', submenu: [
          { label: 'إلى الأعلى', disabled: !store.selection.layerIds.length, action: () => app.moveSelectionToTop() },
          { label: 'إلى الأسفل', disabled: !store.selection.layerIds.length, action: () => app.moveSelectionToBottom() },
        ] },
        { label: 'إظهار/إخفاء', disabled: !store.primaryLayer, action: withSel((l) => store.setLayerFlag(l.id, 'enabled', !l.enabled)) },
        { label: 'قفل/فتح', disabled: !store.primaryLayer, action: withSel((l) => store.setLayerFlag(l.id, 'locked', !l.locked)) },
        { type: 'sep' },
        { label: 'إضافة قناع', disabled: !store.primaryLayer, icon: 'i-mask', action: withSel((l) => store.addMask(l.id)) },
        { label: 'حذف كل الأقنعة', disabled: !store.primaryLayer, action: withSel((l) => { l.masks = []; store.commit('حذف الأقنعة'); }) },
        { label: 'نمط الدمج…', disabled: !store.primaryLayer, action: () => app.focusLayerProps(store.primaryLayer) },
      ],
    },
    {
      label: 'تأثير',
      items: () => [
        ...EFFECT_CATEGORIES.flatMap((cat) => [{
          label: cat.ar,
          submenu: Object.values(EFFECTS).filter((fx) => fx.cat === cat.key).map((fx) => ({
            label: fx.name.ar,
            disabled: !store.primaryLayer,
            action: () => app.addEffectToSelection(fx.id),
          })),
        }]),
        { type: 'sep' },
        { label: 'إزالة كل التأثيرات', disabled: !store.primaryLayer?.effects.length, action: withSel((l) => { l.effects = []; store.commit('حذف التأثيرات'); }) },
        { label: 'نسخ التأثيرات إلى الطبقات المحدّدة', action: () => app.copyEffectsToSelection() },
      ],
    },
    {
      label: 'تحريك',
      items: () => [
        { label: 'إضافة مفتاح عند المؤشر', shortcut: 'Alt+Shift+K', disabled: !store.primaryLayer, action: withSel((l) => {
          const path = store.selection.props[0]?.split('::')[1] || 'transform.opacity';
          store.addKeyframe(l.id, path);
        }) },
        { label: 'حذف المفتاح عند المؤشر', disabled: !store.primaryLayer, action: withSel((l) => {
          const path = store.selection.props[0]?.split('::')[1] || 'transform.opacity';
          store.removeKeyframeAt(l.id, path, store.playhead);
        }) },
        { type: 'sep' },
        { label: 'محرّر المنحنيات', icon: 'i-graph', action: () => app.timeline.showGraphMode(!store.timeline.graph) },
        { label: 'إظهار الخصائص المتحركة فقط', shortcut: 'U', action: () => app.toggleAnimatedOnly() },
        { type: 'sep' },
        { label: 'قوالب جاهزة…', action: () => app.showPresets() },
      ],
    },
    {
      label: 'عرض',
      items: () => [
        { label: 'ملاءمة العارض', shortcut: 'Shift+/', action: () => app.viewer.fit() },
        { label: 'تكبير', shortcut: '+', action: () => app.viewer.setZoom(app.viewer.zoom * 1.25) },
        { label: 'تصغير', shortcut: '-', action: () => app.viewer.setZoom(app.viewer.zoom / 1.25) },
        { type: 'sep' },
        { label: 'الأدلة ومناطق الأمان', checked: store.viewer.showGuides, action: () => app.viewer.toggleGuides() },
        { label: 'المقابض (Gizmos)', checked: store.viewer.gizmos, action: () => { store.viewer.gizmos = !store.viewer.gizmos; app.viewer.renderGizmos(); } },
        { type: 'sep' },
        { label: 'التصاق الخط الزمني', checked: store.timeline.snap, action: () => { store.timeline.snap = !store.timeline.snap; app.updateToggleStates(); } },
        { label: 'ملاءمة الخط الزمني', action: () => app.timeline.fitView() },
        { type: 'sep' },
        { label: 'مساحة العمل', submenu: [
          { label: 'افتراضي', action: () => app.setWorkspace('default') },
          { label: 'تحريك (خط زمني كبير)', action: () => app.setWorkspace('animation') },
          { label: 'معاينة فقط', action: () => app.setWorkspace('preview') },
        ] },
      ],
    },
    {
      label: 'نافذة',
      items: () => [
        { label: 'تبديل اللغة (عربي/English)', action: () => app.toggleLang() },
        { label: 'شاشة كاملة', action: () => app.toggleFullscreen() },
        { type: 'sep' },
        { label: 'وضع المعاينة النقية (Zen)', checked: document.body.classList.contains('zen'), action: () => document.body.classList.toggle('zen') },
        { label: 'إعادة تعيين تخطيط الواجهة', action: () => app.setWorkspace('default') },
      ],
    },
    {
      label: 'مساعدة',
      items: () => [
        { label: 'اختصارات لوحة المفاتيح', shortcut: 'F1', icon: 'i-settings', action: () => shortcutsDialog() },
        { label: 'حول البرنامج', icon: 'i-comp', action: () => aboutDialog() },
        { label: 'دليل سريع', icon: 'i-effects', action: () => app.showQuickGuide() },
      ],
    },
  ];
}
