/**
 * نموذج البيانات — المشروع، التركيبات، الطبقات، الخصائص والمخططات (Schemas)
 * كل خاصية قابلة للتحريك هي كائن { type, value, keys, expr }
 */
import { uid, clamp, deepClone, LAYER_COLORS, randomColor } from './util.js';
import { EFFECTS } from './effects.js';

export const PropType = {
  NUMBER: 'number', VEC2: 'vec2', VEC3: 'vec3', COLOR: 'color',
  TEXT: 'text', BOOL: 'bool', SELECT: 'select',
};

export function makeProp(type, value, extra = {}) {
  return { type, value: deepClone(value), keys: [], expr: '', ...extra };
}
export const numProp = (v, extra) => makeProp(PropType.NUMBER, v ?? 0, extra);
export const vec2Prop = (x = 0, y = 0) => makeProp(PropType.VEC2, { x, y });
export const vec3Prop = (x = 0, y = 0, z = 0) => makeProp(PropType.VEC3, { x, y, z });
export const colorProp = (c = '#ffffff') => makeProp(PropType.COLOR, c);
export const textProp = (t = '') => makeProp(PropType.TEXT, t);
export const boolProp = (v = false) => makeProp(PropType.BOOL, !!v);
export const selectProp = (v) => makeProp(PropType.SELECT, v);

export function cloneProp(prop) {
  return deepClone(prop);
}

/* ============================= أنواع الطبقات ============================= */
export const LAYER_TYPES = {
  solid: { icon: 'i-solid', group: 'basic', color: '#4f6b52' },
  text: { icon: 'i-text', group: 'basic', color: '#6b5a92' },
  shape: { icon: 'i-rect', group: 'basic', color: '#8a6a3a' },
  image: { icon: 'i-image', group: 'media', color: '#3d5a80' },
  video: { icon: 'i-video', group: 'media', color: '#3d5a80' },
  audio: { icon: 'i-audio', group: 'media', color: '#2f6b5a' },
  precomp: { icon: 'i-comp', group: 'basic', color: '#3d6b6b' },
  adjustment: { icon: 'i-adjust', group: 'basic', color: '#7a4a52' },
  null: { icon: 'i-null', group: 'basic', color: '#4a4f58' },
  camera: { icon: 'i-camera', group: '3d', color: '#5a5f8a' },
  light: { icon: 'i-star', group: '3d', color: '#8a7a3a' },
  visualizer: { icon: 'i-wave', group: 'gen', color: '#3f6b7a' },
  particles: { icon: 'i-effects', group: 'gen', color: '#6b3f7a' },
};

export const BLEND_MODES = [
  ['normal', 'عادي'], ['multiply', 'ضرب'], ['screen', 'شاشة'], ['overlay', 'تراكب'],
  ['darken', 'تغميق'], ['lighten', 'تفتيح'], ['color-dodge', 'تفتيح لوني'], ['color-burn', 'حرق لوني'],
  ['hard-light', 'ضوء قوي'], ['soft-light', 'ضوء ناعم'], ['difference', 'فرق'], ['exclusion', 'استبعاد'],
  ['hue', 'تدرج'], ['saturation', 'تشبّع'], ['color', 'لون'], ['luminosity', 'إضاءة'],
];
export const MATTE_MODES = [
  ['none', 'بدون'], ['alpha', 'قناع ألفا'], ['alpha-inverted', 'ألفا معكوس'],
  ['luma', 'قناع إضاءة (Luma)'], ['luma-inverted', 'إضاءة معكوسة'],
];
export const SHAPE_KINDS = [
  ['rect', 'مستطيل'], ['ellipse', 'بيضاوي'], ['polygon', 'مضلع'], ['star', 'نجمة'], ['line', 'خط'], ['path', 'مسار'],
];
export const TEXT_ALIGNS = [['right', 'يمين'], ['center', 'وسط'], ['left', 'يسار']];
export const FONTS = [
  'Cairo', 'Tajawal', 'Noto Kufi Arabic', 'Almarai', 'Amiri', 'Arial', 'Helvetica', 'Tahoma',
  'Impact', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'system-ui', 'monospace',
];

