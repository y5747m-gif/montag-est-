/**
 * مكتبة التأثيرات — تعريفات كاملة تعمل في المعاينة (DOM/CSS/SVG) وفي التصدير (Canvas)
 * كل تأثير يوفّر بعض "الخطّافات" (hooks):
 *   css(p)        → دوال CSS filter تُضاف للمعاينة والتصدير على حد سواء
 *   svg(p, id)    → فلتر SVG يُستخدم في المعاينة (لما لا يوجد مكافئ CSS)
 *   pixel(data,p) → تعديل البكسل يدويًا (التصدير + لقطة المعاينة)
 *   draw(ctx,p)   → رسم إضافي فوق الطبقة (canvas)
 *   domStyle(p)   → أنماط CSS إضافية (قص، أقنعة، تحويلات)
 *   domOverlay(p) → عنصر تراكب داخل الطبقة في المعاينة
 *   transform(p)  → مساهمة في تحويل الطبقة (إزاحة/مقياس/دوران)
 *   clip(p)       → قصّ عام
 */
import { clamp, hexToRgb, rgbToHex, mixColor, rgbaString, rad } from './util.js';

export const EFFECT_CATEGORIES = [
  { key: 'color', ar: 'اللون والتصحيح', en: 'Color Correction' },
  { key: 'blur', ar: 'التمويه والحِدّة', en: 'Blur & Sharpen' },
  { key: 'generate', ar: 'التوليد والضوء', en: 'Generate & Light' },
  { key: 'distort', ar: 'التشويه', en: 'Distort' },
  { key: 'stylize', ar: 'الأنماط والفنّي', en: 'Stylize' },
  { key: 'transition', ar: 'الانتقالات', en: 'Transitions' },
  { key: 'text', ar: 'النصوص', en: 'Text' },
];

const N = (k, label, def, min, max, unit, step) => ({ k, label, type: 'number', def, min, max, unit, step });
const C = (k, label, def) => ({ k, label, type: 'color', def });
const S = (k, label, def, options) => ({ k, label, type: 'select', def, options });
const B = (k, label, def) => ({ k, label, type: 'bool', def });
const V2 = (k, label, def) => ({ k, label, type: 'vec2', def });
const T = (k, label, def) => ({ k, label, type: 'text', def });

/* ------------------------------ أدوات البكسل ------------------------------ */
function eachPixel(data, fn) {
  const { data: d } = data;
  for (let i = 0; i < d.length; i += 4) fn(d, i);
}
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function hexRgb(c) { return hexToRgb(c || '#000000'); }

