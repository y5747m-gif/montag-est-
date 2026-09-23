/**
 * نظام انتقالات الفيديو المونتاجية (Video Transitions Engine)
 * انتقالات سينمائية جاهزة بضغطة زر مع ضبط المدة والاتجاه
 */
import { setPropValue } from './anim.js';
import { toastOk, toastWarn } from '../ui/toast.js';

export const TRANSITIONS = [
  {
    id: 'crossDissolve',
    name: { ar: 'تلاشٍ متقاطع (Cross Dissolve)', en: 'Cross Dissolve' },
    desc: { ar: 'الانتقال المونتاجي الكلاسيكي الأكثر استخدامًا في السينما', en: 'Classic smooth cross-fade transition' },
    effectType: 'fade',
    icon: 'i-transition',
    defaultParams: { in: 100, out: 100, inDuration: 18, outDuration: 18 },
  },
  {
    id: 'dipToBlack',
    name: { ar: 'تلاشٍ إلى السواد (Dip to Black)', en: 'Dip to Black' },
    desc: { ar: 'هبوط سلس إلى السواد ثم صعود للمشهد التالي', en: 'Dips into pure black between scenes' },
    effectType: 'dipToBlack',
    icon: 'i-adjust',
    defaultParams: { duration: 20, mode: 'both' },
  },
  {
    id: 'dipToWhite',
    name: { ar: 'وميض إلى البياض (Dip to White / Flash)', en: 'Dip to White / Flash' },
    desc: { ar: 'وميض ناصع وسريع يربط بين اللقطات الحماسية', en: 'Energetic bright white flash transition' },
    effectType: 'dipToWhite',
    icon: 'i-star',
    defaultParams: { duration: 14, intensity: 100 },
  },
  {
    id: 'slideLeft',
    name: { ar: 'انزلاق لليسار (Push / Slide Left)', en: 'Slide Left' },
    desc: { ar: 'انتقال حركي يدفع المشهد الحالي نحو اليسار', en: 'Dynamic push left transition' },
    effectType: 'slideIn',
    icon: 'i-next',
    defaultParams: { distance: 1920, angle: 180, duration: 16, fade: true },
  },
  {
    id: 'slideRight',
    name: { ar: 'انزلاق لليمين (Push / Slide Right)', en: 'Slide Right' },
    desc: { ar: 'انتقال حركي يدفع المشهد الحالي نحو اليمين', en: 'Dynamic push right transition' },
    effectType: 'slideIn',
    icon: 'i-prev',
    defaultParams: { distance: 1920, angle: 0, duration: 16, fade: true },
  },
  {
    id: 'slideUp',
    name: { ar: 'انزلاق للأعلى (Slide Up)', en: 'Slide Up' },
    desc: { ar: 'حركة صاعدة وسلسة للقطة التالية', en: 'Upward push transition' },
    effectType: 'slideIn',
    icon: 'i-chevron',
    defaultParams: { distance: 1080, angle: 90, duration: 16, fade: true },
  },
  {
    id: 'zoomIn',
    name: { ar: 'تقريب سريع (Zoom In Transition)', en: 'Zoom In' },
    desc: { ar: 'تقريب بصري سريع ونظيف يدخل إلى اللقطة التالية', en: 'Fast optical zoom in' },
    effectType: 'zoomTransition',
    icon: 'i-zoom',
    defaultParams: { mode: 'in', duration: 16, amount: 60 },
  },
  {
    id: 'zoomOut',
    name: { ar: 'تبعيد سينمائي (Zoom Out Transition)', en: 'Zoom Out' },
    desc: { ar: 'تبعيد كاميرا درامي يكشف المشهد التالي', en: 'Dramatic zoom out transition' },
    effectType: 'zoomTransition',
    icon: 'i-zoom',
    defaultParams: { mode: 'out', duration: 16, amount: 50 },
  },
  {
    id: 'glitch',
    name: { ar: 'تشويش رقمي (Glitch Cut)', en: 'Glitch Cut' },
    desc: { ar: 'تشويش ألوان RGB وتمزق رقمي مثالي للألعاب والموسيقى', en: 'RGB split glitch cut' },
    effectType: 'glitchTransition',
    icon: 'i-effects',
    defaultParams: { duration: 12, intensity: 80 },
  },
  {
    id: 'radialWipe',
    name: { ar: 'مسح عقارب الساعة (Radial Clock Wipe)', en: 'Radial Clock Wipe' },
    desc: { ar: 'مسح دائري بزاوية 360 درجة لإظهار المشهد التالي', en: '360 degree radial wipe' },
    effectType: 'radialWipe',
    icon: 'i-rotate',
    defaultParams: { progress: 100, direction: 'cw', feather: 8 },
  },
  {
    id: 'linearWipe',
    name: { ar: 'مسح خطي مائل (Linear Angle Wipe)', en: 'Linear Wipe' },
    desc: { ar: 'مسح خطي مائل بحواف ناعمة', en: 'Linear diagonal soft wipe' },
    effectType: 'linearWipe',
    icon: 'i-mask',
    defaultParams: { angle: 45, feather: 10, progress: 100 },
  },
  {
    id: 'irisWipe',
    name: { ar: 'مسح دائري يتسع (Iris Circle)', en: 'Iris Circle' },
    desc: { ar: 'دائرة تتسع من المركز كعدسة الكاميرا', en: 'Expanding circular iris' },
    effectType: 'irisWipe',
    icon: 'i-ellipse',
    defaultParams: { duration: 18, shape: 'circle' },
  },
];

/** تطبيق انتقال على الطبقة المحددة في المشروع */
export function applyTransition(app, transitionId, targetLayer = null) {
  const trans = TRANSITIONS.find((t) => t.id === transitionId);
  if (!trans) return null;

  const layer = targetLayer || app.store.primaryLayer;
  if (!layer) {
    toastWarn('حدّد طبقة في الخط الزمني لتطبيق الانتقال عليها');
    return null;
  }

  // إضافة التأثير المناسب
  const fx = app.store.addEffect(layer.id, trans.effectType);
  if (fx && trans.defaultParams) {
    Object.entries(trans.defaultParams).forEach(([k, v]) => {
      if (fx.params[k]) {
        setPropValue(fx.params[k], 0, v);
      }
    });
  }

  toastOk(`تم تطبيق انتقال: ${trans.name.ar}`);
  app.propsPanel.expanded.add('effects');
  app.propsPanel.requestRender();
  app.timeline.rebuild();
  return fx;
}