/* ============================= المخططات ============================= */
const P = (k, label, type, def, extra = {}) => ({ k, label, type, def, ...extra });

export const SCHEMAS = {
  solid: [{
    key: 'solid', label: { ar: 'الخلفية الصلبة', en: 'Solid' }, props: [
      P('color', { ar: 'اللون', en: 'Color' }, 'color', '#2f6fd0'),
      P('width', { ar: 'العرض', en: 'Width' }, 'number', 0, { min: 0, max: 8192, unit: 'px', hint: '0 = مقاس التركيب' }),
      P('height', { ar: 'الارتفاع', en: 'Height' }, 'number', 0, { min: 0, max: 8192, unit: 'px' }),
      P('gradient', { ar: 'تدرّج', en: 'Gradient' }, 'bool', false),
      P('color2', { ar: 'اللون الثاني', en: 'Color 2' }, 'color', '#a86bff'),
      P('angle', { ar: 'زاوية التدرّج', en: 'Gradient angle' }, 'number', 45, { min: -360, max: 360, unit: '°' }),
    ],
  }],
  text: [{
    key: 'text', label: { ar: 'النص', en: 'Text' }, props: [
      P('text', { ar: 'مصدر النص', en: 'Source Text' }, 'text', 'نصّك هنا'),
      P('maxWidth', { ar: 'عرض الصندوق', en: 'Box width' }, 'number', 0, { min: 0, max: 8192, unit: 'px', hint: '0 = تلقائي' }),
      P('fontFamily', { ar: 'الخط', en: 'Font' }, 'font', 'Cairo'),
      P('fontSize', { ar: 'حجم الخط', en: 'Font size' }, 'number', 96, { min: 1, max: 900, unit: 'px' }),
      P('fontWeight', { ar: 'وزن الخط', en: 'Weight' }, 'select', '700', { options: [['300', 'رفيع'], ['400', 'عادي'], ['600', 'نصف عريض'], ['700', 'عريض'], ['900', 'أسود']] }),
      P('fill', { ar: 'اللون', en: 'Fill' }, 'color', '#ffffff'),
      P('fill2', { ar: 'لون التدرّج', en: 'Gradient' }, 'color', '#4a9dff'),
      P('gradient', { ar: 'تدرّج', en: 'Gradient fill' }, 'bool', false),
      P('strokeColor', { ar: 'لون الحدود', en: 'Stroke color' }, 'color', '#000000'),
      P('strokeWidth', { ar: 'سماكة الحدود', en: 'Stroke width' }, 'number', 0, { min: 0, max: 60, unit: 'px' }),
      P('tracking', { ar: 'تباعد الأحرف', en: 'Tracking' }, 'number', 0, { min: -50, max: 200, unit: 'px' }),
      P('leading', { ar: 'تباعد الأسطر', en: 'Leading' }, 'number', 0, { min: -100, max: 200, unit: 'px' }),
      P('align', { ar: 'المحاذاة', en: 'Align' }, 'select', 'center', { options: TEXT_ALIGNS }),
      P('justify', { ar: 'تحقيق السطور', en: 'Justify' }, 'select', 'center', { options: [['top', 'أعلى'], ['center', 'وسط'], ['bottom', 'أسفل']] }),
      P('bg', { ar: 'خلفية النص', en: 'Text background' }, 'color', '#00000000'),
      P('bgPadding', { ar: 'هامش الخلفية', en: 'Background padding' }, 'number', 12, { min: 0, max: 200 }),
      P('shadow', { ar: 'ظل النص', en: 'Text shadow' }, 'bool', false),
      P('shadowColor', { ar: 'لون الظل', en: 'Shadow color' }, 'color', '#000000cc'),
      P('shadowBlur', { ar: 'تمويه الظل', en: 'Shadow blur' }, 'number', 12, { min: 0, max: 120 }),
      P('shadowOffset', { ar: 'إزاحة الظل', en: 'Shadow offset' }, 'vec2', { x: 4, y: 6 }),
    ],
  }],
  shape: [{
    key: 'shape', label: { ar: 'الشكل', en: 'Shape' }, props: [
      P('kind', { ar: 'النوع', en: 'Kind' }, 'select', 'rect', { options: SHAPE_KINDS }),
      P('size', { ar: 'الحجم', en: 'Size' }, 'vec2', { x: 520, y: 320 }),
      P('roundness', { ar: 'الاستدارة', en: 'Roundness' }, 'number', 18, { min: 0, max: 500 }),
      P('points', { ar: 'عدد الأضلاع/الرؤوس', en: 'Points' }, 'number', 5, { min: 3, max: 64, step: 1 }),
      P('innerRadius', { ar: 'نسبة النجمة الداخلية', en: 'Inner radius' }, 'number', 45, { min: 1, max: 100, unit: '%' }),
      P('fill', { ar: 'الملء', en: 'Fill' }, 'color', '#4a9dff'),
      P('gradient', { ar: 'تدرّج', en: 'Gradient' }, 'bool', false),
      P('fill2', { ar: 'لون التدرّج', en: 'Gradient color' }, 'color', '#a86bff'),
      P('gradientAngle', { ar: 'زاوية التدرّج', en: 'Gradient angle' }, 'number', 45, { min: -360, max: 360, unit: '°' }),
      P('strokeColor', { ar: 'لون الحدود', en: 'Stroke' }, 'color', '#ffffff'),
      P('strokeWidth', { ar: 'سماكة الحدود', en: 'Stroke width' }, 'number', 0, { min: 0, max: 200 }),
      P('glow', { ar: 'توهّج', en: 'Glow' }, 'number', 0, { min: 0, max: 120 }),
      P('dashes', { ar: 'طول الشرطة', en: 'Dash length' }, 'number', 0, { min: 0, max: 400 }),
    ],
  }],
  image: [{
    key: 'media', label: { ar: 'الصورة', en: 'Image' }, props: [
      P('assetId', { ar: 'الملف', en: 'Source' }, 'asset', ''),
      P('fit', { ar: 'طريقة الملء', en: 'Fit' }, 'select', 'contain', { options: [['contain', 'احتواء'], ['cover', 'تغطية'], ['fill', 'تمديد'], ['none', 'مقاس أصلي']] }),
      P('flipH', { ar: 'قلب أفقي', en: 'Flip H' }, 'bool', false),
      P('flipV', { ar: 'قلب رأسي', en: 'Flip V' }, 'bool', false),
    ],
  }],
  video: [{
    key: 'media', label: { ar: 'الفيديو', en: 'Video' }, props: [
      P('assetId', { ar: 'الملف', en: 'Source' }, 'asset', ''),
      P('fit', { ar: 'طريقة الملء', en: 'Fit' }, 'select', 'cover', { options: [['contain', 'احتواء'], ['cover', 'تغطية'], ['fill', 'تمديد'], ['none', 'مقاس أصلي']] }),
      P('speed', { ar: 'السرعة', en: 'Speed' }, 'number', 100, { min: 1, max: 800, unit: '%' }),
      P('timeRemap', { ar: 'إعادة تعيين الزمن', en: 'Time remap' }, 'number', 0, { min: -100000, max: 100000, unit: 'fr', remap: true }),
      P('flipH', { ar: 'قلب أفقي', en: 'Flip H' }, 'bool', false),
      P('flipV', { ar: 'قلب رأسي', en: 'Flip V' }, 'bool', false),
    ],
  }],
  audio: [{
    key: 'media', label: { ar: 'الصوت', en: 'Audio' }, props: [
      P('assetId', { ar: 'الملف', en: 'Source' }, 'asset', ''),
      P('speed', { ar: 'السرعة/النبرة', en: 'Speed' }, 'number', 100, { min: 25, max: 400, unit: '%' }),
      P('timeRemap', { ar: 'إعادة تعيين الزمن', en: 'Time remap' }, 'number', 0, { min: -100000, max: 100000, unit: 'fr', remap: true }),
    ],
  }],
  precomp: [{
    key: 'comp', label: { ar: 'التركيب المسبق', en: 'Pre-comp' }, props: [
      P('compId', { ar: 'التركيب', en: 'Composition' }, 'comp', ''),
      P('timeOffset', { ar: 'إزاحة الزمن', en: 'Time offset' }, 'number', 0, { min: -100000, max: 100000, unit: 'fr' }),
      P('collapse', { ar: 'توحيد التحويلات', en: 'Collapse transforms' }, 'bool', false),
    ],
  }],
  adjustment: [{
    key: 'adjust', label: { ar: 'الضبط', en: 'Adjustment' }, props: [
      P('amount', { ar: 'قوة التأثير', en: 'Effect amount' }, 'number', 100, { min: 0, max: 100, unit: '%' }),
    ],
  }],
  null: [],
  camera: [{
    key: 'camera', label: { ar: 'الكاميرا', en: 'Camera' }, props: [
      P('zoom', { ar: 'التقريب (البعد البؤري)', en: 'Zoom' }, 'number', 1200, { min: 50, max: 6000 }),
      P('depth', { ar: 'عمق المشهد', en: 'Scene depth' }, 'number', 1600, { min: 100, max: 12000 }),
      P('target', { ar: 'نقطة النظر', en: 'Point of interest' }, 'vec2', { x: 0, y: 0 }),
      P('dof', { ar: 'عمق الميدان', en: 'Depth of field' }, 'number', 0, { min: 0, max: 100 }),
    ],
  }],
  light: [{
    key: 'light', label: { ar: 'الإضاءة', en: 'Light' }, props: [
      P('color', { ar: 'اللون', en: 'Color' }, 'color', '#ffd479'),
      P('intensity', { ar: 'الشدة', en: 'Intensity' }, 'number', 70, { min: 0, max: 100, unit: '%' }),
      P('radius', { ar: 'نصف القطر', en: 'Radius' }, 'number', 700, { min: 1, max: 6000 }),
      P('softness', { ar: 'النعومة', en: 'Softness' }, 'number', 60, { min: 0, max: 100, unit: '%' }),
    ],
  }],
  visualizer: [{
    key: 'viz', label: { ar: 'المُوجِّه الصوتي', en: 'Audio visualizer' }, props: [
      P('assetId', { ar: 'ملف الصوت', en: 'Audio source' }, 'asset', ''),
      P('style', { ar: 'النمط', en: 'Style' }, 'select', 'bars', { options: [['bars', 'أعمدة'], ['line', 'موجة'], ['circle', 'دائري'], ['dots', 'نقاط']] }),
      P('bars', { ar: 'عدد العناصر', en: 'Elements' }, 'number', 48, { min: 4, max: 256, step: 1 }),
      P('radius', { ar: 'نصف القطر', en: 'Radius' }, 'number', 260, { min: 10, max: 2000 }),
      P('thickness', { ar: 'السماكة', en: 'Thickness' }, 'number', 14, { min: 1, max: 200 }),
      P('amplitude', { ar: 'المدى', en: 'Amplitude' }, 'number', 220, { min: 1, max: 2000 }),
      P('color', { ar: 'اللون', en: 'Color' }, 'color', '#4a9dff'),
      P('color2', { ar: 'اللون الثاني', en: 'Color 2' }, 'color', '#a86bff'),
      P('sensitivity', { ar: 'الحساسية', en: 'Sensitivity' }, 'number', 140, { min: 10, max: 600, unit: '%' }),
      P('mirror', { ar: 'تناظر', en: 'Mirror' }, 'bool', false),
      P('smoothing', { ar: 'التنعيم', en: 'Smoothing' }, 'number', 60, { min: 0, max: 100, unit: '%' }),
    ],
  }],
  particles: [{
    key: 'particles', label: { ar: 'الجزيئات', en: 'Particles' }, props: [
      P('count', { ar: 'العدد', en: 'Count' }, 'number', 120, { min: 1, max: 2000, step: 1 }),
      P('lifetime', { ar: 'العمر (إطارات)', en: 'Lifetime (frames)' }, 'number', 90, { min: 2, max: 2000, step: 1 }),
      P('interval', { ar: 'الفاصل (إطارات)', en: 'Spawn interval' }, 'number', 4, { min: 1, max: 120, step: 1 }),
      P('velocity', { ar: 'السرعة', en: 'Velocity' }, 'number', 260, { min: 0, max: 3000, unit: 'px/s' }),
      P('direction', { ar: 'الاتجاه', en: 'Direction' }, 'number', -90, { min: -360, max: 360, unit: '°' }),
      P('spread', { ar: 'الانتشار', en: 'Spread' }, 'number', 70, { min: 0, max: 360, unit: '°' }),
      P('gravity', { ar: 'الجاذبية', en: 'Gravity' }, 'number', 220, { min: -2000, max: 2000, unit: 'px/s²' }),
      P('size', { ar: 'الحجم', en: 'Size' }, 'number', 14, { min: 1, max: 400 }),
      P('sizeVariance', { ar: 'تفاوت الحجم', en: 'Size variance' }, 'number', 60, { min: 0, max: 100, unit: '%' }),
      P('color', { ar: 'اللون', en: 'Color' }, 'color', '#ffd479'),
      P('color2', { ar: 'اللون الثاني', en: 'Color 2' }, 'color', '#ff5c8a'),
      P('shape', { ar: 'شكل الجزيء', en: 'Particle shape' }, 'select', 'circle', { options: [['circle', 'دائرة'], ['square', 'مربع'], ['star', 'نجمة'], ['line', 'خط']] }),
      P('rotationSpeed', { ar: 'سرعة الدوران', en: 'Rotation speed' }, 'number', 90, { min: -720, max: 720, unit: '°/s' }),
      P('fadeOut', { ar: 'تلاشي', en: 'Fade out' }, 'bool', true),
      P('seed', { ar: 'البذرة العشوائية', en: 'Random seed' }, 'number', 7, { min: 0, max: 9999, step: 1 }),
    ],
  }],
};

