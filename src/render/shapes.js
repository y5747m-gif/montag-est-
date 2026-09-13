/**
 * بناء المسارات (Shapes) والنصوص — مشترك بين المعاينة والتصدير
 */
import { rad, clamp } from '../core/util.js';

/** تحويل نوع الشكل إلى كائن مسار Geometry */
export function shapeGeometry(kind, w, h, opts = {}) {
  const { roundness = 0, points = 5, innerRatio = 0.45 } = opts;
  const hw = w / 2, hh = h / 2;
  switch (kind) {
    case 'rect':
      return { kind, w, h, radius: clamp(roundness, 0, Math.min(hw, hh)), x: -hw, y: -hh };
    case 'ellipse':
      return { kind, w, h, x: -hw, y: -hh };
    case 'polygon': {
      const n = Math.max(3, Math.round(points));
      const pts = [];
      for (let i = 0; i < n; i += 1) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * hw, y: Math.sin(a) * hh });
      }
      return { kind, pts };
    }
    case 'star': {
      const n = Math.max(3, Math.round(points));
      const inner = clamp(innerRatio, 0.02, 0.99);
      const pts = [];
      for (let i = 0; i < n * 2; i += 1) {
        const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 ? inner : 1;
        pts.push({ x: Math.cos(a) * hw * r, y: Math.sin(a) * hh * r });
      }
      return { kind, pts };
    }
    case 'line':
      return { kind, line: [{ x: -hw, y: 0 }, { x: hw, y: 0 }] };
    case 'path':
    default:
      return { kind: kind === 'path' ? 'path' : 'rect', w, h, radius: 0, x: -hw, y: -hh };
  }
}

/** يرسم الشكل على Canvas (متمركز حول 0,0) */
export function drawShapeToPath(ctx, geo) {
  ctx.beginPath();
  if (geo.kind === 'rect') {
    if (ctx.roundRect) ctx.roundRect(geo.x, geo.y, geo.w, geo.h, geo.radius);
    else ctx.rect(geo.x, geo.y, geo.w, geo.h);
  } else if (geo.kind === 'ellipse') {
    ctx.ellipse(0, 0, Math.abs(geo.w / 2), Math.abs(geo.h / 2), 0, 0, Math.PI * 2);
  } else if (geo.pts) {
    geo.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  } else if (geo.line) {
    geo.line.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  } else {
    ctx.rect(-10, -10, 20, 20);
  }
  return ctx;
}

/** بناء مسار SVG (للمعاينة عبر clip-path) */
export function maskToClipPath(points, w, h) {
  if (!points || points.length < 3) return 'none';
  const parts = points.map((p, i) => {
    const x = (p.x / w) * 100;
    const y = (p.y / h) * 100;
    return `${i ? 'L' : 'M'}${x.toFixed(3)}% ${y.toFixed(3)}%`;
  });
  return `polygon(${parts.join(', ').replace(/L/g, '').replace(/M/g, '').replace(/^\s+/, '')})`;
}

export function polygonPathString(points, w, h) {
  if (!points || points.length < 3) return '';
  return points.map((p, i) => `${i ? 'L' : 'M'}${((p.x / w) * 100).toFixed(3)}% ${((p.y / h) * 100).toFixed(3)}%`).join(' ') + ' Z';
}

/** تقسيم النص إلى أسطر حسب العرض الأقصى (بالنسبة لعرض التركيب) */
export function layoutText(ctx, text, maxWidth, fontSize) {
  const paragraphs = String(text ?? '').split('\n');
  const lines = [];
  for (const para of paragraphs) {
    if (!maxWidth || maxWidth <= 0) { lines.push(para); continue; }
    const words = para.split(/(\s+)/);
    let cur = '';
    for (const word of words) {
      const test = cur + word;
      if (ctx.measureText(test).width > maxWidth && cur.trim()) {
        lines.push(cur.replace(/\s+$/, ''));
        cur = word.replace(/^\s+/, '');
      } else cur = test;
    }
    lines.push(cur);
  }
  return lines;
}

/** مؤشر لون التدرّج كسلسلة CSS */
export function gradientCss(color1, color2, angle) {
  return `linear-gradient(${angle + 90}deg, ${color1}, ${color2})`;
}

/** مستطيل مستدير عبر CSS */
export function domShapeStyle(geo, style = {}) {
  const out = { ...style };
  if (geo.kind === 'rect') out.borderRadius = `${geo.radius}px`;
  else if (geo.kind === 'ellipse') out.borderRadius = '50%';
  return out;
}

export function rotatePoint(p, angleDeg, ox = 0, oy = 0) {
  const a = rad(angleDeg);
  const dx = p.x - ox, dy = p.y - oy;
  return { x: ox + dx * Math.cos(a) - dy * Math.sin(a), y: oy + dx * Math.sin(a) + dy * Math.cos(a) };
}
