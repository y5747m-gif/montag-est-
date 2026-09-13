/**
 * الترجمة — العربية (افتراضي) والإنجليزية
 */
const DICT = {
  ar: {
    file: 'ملف', edit: 'تحرير', composition: 'تركيب', layer: 'طبقة', effect: 'تأثير', animation: 'تحريك',
    view: 'عرض', window: 'نافذة', help: 'مساعدة', render: 'تصدير', assets: 'المشروع', effects: 'التأثيرات',
    presets: 'القوالب', history: 'السجل', properties: 'الخصائص', timeline: 'الخط الزمني', graph: 'محرر المنحنيات',
    import: 'استيراد ملفات', undo: 'تراجع', redo: 'إعادة', fps: 'معدل الإطارات', duration: 'المدة',
    workarea: 'منطقة العمل', deselect: 'إلغاء التحديد', newComp: 'تركيب جديد', save: 'حفظ', open: 'فتح',
    export: 'تصدير', play: 'تشغيل', pause: 'إيقاف', toStart: 'إلى البداية', toEnd: 'إلى النهاية',
    prevFrame: 'الإطار السابق', nextFrame: 'الإطار التالي', loop: 'تكرار', snap: 'التصاق', zoom: 'تكبير',
    select: 'تحديد', hand: 'تحريك العرض', rotate: 'تدوير', panBehind: 'تحريك نقطة الارتكاز',
    rect: 'مستطيل', ellipse: 'بيضاوي', polygon: 'مضلع', star: 'نجمة', pen: 'قلم (Bezier)', text: 'نص',
    solid: 'خلفية صلبة', adjustment: 'طبقة ضبط', nullLayer: 'كائن فارغ', camera: 'كاميرا', razor: 'مقص',
    keyframe: 'مفتاح', addKeyframe: 'إضافة مفتاح', autoOrient: 'توجيه تلقائي', motionBlur: 'تمويه الحركة',
    quality: 'الجودة', resolution: 'الدقة', audio: 'الصوت', video: 'فيديو', image: 'صورة', comp: 'تركيب',
    folder: 'مجلد', offline: 'وسائط غير متصلة', selectAll: 'تحديد الكل', delete: 'حذف', duplicate: 'مضاعفة',
    precompose: 'تركيب مسبق', parenting: 'الربط الأبوي', timeRemap: 'إعادة تعيين الزمن', expression: 'تعبير',
    blend: 'نمط الدمج', matte: 'القناع', transform: 'التحويل', opacity: 'الشفافية', position: 'الموضع',
    scale: 'المقياس', rotation: 'الدوران', anchor: 'نقطة الارتكاز', skew: 'الانحراف', volume: 'مستوى الصوت',
    shape: 'الشكل', fill: 'الملء', stroke: 'الحدود', strokeWidth: 'سماكة الحدود', masks: 'الأقنعة',
    ready: 'جاهز', playing: 'تشغيل', rendering: 'جارٍ التصدير', name: 'الاسم',
  },
  en: {
    file: 'File', edit: 'Edit', composition: 'Composition', layer: 'Layer', effect: 'Effect', animation: 'Animation',
    view: 'View', window: 'Window', help: 'Help', render: 'Export', assets: 'Project', effects: 'Effects',
    presets: 'Presets', history: 'History', properties: 'Properties', timeline: 'Timeline', graph: 'Graph Editor',
    import: 'Import files', undo: 'Undo', redo: 'Redo', fps: 'FPS', duration: 'Duration',
    workarea: 'Work area', deselect: 'Deselect', newComp: 'New composition', save: 'Save', open: 'Open',
    export: 'Export', play: 'Play', pause: 'Pause', toStart: 'Go to start', toEnd: 'Go to end',
    prevFrame: 'Previous frame', nextFrame: 'Next frame', loop: 'Loop', snap: 'Snap', zoom: 'Zoom',
    select: 'Selection', hand: 'Hand', rotate: 'Rotation', panBehind: 'Pan behind',
    rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', pen: 'Pen', text: 'Text',
    solid: 'Solid', adjustment: 'Adjustment', nullLayer: 'Null object', camera: 'Camera', razor: 'Razor',
    keyframe: 'Keyframe', addKeyframe: 'Add keyframe', autoOrient: 'Auto-orient', motionBlur: 'Motion blur',
    quality: 'Quality', resolution: 'Resolution', audio: 'Audio', video: 'Video', image: 'Image', comp: 'Composition',
    folder: 'Folder', offline: 'Media offline', selectAll: 'Select all', delete: 'Delete', duplicate: 'Duplicate',
    precompose: 'Pre-compose', parenting: 'Parenting', timeRemap: 'Time remap', expression: 'Expression',
    blend: 'Blend mode', matte: 'Track matte', transform: 'Transform', opacity: 'Opacity', position: 'Position',
    scale: 'Scale', rotation: 'Rotation', anchor: 'Anchor point', skew: 'Skew', volume: 'Audio level',
    shape: 'Shape', fill: 'Fill', stroke: 'Stroke', strokeWidth: 'Stroke width', masks: 'Masks',
    ready: 'Ready', playing: 'Playing', rendering: 'Rendering', name: 'Name',
  },
};

let current = localStorage.getItem('ms.lang') || 'ar';

export const getLang = () => current;
export function setLang(lang) {
  current = DICT[lang] ? lang : 'ar';
  localStorage.setItem('ms.lang', current);
  document.documentElement.lang = current;
  document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr';
  document.dispatchEvent(new CustomEvent('ms:lang', { detail: current }));
}
export function t(key, fallback) {
  return DICT[current]?.[key] ?? DICT.ar[key] ?? fallback ?? key;
}
export function isRTL() { return current === 'ar'; }

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n, el.textContent); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle, el.title); });
}