/* الخصائص العامة لكل الطبقات (التحويل + الصوت) */
export function transformProps() {
  return {
    anchor: vec2Prop(0, 0),
    position: vec2Prop(0, 0),
    scale: vec2Prop(100, 100),
    rotation: numProp(0),
    opacity: numProp(100, { min: 0, max: 100 }),
    skew: numProp(0),
    skewAxis: numProp(0),
  };
}
export function audioProps() {
  return {
    volume: numProp(100, { min: 0, max: 400 }),
    muted: boolProp(false),
  };
}
export function threeDProps() {
  return {
    enable: false,
    z: numProp(0),
    rotationX: numProp(0),
    rotationY: numProp(0),
    rotationZ: numProp(0),
    material: selectProp('diffuse'),
  };
}

/* ============================= الطبقات ============================= */
export function defaultPropsFor(type) {
  const schema = SCHEMAS[type] || [];
  const out = {};
  for (const group of schema) {
    for (const p of group.props) {
      switch (p.type) {
        case 'number': out[p.k] = numProp(p.def, { min: p.min, max: p.max, step: p.step, unit: p.unit, remap: p.remap }); break;
        case 'vec2': out[p.k] = vec2Prop(p.def?.x ?? 0, p.def?.y ?? 0); break;
        case 'color': out[p.k] = colorProp(p.def); break;
        case 'text': out[p.k] = textProp(p.def); break;
        case 'bool': out[p.k] = boolProp(p.def); break;
        case 'select':
        case 'font':
        case 'asset':
        case 'comp':
        default: out[p.k] = selectProp(p.def); break;
      }
    }
  }
  return out;
}

