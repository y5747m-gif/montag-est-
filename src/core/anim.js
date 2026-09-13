/**
 * محرّك التحريك — قيم الخصائص، المفاتيح (Keyframes)، والمنحنيات (Bezier / Ease)
 */
import { clamp, lerp, mixColor } from './util.js';

export const EASE_PRESETS = {
  linear: { i: 'linear', eo: { x: 1 / 3, y: 1 / 3 }, ei: { x: 2 / 3, y: 2 / 3 } },
  ease: { i: 'bezier', eo: { x: 0.42, y: 0 }, ei: { x: 0.58, y: 1 } },
  easeIn: { i: 'bezier', eo: { x: 0.42, y: 0 }, ei: { x: 1, y: 1 } },
  easeOut: { i: 'bezier', eo: { x: 0, y: 0 }, ei: { x: 0.58, y: 1 } },
  hold: { i: 'hold', eo: { x: 1 / 3, y: 1 / 3 }, ei: { x: 2 / 3, y: 2 / 3 } },
  bounceOut: { i: 'bounce', eo: { x: 1 / 3, y: 1 / 3 }, ei: { x: 2 / 3, y: 2 / 3 } },
  elasticOut: { i: 'elastic', eo: { x: 1 / 3, y: 1 / 3 }, ei: { x: 2 / 3, y: 2 / 3 } },
  backOut: { i: 'back', eo: { x: 0.2, y: 0.9 }, ei: { x: 0.3, y: 1.2 } },
};

/* --------------------------- حل منحنى بيزييه --------------------------- */
function cubicBezier(x1, y1, x2, y2, t) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (u) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u) => ((ay * u + by) * u + cy) * u;
  const sampleDX = (u) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 8; i += 1) {
    const x = sampleX(u) - t;
    if (Math.abs(x) < 1e-5) break;
    const d = sampleDX(u);
    if (Math.abs(d) < 1e-6) break;
    u -= x / d;
  }
  return sampleY(clamp(u, 0, 1));
}

export function easeProgress(p, keyFrom, keyTo) {
  const kind = keyFrom.i || 'linear';
  if (kind === 'hold') return 0;
  if (kind === 'linear') return p;
  if (kind === 'bezier') {
    const eo = keyFrom.eo || { x: 1 / 3, y: 1 / 3 };
    const ei = keyTo.ei || { x: 2 / 3, y: 2 / 3 };
    return cubicBezier(eo.x, eo.y, ei.x, ei.y, p);
  }
  if (kind === 'bounce') {
    const n1 = 7.5625, d1 = 2.75;
    let x = p;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
    if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
    x -= 2.625 / d1;
    return n1 * x * x + 0.984375;
  }
  if (kind === 'elastic') {
    if (p === 0 || p === 1) return p;
    const c4 = (2 * Math.PI) / 3;
    return 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
  }
  if (kind === 'back') {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
  }
  return p;
}

/* --------------------------- قيم الخصائص --------------------------- */
export function propIsAnimated(prop) {
  return !!(prop && prop.keys && prop.keys.length > 0);
}

export function keyIndexAt(prop, frame) {
  if (!prop?.keys?.length) return -1;
  return prop.keys.findIndex((k) => k.t === frame);
}

