/**
 * العارض (Viewer) — المعاينة، أدوات التحويل، المقابض (Gizmos)، التشغيل
 */
import { el, clear, icon, dragHandler } from './dom.js';
import { clamp, rad } from '../core/util.js';
import { propValueAt } from '../core/anim.js';
import { toast } from './toast.js';
import { showContextMenu } from './menu.js';

const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.66, 1, 1.5, 2, 3, 4, 6, 8];

export class Viewer {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.renderer = app.renderer;
    this.canvas = document.getElementById('viewer-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.overlay = document.getElementById('viewer-overlay');
    this.bodyEl = document.getElementById('viewer-body');
    this.badge = document.getElementById('viewer-badge');
    this.hint = document.getElementById('viewer-hint');
    this.zoom = 1;
    this.fitMode = true;
    this.resolution = 1;
    this.quality = 'full';
    this.panOffset = { x: 0, y: 0 };
    this.playing = false;
    this._raf = null;
    this._lastT = 0;
    this._accum = 0;
    this.playbackRate = 1;
    this.pointerStart = null;
    this.dragging = null;
    this.marquee = null;
    this.maskDraw = null;
    this.addEventListener();
    this.store.on('render', () => this.requestRender());
    this.store.on('time', () => this.requestRender());
    this.store.on('selection', () => { this.requestRender(); this.renderGizmos(); });
    this.store.on('project', () => { this.syncMeta(); this.layout(); this.requestRender(); });
    window.addEventListener('resize', () => this.layout());
    this.syncMeta();
    this.layout(true);
  }

  get comp() { return this.store.comp; }

  /* --------------------------- القياسات --------------------------- */
  syncMeta() {
    const sel = document.getElementById('viewer-zoom');
    if (sel) {
      const opts = ['fit', '0.25', '0.5', '0.66', '1', '1.5', '2', '3', '4'];
      clear(sel);
      opts.forEach((z) => sel.appendChild(el('option', { value: z, text: z === 'fit' ? 'ملاءمة' : `${Math.round(parseFloat(z) * 100)}%` })));
      sel.value = this.fitMode ? 'fit' : String(this.zoom);
    }
    const res = document.getElementById('viewer-res');
    if (res && !res.dataset.filled) {
      [['full', 'كامل'], ['half', 'نصف'], ['quarter', 'ربع'], ['auto', 'تلقائي']].forEach(([v, t]) => res.appendChild(el('option', { value: v, text: t })));
      res.dataset.filled = '1';
      res.value = 'auto';
    }
    this.updateBadge();
  }

  layout(initial = false) {
    const comp = this.comp;
    if (!comp) return;
    const bodyRect = this.bodyEl.getBoundingClientRect();
    const pad = 24;
    const availW = Math.max(60, bodyRect.width - pad);
    const availH = Math.max(60, bodyRect.height - pad);
    if (this.fitMode) {
      this.zoom = clamp(Math.min(availW / comp.width, availH / comp.height), 0.02, 4);
    }
    const dispW = Math.max(16, Math.round(comp.width * this.zoom));
    const dispH = Math.max(16, Math.round(comp.height * this.zoom));
    // دقة الرسم حسب الوضع
    let res = 1;
    const mode = document.getElementById('viewer-res')?.value || 'auto';
    if (mode === 'full') res = 1;
    else if (mode === 'half') res = 0.5;
    else if (mode === 'quarter') res = 0.25;
    else res = this.playing ? (dispW > 1400 ? 0.5 : 0.75) : (dispW > 1600 ? 0.75 : 1);
    if (this.quality === 'draft') res = Math.min(res, 0.5);
    this.resolution = res;

    this.canvas.width = Math.max(2, Math.round(comp.width * res));
    this.canvas.height = Math.max(2, Math.round(comp.height * res));
    this.canvas.style.width = `${dispW}px`;
    this.canvas.style.height = `${dispH}px`;
    this.canvas.style.margin = '0';
    if (initial) this.updateBadge();
    this.requestRender();
    this.renderGizmos();
  }