export function createLayer(type, opts = {}) {
  const meta = LAYER_TYPES[type] || LAYER_TYPES.null;
  const layer = {
    id: uid('lyr'),
    type,
    name: opts.name || defaultLayerName(type, opts),
    color: opts.color || randomColor(meta.group === 'media' ? 205 : Math.random() * 360),
    enabled: true,
    solo: false,
    shy: false,
    locked: false,
    threeD: threeDProps(),
    inPoint: opts.inPoint ?? 0,
    outPoint: opts.outPoint ?? 300,
    startTime: opts.startTime ?? 0,
    stretch: opts.stretch ?? 1,
    parent: null,
    blend: opts.blend || 'normal',
    matte: 'none',
    matteLayerId: null,
    transform: transformProps(),
    props: { ...defaultPropsFor(type), ...(opts.props || {}) },
    audio: audioProps(),
    effects: [],
    masks: [],
    guides: { motionBlur: false, autoOrient: false, adjustmentLayer: type === 'adjustment' },
    collapsed: true,
    sourceId: opts.sourceId || null,
    comments: '',
    created: Date.now(),
  };
  if (type === 'solid') {
    layer.props.width.value = opts.width ?? 0;
    layer.props.height.value = opts.height ?? 0;
  }
  if (type === 'visualizer' || type === 'audio' || type === 'video') {
    if (opts.assetId) layer.props.assetId = selectProp(opts.assetId);
  }
  return layer;
}

