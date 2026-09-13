/**
 * المشروع التجريبي — يوضّح قدرات البرنامج فور فتحه
 */
import { createProject, createComp, createLayer, makeDefProp } from '../core/model.js';
import { EFFECTS } from '../core/effects.js';
import { setKeyframe, setPropValue } from '../core/anim.js';
import { makeDemoBeat } from '../media/media.js';
import { clamp } from '../core/util.js';

export const DEMO_AUDIO_ID = 'demo_beat';

export function createDemoProject({ seconds = 10 } = {}) {
  const comp = createComp({
    name: 'التركيبة الرئيسية',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: seconds * 30,
    bg: '#05070d',
  });
  const project = createProject({ name: 'مشروع تجريبي', comp });
  const fps = comp.fps;
  const total = comp.duration;

  // أصل صوتي افتراضي (يعمل دون ملفات) لتشغيل الموجّه والنبضات
  project.assets.push({
    id: DEMO_AUDIO_ID,
    name: 'إيقاع تجريبي (بدون صوت)',
    kind: 'audio',
    fileType: 'audio/x-virtual',
    size: 0, width: 0, height: 0,
    durationFrames: total, fps, hasAudio: false,
    offline: false, thumb: null, waveform: null, folderId: null,
  });

  const layers = [];

  // ---------- خلفية متدرّجة ----------
  const bg = createLayer('solid', { name: 'خلفية متدرّجة', inPoint: 0, outPoint: total });
  bg.props.gradient.value = true;
  bg.props.color.value = '#101a3a';
  bg.props.color2.value = '#3a1140';
  bg.props.angle.value = 35;
  layers.push(bg);

  // ---------- جزيئات (خلف الطبقات) ----------
  const particles = createLayer('particles', {
    name: 'جزيئات', inPoint: 0, outPoint: total,
    props: {
      count: { type: 'number', value: 180, keys: [], expr: '' },
      velocity: { type: 'number', value: 110, keys: [], expr: '' },
      direction: { type: 'number', value: -90, keys: [], expr: '' },
      spread: { type: 'number', value: 360, keys: [], expr: '' },
      gravity: { type: 'number', value: -20, keys: [], expr: '' },
      size: { type: 'number', value: 9, keys: [], expr: '' },
      color: { type: 'color', value: '#ffd479', keys: [], expr: '' },
      color2: { type: 'color', value: '#ff5c8a', keys: [], expr: '' },
    },
  });
  particles.transform.position.value = { x: 960, y: 540 };
  particles.transform.opacity.value = 75;
  layers.push(particles);

  // ---------- هالة ضوئية ----------
  const light = createLayer('light', { name: 'هالة ضوئية', inPoint: 0, outPoint: total });
  light.props.color.value = '#4a9dff';
  light.props.radius.value = 900;
  light.props.intensity.value = 60;
  light.transform.position.value = { x: 420, y: 340 };
  setKeyframe(light.transform.position, 0, { x: 320, y: 300 });
  setKeyframe(light.transform.position, Math.round(total * 0.5), { x: 1520, y: 760 });
  setKeyframe(light.transform.position, total, { x: 320, y: 300 });
  layers.push(light);

  // ---------- حلقة دوّارة ----------
  const ring = createLayer('shape', {
    name: 'حلقة دوّارة', inPoint: 0, outPoint: total,
    props: {
      kind: { type: 'select', value: 'ellipse', keys: [], expr: '' },
      size: { type: 'vec2', value: { x: 560, y: 560 }, keys: [], expr: '' },
      fill: { type: 'color', value: '#00000000', keys: [], expr: '' },
      strokeColor: { type: 'color', value: '#4a9dff', keys: [], expr: '' },
      strokeWidth: { type: 'number', value: 5, keys: [], expr: '' },
      glow: { type: 'number', value: 25, keys: [], expr: '' },
      dashes: { type: 'number', value: 18, keys: [], expr: '' },
    },
  });
  ring.transform.position.value = { x: 960, y: 558 };
  ring.transform.opacity.value = 80;
  setPropValue(ring.props.size, 0, { x: 520, y: 520 });
  setKeyframe(ring.props.size, 0, { x: 520, y: 520 });
  setKeyframe(ring.props.size, total, { x: 800, y: 800 });
  setKeyframe(ring.transform.rotation, 0, 0);
  setKeyframe(ring.transform.rotation, total, 360);
  layers.push(ring);

  // ---------- العنوان الرئيسي ----------
  const title = createLayer('text', {
    name: 'العنوان',
    inPoint: 0,
    outPoint: Math.min(total, fps * 6),
    props: {
      text: { type: 'text', value: 'Montage Studio', keys: [], expr: '' },
      fontSize: { type: 'number', value: 168, keys: [], expr: '' },
      fill: { type: 'color', value: '#ffffff', keys: [], expr: '' },
      strokeColor: { type: 'color', value: '#0a1024', keys: [], expr: '' },
      strokeWidth: { type: 'number', value: 5, keys: [], expr: '' },
      shadow: { type: 'bool', value: true, keys: [], expr: '' },
      shadowBlur: { type: 'number', value: 24, keys: [], expr: '' },
    },
  });
  title.transform.position.value = { x: 960, y: 470 };
  setKeyframe(title.transform.scale, 0, { x: 74, y: 74 });
  setKeyframe(title.transform.scale, Math.round(fps * 1.1), { x: 104, y: 104 });
  setKeyframe(title.transform.scale, Math.round(fps * 1.6), { x: 100, y: 100 });
  setKeyframe(title.transform.opacity, 0, 0);
  setKeyframe(title.transform.opacity, Math.round(fps * 0.35), 100);
  title.effects.push(makeEffect('glow', { radius: 26, intensity: 90 }));
  layers.push(title);

  // ---------- العنوان الفرعي (آلة كاتبة) ----------
  const sub = createLayer('text', {
    name: 'العنوان الفرعي',
    inPoint: Math.round(fps * 1.2),
    outPoint: Math.min(total, Math.round(fps * 7)),
    props: {
      text: { type: 'text', value: 'مونتاج · موشن جرافيك · تصدير مباشر من المتصفح', keys: [], expr: '' },
      fontSize: { type: 'number', value: 60, keys: [], expr: '' },
      fill: { type: 'color', value: '#a9c8ff', keys: [], expr: '' },
      tracking: { type: 'number', value: 2, keys: [], expr: '' },
    },
  });
  sub.transform.position.value = { x: 960, y: 596 };
  sub.effects.push(makeEffect('typewriter', { speed: 22, cursor: true }));
  sub.effects.push(makeEffect('fade', { in: 60, out: 60 }));
  layers.push(sub);

  // ---------- الموجّه الصوتي ----------
  const viz = createLayer('visualizer', {
    name: 'الموجّه الصوتي',
    inPoint: 0,
    outPoint: total,
    props: {
      assetId: { type: 'select', value: DEMO_AUDIO_ID, keys: [], expr: '' },
      style: { type: 'select', value: 'bars', keys: [], expr: '' },
      bars: { type: 'number', value: 56, keys: [], expr: '' },
      radius: { type: 'number', value: 380, keys: [], expr: '' },
      thickness: { type: 'number', value: 12, keys: [], expr: '' },
      amplitude: { type: 'number', value: 220, keys: [], expr: '' },
      color: { type: 'color', value: '#4a9dff', keys: [], expr: '' },
      color2: { type: 'color', value: '#a86bff', keys: [], expr: '' },
    },
  });
  viz.transform.position.value = { x: 960, y: 800 };
  viz.transform.opacity.value = 92;
  layers.push(viz);

  // ---------- نص النهاية ----------
  const outro = createLayer('text', {
    name: 'نهاية',
    inPoint: Math.round(fps * 7.5),
    outPoint: total,
    props: {
      text: { type: 'text', value: 'صمّم. حرّك. صدّر.', keys: [], expr: '' },
      fontSize: { type: 'number', value: 120, keys: [], expr: '' },
      fill: { type: 'color', value: '#ffd479', keys: [], expr: '' },
    },
  });
  outro.transform.position.value = { x: 960, y: 940 };
  outro.effects.push(makeEffect('slideIn', { distance: 300, angle: 180, duration: 16, fade: true }));
  outro.effects.push(makeEffect('glow', { radius: 30, intensity: 140, color: '#ffd479' }));
  layers.push(outro);

  // ---------- طبقة الضبط ----------
  const adjust = createLayer('adjustment', { name: 'لون سينمائي', inPoint: 0, outPoint: total });
  adjust.effects.push(makeEffect('vignette', { amount: 55, size: 62 }));
  adjust.effects.push(makeEffect('brightness', { contrast: 12, brightness: -3 }));
  adjust.effects.push(makeEffect('grain', { amount: 10 }));
  layers.push(adjust);

  // تأمين أوقات الطبقات داخل مدة التركيب (مهم عند طلب مدة قصيرة)
  layers.forEach((l) => {
    l.inPoint = clamp(Math.round(l.inPoint), 0, Math.max(0, total - 1));
    l.outPoint = clamp(Math.round(l.outPoint), l.inPoint + 1, total);
    if (l.outPoint > total) l.outPoint = total;
  });

  // ترتيب الطبقات: الأعلى أولًا في القائمة
  comp.layers = layers.reverse();
  project.activeCompId = comp.id;
  return project;
}

function makeEffect(type, params = {}) {
  const def = EFFECTS[type];
  if (!def) return null;
  const out = { id: `fx_demo_${type}_${Math.random().toString(36).slice(2, 7)}`, type, enabled: true, params: {}, collapsed: true };
  def.params.forEach((p) => { out.params[p.k] = makeDefProp(p); });
  Object.entries(params).forEach(([k, v]) => {
    if (!out.params[k]) return;
    if (v && typeof v === 'object' && 'x' in v) out.params[k].value = { ...v };
    else out.params[k].value = v;
  });
  return out;
}

/** يسجّل وسائط المشروع التجريبي في مدير الوسائط (دون صوت فعلي) */
export function registerDemoMedia(media) {
  if (!media.get(DEMO_AUDIO_ID)) {
    const beat = makeDemoBeat(12, 120);
    media.registerVirtual(DEMO_AUDIO_ID, { name: 'إيقاع تجريبي', ...beat });
  }
}