export function nearestKeyIndex(prop, frame, dir = 0) {
  if (!prop?.keys?.length) return -1;
  if (dir < 0) {
    for (let i = prop.keys.length - 1; i >= 0; i -= 1) if (prop.keys[i].t < frame) return i;
    return 0;
  }
  if (dir > 0) {
    for (let i = 0; i < prop.keys.length; i += 1) if (prop.keys[i].t > frame) return i;
    return prop.keys.length - 1;
  }
  let best = 0, bestD = Infinity;
  prop.keys.forEach((k, i) => {
    const d = Math.abs(k.t - frame);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

export function keyRange(prop) {
  if (!prop?.keys?.length) return null;
  return { start: prop.keys[0].t, end: prop.keys[prop.keys.length - 1].t };
}

function lerpValue(type, a, b, p) {
  switch (type) {
    case 'number': return lerp(a, b, p);
    case 'vec2': return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
    case 'vec3': return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: lerp(a.z ?? 0, b.z ?? 0, p) };
    case 'color': return mixColor(a, b, p);
    default: return p < 1 ? a : b;
  }
}

/** القيمة الأساسية (بدون تعبيرات) */
export function propBaseValueAt(prop, frame) {
  if (!prop) return 0;
  const keys = prop.keys;
  if (!keys || !keys.length) return prop.value;
  if (keys.length === 1) return keys[0].v;
  if (frame <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (frame >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k0 = keys[i], k1 = keys[i + 1];
    if (frame >= k0.t && frame <= k1.t) {
      const span = k1.t - k0.t;
      if (span <= 0) return k1.v;
      const raw = (frame - k0.t) / span;
      const p = easeProgress(raw, k0, k1);
      return lerpValue(prop.type, k0.v, k1.v, p);
    }
  }
  return last.v;
}

/* --------------------------- التعبيرات --------------------------- */
const exprCache = new Map();

function buildExpr(expr) {
  if (exprCache.has(expr)) return exprCache.get(expr);
  let fn = null;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(
      'value', 'time', 'frame', 'fps', 'duration', 'thisComp', 'thisLayer', 'layer', 'comp',
      'wiggle', 'random', 'noise', 'linear', 'ease', 'loopOut', 'loopIn', 'clamp', 'Math', 'wiggleF',
      `"use strict"; return (${expr});`,
    );
  } catch (e) {
    fn = () => { throw new Error('تعبير غير صالح: ' + e.message); };
  }
  exprCache.set(expr, fn);
  return fn;
}

function mulberry(seed) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function evalExpression(expr, ctx) {
  const { value, frame, fps, comp = {}, layerIndex = 0 } = ctx;
  const time = frame / fps;
  const rnd = mulberry(Math.floor(frame) * 2654435761 + layerIndex * 97);
  const helpers = {
    random: (a = 0, b = 1) => a + rnd() * (b - a),
    noise: (t = time) => {
      const i = Math.floor(t), f = t - i;
      const r = mulberry(i * 374761393 + layerIndex * 668265263);
      const r2 = mulberry((i + 1) * 374761393 + layerIndex * 668265263);
      const a = r(), b = r2();
      const s = f * f * (3 - 2 * f);
      return a + (b - a) * s;
    },
    wiggle: (freq = 1, amp = 5) => helpers.noise(time * freq) * 2 * amp - amp,
    linear: (t, tMin, tMax, vMin, vMax) => {
      if (tMax === tMin) return vMin;
      const p = clamp((t - tMin) / (tMax - tMin), 0, 1);
      return vMin + (vMax - vMin) * p;
    },
    ease: (t, tMin, tMax, vMin, vMax) => {
      if (tMax === tMin) return vMin;
      const p = clamp((t - tMin) / (tMax - tMin), 0, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      return vMin + (vMax - vMin) * e;
    },
    loopOut: () => value,
    loopIn: () => value,
    clamp: (v, a, b) => clamp(v, a, b),
    Math,
  };
  helpers.wiggleF = helpers.wiggle;
  const thisComp = {
    width: comp.width ?? 1920,
    height: comp.height ?? 1080,
    duration: (comp.duration ?? 300) / fps,
    frameDuration: 1 / fps,
    numLayers: (comp.layers || []).length,
    layer: () => null,
    marker: { nearestKey: () => ({ time: 0, duration: 0 }) },
  };
  const thisLayer = { index: layerIndex + 1, name: ctx.layerName || '', time, width: comp.width, height: comp.height };
  try {
    const out = buildExpr(expr)(
      value, time, frame, fps, (comp.duration ?? 300) / fps, thisComp, thisLayer, () => null, comp,
      helpers.wiggle, helpers.random, helpers.noise, helpers.linear, helpers.ease,
      helpers.loopOut, helpers.loopIn, helpers.clamp, Math, helpers.wiggleF,
    );
    if (out && typeof out === 'object' && 'x' in out) return { x: Number(out.x) || 0, y: Number(out.y) || 0, z: Number(out.z) || 0 };
    if (typeof out === 'number') return out;
    if (typeof out === 'string') return out;
    return value;
  } catch (e) {
    return value;
  }
}

/** القيمة النهائية للخاصية عند إطار معيّن (مع دعم التعبيرات) */
export function propValueAt(prop, frame, ctx = {}) {
  const base = propBaseValueAt(prop, frame);
  if (prop?.expr) {
    return evalExpression(prop.expr, { ...ctx, value: base, frame, fps: ctx.fps || 30 });
  }
  return base;
}

/* --------------------------- تعديل المفاتيح --------------------------- */
export function sortKeys(prop) {
  prop.keys.sort((a, b) => a.t - b.t);
}

export function setKeyframe(prop, frame, value, ease = 'ease') {
  frame = Math.round(frame);
  if (!prop.keys) prop.keys = [];
  const existing = prop.keys.find((k) => k.t === frame);
  const preset = EASE_PRESETS[ease] || EASE_PRESETS.ease;
  if (existing) { existing.v = value; }
  else {
    prop.keys.push({ t: frame, v: value, i: ease === 'linear' ? 'linear' : preset.i, eo: { ...preset.eo }, ei: { ...preset.ei } });
  }
  sortKeys(prop);
  return prop;
}

export function removeKeyframe(prop, frame) {
  if (!prop?.keys) return;
  const i = prop.keys.findIndex((k) => k.t === frame);
  if (i >= 0) {
    const wasValue = prop.keys[i].v;
    prop.keys.splice(i, 1);
    if (!prop.keys.length) prop.value = wasValue;
  }
}

export function toggleKeyframe(prop, frame, ease = 'ease') {
  if (keyIndexAt(prop, Math.round(frame)) >= 0) removeKeyframe(prop, frame);
  else setKeyframe(prop, frame, propBaseValueAt(prop, frame), ease);
}

export function setPropValue(prop, frame, value, { animate } = {}) {
  const shouldAnimate = animate ?? propIsAnimated(prop);
  if (shouldAnimate) {
    setKeyframe(prop, frame, value);
  } else {
    prop.value = value;
  }
  return prop;
}

export function offsetKeys(prop, frames) {
  if (!prop?.keys) return;
  prop.keys.forEach((k) => { k.t = Math.max(0, Math.round(k.t + frames)); });
  sortKeys(prop);
}

export function scaleKeys(prop, anchorFrame, factor) {
  if (!prop?.keys) return;
  prop.keys.forEach((k) => { k.t = Math.max(0, Math.round(anchorFrame + (k.t - anchorFrame) * factor)); });
  sortKeys(prop);
}

export function setKeyEase(prop, frame, ease) {
  const k = prop?.keys?.find((x) => x.t === Math.round(frame));
  if (!k) return;
  const preset = EASE_PRESETS[ease] || EASE_PRESETS.ease;
  k.i = ease === 'linear' ? 'linear' : preset.i;
  k.eo = { ...preset.eo };
  k.ei = { ...preset.ei };
}