function defaultLayerName(type, opts) {
  const labels = {
    solid: 'خلفية صلبة', text: 'نص', shape: 'شكل', image: 'صورة', video: 'فيديو', audio: 'صوت',
    precomp: 'تركيب مسبق', adjustment: 'طبقة ضبط', null: 'كائن فارغ', camera: 'كاميرا', light: 'إضاءة',
    visualizer: 'موجّه صوتي', particles: 'جزيئات',
  };
  return opts.name || labels[type] || type;
}

/* ============================= المفاتيح/المؤشرات ============================= */
export function createMarker(t, name, color = '#38c172') {
  return { id: uid('mk'), t, name: name || 'علامة', color };
}

/* ============================= التركيبات ============================= */
export function createComp(opts = {}) {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const fps = opts.fps ?? 30;
  const duration = opts.duration ?? Math.round(fps * 10);
  const comp = {
    id: opts.id || uid('cmp'),
    name: opts.name || 'تركيبة 1',
    width,
    height,
    fps,
    duration,
    bg: opts.bg ?? '#000000',
    transparent: opts.transparent ?? false,
    workArea: [0, duration],
    markers: [],
    layers: opts.layers || [],
    threeD: { enabled: !!opts.threeD, renderer: 'css3d' },
    motionBlur: { enabled: false, samples: 16, shutterAngle: 180 },
    created: Date.now(),
    modified: Date.now(),
  };
  return comp;
}

