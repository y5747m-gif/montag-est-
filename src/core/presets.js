/**
 * القوالب الجاهزة (Presets) — أنماط مونتاج شائعة بضغطة واحدة
 */
import { createLayer, BLEND_MODES } from './model.js';
import { EFFECTS } from './effects.js';
import { setPropValue } from './anim.js';

export const PRESETS = [
  {
    id: 'kinetic-title',
    name: 'عنوان سينمائي متحرك',
    desc: 'طبقة نص + دخول انزلاقي + توهّج + ظل',
    apply(app) {
      const store = app.store;
      const layer = createLayer('text', {
        name: 'عنوان متحرك',
        inPoint: store.playhead,
        outPoint: Math.min(store.duration, store.playhead + Math.round(store.fps * 4)),
        props: { text: 'عنوانك هنا', fontSize: 140, fill: '#ffffff', strokeColor: '#0b1220', strokeWidth: 4 },
      });
      store.addLayer(layer);
      const glow = store.addEffect(layer.id, 'glow');
      if (glow) setPropValue(glow.params.radius, 0, 34);
      store.addEffect(layer.id, 'slideIn');
      store.addEffect(layer.id, 'dropShadow');
      store.setProp(layer.id, 'transform.position', { x: store.width / 2, y: store.height / 2 });
      return 'تم إنشاء العنوان المتحرك';
    },
  },
  {
    id: 'typewriter',
    name: 'آلة كاتبة',
    desc: 'يكشف النص حرفًا حرفًا مع مؤشر وامض',
    apply(app) {
      const store = app.store;
      const layer = createLayer('text', {
        name: 'نص آلة كاتبة',
        inPoint: store.playhead,
        outPoint: Math.min(store.duration, store.playhead + Math.round(store.fps * 6)),
        props: { text: 'اكتب قصّتك هنا…', fontSize: 96, fill: '#e8eaee', align: 'right' },
      });
      store.addLayer(layer);
      store.addEffect(layer.id, 'typewriter');
      store.setProp(layer.id, 'transform.position', { x: store.width / 2, y: store.height / 2 });
      return 'تم إنشاء نص آلة كاتبة';
    },
  },
  {
    id: 'beat-pulse',
    name: 'نبضة على الإيقاع',
    desc: 'يحرّك الطبقة المحدّدة مع شدّة الصوت في المشروع',
    apply(app) {
      const store = app.store;
      const layers = store.selectedLayers();
      if (!layers.length) return null;
      layers.forEach((l) => store.addEffect(l.id, 'beatPulse'));
      return 'تمت إضافة النبضة الإيقاعية';
    },
  },
  {
    id: 'camera-shake',
    name: 'اهتزاز كاميرا',
    desc: 'اهتزاز عشوائي ناعم (مثالي للمشاهد الحماسية)',
    apply(app) {
      const store = app.store;
      const layers = store.selectedLayers();
      if (!layers.length) return null;
      layers.forEach((l) => store.addEffect(l.id, 'shake'));
      return 'تمت إضافة اهتزاز الكاميرا';
    },
  },
  {
    id: 'cinematic-glow',
    name: 'توهّج سينمائي',
    desc: 'طبقة ضبط: توهّج + تظليل الحواف + تباين',
    apply(app) {
      const store = app.store;
      const layer = createLayer('adjustment', {
        name: 'لون سينمائي',
        inPoint: 0,
        outPoint: store.duration,
      });
      store.addLayer(layer);
      store.addEffect(layer.id, 'glow');
      store.addEffect(layer.id, 'vignette');
      store.addEffect(layer.id, 'brightness');
      return 'تمت إضافة طبقة الضبط السينمائية';
    },
  },
  {
    id: 'old-film',
    name: 'فيلم قديم',
    desc: 'فيلم + حبيبات + تدرّج رمادي دافئ',
    apply(app) {
      const store = app.store;
      const layers = store.selectedLayers();
      if (!layers.length) return null;
      layers.forEach((l) => {
        store.addEffect(l.id, 'oldFilm');
        store.addEffect(l.id, 'grain');
        store.addEffect(l.id, 'vignette');
      });
      return 'تم تطبيق نمط الفيلم القديم';
    },
  },
  {
    id: 'glitch',
    name: 'تأثير خلل رقمي',
    desc: 'انحراف لوني + ضجيج + بكسلة خفيفة',
    apply(app) {
      const store = app.store;
      const layers = store.selectedLayers();
      if (!layers.length) return null;
      layers.forEach((l) => {
        store.addEffect(l.id, 'chromatic');
        store.addEffect(l.id, 'noise');
        store.addEffect(l.id, 'scanlines');
      });
      return 'تم تطبيق التأثير الرقمي';
    },
  },
  {
    id: 'transition-wipe',
    name: 'انتقال مسح ناعم',
    desc: 'مسح متدرّج + تلاشٍ (طبّقه على الطبقة الثانية)',
    apply(app) {
      const store = app.store;
      const layers = store.selectedLayers();
      if (!layers.length) return null;
      layers.forEach((l) => {
        const fx = store.addEffect(l.id, 'gradientWipe');
        const fade = store.addEffect(l.id, 'fade');
        if (fx) {
          setPropValue(fx.params.progress, 0, 0);
          fx.params.progress.keys = [
            { t: l.inPoint, v: 0, i: 'bezier', eo: { x: 0.42, y: 0 }, ei: { x: 0.58, y: 1 } },
            { t: Math.min(l.outPoint, l.inPoint + Math.round(store.fps * 1.2)), v: 100, i: 'bezier', eo: { x: 0.42, y: 0 }, ei: { x: 0.58, y: 1 } },
          ];
        }
        if (fade) {
          setPropValue(fade.params.in, 0, 100);
          fade.params.out.value = 100;
        }
        store.commit('قالب انتقال');
      });
      return 'تمت إضافة الانتقال';
    },
  },
  {
    id: 'audio-visualizer',
    name: 'موجّه صوتي',
    desc: 'أعمدة تتحرك مع الصوت (اختر ملف الصوت بعد الإنشاء)',
    apply(app) {
      const store = app.store;
      const layer = createLayer('visualizer', { name: 'موجّه صوتي', inPoint: 0, outPoint: store.duration });
      const audioAsset = store.project.assets.find((a) => a.kind === 'audio' || a.kind === 'video');
      if (audioAsset) layer.props.assetId = { type: 'select', value: audioAsset.id, keys: [], expr: '' };
      store.addLayer(layer);
      store.setProp(layer.id, 'transform.position', { x: store.width / 2, y: store.height / 2 });
      return audioAsset ? 'تم إنشاء الموجّه الصوتي' : 'تم إنشاء الموجّه — اختر ملف صوت من لوحة الخصائص';
    },
  },
  {
    id: 'celebration',
    name: 'جزيئات احتفالية',
    desc: 'انفجار جزيئات ملوّنة مع جاذبية',
    apply(app) {
      const store = app.store;
      const layer = createLayer('particles', {
        name: 'احتفال',
        inPoint: store.playhead,
        outPoint: Math.min(store.duration, store.playhead + Math.round(store.fps * 5)),
      });
      store.addLayer(layer);
      store.setProp(layer.id, 'transform.position', { x: store.width / 2, y: store.height / 2 });
      store.setProp(layer.id, 'transform.scale', { x: 130, y: 130 });
      return 'تم إنشاء الجزيئات الاحتفالية';
    },
  },
  {
    id: 'kenburns',
    name: 'تقريب سينمائي (Ken Burns)',
    desc: 'تقريب وحركة بطيئة على الصور',
    apply(app) {
      const store = app.store;
      const layers = store.selectedLayers();
      if (!layers.length) return null;
      layers.forEach((l) => {
        const inP = l.inPoint, outP = l.outPoint;
        l.transform.scale.keys = [
          { t: inP, v: { x: 100, y: 100 }, i: 'bezier', eo: { x: 0.42, y: 0 }, ei: { x: 0.58, y: 1 } },
          { t: outP, v: { x: 122, y: 122 }, i: 'bezier', eo: { x: 0.42, y: 0 }, ei: { x: 0.58, y: 1 } },
        ];
        const pos = l.transform.position;
        const base = { x: pos.value.x || store.width / 2, y: pos.value.y || store.height / 2 };
        pos.keys = [
          { t: inP, v: base, i: 'bezier', eo: { x: 0.42, y: 0 }, ei: { x: 0.58, y: 1 } },
          { t: outP, v: { x: base.x + 60, y: base.y - 40 }, i: 'bezier', eo: { x: 0.42, y: 0 }, ei: { x: 0.58, y: 1 } },
        ];
        store.commit('قالب تقريب');
      });
      return 'تم تطبيق التقريب السينمائي';
    },
  },
  {
    id: 'lower-third',
    name: 'شريط سفلي (Lower Third)',
    desc: 'عنوان فرعي مع خلفية متدرّجة',
    apply(app) {
      const store = app.store;
      const bg = createLayer('shape', {
        name: 'خلفية الشريط',
        inPoint: store.playhead,
        outPoint: Math.min(store.duration, store.playhead + Math.round(store.fps * 5)),
        props: { kind: 'rect', size: { x: 620, y: 120 }, roundness: 12, gradient: true },
      });
      store.addLayer(bg);
      store.setProp(bg.id, 'transform.position', { x: store.width * 0.3, y: store.height * 0.82 });
      store.setProp(bg.id, 'transform.anchor', { x: -310, y: 0 });
      store.addEffect(bg.id, 'slideIn');
      const text = createLayer('text', {
        name: 'الاسم والمهنة',
        inPoint: store.playhead,
        outPoint: Math.min(store.duration, store.playhead + Math.round(store.fps * 5)),
        props: { text: 'الاسم هنا', fontSize: 54, align: 'center' },
      });
      store.addLayer(text);
      store.setProp(text.id, 'transform.position', { x: store.width * 0.3, y: store.height * 0.82 });
      store.addEffect(text.id, 'typewriter');
      store.setParent(text.id, bg.id);
      return 'تم إنشاء الشريط السفلي';
    },
  },
];

export function presetList() { return PRESETS; }
export function applyPreset(app, id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  return preset.apply(app);
}

export { EFFECTS, BLEND_MODES };
