/**
 * أدوات مساعدة عامة — Montage Studio
 */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const rad = (deg) => (deg * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const round = (v, p = 2) => {
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
export const nearly = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

let __uid = 0;
export function uid(prefix = 'id') {
  __uid += 1;
  return `${prefix}_${Date.now().toString(36)}${(__uid % 100000).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
export const shortId = (p = 'x') => uid(p);

/** حدث بسيط: نشر/اشتراك */
export class Emitter {
  constructor() {
    this._handlers = new Map();
  }
  on(evt, fn) {
    if (!this._handlers.has(evt)) this._handlers.set(evt, new Set());
    this._handlers.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) {
    this._handlers.get(evt)?.delete(fn);
  }
  emit(evt, ...args) {
    const set = this._handlers.get(evt);
    if (set) for (const fn of [...set]) {
      try { fn(...args); } catch (e) { console.error('[emit]', evt, e); }
    }
    const all = this._handlers.get('*');
    if (all) for (const fn of [...all]) {
      try { fn(evt, ...args); } catch (e) { console.error('[emit*]', evt, e); }
    }
  }
}

export function debounce(fn, ms = 120) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function throttle(fn, ms = 60) {
  let last = 0, timer = null, lastArgs = null;
  return (...args) => {
    const now = performance.now();
    lastArgs = args;
    if (now - last >= ms) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = performance.now();
        fn(...lastArgs);
      }, ms - (now - last));
    }
  };
}

export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k in obj) out[k] = deepClone(obj[k]);
  return out;
};

export function mergeDeep(target, source) {
  for (const k in source) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      target[k] = mergeDeep(target[k] && typeof target[k] === 'object' ? target[k] : {}, source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}

/* ----------------------------- الوقت ----------------------------- */
export function framesToTimecode(frames, fps, { framesOnly = false } = {}) {
  const f = Math.max(0, Math.round(frames));
  const totalSec = Math.floor(f / fps);
  const ff = f - totalSec * fps;
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  if (framesOnly) return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}
export function timecodeToFrames(tc, fps = 30) {
  if (tc == null) return 0;
  const s = String(tc).trim();
  if (/^-?\d+(\.\d+)?\s*s$/i.test(s)) {
    return Math.round(parseFloat(s) * fps);
  }
  if (/^-?\d+\s*f$/i.test(s)) {
    return Math.round(parseFloat(s));
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  const parts = s.split(':').map((x) => parseInt(x, 10) || 0);
  while (parts.length < 4) parts.unshift(0);
  const [hh, mm, ss, ff] = parts;
  return Math.round(((hh * 3600 + mm * 60 + ss) * fps) + ff);
}
export const secToFrames = (sec, fps) => Math.round(sec * fps);
export const framesToSec = (fr, fps) => fr / fps;
export const formatTimecodePlain = (frames, fps) => framesToTimecode(frames, fps);

export function prettyDuration(frames, fps) {
  const sec = frames / fps;
  if (sec < 60) return `${round(sec, 2)}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${round(sec - m * 60, 1)}s`;
}

export function prettyBytes(n) {
  if (!n && n !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

/* ----------------------------- الألوان ----------------------------- */
export function hexToRgb(hex) {
  let h = String(hex || '#000').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h || '0', 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgbToHex({ r, g, b }) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function mixColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex({ r: lerp(A.r, B.r, t), g: lerp(A.g, B.g, t), b: lerp(A.b, B.b, t) });
}
export function rgbaString(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}
export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}
export const randomColor = (hue) => hslToHex(hue ?? Math.random() * 360, 62, 52);

export const LAYER_COLORS = [
  '#4a9dff', '#a86bff', '#38c172', '#ffb02e', '#ef5350',
  '#34d3d3', '#ff5c8a', '#8bc34a', '#ff8a3d', '#9aa4b2',
];

/* ----------------------------- الأرقام ----------------------------- */
export function parseNumber(str, fallback = 0) {
  const v = parseFloat(String(str).replace(/[^\d.+-eE]/g, ''));
  return Number.isFinite(v) ? v : fallback;
}
export function fmtNum(v, p = 1) {
  if (!Number.isFinite(v)) return '0';
  const r = round(v, p);
  return Number.isInteger(r) ? String(r) : r.toFixed(p);
}

/* ----------------------------- المصفوفات ----------------------------- */
export function unique(arr) { return [...new Set(arr)]; }
export function groupBy(arr, keyFn) {
  const out = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}
export function insertAt(arr, idx, item) { arr.splice(clamp(idx, 0, arr.length), 0, item); return arr; }
export function moveItem(arr, from, to) {
  if (from === to || from < 0 || from >= arr.length) return arr;
  const [it] = arr.splice(from, 1);
  arr.splice(clamp(to, 0, arr.length), 0, it);
  return arr;
}
export function sortBy(arr, fn, dir = 1) {
  return [...arr].sort((a, b) => (fn(a) > fn(b) ? dir : fn(a) < fn(b) ? -dir : 0));
}

/** التسلسل الزمني — تنسيق التاريخ بالعربية */
export function formatDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** تنزيل ملف */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** مقارنة عميقة بسيطة */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** إسناد قيم مجموعة نصوص إلى أرقام (keyframes blending helpers) */
export const sum = (arr, fn = (x) => x) => arr.reduce((a, b) => a + fn(b), 0);
export const avg = (arr, fn = (x) => x) => (arr.length ? sum(arr, fn) / arr.length : 0);