/* ============================= المشروع ============================= */
export const PROJECT_VERSION = '1.0.0';

export function createProject(opts = {}) {
  const comp = opts.comp || createComp({ name: 'التركيبة الرئيسية' });
  const project = {
    id: uid('prj'),
    name: opts.name || 'مشروع جديد',
    version: PROJECT_VERSION,
    app: 'Montage Studio',
    comps: [comp],
    assets: [],
    activeCompId: comp.id,
    settings: {
      i18n: 'ar',
      autosave: true,
      showGuides: true,
      showSafeAreas: true,
      checkerboard: true,
      snapTimeline: true,
      snapViewer: true,
      gridSize: 50,
    },
    created: Date.now(),
    modified: Date.now(),
  };
  return project;
}

/* ============================= التطبيع (تحميل ملفات) ============================= */
export function normalizeProp(prop, def) {
  if (prop == null) return def ? cloneProp(def) : numProp(0);
  if (typeof prop !== 'object' || !('type' in prop)) {
    // قيمة خام قديمة
    if (def) { const d = cloneProp(def); d.value = prop; return d; }
    return numProp(Number(prop) || 0);
  }
  prop.keys = Array.isArray(prop.keys) ? prop.keys : [];
  prop.keys.forEach((k) => {
    k.t = Math.round(k.t);
    if (!k.eo) k.eo = { x: 1 / 3, y: 1 / 3 };
    if (!k.ei) k.ei = { x: 2 / 3, y: 2 / 3 };
    if (!k.i) k.i = 'bezier';
  });
  prop.keys.sort((a, b) => a.t - b.t);
  prop.expr = prop.expr || '';
  return prop;
}