/** ضجيج حتمي (deterministic) */
export function hashNoise(x, y, seed = 1) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/* ========================================================================== */
export const EFFECTS = {
  /* ------------------------------ اللون ------------------------------ */
  brightness: {
    id: 'brightness', cat: 'color', dom: 'css',
    name: { ar: 'السطوع والتباين', en: 'Brightness & Contrast' },
    desc: { ar: 'يضبط الإضاءة العامة والتباين مع تصحيح جاما.', en: 'Adjusts brightness, contrast and gamma.' },
    params: [N('brightness', { ar: 'السطوع', en: 'Brightness' }, 0, -100, 200, '%'), N('contrast', { ar: 'التباين', en: 'Contrast' }, 0, -100, 200, '%'), N('gamma', { ar: 'جاما', en: 'Gamma' }, 100, 10, 300, '%')],
    css: (p) => `brightness(${(1 + p.brightness / 100).toFixed(3)}) contrast(${(1 + p.contrast / 100).toFixed(3)})`,
    svg: (p, id) => `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="gamma" exponent="${Math.max(0.05, p.gamma / 100)}"/><feFuncG type="gamma" exponent="${Math.max(0.05, p.gamma / 100)}"/><feFuncB type="gamma" exponent="${Math.max(0.05, p.gamma / 100)}"/></feComponentTransfer></filter>`,
    pixel: (img, p) => {
      const g = 1 / Math.max(0.05, p.gamma / 100);
      const c = 1 + p.contrast / 100;
      const b = p.brightness * 2.55;
      if (Math.abs(p.gamma - 100) < 0.5 && Math.abs(p.contrast) < 0.5) {
        eachPixel(img, (d, i) => { d[i] = clamp255(d[i] + b); d[i + 1] = clamp255(d[i + 1] + b); d[i + 2] = clamp255(d[i + 2] + b); });
        return;
      }
      eachPixel(img, (d, i) => {
        for (let k = 0; k < 3; k += 1) {
          let v = d[i + k] * c + b + (1 - c) * 128;
          v = 255 * (clamp(v, 0, 255) / 255) ** g;
          d[i + k] = clamp255(v);
        }
      });
    },
  },

  levels: {
    id: 'levels', cat: 'color', dom: 'svg',
    name: { ar: 'المستويات', en: 'Levels' },
    desc: { ar: 'تحكّم كامل بنقاط الأسود والأبيض والإخراج.', en: 'Input/output black & white points.' },
    params: [N('black', { ar: 'نقطة الأسود', en: 'Input black' }, 0, 0, 255), N('white', { ar: 'نقطة الأبيض', en: 'Input white' }, 255, 0, 255), N('outBlack', { ar: 'إخراج أسود', en: 'Output black' }, 0, 0, 255), N('outWhite', { ar: 'إخراج أبيض', en: 'Output white' }, 255, 0, 255), N('gamma', { ar: 'جاما', en: 'Gamma' }, 100, 10, 300, '%')],
    svg: (p, id) => {
      const tbl = [];
      const ib = p.black / 255, iw = p.white / 255, ob = p.outBlack / 255, ow = p.outWhite / 255;
      for (let i = 0; i < 32; i += 1) {
        let v = i / 31;
        v = (v - ib) / Math.max(1e-4, iw - ib);
        v = clamp(v, 0, 1) ** (100 / Math.max(10, p.gamma));
        tbl.push((ob + v * (ow - ob)).toFixed(4));
      }
      const table = tbl.join(' ');
      return `<filter id="${id}" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="${table}"/><feFuncG type="table" tableValues="${table}"/><feFuncB type="table" tableValues="${table}"/></feComponentTransfer></filter>`;
    },
    pixel: (img, p) => {
      const ib = p.black, iw = Math.max(p.black + 1, p.white);
      const scale = (p.outWhite - p.outBlack) / (iw - ib);
      const gamma = 1 / Math.max(0.1, p.gamma / 100);
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i += 1) {
        let v = (i - ib) * scale + p.outBlack;
        v = clamp255(v) / 255;
        lut[i] = clamp255(255 * v ** gamma);
      }
      eachPixel(img, (d, i) => { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; });
    },
  },

  hueSaturate: {
    id: 'hueSaturate', cat: 'color', dom: 'css',
    name: { ar: 'الهيو والتشبّع', en: 'Hue / Saturation' },
    desc: { ar: 'تدوير الدرجة اللونية والتحكّم بالتشبّع والإضاءة.', en: 'Hue rotate, saturation and lightness.' },
    params: [N('hue', { ar: 'التدوير', en: 'Hue' }, 0, -180, 180, '°'), N('saturation', { ar: 'التشبّع', en: 'Saturation' }, 0, -100, 300, '%'), N('lightness', { ar: 'الإضاءة', en: 'Lightness' }, 0, -100, 100, '%'), N('colorize', { ar: 'تلوين كامل', en: 'Colorize' }, 0, 0, 100, '%')],
    css: (p) => `hue-rotate(${p.hue}deg) saturate(${(1 + p.saturation / 100).toFixed(3)})${p.lightness ? ` brightness(${(1 + p.lightness / 100).toFixed(3)})` : ''}`,
    pixel: (img, p) => {
      if (p.colorize <= 0) return;
      const a = p.colorize / 100;
      eachPixel(img, (d, i) => {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = clamp255(d[i] * (1 - a) + l * a);
        d[i + 1] = clamp255(d[i + 1] * (1 - a) + l * a);
        d[i + 2] = clamp255(d[i + 2] * (1 - a) + l * a);
      });
    },
  },

  tint: {
    id: 'tint', cat: 'color', dom: 'css',
    name: { ar: 'الصبغة', en: 'Tint' },
    desc: { ar: 'يمزج الطبقة بلون واحد بقوة محدّدة.', en: 'Blends the layer toward a single color.' },
    params: [C('color', { ar: 'اللون', en: 'Color' }, '#4a9dff'), N('amount', { ar: 'الكمية', en: 'Amount' }, 60, 0, 100, '%'), B('preserveLuma', { ar: 'الحفاظ على الإضاءة', en: 'Preserve luminance' }, true)],
    pixel: (img, p) => {
      const { r, g, b } = hexRgb(p.color);
      const a = p.amount / 100;
      eachPixel(img, (d, i) => {
        if (p.preserveLuma) {
          const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
          d[i] = clamp255(d[i] * (1 - a) + r * l * a);
          d[i + 1] = clamp255(d[i + 1] * (1 - a) + g * l * a);
          d[i + 2] = clamp255(d[i + 2] * (1 - a) + b * l * a);
        } else {
          d[i] = clamp255(d[i] * (1 - a) + r * a);
          d[i + 1] = clamp255(d[i + 1] * (1 - a) + g * a);
          d[i + 2] = clamp255(d[i + 2] * (1 - a) + b * a);
        }
      });
    },
    domOverlay: (p) => `<div class="fx-tint" style="background:${p.color};opacity:${(p.amount / 100) * (p.preserveLuma ? 0.55 : 0.9)};mix-blend-mode:${p.preserveLuma ? 'color' : 'normal'}"></div>`,
  },

  colorBalance: {
    id: 'colorBalance', cat: 'color', dom: 'svg',
    name: { ar: 'توازن الألوان', en: 'Color Balance' },
    desc: { ar: 'يعزّز قنوات الأحمر والأخضر والأزرق.', en: 'Per-channel RGB gain and offset.' },
    params: [N('r', { ar: 'أحمر', en: 'Red' }, 100, 0, 300, '%'), N('g', { ar: 'أخضر', en: 'Green' }, 100, 0, 300, '%'), N('b', { ar: 'أزرق', en: 'Blue' }, 100, 0, 300, '%'), N('rOff', { ar: 'إزاحة حمراء', en: 'Red offset' }, 0, -100, 100), N('gOff', { ar: 'إزاحة خضراء', en: 'Green offset' }, 0, -100, 100), N('bOff', { ar: 'إزاحة زرقاء', en: 'Blue offset' }, 0, -100, 100)],
    svg: (p, id) => {
      const t = (gain, off) => {
        const g = gain / 100, o = off / 255;
        const arr = [];
        for (let i = 0; i < 8; i += 1) arr.push(clamp(o + (i / 7) * g, 0, 1).toFixed(4));
        return arr.join(' ');
      };
      return `<filter id="${id}" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="${t(p.r, p.rOff)}"/><feFuncG type="table" tableValues="${t(p.g, p.gOff)}"/><feFuncB type="table" tableValues="${t(p.b, p.bOff)}"/></feComponentTransfer></filter>`;
    },
    pixel: (img, p) => {
      const lut = (gain, off) => {
        const arr = new Uint8ClampedArray(256);
        const g = gain / 100;
        for (let i = 0; i < 256; i += 1) arr[i] = clamp255(i * g + off * 2.55);
        return arr;
      };
      const lr = lut(p.r, p.rOff), lg = lut(p.g, p.gOff), lb = lut(p.b, p.bOff);
      eachPixel(img, (d, i) => { d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]]; });
    },
  },

  vibrance: {
    id: 'vibrance', cat: 'color', dom: 'canvas-only',
    name: { ar: 'الاهتزاز اللوني', en: 'Vibrance' },
    desc: { ar: 'يزيد حيوية الألوان الباهتة دون إشباع المفرطة.', en: 'Boosts muted colors selectively.' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 50, -100, 200, '%')],
    pixel: (img, p) => {
      const a = p.amount / 100;
      eachPixel(img, (d, i) => {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        const mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const sat = (mx - mn) / 255;
        const boost = 1 + a * (1 - sat);
        const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
        for (let k = 0; k < 3; k += 1) d[i + k] = clamp255(avg + (d[i + k] - avg) * boost);
      });
    },
  },

  invert: {
    id: 'invert', cat: 'color', dom: 'css',
    name: { ar: 'عكس الألوان', en: 'Invert' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 100, 0, 100, '%')],
    css: (p) => `invert(${(p.amount / 100).toFixed(3)})`,
  },
  grayscale: {
    id: 'grayscale', cat: 'color', dom: 'css',
    name: { ar: 'تدرّج رمادي', en: 'Black & White' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 100, 0, 100, '%'), N('sepia', { ar: 'دافئ (سيبيا)', en: 'Sepia' }, 0, 0, 100, '%')],
    css: (p) => `grayscale(${(p.amount / 100).toFixed(3)})${p.sepia ? ` sepia(${(p.sepia / 100).toFixed(3)})` : ''}`,
  },
  fill: {
    id: 'fill', cat: 'color', dom: 'both',
    name: { ar: 'تعبئة بلون', en: 'Fill' },
    desc: { ar: 'يصبغ الطبقة بلون مع نمط دمج.', en: 'Fills the layer with a color using a blend mode.' },
    params: [C('color', { ar: 'اللون', en: 'Color' }, '#ff5c8a'), N('opacity', { ar: 'الشفافية', en: 'Opacity' }, 70, 0, 100, '%'), S('blend', { ar: 'نمط الدمج', en: 'Blend' }, 'color', [['normal', 'عادي'], ['color', 'لون'], ['overlay', 'تراكب'], ['screen', 'شاشة'], ['multiply', 'ضرب'], ['soft-light', 'ضوء ناعم'], ['hue', 'تدرّج']])],
    draw: (ctx, p, w, h) => {
      ctx.save();
      ctx.globalCompositeOperation = p.blend === 'normal' ? 'source-atop' : p.blend;
      ctx.globalAlpha = p.opacity / 100;
      ctx.fillStyle = p.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    domOverlay: (p) => `<div class="fx-fill" style="background:${p.color};opacity:${(p.opacity / 100).toFixed(3)};mix-blend-mode:${p.blend === 'normal' ? 'normal' : p.blend}"></div>`,
  },
  tritone: {
    id: 'tritone', cat: 'color', dom: 'canvas-only',
    name: { ar: 'ثلاثي الألوان', en: 'Tritone' },
    desc: { ar: 'يعيّن الظلال والوسط والأضواء لثلاثة ألوان.', en: 'Maps shadows/mids/highlights to three colors.' },
    params: [C('shadow', { ar: 'الظلال', en: 'Shadows' }, '#1b2a4a'), C('mid', { ar: 'الوسط', en: 'Midtones' }, '#8a4a8a'), C('high', { ar: 'الأضواء', en: 'Highlights' }, '#ffd479'), N('amount', { ar: 'الكمية', en: 'Amount' }, 100, 0, 100, '%')],
    pixel: (img, p) => {
      const a = p.amount / 100;
      const s = hexRgb(p.shadow), m = hexRgb(p.mid), hi = hexRgb(p.high);
      eachPixel(img, (d, i) => {
        const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        let c;
        if (l < 0.5) c = { r: s.r + (m.r - s.r) * (l * 2), g: s.g + (m.g - s.g) * (l * 2), b: s.b + (m.b - s.b) * (l * 2) };
        else { const t = (l - 0.5) * 2; c = { r: m.r + (hi.r - m.r) * t, g: m.g + (hi.g - m.g) * t, b: m.b + (hi.b - m.b) * t }; }
        d[i] = clamp255(d[i] * (1 - a) + c.r * a);
        d[i + 1] = clamp255(d[i + 1] * (1 - a) + c.g * a);
        d[i + 2] = clamp255(d[i + 2] * (1 - a) + c.b * a);
      });
    },
  },
  posterize: {
    id: 'posterize', cat: 'stylize', dom: 'svg',
    name: { ar: 'تقليل الدرجات', en: 'Posterize' },
    params: [N('levels', { ar: 'عدد الدرجات', en: 'Levels' }, 6, 2, 64, '', 1)],
    svg: (p, id) => {
      const n = Math.max(2, Math.round(p.levels));
      const t = [];
      for (let i = 0; i < n; i += 1) { t.push((i / n).toFixed(3)); t.push(((i + 1) / n).toFixed(3)); }
      const tv = t.join(' ');
      return `<filter id="${id}" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="discrete" tableValues="${tv}"/><feFuncG type="discrete" tableValues="${tv}"/><feFuncB type="discrete" tableValues="${tv}"/></feComponentTransfer></filter>`;
    },
    pixel: (img, p) => {
      const n = Math.max(2, Math.round(p.levels)) - 1;
      eachPixel(img, (d, i) => { for (let k = 0; k < 3; k += 1) d[i + k] = clamp255(Math.round((d[i + k] / 255) * n) / n * 255); });
    },
  },

  /* ------------------------------ التمويه والحدة ------------------------------ */
  blur: {
    id: 'blur', cat: 'blur', dom: 'css',
    name: { ar: 'تمويه غاوسي', en: 'Gaussian Blur' },
    params: [N('radius', { ar: 'نصف القطر', en: 'Blur radius' }, 8, 0, 200, 'px'), N('directional', { ar: 'اتجاهي (طول)', en: 'Directional length' }, 0, 0, 400, 'px'), N('angle', { ar: 'الزاوية', en: 'Angle' }, 0, -180, 180, '°')],
    css: (p) => (p.radius > 0 ? `blur(${p.radius}px)` : ''),
    draw: (ctx, p, w, h, info) => {
      if (p.directional <= 1) return;
      const steps = 12;
      const a = rad(p.angle);
      const dx = Math.cos(a) * p.directional / steps;
      const dy = Math.sin(a) * p.directional / steps;
      const snap = info.tempCanvas;
      if (!snap) return;
      ctx.save();
      ctx.globalAlpha = 1 / (steps + 1);
      for (let i = 1; i <= steps; i += 1) ctx.drawImage(snap, dx * i, dy * i, w, h);
      ctx.restore();
    },
  },
  radialBlur: {
    id: 'radialBlur', cat: 'blur', dom: 'canvas-only',
    name: { ar: 'تمويه شعاعي', en: 'Radial Blur' },
    desc: { ar: 'تمويه تكبير/دوران حول نقطة — مثالي لمشاهد الحركة.', en: 'Zoom/rotate blur around a point.' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 40, 1, 100, '%'), V2('center', { ar: 'المركز', en: 'Center' }, { x: 0, y: 0 }), S('type', { ar: 'النوع', en: 'Type' }, 'zoom', [['zoom', 'تكبير'], ['spin', 'دوران']])],
    needsTemp: true,
    draw: (ctx, p, w, h, info) => {
      const snap = info.tempCanvas;
      if (!snap) return;
      const steps = 14;
      const cx = w / 2 + p.center.x, cy = h / 2 + p.center.y;
      const amt = p.amount / 100;
      ctx.save();
      ctx.globalAlpha = 1 / (steps + 1);
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        ctx.save();
        ctx.translate(cx, cy);
        if (p.type === 'zoom') ctx.scale(1 + amt * t * 0.12, 1 + amt * t * 0.12);
        else ctx.rotate((amt * t * 0.06) * (i % 2 ? 1 : 1));
        ctx.translate(-cx, -cy);
        ctx.drawImage(snap, 0, 0, w, h);
        ctx.restore();
      }
      ctx.restore();
    },
  },
  sharpen: {
    id: 'sharpen', cat: 'blur', dom: 'svg',
    name: { ar: 'الحِدّة', en: 'Sharpen' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 60, 0, 300, '%'), N('radius', { ar: 'النطاق', en: 'Radius' }, 1, 0.3, 8, 'px')],
    svg: (p, id) => {
      const a = p.amount / 100;
      const c = -a / 4;
      return `<filter id="${id}" color-interpolation-filters="sRGB"><feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 ${c} 0 ${c} ${1 + a} ${c} 0 ${c} 0"/></filter>`;
    },
    pixel: (img, p) => {
      const a = p.amount / 100;
      const { data, width, height } = img;
      const src = new Uint8ClampedArray(data);
      const k = [0, -a / 4, 0, -a / 4, 1 + a, -a / 4, 0, -a / 4, 0];
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const i = (y * width + x) * 4;
          for (let ch = 0; ch < 3; ch += 1) {
            let v = 0;
            for (let ky = -1; ky <= 1; ky += 1) {
              for (let kx = -1; kx <= 1; kx += 1) {
                v += src[((y + ky) * width + (x + kx)) * 4 + ch] * k[(ky + 1) * 3 + (kx + 1)];
              }
            }
            data[i + ch] = clamp255(v);
          }
        }
      }
    },
  },
  glow: {
    id: 'glow', cat: 'generate', dom: 'css',
    name: { ar: 'التوهّج', en: 'Glow' },
    desc: { ar: 'يضيف هالة ضوئية حول العناصر الساطعة.', en: 'Adds a light bloom around bright areas.' },
    params: [N('radius', { ar: 'الانتشار', en: 'Radius' }, 24, 0, 200, 'px'), N('intensity', { ar: 'الشدة', en: 'Intensity' }, 120, 0, 400, '%'), C('color', { ar: 'اللون', en: 'Color' }, '#ffffff'), N('threshold', { ar: 'العتبة', en: 'Threshold' }, 40, 0, 100, '%')],
    css: (p) => {
      const col = rgbaString(p.color, clamp((p.intensity / 100) * 0.85, 0, 1));
      const n = clamp(Math.round(p.intensity / 60), 1, 6);
      return Array.from({ length: n }, () => `drop-shadow(0 0 ${p.radius}px ${col})`).join(' ');
    },
    draw: (ctx, p, w, h, info) => {
      const snap = info.tempCanvas;
      if (!snap) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(p.intensity / 200, 0, 2);
      ctx.filter = `blur(${Math.max(1, p.radius / 2)}px) brightness(${1 + p.threshold / 100})`;
      ctx.drawImage(snap, 0, 0, w, h);
      ctx.restore();
    },
    needsTemp: true,
  },
  dropShadow: {
    id: 'dropShadow', cat: 'generate', dom: 'css',
    name: { ar: 'ظل مسقط', en: 'Drop Shadow' },
    params: [C('color', { ar: 'اللون', en: 'Color' }, '#000000'), N('opacity', { ar: 'الشفافية', en: 'Opacity' }, 70, 0, 100, '%'), N('distance', { ar: 'المسافة', en: 'Distance' }, 14, 0, 400, 'px'), N('angle', { ar: 'الزاوية', en: 'Angle' }, 135, -360, 360, '°'), N('blur', { ar: 'التمويه', en: 'Softness' }, 16, 0, 200, 'px')],
    css: (p) => {
      const a = rad(p.angle);
      return `drop-shadow(${Math.cos(a) * p.distance}px ${Math.sin(a) * p.distance}px ${p.blur}px ${rgbaString(p.color, p.opacity / 100)})`;
    },
    draw: (ctx, p, w, h, info) => {
      const snap = info.tempCanvas;
      if (!snap) return;
      const a = rad(p.angle);
      ctx.save();
      ctx.globalAlpha = p.opacity / 100;
      ctx.filter = `blur(${p.blur / 2}px)`;
      ctx.globalCompositeOperation = 'destination-over';
      // تلوين الظل عبر رسم الشكل بلون الظل
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.drawImage(snap, 0, 0);
      cx.globalCompositeOperation = 'source-in';
      cx.fillStyle = p.color;
      cx.fillRect(0, 0, w, h);
      ctx.drawImage(c, Math.cos(a) * p.distance, Math.sin(a) * p.distance);
      ctx.restore();
    },
    needsTemp: true,
  },

  /* ------------------------------ التوليد ------------------------------ */
  noise: {
    id: 'noise', cat: 'stylize', dom: 'svg',
    name: { ar: 'ضجيج', en: 'Noise' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 20, 0, 100, '%'), B('monochrome', { ar: 'أحادي', en: 'Monochromatic' }, true), N('speed', { ar: 'السرعة', en: 'Speed' }, 0, 0, 24, '', 1)],
    pixel: (img, p, info) => {
      const a = p.amount / 100;
      const seed = Math.floor((info.frame || 0) * (p.speed / 24) * 1000);
      const { data, width } = img;
      for (let i = 0; i < data.length; i += 4) {
        const n = (hashNoise(i % width, (i / 4 / width) | 0, seed) - 0.5) * 255 * a * 2;
        if (p.monochrome) { data[i] = clamp255(data[i] + n); data[i + 1] = clamp255(data[i + 1] + n); data[i + 2] = clamp255(data[i + 2] + n); }
        else { data[i] = clamp255(data[i] + n); data[i + 1] = clamp255(data[i + 1] + n * 0.7); data[i + 2] = clamp255(data[i + 2] + n * 0.4); }
      }
    },
    svg: (p, id) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feColorMatrix in="n" type="saturate" values="${p.monochrome ? 0 : 1}" result="nc"/><feComposite in="SourceGraphic" in2="nc" operator="arithmetic" k1="0" k2="1" k3="${(p.amount / 100).toFixed(2)}" k4="${(-50 * p.amount / 100).toFixed(1)}"/></filter>`,
  },
  fractalNoise: {
    id: 'fractalNoise', cat: 'generate', dom: 'svg',
    name: { ar: 'ضجيج فراكتالي', en: 'Fractal Noise' },
    desc: { ar: 'يولّد خلفية ضجيج متحركة (سحب، دخان، ماء).', en: 'Generates animated fractal noise.' },
    params: [N('scale', { ar: 'المقياس', en: 'Scale' }, 60, 1, 400, '%'), N('complexity', { ar: 'التفاصيل', en: 'Complexity' }, 3, 1, 8, '', 1), N('evolution', { ar: 'التطور', en: 'Evolution' }, 0, -1000, 1000, '°'), N('contrast', { ar: 'التباين', en: 'Contrast' }, 100, 0, 300, '%'), B('invert', { ar: 'معكوس', en: 'Invert' }, false), S('blend', { ar: 'الدمج مع الطبقة', en: 'Blend' }, 'overlay', [['overlay', 'تراكب'], ['screen', 'شاشة'], ['multiply', 'ضرب'], ['normal', 'تغطية كاملة']])],
    drawsBackground: true,
    svg: (p, id) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${(0.02 * (100 / Math.max(1, p.scale)) * 6).toFixed(4)}" numOctaves="${Math.round(p.complexity)}" seed="${Math.round(p.evolution)}" result="t"/><feColorMatrix type="saturate" values="0"/></filter>`,
    drawBackground: (ctx, p, w, h, info) => {
      const freq = 0.02 * (100 / Math.max(1, p.scale)) * 6;
      const c = document.createElement('canvas');
      const cw = 256, ch = 256;
      c.width = cw; c.height = ch;
      const cx = c.getContext('2d');
      const oct = Math.max(1, Math.round(p.complexity));
      const img = cx.createImageData(cw, ch);
      const seed = Math.round(p.evolution);
      for (let y = 0; y < ch; y += 1) {
        for (let x = 0; x < cw; x += 1) {
          let v = 0, amp = 1, tot = 0, f = freq * cw;
          for (let o = 0; o < oct; o += 1) {
            v += amp * smoothNoise(x * f, y * f, seed + o * 37);
            tot += amp;
            amp *= 0.5; f *= 2;
          }
          v /= tot;
          v = clamp((v - 0.5) * (p.contrast / 100) + 0.5, 0, 1);
          if (p.invert) v = 1 - v;
          const i = (y * cw + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * v;
          img.data[i + 3] = 255;
        }
      }
      cx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = p.blend === 'normal' ? 'source-over' : p.blend;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(c, 0, 0, cw, ch, 0, 0, w, h);
      ctx.restore();
    },
    domOverlay: (p) => `<div class="fx-noise" style="background-image:url('${noiseDataURL(96, Math.round(p.evolution), p.contrast, p.invert)}');background-size:${clamp(400 / (p.scale / 50), 40, 900)}px;mix-blend-mode:${p.blend === 'normal' ? 'normal' : p.blend}"></div>`,
  },
  gradientRamp: {
    id: 'gradientRamp', cat: 'generate', dom: 'both',
    name: { ar: 'تدرّج لوني', en: 'Gradient Ramp' },
    desc: { ar: 'يضيف تدرّجًا كاملًا فوق الطبقة (خلفيات، عناوين).', en: 'Overlays a gradient ramp.' },
    params: [C('c1', { ar: 'اللون 1', en: 'Color 1' }, '#4a9dff'), C('c2', { ar: 'اللون 2', en: 'Color 2' }, '#a86bff'), N('angle', { ar: 'الزاوية', en: 'Angle' }, 45, -360, 360, '°'), N('opacity', { ar: 'الشفافية', en: 'Opacity' }, 100, 0, 100, '%'), S('blend', { ar: 'الدمج', en: 'Blend' }, 'normal', [['normal', 'عادي'], ['overlay', 'تراكب'], ['screen', 'شاشة'], ['multiply', 'ضرب'], ['soft-light', 'ضوء ناعم']])],
    draw: (ctx, p, w, h) => {
      const a = rad(p.angle);
      const x1 = w / 2 - Math.cos(a) * w / 2, y1 = h / 2 - Math.sin(a) * h / 2;
      const x2 = w / 2 + Math.cos(a) * w / 2, y2 = h / 2 + Math.sin(a) * h / 2;
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, p.c1); g.addColorStop(1, p.c2);
      ctx.save();
      ctx.globalAlpha = p.opacity / 100;
      ctx.globalCompositeOperation = p.blend === 'normal' ? 'source-atop' : p.blend;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    domOverlay: (p) => `<div class="fx-fill" style="background:linear-gradient(${p.angle + 90}deg, ${p.c1}, ${p.c2});opacity:${p.opacity / 100};mix-blend-mode:${p.blend}"></div>`,
  },
  vignette: {
    id: 'vignette', cat: 'generate', dom: 'both',
    name: { ar: 'تظليل الحواف', en: 'Vignette' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 60, 0, 100, '%'), N('size', { ar: 'الحجم', en: 'Size' }, 55, 0, 100, '%'), N('softness', { ar: 'النعومة', en: 'Softness' }, 60, 0, 100, '%')],
    draw: (ctx, p, w, h) => {
      const cx = w / 2, cy = h / 2;
      const r = Math.hypot(w, h) / 2;
      const g = ctx.createRadialGradient(cx, cy, r * (p.size / 100) * 0.7, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${(p.amount / 100).toFixed(3)})`);
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    domOverlay: (p) => `<div class="fx-vignette" style="--v-amt:${p.amount / 100};--v-size:${p.size * 0.7}%;--v-soft:${p.softness / 100}"></div>`,
  },
  scanlines: {
    id: 'scanlines', cat: 'stylize', dom: 'both',
    name: { ar: 'خطوط مسح (CRT)', en: 'Scanlines' },
    params: [N('spacing', { ar: 'التباعد', en: 'Spacing' }, 4, 2, 40, 'px'), N('opacity', { ar: 'الشفافية', en: 'Opacity' }, 30, 0, 100, '%'), N('flicker', { ar: 'وميض', en: 'Flicker' }, 0, 0, 100, '%')],
    draw: (ctx, p, w, h) => {
      ctx.save();
      ctx.globalAlpha = p.opacity / 100;
      ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += p.spacing * 2) ctx.fillRect(0, y, w, p.spacing);
      ctx.restore();
    },
    domOverlay: (p) => `<div class="fx-scan" style="background:repeating-linear-gradient(180deg, rgba(0,0,0,${p.opacity / 100}) 0 ${p.spacing}px, transparent ${p.spacing}px ${p.spacing * 2}px)"></div>`,
  },
  oldFilm: {
    id: 'oldFilm', cat: 'stylize', dom: 'canvas-only',
    name: { ar: 'فيلم قديم', en: 'Old Film' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 70, 0, 100, '%'), N('grain', { ar: 'الحبيبات', en: 'Grain' }, 40, 0, 100, '%'), N('scratches', { ar: 'الخدوش', en: 'Scratches' }, 30, 0, 100, '%')],
    pixel: (img, p, info) => {
      const a = p.amount / 100;
      const { data, width } = img;
      for (let i = 0; i < data.length; i += 4) {
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = clamp255(l * 1.08 + 12 * a + (data[i] - l) * 0.25);
        data[i + 1] = clamp255(l + 6 * a + (data[i + 1] - l) * 0.25);
        data[i + 2] = clamp255(l * 0.92 + (data[i + 2] - l) * 0.25);
        if (p.grain) {
          const n = (hashNoise(i % width, (i / 4 / width) | 0, (info.frame || 0)) - 0.5) * p.grain * 1.4 * a;
          data[i] = clamp255(data[i] + n); data[i + 1] = clamp255(data[i + 1] + n); data[i + 2] = clamp255(data[i + 2] + n);
        }
      }
    },
    draw: (ctx, p, w, h, info) => {
      if (!p.scratches) return;
      ctx.save();
      ctx.globalAlpha = (p.scratches / 100) * 0.35;
      ctx.strokeStyle = '#fff';
      const seed = Math.floor((info.frame || 0) / 2);
      for (let i = 0; i < 4; i += 1) {
        const x = hashNoise(i, seed, 5) * w;
        ctx.lineWidth = hashNoise(i, seed, 9) * 1.6 + 0.3;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (hashNoise(i, seed, 11) - 0.5) * 30, h);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  grain: {
    id: 'grain', cat: 'stylize', dom: 'canvas-only',
    name: { ar: 'حبيبات الفيلم', en: 'Film Grain' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 35, 0, 100, '%'), B('colored', { ar: 'ملوّن', en: 'Colored' }, false)],
    pixel: (img, p, info) => {
      const a = p.amount / 100;
      const { data, width } = img;
      const seed = Math.floor(info.frame || 0);
      for (let i = 0; i < data.length; i += 4) {
        const n = (hashNoise(i % width, (i / 4 / width) | 0, seed) - 0.5) * 255 * a;
        data[i] = clamp255(data[i] + n);
        data[i + 1] = clamp255(data[i + 1] + (p.colored ? (hashNoise(i, 3, seed) - 0.5) * 255 * a : n));
        data[i + 2] = clamp255(data[i + 2] + (p.colored ? (hashNoise(i, 7, seed) - 0.5) * 255 * a : n));
      }
    },
  },

  /* ------------------------------ التشويه ------------------------------ */
  roughenEdges: {
    id: 'roughenEdges', cat: 'distort', dom: 'svg',
    name: { ar: 'خشونة الحواف', en: 'Roughen Edges' },
    params: [N('amount', { ar: 'المقدار', en: 'Amount' }, 12, 0, 120, 'px'), N('scale', { ar: 'الحجم', en: 'Scale' }, 24, 1, 200), N('evolution', { ar: 'التطور', en: 'Evolution' }, 0, -720, 720, '°')],
    svg: (p, id) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="${(1 / Math.max(1, p.scale)).toFixed(4)}" numOctaves="2" seed="${Math.round(p.evolution)}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${p.amount}" xChannelSelector="R" yChannelSelector="G"/></filter>`,
    pixel: (img, p, info) => displacePixels(img, (x, y) => {
      const f = 1 / Math.max(1, p.scale);
      return [(smoothNoise(x * f, y * f, p.evolution) - 0.5) * p.amount * 2, (smoothNoise(x * f + 31, y * f + 17, p.evolution) - 0.5) * p.amount * 2];
    }),
  },
  turbulentDisplace: {
    id: 'turbulentDisplace', cat: 'distort', dom: 'svg',
    name: { ar: 'إزاحة مضطربة', en: 'Turbulent Displace' },
    params: [N('amount', { ar: 'المقدار', en: 'Amount' }, 40, 0, 400, 'px'), N('size', { ar: 'حجم الموجة', en: 'Wave size' }, 60, 2, 500), N('evolution', { ar: 'التطور', en: 'Evolution' }, 0, -2000, 2000, '°'), S('type', { ar: 'النوع', en: 'Type' }, 'turbulence', [['turbulence', 'اضطراب'], ['bulge', 'انتفاخ'], ['marble', 'رخام']])],
    svg: (p, id) => `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="turbulence" baseFrequency="${(1 / Math.max(2, p.size)).toFixed(4)}" numOctaves="3" seed="${Math.round(p.evolution)}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${p.amount}" xChannelSelector="R" yChannelSelector="G"/></filter>`,
    pixel: (img, p) => displacePixels(img, (x, y) => {
      const f = 1 / Math.max(2, p.size);
      const ev = p.evolution / 10;
      let dx = (smoothNoise(x * f, y * f, ev) - 0.5) * p.amount;
      let dy = (smoothNoise(x * f + 13, y * f + 29, ev) - 0.5) * p.amount;
      if (p.type === 'bulge') {
        const cx = img.width / 2, cy = img.height / 2;
        const d = Math.hypot(x - cx, y - cy) / Math.max(1, p.size * 6);
        dx += (x - cx) * (1 / (1 + d * d) - 1) * (p.amount / 60);
        dy += (y - cy) * (1 / (1 + d * d) - 1) * (p.amount / 60);
      }
      if (p.type === 'marble') { dx += Math.sin((y * f * 4) + ev) * p.amount * 0.4; }
      return [dx, dy];
    }),
  },
  ripple: {
    id: 'ripple', cat: 'distort', dom: 'canvas-only',
    name: { ar: 'تموّج', en: 'Ripple' },
    params: [N('amplitude', { ar: 'السعة', en: 'Amplitude' }, 14, 0, 200, 'px'), N('wavelength', { ar: 'الطول الموجي', en: 'Wavelength' }, 90, 5, 900), N('speed', { ar: 'السرعة', en: 'Speed' }, 120, -600, 600), S('axis', { ar: 'المحور', en: 'Axis' }, 'horizontal', [['horizontal', 'أفقي'], ['vertical', 'رأسي'], ['radial', 'شعاعي']])],
    pixel: (img, p, info) => {
      const t = (info.frame || 0) / 30 * (p.speed / 60);
      displacePixels(img, (x, y) => {
        if (p.axis === 'horizontal') return [0, Math.sin((x / p.wavelength) * Math.PI * 2 + t * Math.PI * 2) * p.amplitude];
        if (p.axis === 'vertical') return [Math.sin((y / p.wavelength) * Math.PI * 2 + t * Math.PI * 2) * p.amplitude, 0];
        const d = Math.hypot(x - img.width / 2, y - img.height / 2);
        const s = Math.sin((d / p.wavelength) * Math.PI * 2 + t * Math.PI * 2) * p.amplitude;
        const a = Math.atan2(y - img.height / 2, x - img.width / 2);
        return [Math.cos(a) * s, Math.sin(a) * s];
      });
    },
  },
  pixelate: {
    id: 'pixelate', cat: 'stylize', dom: 'svg',
    name: { ar: 'بكسلة', en: 'Mosaic / Pixelate' },
    params: [N('size', { ar: 'حجم المربع', en: 'Block size' }, 18, 2, 200, 'px'), N('roundness', { ar: 'الاستدارة', en: 'Roundness' }, 0, 0, 100, '%')],
    svg: (p, id) => {
      const s = Math.max(2, Math.round(p.size));
      return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feFlood x="1" y="1" width="${s}" height="${s}" result="f"/><feComposite width="${s * 2}" height="${s * 2}" result="c"/><feTile result="t"/><feComposite in="SourceGraphic" in2="t" operator="in"/></filter>`;
    },
    pixel: (img, p) => {
      const s = Math.max(2, Math.round(p.size));
      const { data, width, height } = img;
      for (let y = 0; y < height; y += s) {
        for (let x = 0; x < width; x += s) {
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let yy = y; yy < Math.min(y + s, height); yy += 1) {
            for (let xx = x; xx < Math.min(x + s, width); xx += 1) {
              const i = (yy * width + xx) * 4;
              r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n += 1;
            }
          }
          r /= n; g /= n; b /= n; a /= n;
          for (let yy = y; yy < Math.min(y + s, height); yy += 1) {
            for (let xx = x; xx < Math.min(x + s, width); xx += 1) {
              const i = (yy * width + xx) * 4;
              data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
            }
          }
        }
      }
    },
  },
  mirror: {
    id: 'mirror', cat: 'distort', dom: 'both',
    name: { ar: 'انعكاس', en: 'Mirror' },
    params: [S('axis', { ar: 'المحور', en: 'Axis' }, 'horizontal', [['horizontal', 'أفقي'], ['vertical', 'رأسي'], ['both', 'رباعي'], ['quad', 'أربعة أقسام']]), N('angle', { ar: 'زاوية الخط', en: 'Line angle' }, 0, -180, 180, '°'), N('center', { ar: 'موضع الخط', en: 'Center' }, 0, -100, 100, '%')],
    draw: (ctx, p, w, h, info) => {
      const snap = info.tempCanvas;
      if (!snap) return;
      const cx = w / 2 + (w / 2) * (p.center / 100) * (p.axis === 'vertical' ? 0 : 1);
      const cy = h / 2 + (h / 2) * (p.center / 100) * (p.axis === 'horizontal' ? 0 : 1);
      ctx.save();
      ctx.beginPath();
      if (p.axis === 'horizontal') ctx.rect(cx, 0, w - cx, h);
      else if (p.axis === 'vertical') ctx.rect(0, cy, w, h - cy);
      else ctx.rect(cx, cy, w - cx, h - cy);
      ctx.clip();
      ctx.translate(cx * 2, 0);
      ctx.drawImage(snap, 0, 0, w, h);
      if (p.axis === 'both' || p.axis === 'quad') {
        ctx.translate(-cx * 2, cy * 2);
        ctx.drawImage(snap, 0, 0, w, h);
      }
      ctx.restore();
    },
    needsTemp: true,
  },
  crop: {
    id: 'crop', cat: 'distort', dom: 'both',
    name: { ar: 'قص', en: 'Crop' },
    params: [N('top', { ar: 'أعلى', en: 'Top' }, 0, 0, 100, '%'), N('bottom', { ar: 'أسفل', en: 'Bottom' }, 0, 0, 100, '%'), N('left', { ar: 'يسار', en: 'Left' }, 0, 0, 100, '%'), N('right', { ar: 'يمين', en: 'Right' }, 0, 0, 100, '%'), N('feather', { ar: 'تنعيم', en: 'Feather' }, 0, 0, 50, '%'), B('autoCenter', { ar: 'إعادة التوسيط', en: 'Auto-center' }, false)],
    domStyle: (p) => ({ clipPath: `inset(${p.top}% ${p.right}% ${p.bottom}% ${p.left}%)` }),
    draw: (ctx, p, w, h) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(w * p.left / 100, h * p.top / 100, w * (1 - (p.left + p.right) / 100), h * (1 - (p.top + p.bottom) / 100));
      ctx.clip();
      ctx.clearRect(0, 0, w, h);
      ctx.restore();
      // إعادة رسم المحتوى داخل منطقة القص
      if (p.autoCenter) { /* يُدار في المحرّك عبر transform */ }
    },
  },
  flip: {
    id: 'flip', cat: 'distort', dom: 'both',
    name: { ar: 'قلب', en: 'Flip' },
    params: [B('horizontal', { ar: 'أفقي', en: 'Horizontal' }, false), B('vertical', { ar: 'رأسي', en: 'Vertical' }, false)],
    transform: (p) => ({ sx: p.horizontal ? -1 : 1, sy: p.vertical ? -1 : 1 }),
    domStyle: (p) => ({ transform: `scale(${p.horizontal ? -1 : 1}, ${p.vertical ? -1 : 1})` }),
  },
  lensDistortion: {
    id: 'lensDistortion', cat: 'distort', dom: 'canvas-only',
    name: { ar: 'تشويه عدسة', en: 'Lens Distortion' },
    params: [N('amount', { ar: 'الكمية', en: 'Amount' }, 30, -100, 100, '%'), N('zoom', { ar: 'تقريب', en: 'Zoom' }, 0, -50, 50, '%')],
    pixel: (img, p) => {
      const { width: w, height: h } = img;
      const k = p.amount / 100 * 0.5;
      displacePixels(img, (x, y) => {
        const cx = w / 2, cy = h / 2;
        const nx = (x - cx) / cx, ny = (y - cy) / cy;
        const r2 = nx * nx + ny * ny;
        const f = 1 + k * r2 + (p.zoom / 100) * -0.4;
        const sx = cx + nx * f * cx, sy = cy + ny * f * cy;
        return [sx - x, sy - y];
      });
    },
  },
  chromatic: {
    id: 'chromatic', cat: 'stylize', dom: 'canvas-only',
    name: { ar: 'انحراف لوني', en: 'Chromatic Aberration' },
    params: [N('amount', { ar: 'المقدار', en: 'Amount' }, 6, 0, 80, 'px'), N('angle', { ar: 'الزاوية', en: 'Angle' }, 0, -180, 180, '°')],
    needsTemp: true,
    drawsChannels: true,
    draw: (ctx, p, w, h, info) => {
      const snap = info.tempCanvas;
      if (!snap) return;
      const a = rad(p.angle);
      const dx = Math.cos(a) * p.amount, dy = Math.sin(a) * p.amount;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.filter = 'url(#none)';
      ctx.drawImage(snap, dx, dy, w, h);
      ctx.drawImage(snap, -dx, -dy, w, h);
      ctx.restore();
    },
  },
  stroke: {
    id: 'stroke', cat: 'generate', dom: 'svg',
    name: { ar: 'حدود خارجية', en: 'Stroke / Outline' },
    desc: { ar: 'يرسم إطارًا حول محتوى الطبقة (مثالي للعناوين).', en: 'Outlines the layer content.' },
    params: [C('color', { ar: 'اللون', en: 'Color' }, '#ffffff'), N('width', { ar: 'السماكة', en: 'Width' }, 4, 0, 80, 'px'), N('opacity', { ar: 'الشفافية', en: 'Opacity' }, 100, 0, 100, '%')],
    svg: (p, id) => `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%"><feMorphology operator="dilate" radius="${Math.max(0.4, p.width / 2)}" in="SourceAlpha" result="d"/><feFlood flood-color="${p.color}" flood-opacity="${(p.opacity / 100).toFixed(2)}" result="c"/><feComposite in="c" in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    draw: (ctx, p, w, h, info) => {
      const snap = info.tempCanvas;
      if (!snap) return;
      const n = Math.max(4, Math.round(p.width));
      ctx.save();
      ctx.globalAlpha = p.opacity / 100;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.drawImage(snap, 0, 0);
      cx.globalCompositeOperation = 'source-in';
      cx.fillStyle = p.color;
      cx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-over';
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        ctx.drawImage(c, Math.cos(a) * p.width / 2, Math.sin(a) * p.width / 2);
      }
      ctx.restore();
    },
    needsTemp: true,
  },

  /* ------------------------------ الانتقالات ------------------------------ */
  linearWipe: {
    id: 'linearWipe', cat: 'transition', dom: 'both',
    name: { ar: 'مسح خطي', en: 'Linear Wipe' },
    desc: { ar: 'كشف الطبقة تدريجيًا من اتجاه محدّد.', en: 'Progressively reveals the layer.' },
    params: [N('progress', { ar: 'التقدّم', en: 'Progress' }, 100, 0, 100, '%'), N('angle', { ar: 'الزاوية', en: 'Angle' }, 0, -360, 360, '°'), N('feather', { ar: 'تنعيم الحد', en: 'Feather' }, 4, 0, 50, '%')],
    domStyle: (p) => {
      if (p.progress >= 99.9) return {};
      const insetMap = wipedInsets(p.angle, p.progress, p.feather / 2);
      return { clipPath: `inset(${insetMap})` };
    },
    clip: (p, w, h) => {
      if (p.progress >= 99.9) return null;
      const a = rad(p.angle);
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      return { path: (ctx) => {
        const pts = wipePolygon(dir, p.progress / 100, w, h);
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      } };
    },
  },
  radialWipe: {
    id: 'radialWipe', cat: 'transition', dom: 'both',
    name: { ar: 'مسح دائري', en: 'Radial Wipe' },
    params: [N('progress', { ar: 'التقدّم', en: 'Progress' }, 100, 0, 100, '%'), V2('center', { ar: 'المركز', en: 'Center' }, { x: 0, y: 0 }), S('direction', { ar: 'الاتجاه', en: 'Direction' }, 'cw', [['cw', 'مع عقارب الساعة'], ['ccw', 'عكس عقارب الساعة']]), N('feather', { ar: 'تنعيم', en: 'Feather' }, 6, 0, 45, '%')],
    domStyle: (p) => {
      if (p.progress >= 99.9) return {};
      const deg = (p.progress / 100) * 360;
      const mask = p.direction === 'cw'
        ? `conic-gradient(at 50% 50%, #000 0deg, #000 ${deg}deg, transparent ${deg}deg)`
        : `conic-gradient(at 50% 50%, transparent 0deg, transparent ${360 - deg}deg, #000 ${360 - deg}deg)`;
      return { WebkitMaskImage: mask, maskImage: mask };
    },
    clip: (p, w, h) => ({
      path: (ctx) => {
        const cx = w / 2 + p.center.x, cy = h / 2 + p.center.y;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const a0 = p.direction === 'cw' ? 0 : Math.PI;
        const sweep = (p.progress / 100) * Math.PI * 2 * (p.direction === 'cw' ? 1 : -1);
        ctx.arc(cx, cy, Math.hypot(w, h), a0, a0 + sweep, p.direction !== 'cw');
        ctx.closePath();
      },
    }),
  },
  gradientWipe: {
    id: 'gradientWipe', cat: 'transition', dom: 'both',
    name: { ar: 'مسح متدرّج', en: 'Gradient Wipe' },
    params: [N('progress', { ar: 'التقدّم', en: 'Progress' }, 100, 0, 100, '%'), N('angle', { ar: 'الزاوية', en: 'Angle' }, 45, -360, 360, '°'), N('softness', { ar: 'نعومة الحد', en: 'Softness' }, 25, 0, 100, '%'), N('transitionWidth', { ar: 'عرض الانتقال', en: 'Transition width' }, 18, 1, 100, '%')],
    domStyle: (p) => {
      if (p.progress >= 99.9) return {};
      const start = -p.transitionWidth + (p.progress / 100) * (100 + p.transitionWidth * 2);
      const mask = `linear-gradient(${p.angle + 90}deg, transparent ${Math.max(0, start - p.transitionWidth)}%, #000 ${clamp(start + p.transitionWidth, 0, 100)}%, transparent 100%)`;
      const m2 = `linear-gradient(${p.angle + 90}deg, #000 ${Math.max(0, start - p.transitionWidth)}%, rgba(0,0,0,0) ${clamp(start + p.transitionWidth, 0, 100)}%)`;
      return { WebkitMaskImage: m2, maskImage: m2 };
    },
  },
  fade: {
    id: 'fade', cat: 'transition', dom: 'both',
    name: { ar: 'تلاشٍ', en: 'Fade' },
    params: [N('in', { ar: 'دخول', en: 'Fade in' }, 0, 0, 100, '%'), N('out', { ar: 'خروج', en: 'Fade out' }, 0, 0, 100, '%'), N('inDuration', { ar: 'مدة الدخول (fr)', en: 'In duration (frames)' }, 15, 1, 300, '', 1), N('outDuration', { ar: 'مدة الخروج (fr)', en: 'Out duration (frames)' }, 15, 1, 300, '', 1)],
    opacityFactor: (p, info) => {
      const local = info.frame - (info.layer.inPoint);
      const total = info.layer.outPoint - info.layer.inPoint;
      let f = 1;
      if (p.in > 0) f *= clamp(local / Math.max(1, p.inDuration), 0, 1) * (p.in / 100) + (1 - p.in / 100);
      if (p.out > 0) f *= clamp((total - local) / Math.max(1, p.outDuration), 0, 1) * (p.out / 100) + (1 - p.out / 100);
      return f;
    },
  },
  slideIn: {
    id: 'slideIn', cat: 'transition', dom: 'both',
    name: { ar: 'دخول انزلاقي', en: 'Slide In' },
    params: [N('distance', { ar: 'المسافة', en: 'Distance' }, 600, 0, 4000, 'px'), N('angle', { ar: 'الاتجاه', en: 'Direction' }, 180, -360, 360, '°'), N('duration', { ar: 'المدة (fr)', en: 'Duration (frames)' }, 18, 1, 300, '', 1), B('fade', { ar: 'مع تلاشٍ', en: 'With fade' }, true)],
    transform: (p, info) => {
      const local = info.frame - info.layer.inPoint;
      const t = clamp(local / Math.max(1, p.duration), 0, 1);
      const e = 1 - (1 - t) ** 3;
      const f = (1 - e) * p.distance;
      const a = rad(p.angle);
      return { tx: Math.cos(a) * f, ty: Math.sin(a) * f };
    },
    opacityFactor: (p, info) => {
      if (!p.fade) return 1;
      const local = info.frame - info.layer.inPoint;
      return clamp(local / Math.max(1, p.duration), 0, 1);
    },
  },
  popIn: {
    id: 'popIn', cat: 'transition', dom: 'both',
    name: { ar: 'ظهور نابض', en: 'Pop In' },
    params: [N('duration', { ar: 'المدة (fr)', en: 'Duration (frames)' }, 16, 1, 300, '', 1), N('overshoot', { ar: 'الانتفاخ', en: 'Overshoot' }, 30, 0, 100, '%'), N('fade', { ar: 'مع تلاشٍ', en: 'With fade' }, true)],
    transform: (p, info) => {
      const local = info.frame - info.layer.inPoint;
      const t = clamp(local / Math.max(1, p.duration), 0, 1);
      const e = 1 - (1 - t) ** 3;
      const over = 1 - Math.sin(t * Math.PI) * (1 - t) * (p.overshoot / 100) * 2.4;
      return { sx: clamp(e * over, 0.0001, 6), sy: clamp(e * over, 0.0001, 6) };
    },
    opacityFactor: (p, info) => (p.fade ? clamp((info.frame - info.layer.inPoint) / Math.max(1, p.duration / 2), 0, 1) : 1),
  },
  shake: {
    id: 'shake', cat: 'transition', dom: 'both',
    name: { ar: 'اهتزاز', en: 'Camera Shake' },
    params: [N('amount', { ar: 'القوة', en: 'Amount' }, 24, 0, 400, 'px'), N('frequency', { ar: 'التردد', en: 'Frequency' }, 12, 0.2, 60, 'Hz'), S('axis', { ar: 'المحور', en: 'Axis' }, 'both', [['both', 'الاثنان'], ['x', 'أفقي'], ['y', 'رأسي']]), N('rotation', { ar: 'دوران', en: 'Rotation' }, 3, 0, 45, '°')],
    transform: (p, info) => {
      const t = (info.frame || 0) / Math.max(1, info.fps || 30) * p.frequency;
      const nx = smoothNoise(t * 13.7, 5.1, 3) - 0.5;
      const ny = smoothNoise(t * 11.3, 17.7, 9) - 0.5;
      const nr = smoothNoise(t * 7.9, 23.3, 4) - 0.5;
      return {
        tx: p.axis === 'y' ? 0 : nx * 2 * p.amount,
        ty: p.axis === 'x' ? 0 : ny * 2 * p.amount,
        rot: nr * 2 * p.rotation,
      };
    },
  },
  beatPulse: {
    id: 'beatPulse', cat: 'transition', dom: 'both',
    name: { ar: 'نبضة على الإيقاع', en: 'Beat Pulse' },
    desc: { ar: 'يحرّك الطبقة تلقائيًا مع شدّة الصوت في المشروع.', en: 'Drives the layer from project audio loudness.' },
    params: [N('scale', { ar: 'قوة المقياس', en: 'Scale amount' }, 18, 0, 120, '%'), N('move', { ar: 'قوة الحركة', en: 'Move amount' }, 0, 0, 200, 'px'), N('rotation', { ar: 'الدوران', en: 'Rotation' }, 0, 0, 30, '°'), N('threshold', { ar: 'العتبة', en: 'Threshold' }, 10, 0, 100, '%'), N('smoothing', { ar: 'تنعيم', en: 'Smoothing' }, 40, 0, 95, '%')],
    needsAudio: true,
    transform: (p, info) => {
      const amp = clamp((info.audioAmp ?? 0) * 100, 0, 300) / 100;
      const above = clamp(amp - p.threshold / 100, 0, 3);
      const k = above * (1 - p.smoothing / 100) + above * (p.smoothing / 100) * 0.4;
      return { sx: 1 + (p.scale / 100) * k, sy: 1 + (p.scale / 100) * k, ty: -p.move * k, rot: p.rotation * k };
    },
  },

  /* ------------------------------ النصوص ------------------------------ */
  typewriter: {
    id: 'typewriter', cat: 'text', dom: 'both', textOnly: true,
    name: { ar: 'آلة كاتبة', en: 'Typewriter' },
    desc: { ar: 'يكشف النص حرفًا حرفًا — يُطبَّق على الطبقات النصية.', en: 'Reveals text character by character.' },
    params: [N('speed', { ar: 'السرعة (حرف/ثانية)', en: 'Speed (chars/s)' }, 18, 0.5, 120), N('start', { ar: 'تأخير (fr)', en: 'Delay (frames)' }, 0, 0, 600, '', 1), B('cursor', { ar: 'مؤشر وامض', en: 'Blinking cursor' }, true), N('cursorWidth', { ar: 'سماكة المؤشر', en: 'Cursor width' }, 6, 1, 60, 'px')],
    textTransform: (text, p, info) => {
      const local = (info.frame - info.layer.inPoint) - p.start;
      const chars = Math.max(0, Math.floor((local / (info.fps || 30)) * p.speed));
      const shown = text.slice(0, chars);
      const blink = p.cursor && Math.floor((info.frame || 0) / 8) % 2 === 0 && chars < text.length;
      return { text: blink ? `${shown}|` : shown, hidden: chars <= 0 };
    },
  },
  textTracking: {
    id: 'textTracking', cat: 'text', dom: 'both', textOnly: true,
    name: { ar: 'حركة الأحرف', en: 'Text Reveal' },
    desc: { ar: 'يدخل النص حرفًا حرفًا من الأسفل أو الجانب.', en: 'Animates characters in one by one.' },
    params: [N('duration', { ar: 'المدة (fr)', en: 'Duration (frames)' }, 24, 1, 600, '', 1), N('overlap', { ar: 'تراكب', en: 'Overlap' }, 60, 0, 100, '%'), N('offset', { ar: 'الإزاحة', en: 'Offset' }, 60, -300, 300, 'px'), N('angle', { ar: 'زاوية الدخول', en: 'Direction' }, 90, -360, 360, '°')],
    textChars: (p, info) => {
      const local = info.frame - info.layer.inPoint;
      const dur = Math.max(1, p.duration);
      return (i, total) => {
        const stagger = dur / Math.max(1, total) * (p.overlap / 100);
        const start = i * stagger;
        const t = clamp((local - start) / Math.max(1, dur - (total - 1) * stagger), 0, 1);
        const e = 1 - (1 - t) ** 3;
        const a = rad(p.angle);
        return { opacity: clamp(t * 1.6, 0, 1), tx: Math.cos(a) * p.offset * (1 - e), ty: Math.sin(a) * p.offset * (1 - e), rot: 0 };
      };
    },
  },

  /* ------------------------------ انتقالات إضافية ------------------------------ */
  dipToBlack: {
    id: 'dipToBlack', cat: 'transition', dom: 'both',
    name: { ar: 'تلاشٍ إلى السواد', en: 'Dip to Black' },
    desc: { ar: 'هبوط سلس إلى السواد ثم صعود.', en: 'Fades smoothly to black.' },
    params: [N('duration', { ar: 'المدة (fr)', en: 'Duration (frames)' }, 16, 2, 120, '', 1), S('mode', { ar: 'الوضع', en: 'Mode' }, 'both', [['both', 'دخول وخروج'], ['in', 'دخول فقط'], ['out', 'خروج فقط']])],
    draw: (ctx, p, w, h, info) => {
      const inPt = info.layer.inPoint;
      const outPt = info.layer.outPoint;
      const f = info.frame;
      const dur = Math.max(1, p.duration);
      let alpha = 0;
      if (p.mode === 'in' || p.mode === 'both') {
        if (f < inPt + dur) alpha = Math.max(alpha, 1 - (f - inPt) / dur);
      }
      if (p.mode === 'out' || p.mode === 'both') {
        if (f > outPt - dur) alpha = Math.max(alpha, (f - (outPt - dur)) / dur);
      }
      if (alpha > 0.001) {
        ctx.fillStyle = `rgba(0, 0, 0, ${clamp(alpha, 0, 1)})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
  },
  dipToWhite: {
    id: 'dipToWhite', cat: 'transition', dom: 'both',
    name: { ar: 'وميض أبيض', en: 'Dip to White / Flash' },
    desc: { ar: 'وميض أبيض ناصع للانتقال بين المشاهد.', en: 'Bright white flash transition.' },
    params: [N('duration', { ar: 'المدة (fr)', en: 'Duration (frames)' }, 14, 2, 120, '', 1), N('intensity', { ar: 'الشدّة', en: 'Intensity' }, 100, 0, 100, '%')],
    draw: (ctx, p, w, h, info) => {
      const inPt = info.layer.inPoint;
      const outPt = info.layer.outPoint;
      const f = info.frame;
      const dur = Math.max(1, p.duration);
      let alpha = 0;
      if (f < inPt + dur) alpha = Math.max(alpha, 1 - (f - inPt) / dur);
      if (f > outPt - dur) alpha = Math.max(alpha, (f - (outPt - dur)) / dur);
      alpha *= (p.intensity / 100);
      if (alpha > 0.001) {
        ctx.fillStyle = `rgba(255, 255, 255, ${clamp(alpha, 0, 1)})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
  },
  zoomTransition: {
    id: 'zoomTransition', cat: 'transition', dom: 'both',
    name: { ar: 'انتقال التكبير/التصغير', en: 'Zoom Transition' },
    desc: { ar: 'تقريب أو تبعيد حركي سينمائي عند بداية أو نهاية اللقطة.', en: 'Dynamic zoom in or out transition.' },
    params: [S('mode', { ar: 'النوع', en: 'Mode' }, 'in', [['in', 'تقريب للداخل (Zoom In)'], ['out', 'تبعيد للخارج (Zoom Out)']]), N('duration', { ar: 'المدة (fr)', en: 'Duration (frames)' }, 16, 2, 120, '', 1), N('amount', { ar: 'مقدار الحركة', en: 'Amount' }, 60, 10, 200, '%')],
    transform: (p, info) => {
      const inPt = info.layer.inPoint;
      const outPt = info.layer.outPoint;
      const f = info.frame;
      const dur = Math.max(1, p.duration);
      let s = 1;
      if (f < inPt + dur) {
        const t = (f - inPt) / dur;
        const e = 1 - (1 - t) ** 3;
        s = p.mode === 'in' ? 1 + (1 - e) * (p.amount / 100) : 1 - (1 - e) * (p.amount / 200);
      } else if (f > outPt - dur) {
        const t = (f - (outPt - dur)) / dur;
        const e = t ** 3;
        s = p.mode === 'in' ? 1 + e * (p.amount / 100) : 1 - e * (p.amount / 200);
      }
      return { sx: clamp(s, 0.05, 10), sy: clamp(s, 0.05, 10) };
    },
    opacityFactor: (p, info) => {
      const inPt = info.layer.inPoint;
      const f = info.frame;
      const dur = Math.max(1, p.duration);
      if (f < inPt + dur) return clamp((f - inPt) / dur, 0, 1);
      return 1;
    },
  },
  glitchTransition: {
    id: 'glitchTransition', cat: 'transition', dom: 'both',
    name: { ar: 'انتقال تشويش رقمي', en: 'Glitch Transition' },
    desc: { ar: 'تشويش تقني وانشطار لوني عند الانتقال.', en: 'Cyber digital glitch transition.' },
    params: [N('duration', { ar: 'المدة (fr)', en: 'Duration (frames)' }, 12, 2, 60, '', 1), N('intensity', { ar: 'الشدّة', en: 'Intensity' }, 80, 0, 100, '%')],
    draw: (ctx, p, w, h, info) => {
      const inPt = info.layer.inPoint;
      const f = info.frame;
      const dur = Math.max(1, p.duration);
      if (f >= inPt && f < inPt + dur) {
        const t = 1 - (f - inPt) / dur;
        const power = t * (p.intensity / 100);
        if (power > 0.05) {
          ctx.save();
          const slices = 6;
          for (let s = 0; s < slices; s += 1) {
            const sy = (s / slices) * h;
            const sh = h / slices;
            const shift = (Math.sin(s * 8.3 + f) * 28) * power;
            ctx.fillStyle = s % 2 === 0 ? `rgba(0, 240, 255, ${power * 0.25})` : `rgba(255, 0, 80, ${power * 0.25})`;
            ctx.fillRect(shift, sy, w, sh);
          }
          ctx.restore();
        }
      }
    },
  },
  irisWipe: {
    id: 'irisWipe', cat: 'transition', dom: 'both',
    name: { ar: 'مسح القزحية (Iris)', en: 'Iris Circle Wipe' },
    desc: { ar: 'دائرة تتسع أو تضيق للكشف عن المشهد.', en: 'Circular iris wipe transition.' },
    params: [N('progress', { ar: 'التقدّم', en: 'Progress' }, 100, 0, 100, '%'), S('shape', { ar: 'الشكل', en: 'Shape' }, 'circle', [['circle', 'دائرة'], ['box', 'مستطيل']])],
    clip: (p, w, h) => ({
      path: (ctx) => {
        const pr = p.progress / 100;
        const cx = w / 2, cy = h / 2;
        const maxR = Math.hypot(w, h) / 2;
        ctx.beginPath();
        if (p.shape === 'circle') {
          ctx.arc(cx, cy, maxR * pr, 0, Math.PI * 2);
        } else {
          const bw = w * pr, bh = h * pr;
          ctx.rect(cx - bw / 2, cy - bh / 2, bw, bh);
        }
        ctx.closePath();
      },
    }),
  },
  /* ------------------------------ التلوين السينمائي ------------------------------ */
  colorGradeTealOrange: {
    id: 'colorGradeTealOrange', cat: 'color', dom: 'both',
    name: { ar: 'تلوين سينمائي (Teal & Orange)', en: 'Teal & Orange Grade' },
    desc: { ar: 'نمط هوليوود البصري: ظلال زرقاء/سماوية وإضاءات برتقالية دافئة.', en: 'Hollywood blockbuster look: teal shadows and warm orange skin highlights.' },
    params: [N('intensity', { ar: 'قوة التأثير', en: 'Intensity' }, 80, 0, 100, '%'), N('contrast', { ar: 'التباين', en: 'Contrast' }, 20, -50, 100, '%')],
    pixel: (img, p) => {
      const factor = p.intensity / 100;
      const cFactor = 1 + (p.contrast / 100);
      eachPixel(img, (d, i) => {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        r = ((r - 128) * cFactor) + 128;
        g = ((g - 128) * cFactor) + 128;
        b = ((b - 128) * cFactor) + 128;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 128) {
          const shadowT = (128 - lum) / 128;
          b += shadowT * 45 * factor;
          g += shadowT * 18 * factor;
          r -= shadowT * 25 * factor;
        } else {
          const highT = (lum - 128) / 128;
          r += highT * 40 * factor;
          g += highT * 15 * factor;
          b -= highT * 35 * factor;
        }
        d[i] = clamp255(r);
        d[i + 1] = clamp255(g);
        d[i + 2] = clamp255(b);
      });
    },
  },
  colorGradeVintage: {
    id: 'colorGradeVintage', cat: 'color', dom: 'both',
    name: { ar: 'فيلم كلاسيكي 35 مم', en: 'Vintage 35mm Film' },
    desc: { ar: 'ألوان دافئة مبهوتة مع تدرج درامي للأسود.', en: 'Vintage warm tones with faded blacks.' },
    params: [N('warmth', { ar: 'الدفء', en: 'Warmth' }, 40, 0, 100, '%'), N('fade', { ar: 'بهتان الأسود', en: 'Black fade' }, 30, 0, 100, '%')],
    pixel: (img, p) => {
      const w = p.warmth / 100;
      const f = p.fade / 100;
      eachPixel(img, (d, i) => {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        r = r + w * 28;
        b = b - w * 22;
        r = r * (1 - f * 0.25) + f * 35;
        g = g * (1 - f * 0.25) + f * 30;
        b = b * (1 - f * 0.2) + f * 40;
        d[i] = clamp255(r);
        d[i + 1] = clamp255(g);
        d[i + 2] = clamp255(b);
      });
    },
  },
  colorGradeCyberpunk: {
    id: 'colorGradeCyberpunk', cat: 'color', dom: 'both',
    name: { ar: 'سايبربانك نيون', en: 'Cyberpunk Neon' },
    desc: { ar: 'تدرجات بنفسجية مشعة مع أزرق كهربائي مستقبلي.', en: 'Futuristic glowing magenta and electric cyan.' },
    params: [N('intensity', { ar: 'الشدّة', en: 'Intensity' }, 75, 0, 100, '%')],
    pixel: (img, p) => {
      const f = p.intensity / 100;
      eachPixel(img, (d, i) => {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum > 110) {
          r += f * 50;
          b += f * 55;
          g -= f * 20;
        } else {
          b += f * 45;
          g += f * 20;
          r -= f * 30;
        }
        d[i] = clamp255(r);
        d[i + 1] = clamp255(g);
        d[i + 2] = clamp255(b);
      });
    },
  },
  colorGradeNoir: {
    id: 'colorGradeNoir', cat: 'color', dom: 'both',
    name: { ar: 'سينما نوار (Black & White Noir)', en: 'Cinema Noir' },
    desc: { ar: 'أبيض وأسود درامي عالي التباين بطابع الأفلام البوليسية.', en: 'Dramatic high-contrast monochrome cinema.' },
    params: [N('contrast', { ar: 'التباين', en: 'Contrast' }, 50, 0, 100, '%')],
    pixel: (img, p) => {
      const c = 1 + (p.contrast / 100);
      eachPixel(img, (d, i) => {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const val = clamp255(((lum - 128) * c) + 128);
        d[i] = val;
        d[i + 1] = val;
        d[i + 2] = val;
      });
    },
  },
};