  updateBadge() {
    const comp = this.comp;
    if (!comp || !this.badge) return;
    this.badge.innerHTML = '';
    const scalePct = Math.round(this.zoom * 100);
    const resPct = Math.round(this.resolution * 100);
    [['', comp.name], ['b', `${comp.width}×${comp.height}`], ['b', `${Math.round(comp.fps)}fps`], ['b', `${scalePct}% عرض`], ['b', `${resPct}% دقة`]]
      .forEach(([cls, text]) => this.badge.appendChild(el(cls ? 'b' : 'span', { text })));
    if (this.hint) {
      this.hint.textContent = this.store.playing ? 'التشغيل… (مسافة للإيقاف)' : 'عجلة الفأرة للتكبير • مسافة للتشغيل • زر أوسط للتحريك';
    }
  }

  /* --------------------------- الرسم --------------------------- */
  requestRender() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this.draw();
    });
  }

  draw() {
    const comp = this.comp;
    if (!comp) return;
    const cw = this.canvas.width, ch = this.canvas.height;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, cw, ch);
    try {
      this.renderer.renderComp(this.ctx, comp, this.store.playhead, {
        width: cw,
        height: ch,
        transparent: true,
        skipPixels: false,
        depth: 0,
      });
    } catch (e) {
      console.error('فشل رسم الإطار', e);
      this.app.setStatus('خطأ في الرسم');
    }
    this.updateBadge();
  }

  /* --------------------------- أدوات التحويل --------------------------- */
  compPointFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.comp.width,
      y: ((e.clientY - rect.top) / rect.height) * this.comp.height,
      inView: e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom,
    };
  }

  contentSize(layer) {
    const comp = this.comp;
    const frame = this.store.playhead;
    const ctxInfo = { fps: comp.fps, comp, frame, layer };
    switch (layer.type) {
      case 'solid': {
        const w = propValueAt(layer.props.width, frame, ctxInfo) || comp.width;
        const h = propValueAt(layer.props.height, frame, ctxInfo) || comp.height;
        return { w, h };
      }
      case 'shape': {
        const s = propValueAt(layer.props.size, frame, ctxInfo) || { x: 100, y: 100 };
        const sw = propValueAt(layer.props.strokeWidth, frame, ctxInfo) || 0;
        return { w: s.x + sw, h: s.y + sw };
      }
      case 'text': {
        const size = propValueAt(layer.props.fontSize, frame, ctxInfo) || 72;
        const text = String(propValueAt(layer.props.text, frame, ctxInfo) ?? '');
        const c = document.createElement('canvas').getContext('2d');
        c.font = `${layer.props.fontWeight?.value || '700'} ${size}px "${layer.props.fontFamily?.value || 'Cairo'}", sans-serif`;
        const lines = text.split('\n');
        const w = Math.max(...lines.map((l) => c.measureText(l).width), 10);
        const h = lines.length * size * 1.22 + (propValueAt(layer.props.leading, frame, ctxInfo) || 0) * lines.length;
        return { w, h };
      }
      case 'precomp': {
        const sub = this.store.project.comps.find((x) => x.id === layer.props.compId?.value);
        return sub ? { w: sub.width, h: sub.height } : { w: comp.width, h: comp.height };
      }
      case 'image':
      case 'video': {
        const m = this.app.media.get(layer.props.assetId?.value);
        if (m) return { w: m.width || comp.width, h: m.height || comp.height };
        return { w: comp.width, h: comp.height };
      }
      case 'light': {
        const r = propValueAt(layer.props.radius, frame, ctxInfo) || 400;
        return { w: r * 2, h: r * 2 };
      }
      default:
        return { w: comp.width * 0.5, h: comp.height * 0.5 };
    }
  }

  transformedCorners(layer) {
    const t = layer.transform;
    const frame = this.store.playhead;
    const ctxInfo = { fps: this.comp.fps, comp: this.comp, frame, layer };
    const pos = propValueAt(t.position, frame, ctxInfo) || { x: 0, y: 0 };
    const anchor = propValueAt(t.anchor, frame, ctxInfo) || { x: 0, y: 0 };
    const scale = propValueAt(t.scale, frame, ctxInfo) || { x: 100, y: 100 };
    const rot = rad(propValueAt(t.rotation, frame, ctxInfo) || 0);
    // ترتيب التحويل: الموضع → الدوران → المقياس → الارتكاز
    const size = this.contentSize(layer);
    const pts = [
      { x: -size.w / 2, y: -size.h / 2 }, { x: size.w / 2, y: -size.h / 2 },
      { x: size.w / 2, y: size.h / 2 }, { x: -size.w / 2, y: size.h / 2 },
    ];
    const out = pts.map((p) => {
      let x = (p.x - anchor.x) * (scale.x / 100);
      let y = (p.y - anchor.y) * (scale.y / 100);
      const rx = x * Math.cos(rot) - y * Math.sin(rot);
      const ry = x * Math.sin(rot) + y * Math.cos(rot);
      return { x: rx + pos.x, y: ry + pos.y };
    });
    return { corners: out, size, pos, anchor, scale, rot: propValueAt(t.rotation, frame, ctxInfo) || 0 };
  }

  toScreen(p) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (p.x / this.comp.width) * rect.width,
      y: rect.top + (p.y / this.comp.height) * rect.height,
      scale: rect.width / this.comp.width,
    };
  }

  renderGizmos() {
    const overlay = this.overlay;
    clear(overlay);
    const comp = this.comp;
    if (!comp) return;
    const rect = this.canvas.getBoundingClientRect();
    const bodyRect = this.bodyEl.getBoundingClientRect();
    const offsetX = rect.left - bodyRect.left;
    const offsetY = rect.top - bodyRect.top;
    // إرشادات الأمان والشبكة
    if (this.store.viewer.showGuides) {
      const safe = el('div', {
        class: 'safe-area action',
        style: {
          left: `${offsetX + rect.width * 0.05}px`, top: `${offsetY + rect.height * 0.05}px`,
          width: `${rect.width * 0.9}px`, height: `${rect.height * 0.9}px`,
        },
      });
      const title = el('div', {
        class: 'safe-area title',
        style: {
          left: `${offsetX + rect.width * 0.1}px`, top: `${offsetY + rect.height * 0.1}px`,
          width: `${rect.width * 0.8}px`, height: `${rect.height * 0.8}px`,
        },
      });
      const cv = el('div', { class: 'safe-area center-v', style: { left: `${offsetX + rect.width / 2}px`, top: `${offsetY}px`, height: `${rect.height}px` } });
      const ch = el('div', { class: 'safe-area center-h', style: { left: `${offsetX}px`, top: `${offsetY + rect.height / 2}px`, width: `${rect.width}px` } });
      overlay.append(safe, title, cv, ch);
    }
    if (!this.store.viewer.gizmos) return;
    const layers = this.store.selectedLayers();
    if (!layers.length) return;
    if (layers.length === 1 && !this.store.playing) {
      const layer = layers[0];
      const info = this.transformedCorners(layer);
      const cx = offsetX + (info.pos.x / comp.width) * rect.width;
      const cy = offsetY + (info.pos.y / comp.height) * rect.height;
      const sx = (rect.width / comp.width) * (info.scale.x / 100);
      const sy = (rect.height / comp.height) * (info.scale.y / 100);
      const frameEl = el('div', {
        class: 'gizmo-frame',
        style: {
          left: '0px', top: '0px',
          width: `${info.size.w}px`, height: `${info.size.h}px`,
          transformOrigin: '0 0',
          transform: `translate(${cx}px, ${cy}px) rotate(${info.rot}deg) scale(${sx}, ${sy}) translate(${-info.size.w / 2 - info.anchor.x}px, ${-info.size.h / 2 - info.anchor.y}px)`,
        },
      });
      const handles = [
        ['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0],
        ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1],
        ['sw', 0, 1], ['w', 0, 0.5],
      ];
      handles.forEach(([name, hx, hy]) => {
        const h = el('div', {
          class: 'gizmo-handle',
          style: { left: `${hx * 100}%`, top: `${hy * 100}%`, cursor: cursorForHandle(name, info.rot) },
        });
        h.addEventListener('pointerdown', dragHandler(h, {
          cursor: cursorForHandle(name, info.rot),
          onStart: () => this.app.beginGesture?.(`تحجيم: ${layer.name}`),
          onMove: (e, { dx, dy }) => {
            const cur = propValueAt(layer.transform.scale, this.store.playhead) || { x: 100, y: 100 };
            const dispW = Math.max(4, info.size.w * Math.abs(sx));
            const dispH = Math.max(4, info.size.h * Math.abs(sy));
            const next = {
              x: hx === 0.5 ? cur.x : clamp(cur.x * (1 + ((hx === 0 ? -1 : 1) * dx) / dispW), -5000, 6000),
              y: hy === 0.5 ? cur.y : clamp(cur.y * (1 + ((hy === 0 ? -1 : 1) * dy) / dispH), -5000, 6000),
            };
            this.app.store.setProp(layer.id, 'transform.scale', next, { coalesce: 'gizmo-scale' });
            this.renderGizmos();
          },
          onEnd: () => this.app.endGesture?.(),
        }));
        frameEl.appendChild(h);
      });
      // مقبض الدوران
      const rotH = el('div', { class: 'gizmo-handle rot', style: { left: '50%', top: '-26px', cursor: 'grab' } });
      rotH.addEventListener('pointerdown', dragHandler(rotH, {
        cursor: 'grabbing',
        onStart: () => this.app.beginGesture?.(`تدوير: ${layer.name}`),
        onMove: (e) => {
          const p = this.compPointFromEvent(e);
          const angle = Math.atan2(p.y - info.pos.y, p.x - info.pos.x) * 180 / Math.PI + 90;
          this.app.store.setProp(layer.id, 'transform.rotation', Math.round(angle), { coalesce: 'gizmo-rot' });
          this.renderGizmos();
        },
        onEnd: () => this.app.endGesture?.(),
      }));
      frameEl.appendChild(rotH);
      // نقطة الارتكاز
      const anchorEl2 = el('div', {
        class: 'gizmo-handle anchor',
        style: {
          left: `${(info.anchor.x + info.size.w / 2) / info.size.w * 100}%`,
          top: `${(info.anchor.y + info.size.h / 2) / info.size.h * 100}%`,
          cursor: 'move',
        },
      });
      anchorEl2.addEventListener('pointerdown', dragHandler(anchorEl2, {
        cursor: 'move',
        onStart: () => this.app.beginGesture?.('نقطة الارتكاز'),
        onMove: (e, { dx, dy }) => {
          const a = propValueAt(layer.transform.anchor, this.store.playhead) || { x: 0, y: 0 };
          const rx = dx / (rect.width / comp.width) / (info.scale.x / 100);
          const ry = dy / (rect.height / comp.height) / (info.scale.y / 100);
          const ang = rad(info.rot);
          const lx = rx * Math.cos(-ang) - ry * Math.sin(-ang);
          const ly = rx * Math.sin(-ang) + ry * Math.cos(-ang);
          this.app.store.setProp(layer.id, 'transform.anchor', { x: Math.round(a.x + lx), y: Math.round(a.y + ly) }, { coalesce: 'gizmo-anchor' });
          this.renderGizmos();
        },
        onEnd: () => this.app.endGesture?.(),
      }));
      frameEl.appendChild(anchorEl2);
      overlay.appendChild(frameEl);
    } else {
      // إطار حول كل طبقة محدّدة
      layers.forEach((layer) => {
        const info = this.transformedCorners(layer);
        const xs = info.corners.map((p) => p.x), ys = info.corners.map((p) => p.y);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        const w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
        overlay.appendChild(el('div', {
          class: 'gizmo-frame',
          style: {
            left: `${offsetX + (x0 / comp.width) * rect.width}px`,
            top: `${offsetY + (y0 / comp.height) * rect.height}px`,
            width: `${(w / comp.width) * rect.width}px`,
            height: `${(h / comp.height) * rect.height}px`,
          },
        }));
      });
    }
  }

  /* --------------------------- التفاعل --------------------------- */
  addEventListener() {
    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showViewerMenu(e);
    });
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => {
      const p = this.compPointFromEvent(e);
      this.app.setStatus(`x: ${Math.round(p.x)}  y: ${Math.round(p.y)}`);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const dir = e.deltaY < 0 ? 1 : -1;
        const idx = ZOOM_STEPS.findIndex((z) => z >= this.zoom - 0.001);
        const next = ZOOM_STEPS[clamp(idx + dir, 0, ZOOM_STEPS.length - 1)];
        this.setZoom(next);
      } else if (e.shiftKey) {
        this.bodyEl.scrollLeft += e.deltaY;
      } else {
        this.bodyEl.scrollTop += e.deltaY;
        this.bodyEl.scrollLeft += e.deltaX;
      }
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => {
      const layer = this.hitTest(this.compPointFromEvent(e));
      if (layer) this.app.openLayerInViewer(layer);
    });
    document.addEventListener('keydown', (e) => { /* تُدار في الاختصارات */ });
  }

  hitTest(p) {
    const comp = this.comp;
    const layers = [...comp.layers].reverse();
    for (const layer of layers) {
      if (!layer.enabled) continue;
      if (p.x < layer.inPoint || p.x > layer.outPoint) continue;
      const info = this.transformedCorners(layer);
      const xs = info.corners.map((q) => q.x), ys = info.corners.map((q) => q.y);
      const pad = 2;
      if (p.x >= Math.min(...xs) - pad && p.x <= Math.max(...xs) + pad && p.y >= Math.min(...ys) - pad && p.y <= Math.max(...ys) + pad) return layer;
    }
    return null;
  }

  onPointerDown(e) {
    const tool = this.app.tool;
    const p = this.compPointFromEvent(e);
    if (e.button === 2) return;
    // أدوات الرسم
    if (tool === 'pen') { this.startMaskDraw(p, e); return; }
    if (['rect', 'ellipse', 'polygon', 'star', 'text', 'solid'].includes(tool)) { this.startCreateLayer(p, e); return; }
    if (tool === 'hand' || e.button === 1) {
      this.startPan(e);
      return;
    }
    if (tool === 'zoom') {
      const dir = e.altKey ? -1 : 1;
      const idx = ZOOM_STEPS.findIndex((z) => z >= this.zoom - 0.001);
      this.setZoom(ZOOM_STEPS[clamp(idx + dir, 0, ZOOM_STEPS.length - 1)]);
      return;
    }
    // تحديد / تحريك
    const layer = this.hitTest(p);
    if (layer) {
      const already = this.store.isSelected(layer.id);
      if (!already) this.store.select([layer.id], { add: e.shiftKey });
      else if (e.shiftKey) this.store.select([layer.id], { toggle: true });
      if (this.store.isSelected(layer.id)) this.startMoveOrRotate(e);
    } else {
      this.startMarquee(e);
    }
  }

  startPan(e) {
    const el0 = this.bodyEl;
    const startX = e.clientX, startY = e.clientY;
    const sx = el0.scrollLeft, sy = el0.scrollTop;
    const move = (ev) => {
      el0.scrollLeft = sx - (ev.clientX - startX);
      el0.scrollTop = sy - (ev.clientY - startY);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  startMoveOrRotate(e) {
    const frame = this.store.playhead;
    const store = this.store;
    const layers = store.selectedLayers().filter((l) => !l.locked);
    if (!layers.length) return;
    const start = layers.map((l) => ({
      layer: l,
      pos: { ...(propValueAt(l.transform.position, frame) || { x: 0, y: 0 }) },
    }));
    const tool = this.app.tool;
    const rect = this.canvas.getBoundingClientRect();
    const comp = this.comp;
    const origin = this.compPointFromEvent(e);
    this.app.beginGesture?.(tool === 'rotate' ? 'تدوير' : 'تحريك');
    const move = (ev) => {
      const p = {
        x: ((ev.clientX - rect.left) / rect.width) * comp.width,
        y: ((ev.clientY - rect.top) / rect.height) * comp.height,
      };
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      start.forEach((s) => {
        if (tool === 'rotate') {
          const a = Math.atan2(p.y - s.pos.y, p.x - s.pos.x) * 180 / Math.PI + 90;
          store.setProp(s.layer.id, 'transform.rotation', Math.round(a), { coalesce: 'rotate', frame });
        } else if (tool === 'pan-behind') {
          const anchor = propValueAt(s.layer.transform.anchor, frame) || { x: 0, y: 0 };
          store.setProp(s.layer.id, 'transform.anchor', { x: Math.round(anchor.x + dx), y: Math.round(anchor.y + dy) }, { coalesce: 'anchor', frame });
          store.setProp(s.layer.id, 'transform.position', { x: Math.round(s.pos.x + dx), y: Math.round(s.pos.y + dy) }, { coalesce: 'panbehind', frame });
        } else {
          store.setProp(s.layer.id, 'transform.position', { x: Math.round(s.pos.x + dx), y: Math.round(s.pos.y + dy) }, { coalesce: 'move', frame });
        }
      });
      this.renderGizmos();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.app.endGesture?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  startMarquee(e) {
    const bodyRect = this.bodyEl.getBoundingClientRect();
    const rect = this.canvas.getBoundingClientRect();
    const startX = e.clientX - bodyRect.left + this.bodyEl.scrollLeft;
    const startY = e.clientY - bodyRect.top + this.bodyEl.scrollTop;
    const box = el('div', { class: 'marquee-box' });
    this.overlay.appendChild(box);
    const comp = this.comp;
    const move = (ev) => {
      const x = ev.clientX - bodyRect.left + this.bodyEl.scrollLeft;
      const y = ev.clientY - bodyRect.top + this.bodyEl.scrollTop;
      const left = Math.min(startX, x), top = Math.min(startY, y);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.abs(x - startX)}px`;
      box.style.height = `${Math.abs(y - startY)}px`;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const x = ev.clientX - bodyRect.left + this.bodyEl.scrollLeft;
      const y = ev.clientY - bodyRect.top + this.bodyEl.scrollTop;
      const left = Math.min(startX, x), top = Math.min(startY, y);
      const w = Math.abs(x - startX), h = Math.abs(y - startY);
      box.remove();
      if (w < 4 && h < 4) { this.store.deselectAll(); return; }
      const padL = rect.left - bodyRect.left, padT = rect.top - bodyRect.top;
      const sel = [];
      comp.layers.forEach((layer) => {
        const info = this.transformedCorners(layer);
        const xs = info.corners.map((p) => p.x), ys = info.corners.map((p) => p.y);
        const cx = padL + (Math.min(...xs) / comp.width) * rect.width;
        const cy = padT + (Math.min(...ys) / comp.height) * rect.height;
        const cw = ((Math.max(...xs) - Math.min(...xs)) / comp.width) * rect.width;
        const chh = ((Math.max(...ys) - Math.min(...ys)) / comp.height) * rect.height;
        if (cx + cw >= left && cx <= left + w && cy + chh >= top && cy <= top + h) sel.push(layer.id);
      });
      this.store.select(sel, { add: ev.shiftKey });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  startCreateLayer(p, e) {
    const tool = this.app.tool;
    const comp = this.comp;
    const store = this.store;
    const startP = { ...p };
    const preview = el('div', { class: 'marquee-box' });
    this.overlay.appendChild(preview);
    const rect = this.canvas.getBoundingClientRect();
    const bodyRect = this.bodyEl.getBoundingClientRect();
    const move = (ev) => {
      const q = this.compPointFromEvent(ev);
      const left = bodyRect.left + Math.min(startP.x, q.x) / comp.width * rect.width - bodyRect.left;
      preview.style.left = `${((Math.min(startP.x, q.x)) / comp.width) * rect.width + (rect.left - bodyRect.left)}px`;
      preview.style.top = `${((Math.min(startP.y, q.y)) / comp.height) * rect.height + (rect.top - bodyRect.top)}px`;
      preview.style.width = `${(Math.abs(q.x - startP.x) / comp.width) * rect.width}px`;
      preview.style.height = `${(Math.abs(q.y - startP.y) / comp.height) * rect.height}px`;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      preview.remove();
      const q = this.compPointFromEvent(ev);
      const w = Math.abs(q.x - startP.x), h = Math.abs(q.y - startP.y);
      const cx = (startP.x + q.x) / 2, cy = (startP.y + q.y) / 2;
      const tiny = w < 6 || h < 6;
      this.app.createLayerFromTool(tool, {
        position: tiny ? startP : { x: cx, y: cy },
        size: tiny ? null : { x: w, y: h },
        inPoint: store.playhead,
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  startMaskDraw(p, e) {
    const layer = this.store.primaryLayer;
    if (!layer) { toast('حدّد طبقة أولًا لرسم قناع', 'warn'); return; }
    const mask = this.store.addMask(layer.id, [], 'add');
    const draw = el('svg', { class: 'mask-pen-overlay' });
    this.overlay.appendChild(draw);
    const rect = this.canvas.getBoundingClientRect();
    const bodyRect = this.bodyEl.getBoundingClientRect();
    const toLocal = (ev) => {
      const q = this.compPointFromEvent(ev);
      return { x: q.x, y: q.y };
    };
    const points = [{ x: p.x, y: p.y, inX: 0, inY: 0, outX: 0, outY: 0 }];
    const redraw = () => {
      const scale = rect.width / this.comp.width;
      const ox = rect.left - bodyRect.left;
      const oy = rect.top - bodyRect.top;
      draw.setAttribute('width', String(bodyRect.width));
      draw.setAttribute('height', String(bodyRect.height));
      draw.innerHTML = `<polyline fill="rgba(74,157,255,.12)" stroke="#4a9dff" stroke-width="1.4"
        points="${points.map((q) => `${ox + q.x * scale},${oy + q.y * scale}`).join(' ')}"/>`;
    };
    redraw();
    const click = (ev) => {
      const q = toLocal(ev);
      if (ev.detail === 2 || (points.length > 2 && Math.hypot(q.x - points[0].x, q.y - points[0].y) < 12)) {
        finish();
        return;
      }
      points.push({ x: q.x, y: q.y, inX: 0, inY: 0, outX: 0, outY: 0 });
      redraw();
    };
    const move = (ev) => {
      const q = toLocal(ev);
      redraw();
      const scale = rect.width / this.comp.width;
      const ox = rect.left - bodyRect.left;
      const oy = rect.top - bodyRect.top;
      draw.innerHTML += `<line x1="${ox + points[points.length - 1].x * scale}" y1="${oy + points[points.length - 1].y * scale}" x2="${ox + q.x * scale}" y2="${oy + q.y * scale}" stroke="#4a9dff" stroke-width="1" stroke-dasharray="3 3"/>`;
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', click);
      draw.remove();
      if (points.length >= 3) {
        this.store.updateMask(layer.id, mask.id, { points });
        toast('تم إنشاء القناع', 'ok');
      } else {
        this.store.removeMask(layer.id, mask.id);
      }
      this.app.setTool('select');
    };
    window.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', click);
  }

  /** إلغاء أي تفاعل جارٍ (سحب، رسم قناع، مستطيل تحديد) */
  cancelCurrent() {
    if (this.dragging?.cleanup) this.dragging.cleanup();
    this.dragging = null;
    this.pointerStart = null;
    if (this.marquee) { this.marquee.remove?.(); this.marquee = null; }
    if (this.maskDraw) { this.maskDraw.remove?.(); this.maskDraw = null; }
    document.querySelectorAll('.marquee-box, .mask-pen-overlay').forEach((n) => n.remove());
    this.app.setTool('select');
    this.overlay.querySelectorAll('.gizmo-frame, .gizmo-handle, .safe-area').forEach((n) => n.remove());
    this.requestRender();
  }

  showViewerMenu(e) {
    const p = this.compPointFromEvent(e);
    const layer = this.hitTest(p);
    const items = [
      { label: 'ملاءمة العرض', icon: 'i-fit', action: () => this.fit() },
      { label: 'تكبير 100%', action: () => this.setZoom(1) },
      { label: 'دقة كاملة', action: () => { document.getElementById('viewer-res').value = 'full'; this.layout(); } },
      { type: 'sep' },
      { label: 'إظهار الأدلة', checked: () => this.store.viewer.showGuides, type: 'item', action: () => this.toggleGuides() },
      { label: 'إظهار المقابض', checked: () => this.store.viewer.gizmos, action: () => { this.store.viewer.gizmos = !this.store.viewer.gizmos; this.renderGizmos(); } },
      { label: 'حفظ الإطار كصورة PNG', icon: 'i-image', action: () => this.snapshot() },
      { type: 'sep' },
      { label: layer ? `تحديد: ${layer.name}` : 'لا توجد طبقة هنا', disabled: !layer, action: () => layer && this.store.select([layer.id]) },
    ];
    if (layer) {
      items.push({ label: 'خصائص الطبقة', icon: 'i-settings', action: () => this.app.focusLayerProps(layer) });
    }
    showContextMenu(items, { x: e.clientX, y: e.clientY });
  }

  toggleGuides() {
    this.store.viewer.showGuides = !this.store.viewer.showGuides;
    this.renderGizmos();
  }

  setZoom(z) {
    this.fitMode = false;
    this.zoom = clamp(z, 0.02, 8);
    const sel = document.getElementById('viewer-zoom');
    if (sel) sel.value = [...sel.options].some((o) => o.value === String(this.zoom)) ? String(this.zoom) : 'fit';
    this.layout();
  }

  fit() {
    this.fitMode = true;
    const sel = document.getElementById('viewer-zoom');
    if (sel) sel.value = 'fit';
    this.layout();
  }

  snapshot() {
    const comp = this.comp;
    const url = this.renderer.renderToDataURL(comp, this.store.playhead, { scale: 1, transparent: false });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${comp.name.replace(/\s+/g, '_')}_${this.store.playhead}.png`;
    a.click();
    toast('تم حفظ الإطار', 'ok');
  }

  /* --------------------------- التشغيل --------------------------- */
  togglePlay() {
    if (this.playing) this.stop();
    else this.play();
  }

  play({ fromFrame = this.store.playhead, rate = 1 } = {}) {
    if (this.playing) return;
    this.playing = true;
    this.playbackRate = rate;
    this.store.setPlaying(true);
    this.app.audio?.play(fromFrame, rate);
    this._startTime = performance.now();
    this._startFrame = fromFrame;
    this._raf = requestAnimationFrame(() => this._tick());
    this.updateBadge();
  }

  _tick() {
    if (!this.playing) return;
    const comp = this.comp;
    const now = performance.now();
    const elapsed = (now - this._startTime) / 1000;
    let frame = this._startFrame + elapsed * comp.fps * this.playbackRate;
    if (frame >= comp.duration) {
      if (this.store.loop) {
        frame = 0;
        this._startTime = now;
        this._startFrame = 0;
        this.app.audio?.play(0, this.playbackRate);
      } else {
        frame = comp.duration;
        this.store.setPlayhead(frame, { silent: true });
        this.draw();
        this.stop();
        return;
      }
    }
    this.store.setPlayhead(frame, { silent: false });
    this.draw();
    this.renderGizmos();
    this._raf = requestAnimationFrame(() => this._tick());
  }

  stop() {
    this.playing = false;
    this.store.setPlaying(false);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.app.audio?.stop();
    this.layout();
    this.updateBadge();
  }

  stepFrame(d) {
    this.stop();
    this.store.stepFrame(d);
  }
}

function cursorForHandle(name, rot) {
  const map = { nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize' };
  return map[name] || 'pointer';
}