export function normalizeLayer(raw) {
  const type = LAYER_TYPES[raw.type] ? raw.type : 'null';
  const base = createLayer(type, { name: raw.name, color: raw.color });
  const layer = { ...base, ...raw };
  layer.type = type;
  layer.transform = layer.transform || transformProps();
  const defT = transformProps();
  for (const k of Object.keys(defT)) layer.transform[k] = normalizeProp(layer.transform[k], defT[k]);
  layer.audio = layer.audio || audioProps();
  layer.audio.volume = normalizeProp(layer.audio.volume, audioProps().volume);
  layer.audio.muted = normalizeProp(layer.audio.muted, audioProps().muted);
  const defP = defaultPropsFor(type);
  layer.props = layer.props || {};
  for (const k of Object.keys(defP)) layer.props[k] = normalizeProp(layer.props[k], defP[k]);
  for (const k of Object.keys(layer.props)) layer.props[k] = normalizeProp(layer.props[k], defP[k]);
  layer.effects = (layer.effects || []).map((fx) => normalizeEffect(fx));
  layer.masks = (layer.masks || []).map((m) => ({
    id: m.id || uid('msk'), mode: m.mode || 'add', inverted: !!m.inverted, closed: m.closed !== false,
    feather: m.feather ?? 0, expansion: m.expansion ?? 0, opacity: m.opacity ?? 100,
    points: (m.points || []).map((p) => ({
      x: p.x ?? 0, y: p.y ?? 0,
      inX: p.inX ?? 0, inY: p.inY ?? 0, outX: p.outX ?? 0, outY: p.outY ?? 0,
    })),
  }));
  layer.threeD = { ...threeDProps(), ...(layer.threeD || {}) };
  layer.threeD.z = normalizeProp(layer.threeD.z, numProp(0));
  layer.threeD.rotationX = normalizeProp(layer.threeD.rotationX, numProp(0));
  layer.threeD.rotationY = normalizeProp(layer.threeD.rotationY, numProp(0));
  layer.threeD.rotationZ = normalizeProp(layer.threeD.rotationZ, numProp(0));
  layer.inPoint = Math.round(layer.inPoint ?? 0);
  layer.outPoint = Math.round(layer.outPoint ?? 300);
  layer.startTime = Math.round(layer.startTime ?? 0);
  layer.stretch = layer.stretch ?? 1;
  layer.collapsed = layer.collapsed !== false;
  return layer;
}

export function normalizeEffect(fx) {
  const def = EFFECTS[fx.type];
  if (!def) return fx;
  const params = {};
  for (const p of def.params) {
    const cur = fx.params?.[p.k];
    params[p.k] = normalizeProp(cur, makeDefProp(p));
  }
  return { id: fx.id || uid('fx'), type: fx.type, name: fx.name, enabled: fx.enabled !== false, params, collapsed: fx.collapsed !== false };
}

export function makeDefProp(p) {
  switch (p.type) {
    case 'number': return numProp(p.def, { min: p.min, max: p.max, step: p.step, unit: p.unit });
    case 'vec2': return vec2Prop(p.def?.x ?? 0, p.def?.y ?? 0);
    case 'vec3': return vec3Prop(p.def?.x ?? 0, p.def?.y ?? 0, p.def?.z ?? 0);
    case 'color': return colorProp(p.def);
    case 'text': return textProp(p.def);
    case 'bool': return boolProp(p.def);
    case 'select':
    default: return selectProp(p.def);
  }
}

