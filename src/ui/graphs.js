/**
 * محرر المنحنيات (Graph Editor) — يعرض منحنيات الخصائص المحدّدة ويسمح بتحرير المفاتيح
 */
import { el, clear, icon } from './dom.js';
import { clamp, framesToTimecode } from '../core/util.js';
import { propValueAt } from '../core/anim.js';
import { showContextMenu } from './menu.js';

const COLORS = ['#4a9dff', '#a86bff', '#38c172', '#ffb02e', '#ef5350', '#34d3d3', '#ff5c8a'];

export class GraphEditor {
  constructor(timeline) {
    this.tl = timeline;
    this.app = timeline.app;
    this.store = timeline.app.store;
    this.state = { drag: null, hover: null };
    this.canvas = timeline.elements.graphCanvas;
    this.toolbar = timeline.elements.graphToolbar;
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', () => this.onUp());
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const hit = this.hitTest(this.toGraph(e));
      if (!hit) return;
      showContextMenu([
        { label: 'خطي', action: () => this.store.setKeyEase(hit.layer.id, hit.path, hit.key.t, 'linear') },
        { label: 'ناعم', action: () => this.store.setKeyEase(hit.layer.id, hit.path, hit.key.t, 'ease') },
        { label: 'ثابت', action: () => this.store.setKeyEase(hit.layer.id, hit.path, hit.key.t, 'hold') },
        { type: 'sep' },
        { label: 'حذف المفتاح', action: () => this.store.removeKeyframeAt(hit.layer.id, hit.path, hit.key.t) },
      ], { x: e.clientX, y: e.clientY });
    });
    this.store.on('props', () => this.render());
    this.store.on('change', () => this.render());
  }

  get comp() { return this.store.comp; }
  get fps() { return this.comp?.fps || 30; }

  /** الخصائص المعروضة: كل خصائص الطبقات المحدّدة المتحركة + ما يُختار من لوحة الخصائص */
  activeCurves() {
    const out = [];
    const comp = this.comp;
    const layers = this.store.selectedLayers();
    const explicit = this.store.selection.props;
    layers.forEach((layer) => {
      const props = this.tl.propertyRows(layer).filter((r) => !r.group && r.path && r.prop);
      props.forEach((r) => {
        const isExplicit = explicit.some((p) => p === `${layer.id}::${r.path}`);
        if (r.prop.keys?.length || isExplicit) {
          out.push({ layer, path: r.path, label: r.label, prop: r.prop });
        }
      });
    });
    return out.slice(0, 12);
  }

  mount() {
    this.toolbar.innerHTML = '';
    const curves = this.activeCurves();
    if (!curves.length) {
      this.toolbar.appendChild(el('span', { text: 'حدّد طبقة بها مفاتيح لعرض المنحنيات — أو أضف مفتاحًا (◆) من لوحة الخصائص.' }));
    } else {
      curves.forEach((c, i) => this.toolbar.appendChild(el('span', {
        class: 'prop-chip',
        style: { borderColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length] },
        text: `${c.layer.name} · ${c.label}`,
      })));
    }
    this.toolbar.appendChild(el('span', { class: 'grow', style: { flex: '1' } }));
    this.toolbar.appendChild(el('button', {
      class: 'tb-btn ghost sm', title: 'ملاءمة', onclick: () => this.fit(),
    }, [icon('i-fit', 13)]));
    this.render();
  }

  fit() { this.render(true); }

  layout() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(rect.width * dpr) || this.canvas.height !== Math.round(rect.height * dpr)) {
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
    }
    return { rect, dpr, w: rect.width, h: rect.height };
  }

  valueRange(curves) {
    let min = Infinity, max = -Infinity;
    curves.forEach(({ layer, prop }) => {
      if (prop.type === 'vec2') {
        prop.keys?.forEach((k) => { min = Math.min(min, k.v.x, k.v.y); max = Math.max(max, k.v.x, k.v.y); });
        const v = propValueAt(prop, this.store.playhead);
        if (v) { min = Math.min(min, v.x, v.y); max = Math.max(max, v.x, v.y); }
      } else if (prop.type === 'number') {
        prop.keys?.forEach((k) => { min = Math.min(min, k.v); max = Math.max(max, k.v); });
        const v = propValueAt(prop, this.store.playhead);
        if (typeof v === 'number') { min = Math.min(min, v); max = Math.max(max, v); }
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = -100; max = 100; }
    if (max - min < 1e-3) { min -= 50; max += 50; }
    const pad = (max - min) * 0.15;
    return { min: min - pad, max: max + pad };
  }

  mapping() {
    const { w, h } = this.canvas.getBoundingClientRect();
    const comp = this.comp;
    const z = Math.max(1, (w - 40) / Math.max(1, comp.duration));
    return { z, left: 20, w, h, comp };
  }

  render(fit = false) {
    if (!this.store.timeline.graph) return;
    const { dpr, w, h } = this.layout();
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, w, h);
    const curves = this.activeCurves();
    if (!curves.length) return;
    const map = this.mapping();
    const range = this.valueRange(curves);
    const yOf = (v) => h - ((v - range.min) / (range.max - range.min)) * (h - 30) - 15;
    const xOf = (t) => map.z <= 0 ? 0 : (t / this.comp.duration) * (w - 40) + 20;
    this._map = { ...map, range, yOf, xOf };

    // شبكة
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.fillStyle = '#6d737d';
    ctx.font = '10px ui-monospace, monospace';
    const stepv = niceStep((range.max - range.min) / 6);
    for (let v = Math.ceil(range.min / stepv) * stepv; v <= range.max; v += stepv) {
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(w - 10, y); ctx.stroke();
      ctx.fillText(String(Math.round(v)), 2, y + 3);
    }
    const frames = niceStep(this.comp.duration / 10);
    for (let f = 0; f <= this.comp.duration; f += frames) {
      const x = xOf(f);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.fillText(framesToTimecode(f, this.fps).slice(3), x + 2, h - 3);
    }
    // مؤشر الزمن
    const px = xOf(this.store.playhead);
    ctx.strokeStyle = '#ffb02e';
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();

    // المنحنيات
    curves.forEach((c, i) => {
      const color = COLORS[i % COLORS.length];
      const prop = c.prop;
      if (prop.type === 'vec2') {
        ['x', 'y'].forEach((axis, ai) => {
          drawCurve(ctx, prop, axis, ai === 0 ? color : mix(color, '#ffffff', 0.45), xOf, yOf, w);
        });
      } else {
        drawCurve(ctx, prop, null, color, xOf, yOf, w);
      }
      // المفاتيح
      prop.keys?.forEach((k) => {
        const v = prop.type === 'vec2' ? k.v.x : k.v;
        const y = yOf(v);
        const x = xOf(k.t);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y);
        ctx.closePath(); ctx.fill();
      });
    });
  }

  toGraph(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const map = this._map;
    if (!map) return { x, y, frame: 0, value: 0 };
    const frame = clamp(Math.round(((x - 20) / (rect.width - 40)) * this.comp.duration), 0, this.comp.duration);
    const value = map.range.min + ((rect.height - y - 15) / (rect.height - 30)) * (map.range.max - map.range.min);
    return { x, y, frame, value };
  }

  hitTest(p) {
    const curves = this.activeCurves();
    let best = null, bestD = 12;
    curves.forEach((c) => {
      const prop = c.prop;
      prop.keys?.forEach((k) => {
        const v = prop.type === 'vec2' ? k.v.x : k.v;
        const { xOf, yOf } = this._map || {};
        if (!xOf) return;
        const kx = xOf(k.t), ky = yOf(v);
        const d = Math.hypot(kx - p.x, ky - p.y);
        if (d < bestD) { bestD = d; best = { layer: c.layer, path: c.path, key: k, prop }; }
      });
    });
    return best;
  }

  onDown(e) {
    const p = this.toGraph(e);
    const hit = this.hitTest(p);
    if (hit) {
      this.state.drag = { ...hit, startFrame: hit.key.t, startValue: hit.prop.type === 'vec2' ? { ...hit.key.v } : hit.key.v };
      this.app.beginGesture?.('تحرير منحنى');
    }
  }

  onMove(e) {
    const p = this.toGraph(e);
    if (this.state.drag) {
      const { prop, key } = this.state.drag;
      const min = this._map.range.min;
      const span = this._map.range.max - this._map.range.min;
      const delta = ((e.movementY || 0) / (this.canvas.getBoundingClientRect().height - 30)) * span;
      if (prop.type === 'vec2') {
        const v = { ...key.v };
        v.x = Math.round((v.x ?? 0) - delta);
        v.y = Math.round((v.y ?? 0) - delta);
        key.v = v;
      } else if (prop.type === 'number') {
        key.v = Math.round((key.v - delta) * 100) / 100;
      } else if (prop.type === 'color') {
        // تُحفظ كما هي
      }
      key.t = clamp(p.frame, 0, this.comp.duration);
      prop.keys.sort((a, b) => a.t - b.t);
      this.render();
    } else {
      this.state.hover = this.hitTest(p);
      this.canvas.style.cursor = this.state.hover ? 'ns-resize' : 'default';
    }
  }

  onUp() {
    if (this.state.drag) {
      this.store.commit('تحرير المنحنى');
      this.app.endGesture?.();
      this.state.drag = null;
    }
  }
}

function drawCurve(ctx, prop, axis, color, xOf, yOf, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const dur = prop.keys?.length ? prop.keys[prop.keys.length - 1].t : 0;
  let started = false;
  for (let x = 20; x <= w - 10; x += 2) {
    const frame = ((x - 20) / (w - 40)) * Math.max(1, dur || 1);
    const v = propValueAt(prop, frame) ?? 0;
    const val = axis ? v[axis] : v;
    const y = yOf(val);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function niceStep(v) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(1e-6, Math.abs(v))));
  const n = v / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * pow;
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