/* ------------------------------ مساعدات ------------------------------ */
function displacePixels(img, offsetFn) {
  const { data, width, height } = img;
  const src = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [dx, dy] = offsetFn(x, y);
      const sx = clamp(Math.round(x - dx), 0, width - 1);
      const sy = clamp(Math.round(y - dy), 0, height - 1);
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      data[di] = src[si]; data[di + 1] = src[si + 1]; data[di + 2] = src[si + 2]; data[di + 3] = src[si + 3];
    }
  }
}

export function smoothNoise(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hashNoise(x0, y0, seed);
  const n10 = hashNoise(x0 + 1, y0, seed);
  const n01 = hashNoise(x0, y0 + 1, seed);
  const n11 = hashNoise(x0 + 1, y0 + 1, seed);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

function noiseDataURL(size = 96, seed = 0, contrast = 100, invert = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const cx = c.getContext('2d');
  const img = cx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = smoothNoise(x * 0.08, y * 0.08, seed);
      v = clamp((v - 0.5) * (contrast / 100) + 0.5, 0, 1);
      if (invert) v = 1 - v;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * v;
      img.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function wipePolygon(dir, progress, w, h) {
  const len = Math.abs(dir.x) * w + Math.abs(dir.y) * h;
  const cut = len * progress;
  const pts = [[0, 0], [w, 0], [w, h], [0, h]];
  const proj = (p) => p[0] * dir.x + p[1] * dir.y;
  const keep = pts.filter((p) => proj(p) <= cut);
  const out = [...keep];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const pa = proj(a), pb = proj(b);
    if ((pa <= cut && pb > cut) || (pa > cut && pb <= cut)) {
      const t = (cut - pa) / (pb - pa);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  if (out.length < 3) {
    const cx = w / 2, cy = h / 2;
    return [[cx, cy], [cx + 0.01, cy]];
  }
  // ترتيب زاوي
  const cx = out.reduce((s, p) => s + p[0], 0) / out.length;
  const cy = out.reduce((s, p) => s + p[1], 0) / out.length;
  return out.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
}

function wipedInsets(angle, progress, feather) {
  const a = ((angle % 360) + 360) % 360;
  const p = progress / 100;
  const f = feather;
  if (a === 0) return `${f}% ${Math.max(0, 100 - p * 100)}% ${f}% 0%`;
  if (a === 180) return `${f}% 0% ${f}% ${Math.max(0, 100 - p * 100)}%`;
  if (a === 90) return `${Math.max(0, 100 - p * 100)}% ${f}% 0% ${f}%`;
  if (a === 270) return `0% ${f}% ${Math.max(0, 100 - p * 100)}% ${f}%`;
  // زاوية عامة → نستخدم مسح تفاعلي عبر مدرّج قناع
  return `${Math.max(0, (100 - p * 100))}% 0% 0% 0%`;
}

export function getEffectDef(type) { return EFFECTS[type] || null; }

export function effectsByCategory() {
  const out = new Map();
  for (const cat of EFFECT_CATEGORIES) out.set(cat.key, []);
  for (const fx of Object.values(EFFECTS)) {
    if (!out.has(fx.cat)) out.set(fx.cat, []);
    out.get(fx.cat).push(fx);
  }
  return out;
}