export function normalizeComp(raw) {
  const comp = createComp({
    id: raw.id, name: raw.name, width: raw.width, height: raw.height, fps: raw.fps,
    duration: raw.duration, bg: raw.bg, transparent: raw.transparent,
    markers: raw.markers, threeD: raw.threeD, motionBlur: raw.motionBlur,
  });
  comp.workArea = raw.workArea || [0, comp.duration];
  comp.layers = (raw.layers || []).map(normalizeLayer);
  comp.markers = (raw.markers || []).map((m) => createMarker(m.t, m.name, m.color));
  comp.modified = raw.modified || Date.now();
  return comp;
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') return createProject();
  const project = createProject({ name: raw.name || 'مشروع مستورد' });
  project.id = raw.id || project.id;
  project.version = raw.version || PROJECT_VERSION;
  project.settings = { ...project.settings, ...(raw.settings || {}) };
  project.comps = (raw.comps && raw.comps.length ? raw.comps : [createComp({})]).map(normalizeComp);
  project.activeCompId = project.comps.find((c) => c.id === raw.activeCompId) ? raw.activeCompId : project.comps[0].id;
  project.assets = (raw.assets || []).map((a) => ({
    id: a.id || uid('ast'),
    name: a.name || 'ملف',
    kind: a.kind || 'image',
    fileType: a.fileType || '',
    size: a.size || 0,
    width: a.width || 0,
    height: a.height || 0,
    durationFrames: a.durationFrames || 0,
    fps: a.fps || 0,
    hasAudio: !!a.hasAudio,
    folderId: a.folderId || null,
    offline: true, // الوسائط تُعاد ربطها عند الفتح إن لم تكن في الجلسة
    thumb: a.thumb || null,
    waveform: a.waveform || null,
  }));
  project.created = raw.created || Date.now();
  project.modified = Date.now();
  return project;
}

/* ============================= استعلامات مساعدة ============================= */
export function findComp(project, id) { return project.comps.find((c) => c.id === id) || null; }
export function findLayer(comp, id) { return comp?.layers.find((l) => l.id === id) || null; }
export function layerIndex(comp, id) { return comp.layers.findIndex((l) => l.id === id); }

export function iterProps(layer) {
  const out = [];
  for (const [k, p] of Object.entries(layer.transform || {})) out.push({ path: `transform.${k}`, prop: p, key: k, group: 'transform' });
  for (const [k, p] of Object.entries(layer.props || {})) {
    if (p && p.type) out.push({ path: `props.${k}`, prop: p, key: k, group: 'props' });
  }
  for (const [k, p] of Object.entries(layer.audio || {})) {
    if (p && p.type) out.push({ path: `audio.${k}`, prop: p, key: k, group: 'audio' });
  }
  layer.effects.forEach((fx) => {
    for (const [k, p] of Object.entries(fx.params || {})) {
      out.push({ path: `effects.${fx.id}.${k}`, prop: p, key: k, group: 'effect', fx });
    }
  });
  return out;
}

export function anyAnimated(layer) { return iterProps(layer).some((e) => e.prop.keys?.length); }

export function clampLayerRange(layer, duration) {
  layer.inPoint = clamp(Math.round(layer.inPoint), 0, duration);
  layer.outPoint = clamp(Math.round(layer.outPoint), layer.inPoint + 1, duration);
  return layer;
}

export function layerVisibleAt(layer, frame, comp) {
  if (!layer.enabled) return false;
  if (frame < layer.inPoint || frame > layer.outPoint) return false;
  const soloed = comp.layers.some((l) => l.solo);
  if (soloed && !layer.solo) return false;
  return true;
}

/** استيراد نصوص مخططات الواجهة */
export function schemaFor(type) { return SCHEMAS[type] || []; }
