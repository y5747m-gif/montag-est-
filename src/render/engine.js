/**
 * محرّك الرسم — يرسم التركيبة إلى Canvas (نفس المسار يُستخدم في المعاينة والتصدير)
 */
import { clamp, rad, hexToRgb, mixColor, rgbaString } from '../core/util.js';
import { propValueAt, propIsAnimated } from '../core/anim.js';
import { EFFECTS } from '../core/effects.js';
import { layerVisibleAt } from '../core/model.js';
import { shapeGeometry, drawShapeToPath, layoutText } from './shapes.js';

const BLEND_CANVAS = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay',
  darken: 'darken', lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn',
  'hard-light': 'hard-light', 'soft-light': 'soft-light', difference: 'difference', exclusion: 'exclusion',
  hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};

const MAX_DEPTH = 6;

export class Renderer {
  constructor(store, media) {
    this.store = store;
    this.media = media;
    this.pool = [];
    this.cache = new Map();
    this.frameStats = { layers: 0, ms: 0 };
    if (store) store.on('change', () => this.clearCache());
    if (store) store.on('project', () => this.clearCache());
  }

  clearCache() { this.cache.clear(); }

  /* ---------------------------- أدوات المؤقت ---------------------------- */
  temp(w, h) {
    const c = this.pool.pop() || document.createElement('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, w, h);
    return c;
  }
  release(c) {
    if (this.pool.length < 8 && c) this.pool.push(c);
  }

  /* ---------------------------- الحل (Resolve) ---------------------------- */
  resolveParams(fx, frame, ctxInfo) {
    const out = {};
    for (const [k, prop] of Object.entries(fx.params || {})) {
      if (prop && prop.type) {
        const v = propValueAt(prop, frame, ctxInfo);
        out[k] = v && typeof v === 'object' ? { ...v } : v;
      } else {
        out[k] = prop;
      }
    }
    return out;
  }

  resolveLayerEffects(layer, frame, ctxInfo) {
    return layer.effects.filter((f) => f.enabled).map((fx) => {
      const def = EFFECTS[fx.type];
      if (!def) return null;
      return { id: fx.id, type: fx.type, def, params: this.resolveParams(fx, frame, ctxInfo) };
    }).filter(Boolean);
  }

  /** تحويل الطبقة إلى مصفوفة أفينية (مع سلسلة الآباء وتأثيرات التحويل) */
  computeTransform(layer, frame, ctxInfo) {
    const t = layer.transform;
    const pos = propValueAt(t.position, frame, ctxInfo) || { x: 0, y: 0 };
    const anchor = propValueAt(t.anchor, frame, ctxInfo) || { x: 0, y: 0 };
    const scale = propValueAt(t.scale, frame, ctxInfo) || { x: 100, y: 100 };
    const rot = propValueAt(t.rotation, frame, ctxInfo) || 0;
    const skew = propValueAt(t.skew, frame, ctxInfo) || 0;
    const fxStates = this.resolveLayerEffects(layer, frame, ctxInfo);
    let extra = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };
    for (const st of fxStates) {
      if (st.def.transform) {
        const c = st.def.transform(st.params, { ...ctxInfo, frame, layer, fps: ctxInfo.fps }) || {};
        extra.tx += c.tx || 0;
        extra.ty += c.ty || 0;
        extra.sx *= c.sx ?? 1;
        extra.sy *= c.sy ?? 1;
        extra.rot += c.rot || 0;
      }
    }
    const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    // موقع الطبقة
    mul(m, translation(pos.x + extra.tx, pos.y + extra.ty));
    // الدوران والانحراف
    const totalRot = rad(rot + extra.rot);
    mul(m, rotation(totalRot));
    if (skew) {
      const k = Math.tan(rad(clamp(skew, -85, 85)));
      mul(m, { a: 1, b: 0, c: k, d: 1, e: 0, f: 0 });
    }
    // المقياس
    mul(m, scaling((scale.x / 100) * extra.sx, (scale.y / 100) * extra.sy));
    // نقطة الارتكاز
    mul(m, translation(-anchor.x, -anchor.y));
    // سلسلة الآباء
    let parent = layer.parent ? this.store.comp?.layers.find((l) => l.id === layer.parent) : null;
    let guard = 0;
    while (parent && guard < 16) {
      const pt = parent.transform;
      const ppos = propValueAt(pt.position, frame, ctxInfo) || { x: 0, y: 0 };
      const panch = propValueAt(pt.anchor, frame, ctxInfo) || { x: 0, y: 0 };
      const pscale = propValueAt(pt.scale, frame, ctxInfo) || { x: 100, y: 100 };
      const prot = propValueAt(pt.rotation, frame, ctxInfo) || 0;
      const pm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      mul(pm, translation(ppos.x, ppos.y));
      mul(pm, rotation(rad(prot)));
      mul(pm, scaling(pscale.x / 100, pscale.y / 100));
      mul(pm, translation(-panch.x, -panch.y));
      mul(pm, m);
      Object.assign(m, pm);
      parent = parent.parent ? this.store.comp?.layers.find((l) => l.id === parent.parent) : null;
      guard += 1;
    }
    return { m, fxStates, pos, anchor, scale, rot, skew, opacity: propValueAt(t.opacity, frame, ctxInfo) ?? 100 };
  }

  /* ---------------------------- الرسم العام ---------------------------- */
  /**
   * يرسم التركيبة على السياق المحدّد
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} comp
   * @param {number} frame
   * @param {object} opts { width, height, transparent, quality, depth }
   */
  renderComp(ctx, comp, frame, opts = {}) {
    const t0 = performance.now();
    const W = opts.width || comp.width;
    const H = opts.height || comp.height;
    const depth = opts.depth || 0;
    const scaleX = W / comp.width;
    const scaleY = H / comp.height;
    ctx.save();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    if (!opts.transparent) {
      ctx.fillStyle = comp.bg || '#000000';
      ctx.fillRect(0, 0, comp.width, comp.height);
    }
    this.renderLayers(ctx, comp, frame, { ...opts, width: comp.width, height: comp.height, depth });
    ctx.restore();
    this.frameStats.ms = performance.now() - t0;
  }

  renderLayers(ctx, comp, frame, opts) {
    const W = comp.width;
    const H = comp.height;
    const depth = opts.depth || 0;
    const ctxInfoBase = { fps: comp.fps, comp, media: this.media };
    const order = [...comp.layers].reverse(); // من الأسفل إلى الأعلى
    let stats = 0;

    for (let li = 0; li < order.length; li += 1) {
      const layer = order[li];
      if (!layerVisibleAt(layer, frame, comp)) continue;
      if (layer.type === 'adjustment') {
        this.applyAdjustment(ctx, layer, comp, frame, W, H, ctxInfoBase, opts);
        stats += 1;
        continue;
      }
      if (layer.type === 'camera') continue; // تُستخدم في حساب العرض
      const ctxInfo = { ...ctxInfoBase, frame, layer, layerName: layer.name };
      const tState = this.computeTransform(layer, frame, ctxInfo);
      const render = this.renderLayerToCanvas(layer, comp, frame, W, H, opts, depth);
      if (!render) continue;
      const { canvas, opacity, filter, blend } = render;
      ctx.save();
      ctx.globalAlpha = clamp(opacity / 100, 0, 4);
      ctx.globalCompositeOperation = BLEND_CANVAS[layer.blend] || 'source-over';
      if (filter) ctx.filter = filter;
      ctx.drawImage(canvas, 0, 0, W, H);
      ctx.restore();
      this.release(canvas);
      stats += 1;
    }
    this.frameStats.layers = stats;
  }

  applyAdjustment(ctx, layer, comp, frame, W, H, ctxInfoBase, opts) {
    const ctxInfo = { ...ctxInfoBase, frame, layer, layerName: layer.name, tempCanvas: null };
    const states = this.resolveLayerEffects(layer, frame, ctxInfo);
    if (!states.length) return;
    const amount = clamp((propValueAt(layer.props.amount, frame, ctxInfo) ?? 100) / 100, 0, 1);
    if (amount <= 0) return;
    let pending = '';
    const flush = () => {
      if (!pending) return;
      const tmp = this.temp(W, H);
      const tctx = tmp.getContext('2d');
      tctx.filter = pending.trim();
      tctx.drawImage(ctx.canvas, 0, 0, W, H);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(tmp, 0, 0, W, H);
      ctx.restore();
      this.release(tmp);
      pending = '';
    };
    for (const st of states) {
      const def = st.def;
      if (def.css) { const s = def.css(st.params, ctxInfo); if (s) pending += ` ${s}`; }
      if (def.pixel) {
        flush();
        const img = ctx.getImageData(0, 0, W, H);
        const before = new Uint8ClampedArray(img.data);
        def.pixel(img, st.params, ctxInfo);
        if (amount < 1) {
          for (let i = 0; i < img.data.length; i += 1) img.data[i] = before[i] + (img.data[i] - before[i]) * amount;
        }
        ctx.putImageData(img, 0, 0);
      }
      if (def.draw) { flush(); def.draw(ctx, st.params, W, H, ctxInfo); }
    }
    flush();
  }

  /* ---------------------------- طبقة واحدة ---------------------------- */
  renderLayerToCanvas(layer, comp, frame, W, H, opts, depth) {
    const ctxInfo = { fps: comp.fps, comp, frame, layer, layerName: layer.name, media: this.media, audioAmp: this.media?.ampAt(frame, comp, comp.fps) || 0 };
    const tState = this.computeTransform(layer, frame, ctxInfo);
    const states = tState.fxStates;
    const isStatic = this.isStatic(layer, states);
    const cacheKey = `${layer.id}:${W}x${H}:${frame}`;
    if (isStatic && this.cache.has(cacheKey)) {
      const c = this.cache.get(cacheKey);
      return { canvas: this.copyOf(c), opacity: 100, filter: '', blend: layer.blend, cached: true };
    }

    const canvas = this.temp(W, H);
    const ctx = canvas.getContext('2d');
    let opacity = propValueAt(layer.transform.opacity, frame, ctxInfo) ?? 100;

    // السجل المرئي للتأثيرات (رسم، تراكب، تلاشٍ)
    let pendingFilter = '';
    const flush = () => {
      if (!pendingFilter.trim()) return;
      const tmp = this.temp(W, H);
      const tctx = tmp.getContext('2d');
      tctx.drawImage(canvas, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = pendingFilter.trim();
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(tmp, 0, 0);
      ctx.filter = 'none';
      this.release(tmp);
      pendingFilter = '';
    };

    const textInfo = { fps: comp.fps, frame, layer, comp };
    let textOverride = null;
    for (const st of states) {
      if (st.def.opacityFactor) opacity *= clamp(st.def.opacityFactor(st.params, { ...ctxInfo, layer }), 0, 4);
      if (st.def.textTransform && layer.type === 'text') {
        textOverride = st.def.textTransform(propValueAt(layer.props.text, frame, ctxInfo) ?? '', st.params, { ...ctxInfo, fps: comp.fps });
      }
    }

    // 1) محتوى الطبقة
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const m = tState.m;
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.drawContent(ctx, layer, comp, frame, ctxInfo, { textOverride, states, depth, opts });
    ctx.restore();

    // 2) الأقنعة (في فضاء التركيب)
    if (layer.masks.length) this.applyMasks(canvas, layer, comp, frame, ctxInfo);

    // 3) التأثيرات بالترتيب
    for (const st of states) {
      const def = st.def;
      if (def.drawsBackground) { /* يُرسم في المحتوى */ }
      if (def.needsTemp || def.draw || def.pixel) {
        // نسخة للقراءة عند الحاجة
      }
      if (def.draw) {
        flush();
        const needTemp = !!def.needsTemp;
        const snap = needTemp ? this.copyOf(canvas) : null;
        const snapCtx = snap ? snap.getContext('2d') : null;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.filter = 'none';
        def.draw(ctx, st.params, W, H, { ...ctxInfo, fps: comp.fps, frame, tempCanvas: snap, tempCtx: snapCtx, layer, states });
        if (snap) this.release(snap);
      }
      if (def.pixel && opts.skipPixels !== true) {
        flush();
        const img = ctx.getImageData(0, 0, W, H);
        def.pixel({ data: img.data, width: W, height: H }, st.params, { frame, fps: comp.fps, layer });
        ctx.putImageData(img, 0, 0);
      }
      if (def.css) {
        const s = def.css(st.params, ctxInfo);
        if (s) pendingFilter += ` ${s}`;
      }
      if (def.opacityFactor) { /* طُبّق أعلاه */ }
    }
    flush();

    // 4) القصّ العام (clip hooks) — يُطبَّق عند الدمج عبر قناع
    const clipPaths = states.map((st) => st.def.clip && st.def.clip(st.params, W, H)).filter(Boolean);
    if (clipPaths.length) {
      const mask = this.temp(W, H);
      const mctx = mask.getContext('2d');
      mctx.fillStyle = '#fff';
      clipPaths.forEach((cp) => { mctx.beginPath(); cp.path(mctx); mctx.fill(); });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      this.release(mask);
    }

    // 5) القناع (Track Matte)
    if (layer.matte !== 'none') {
      const matteLayer = this.findMatteLayer(layer, comp);
      if (matteLayer) {
        const matte = this.renderLayerToCanvas(matteLayer, comp, frame, W, H, { ...opts, skipMatte: true }, depth + 1);
        if (matte) {
          const m2 = matte.canvas;
          if (layer.matte.includes('luma')) {
            const mctx = m2.getContext('2d');
            const img = mctx.getImageData(0, 0, W, H);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
              const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
              d[i + 3] = d[i + 3] * (l / 255);
            }
            mctx.putImageData(img, 0, 0);
          }
          if (layer.matte.includes('inverted')) {
            const mctx = m2.getContext('2d');
            const img = mctx.getImageData(0, 0, W, H);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) d[i + 3] = 255 - d[i + 3];
            mctx.putImageData(img, 0, 0);
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(m2, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          this.release(m2);
        }
      }
    }

    if (isStatic) this.cache.set(cacheKey, this.copyOf(canvas));

    return { canvas, opacity, filter: '', blend: layer.blend };
  }

  isStatic(layer, states) {
    if (layer.type === 'video' || layer.type === 'visualizer' || layer.type === 'particles' || layer.type === 'precomp') return false;
    if (layer.matte !== 'none') return false;
    const animated = ['anchor', 'position', 'scale', 'rotation', 'opacity', 'skew'].some((k) => propIsAnimated(layer.transform[k]));
    if (animated) return false;
    if (Object.values(layer.props).some((p) => p && p.keys && p.keys.length)) return false;
    if (layer.parent) return false;
    for (const st of states) {
      if (st.def.transform || st.def.draw || st.def.pixel || st.def.opacityFactor || st.def.textTransform) return false;
      if (Object.values(st.def.params || {}).length && st.def.id !== 'blur') return false;
    }
    return true;
  }

  findMatteLayer(layer, comp) {
    if (layer.matteLayerId) return comp.layers.find((l) => l.id === layer.matteLayerId) || null;
    const idx = comp.layers.indexOf(layer);
    return idx > 0 ? comp.layers[idx - 1] : null;
  }

  applyMasks(canvas, layer, comp, frame, ctxInfo) {
    const W = canvas.width, H = canvas.height;
    const maskCanvas = this.temp(W, H);
    const mctx = maskCanvas.getContext('2d');
    mctx.fillStyle = '#fff';
    for (const mask of layer.masks) {
      if (!mask.points || mask.points.length < 3) continue;
      mctx.save();
      if (mask.inverted) mctx.globalCompositeOperation = 'xor';
      if (mask.feather) mctx.filter = `blur(${mask.feather}px)`;
      mctx.globalAlpha = clamp((mask.opacity ?? 100) / 100, 0, 1);
      mctx.beginPath();
      const pts = mask.points;
      const expand = mask.expansion || 0;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      pts.forEach((p, i) => {
        let x = p.x, y = p.y;
        if (expand) {
          const dx = p.x - cx, dy = p.y - cy;
          const len = Math.hypot(dx, dy) || 1;
          x += (dx / len) * expand;
          y += (dy / len) * expand;
        }
        if (i === 0) mctx.moveTo(x, y);
        else mctx.lineTo(x, y);
      });
      mctx.closePath();
      mctx.fill();
      mctx.restore();
    }
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.restore();
    this.release(maskCanvas);
  }

  copyOf(canvas) {
    const c = this.temp(canvas.width, canvas.height);
    c.getContext('2d').drawImage(canvas, 0, 0);
    return c;
  }

  /* ---------------------------- محتوى الأنواع ---------------------------- */
  drawContent(ctx, layer, comp, frame, ctxInfo, opts) {
    const compW = comp.width, compH = comp.height;
    switch (layer.type) {
      case 'solid': return this.drawSolid(ctx, layer, frame, ctxInfo, compW, compH);
      case 'shape': return this.drawShape(ctx, layer, frame, ctxInfo);
      case 'text': return this.drawText(ctx, layer, frame, ctxInfo, compW, opts);
      case 'image': return this.drawMedia(ctx, layer, frame, ctxInfo, compW, compH, false);
      case 'video': return this.drawMedia(ctx, layer, frame, ctxInfo, compW, compH, true);
      case 'audio': return;
      case 'precomp': return this.drawPrecomp(ctx, layer, frame, ctxInfo, opts);
      case 'light': return this.drawLight(ctx, layer, frame, ctxInfo, compW, compH);
      case 'visualizer': return this.drawVisualizer(ctx, layer, frame, ctxInfo, compW);
      case 'particles': return this.drawParticles(ctx, layer, frame, ctxInfo);
      case 'null': return;
      case 'adjustment': return;
      default: return;
    }
  }

  drawSolid(ctx, layer, frame, ctxInfo, compW, compH) {
    const w = (propValueAt(layer.props.width, frame, ctxInfo) || 0) || compW;
    const h = (propValueAt(layer.props.height, frame, ctxInfo) || 0) || compH;
    const color = propValueAt(layer.props.color, frame, ctxInfo) || '#000';
    const grad = propValueAt(layer.props.gradient, frame, ctxInfo);
    ctx.save();
    if (grad) {
      const a = rad(propValueAt(layer.props.angle, frame, ctxInfo) || 45);
      const c2 = propValueAt(layer.props.color2, frame, ctxInfo) || '#fff';
      const g = ctx.createLinearGradient(-Math.cos(a) * w / 2, -Math.sin(a) * h / 2, Math.cos(a) * w / 2, Math.sin(a) * h / 2);
      g.addColorStop(0, color); g.addColorStop(1, c2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  drawShape(ctx, layer, frame, ctxInfo) {
    const size = propValueAt(layer.props.size, frame, ctxInfo) || { x: 100, y: 100 };
    const kind = layer.props.kind?.value || 'rect';
    const roundness = propValueAt(layer.props.roundness, frame, ctxInfo) || 0;
    const points = propValueAt(layer.props.points, frame, ctxInfo) || 5;
    const inner = (propValueAt(layer.props.innerRadius, frame, ctxInfo) || 45) / 100;
    const geo = shapeGeometry(kind, size.x, size.y, { roundness: Math.min(roundness, Math.min(size.x, size.y) / 2), points, innerRatio: inner });
    const grad = propValueAt(layer.props.gradient, frame, ctxInfo);
    const fill = propValueAt(layer.props.fill, frame, ctxInfo) || '#4a9dff';
    const strokeColor = propValueAt(layer.props.strokeColor, frame, ctxInfo) || '#fff';
    const strokeWidth = propValueAt(layer.props.strokeWidth, frame, ctxInfo) || 0;
    const glow = propValueAt(layer.props.glow, frame, ctxInfo) || 0;
    const dashes = propValueAt(layer.props.dashes, frame, ctxInfo) || 0;
    ctx.save();
    ctx.beginPath();
    drawShapeToPath(ctx, geo);
    ctx.restore();
    ctx.save();
    if (grad) {
      const a = rad(propValueAt(layer.props.gradientAngle, frame, ctxInfo) || 45);
      const c2 = propValueAt(layer.props.fill2, frame, ctxInfo) || '#a86bff';
      const r = Math.max(size.x, size.y) / 2;
      const g = ctx.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
      g.addColorStop(0, fill); g.addColorStop(1, c2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = fill;
    if (glow) { ctx.shadowColor = rgbaString(fill, 0.9); ctx.shadowBlur = glow; }
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      if (dashes) ctx.setLineDash([dashes, dashes * 0.6]);
      ctx.stroke();
    }
    ctx.fill();
    ctx.restore();
  }

  fontString(layer, frame, ctxInfo) {
    const family = layer.props.fontFamily?.value || 'Cairo';
    const size = propValueAt(layer.props.fontSize, frame, ctxInfo) || 72;
    const weight = layer.props.fontWeight?.value || '700';
    return `${weight} ${size}px "${family}", system-ui, sans-serif`;
  }

  drawText(ctx, layer, frame, ctxInfo, compW, opts) {
    const override = opts.textOverride;
    let text = override ? override.text : (propValueAt(layer.props.text, frame, ctxInfo) ?? '');
    if (override?.hidden && !text) return;
    const size = propValueAt(layer.props.fontSize, frame, ctxInfo) || 72;
    const tracking = propValueAt(layer.props.tracking, frame, ctxInfo) || 0;
    const leading = propValueAt(layer.props.leading, frame, ctxInfo) || 0;
    const align = layer.props.align?.value || 'center';
    const justify = layer.props.justify?.value || 'center';
    const fill = propValueAt(layer.props.fill, frame, ctxInfo) || '#fff';
    const fill2 = propValueAt(layer.props.fill2, frame, ctxInfo) || '#4a9dff';
    const grad = propValueAt(layer.props.gradient, frame, ctxInfo);
    const strokeColor = propValueAt(layer.props.strokeColor, frame, ctxInfo) || '#000';
    const strokeWidth = propValueAt(layer.props.strokeWidth, frame, ctxInfo) || 0;
    const maxWidth = propValueAt(layer.props.maxWidth, frame, ctxInfo) || 0;
    const bg = propValueAt(layer.props.bg, frame, ctxInfo) || '#00000000';
    const bgPad = propValueAt(layer.props.bgPadding, frame, ctxInfo) || 0;
    const shadow = propValueAt(layer.props.shadow, frame, ctxInfo);
    const shadowColor = propValueAt(layer.props.shadowColor, frame, ctxInfo) || '#000';
    const shadowBlur = propValueAt(layer.props.shadowBlur, frame, ctxInfo) || 0;
    const shadowOffset = propValueAt(layer.props.shadowOffset, frame, ctxInfo) || { x: 4, y: 4 };

    ctx.save();
    ctx.font = this.fontString(layer, frame, ctxInfo);
    ctx.textBaseline = 'middle';
    const limit = maxWidth || (compW * 0.92);
    const lines = maxWidth ? layoutText(ctx, text, maxWidth, size) : String(text).split('\n');
    const lineHeight = size * 1.22 + leading;

    // تأثيرات الأحرف
    let charFn = null;
    if (layer.type === 'text') {
      for (const st of opts.states || []) {
        if (st.def.textChars) charFn = st.def.textChars(st.params, { ...ctxInfo, fps: ctxInfo.fps, frame, layer });
      }
    }

    const measureLine = (line) => {
      let w = 0;
      for (const ch of line) w += ctx.measureText(ch).width + tracking;
      return w;
    };
    const widths = lines.map(measureLine);
    const blockW = Math.max(...widths, 1);
    const blockH = lines.length * lineHeight;
    let baseY = -blockH / 2 + lineHeight / 2;
    if (justify === 'top') baseY = 0 + lineHeight / 2;
    if (justify === 'bottom') baseY = -blockH + lineHeight / 2;

    if (bg && bg !== '#00000000' && !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(bg)) {
      const r = hexToRgb(bg);
      const alpha = (bg.length === 9) ? parseInt(bg.slice(7, 9), 16) / 255 : 1;
      ctx.fillStyle = `rgba(${r.r},${r.g},${r.b},${alpha})`;
      ctx.fillRect(-blockW / 2 - bgPad, baseY - lineHeight / 2 - bgPad, blockW + bgPad * 2, blockH + bgPad * 2);
    }
    if (shadow) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = shadowOffset.x;
      ctx.shadowOffsetY = shadowOffset.y;
    }
    if (grad) {
      const r = Math.max(blockW, blockH) / 2;
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, fill); g.addColorStop(1, fill2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = fill;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    if (tracking) ctx.letterSpacing = `${tracking}px`;

    let totalChars = lines.reduce((s, l) => s + l.length, 0);
    let globalIndex = 0;
    lines.forEach((line, li) => {
      const lw = widths[li];
      let x = -lw / 2;
      if (align === 'right') x = blockW / 2 - lw;
      if (align === 'left') x = -blockW / 2;
      const y = baseY + li * lineHeight;
      if (!charFn) {
        ctx.fillText(line, x, y);
        if (strokeWidth) ctx.strokeText(line, x, y);
      } else {
        let cx = x;
        for (const ch of line) {
          const cs = charFn(globalIndex, totalChars) || {};
          globalIndex += 1;
          ctx.save();
          ctx.globalAlpha = clamp(cs.opacity ?? 1, 0, 1);
          ctx.translate(cx + ctx.measureText(ch).width / 2 + (cs.tx || 0), y + (cs.ty || 0));
          if (cs.rot) ctx.rotate(rad(cs.rot));
          if (cs.scale != null) ctx.scale(cs.scale, cs.scale);
          if (strokeWidth) ctx.strokeText(ch, -ctx.measureText(ch).width / 2, 0);
          ctx.fillText(ch, -ctx.measureText(ch).width / 2, 0);
          ctx.restore();
          cx += ctx.measureText(ch).width + tracking;
        }
      }
    });
    ctx.restore();
  }

  drawMedia(ctx, layer, frame, ctxInfo, compW, compH, isVideo) {
    const assetId = layer.props.assetId?.value;
    const entry = assetId ? this.media?.get(assetId) : null;
    const src = isVideo ? entry?.video : (entry?.img || entry?.video);
    ctx.save();
    if (!src || (isVideo && entry.video && entry.video.readyState < 2)) {
      // عنصر غير متاح — نرسم إطارًا بديلًا
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(-compW / 2, -compH / 2, compW, compH);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '600 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`⚠ ${entry ? 'وسائط غير جاهزة' : 'وسائط مفقودة'}`, 0, 0);
      ctx.restore();
      return;
    }
    const natW = entry.width || src.videoWidth || src.naturalWidth || compW;
    const natH = entry.height || src.videoHeight || src.naturalHeight || compH;
    const fit = layer.props.fit?.value || 'contain';
    const flipH = propValueAt(layer.props.flipH, frame, ctxInfo);
    const flipV = propValueAt(layer.props.flipV, frame, ctxInfo);
    let w = natW, h = natH;
    if (fit === 'contain' || fit === 'cover') {
      const s = fit === 'contain' ? Math.min(compW / natW, compH / natH) : Math.max(compW / natW, compH / natH);
      w = natW * s; h = natH * s;
    } else if (fit === 'fill') { w = compW; h = compH; }
    ctx.translate(-w / 2, -h / 2);
    if (flipH || flipV) { ctx.translate(w / 2, h / 2); ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1); ctx.translate(-w / 2, -h / 2); }
    try { ctx.drawImage(src, 0, 0, w, h); } catch (e) { /* إطار غير جاهز */ }
    ctx.restore();
  }

  drawPrecomp(ctx, layer, frame, ctxInfo, opts) {
    const subId = layer.props.compId?.value;
    const sub = this.store.project.comps.find((c) => c.id === subId);
    if (!sub) return;
    const depth = (opts.depth || 0) + 1;
    if (depth > MAX_DEPTH) return;
    const offset = propValueAt(layer.props.timeOffset, frame, ctxInfo) || 0;
    const local = clamp(frame - layer.inPoint + offset, 0, sub.duration);
    const canvas = this.temp(sub.width, sub.height);
    const cctx = canvas.getContext('2d');
    this.renderComp(cctx, sub, local, { width: sub.width, height: sub.height, transparent: true, depth, skipPixels: opts.skipPixels });
    ctx.save();
    ctx.drawImage(canvas, -sub.width / 2, -sub.height / 2, sub.width, sub.height);
    ctx.restore();
    this.release(canvas);
  }

  drawLight(ctx, layer, frame, ctxInfo, compW, compH) {
    const color = propValueAt(layer.props.color, frame, ctxInfo) || '#ffd479';
    const intensity = (propValueAt(layer.props.intensity, frame, ctxInfo) || 0) / 100;
    const radius = propValueAt(layer.props.radius, frame, ctxInfo) || 500;
    const softness = (propValueAt(layer.props.softness, frame, ctxInfo) || 50) / 100;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    const r = hexToRgb(color);
    g.addColorStop(0, `rgba(${r.r},${r.g},${r.b},${clamp(intensity, 0, 1)})`);
    g.addColorStop(clamp(1 - softness, 0.02, 0.98), `rgba(${r.r},${r.g},${r.b},${clamp(intensity * 0.35, 0, 1)})`);
    g.addColorStop(1, `rgba(${r.r},${r.g},${r.b},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(-compW, -compH / 2, compW * 2, compH);
    ctx.restore();
  }

  drawVisualizer(ctx, layer, frame, ctxInfo, compW) {
    const p = layer.props;
    const assetId = p.assetId?.value;
    const style = p.style?.value || 'bars';
    const count = Math.max(4, Math.round(propValueAt(p.bars, frame, ctxInfo) || 48));
    const radius = propValueAt(p.radius, frame, ctxInfo) || 200;
    const thickness = propValueAt(p.thickness, frame, ctxInfo) || 12;
    const amplitude = propValueAt(p.amplitude, frame, ctxInfo) || 160;
    const color = propValueAt(p.color, frame, ctxInfo) || '#4a9dff';
    const color2 = propValueAt(p.color2, frame, ctxInfo) || '#a86bff';
    const sensitivity = (propValueAt(p.sensitivity, frame, ctxInfo) || 100) / 100;
    const smoothing = (propValueAt(p.smoothing, frame, ctxInfo) || 0) / 100;
    const mirror = propValueAt(p.mirror, frame, ctxInfo);
    const localSec = (frame - layer.inPoint) / ctxInfo.fps;
    const rms = this.media?.rmsWindow(assetId, localSec, count, Math.max(0.35, count * 0.02)) || new Float32Array(count);
    const vals = new Float32Array(count);
    let prev = 0;
    for (let i = 0; i < count; i += 1) {
      const raw = Math.pow(clamp((rms[i] || 0) * sensitivity, 0, 1), 0.8);
      prev = prev * smoothing + raw * (1 - smoothing);
      vals[i] = prev;
    }
    ctx.save();
    ctx.lineCap = 'round';
    if (style === 'bars') {
      const totalW = radius * 2;
      const bw = totalW / count;
      for (let i = 0; i < count; i += 1) {
        const h = Math.max(2, vals[i] * amplitude);
        const x = -radius + i * bw + bw / 2;
        const g = ctx.createLinearGradient(x, 0, x, -h);
        g.addColorStop(0, color); g.addColorStop(1, color2);
        ctx.fillStyle = g;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - thickness / 2, -h, thickness, h, thickness / 2);
        else ctx.rect(x - thickness / 2, -h, thickness, h);
        ctx.fill();
        if (mirror) {
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x - thickness / 2, 0, thickness, h, thickness / 2);
          else ctx.rect(x - thickness / 2, 0, thickness, h);
          ctx.fill();
        }
      }
    } else if (style === 'line') {
      ctx.lineWidth = thickness;
      const g = ctx.createLinearGradient(-radius, 0, radius, 0);
      g.addColorStop(0, color); g.addColorStop(1, color2);
      ctx.strokeStyle = g;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = -radius + (i / (count - 1)) * radius * 2;
        const y = -vals[i] * amplitude;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (style === 'circle') {
      const g = ctx.createLinearGradient(-radius, -radius, radius, radius);
      g.addColorStop(0, color); g.addColorStop(1, color2);
      ctx.strokeStyle = g;
      ctx.lineWidth = thickness;
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 - Math.PI / 2;
        const r1 = radius;
        const r2 = radius + Math.max(2, vals[i] * amplitude);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 - Math.PI / 2;
        const r = radius + vals[i] * amplitude;
        ctx.fillStyle = mixColor(color, color2, i / count);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, thickness / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawParticles(ctx, layer, frame, ctxInfo) {
    const p = layer.props;
    const count = Math.max(1, Math.round(propValueAt(p.count, frame, ctxInfo) || 100));
    const lifetime = Math.max(2, propValueAt(p.lifetime, frame, ctxInfo) || 90);
    const interval = Math.max(1, propValueAt(p.interval, frame, ctxInfo) || 4);
    const velocity = propValueAt(p.velocity, frame, ctxInfo) || 200;
    const direction = propValueAt(p.direction, frame, ctxInfo) || -90;
    const spread = propValueAt(p.spread, frame, ctxInfo) || 60;
    const gravity = propValueAt(p.gravity, frame, ctxInfo) || 0;
    const size = propValueAt(p.size, frame, ctxInfo) || 10;
    const sizeVar = (propValueAt(p.sizeVariance, frame, ctxInfo) || 0) / 100;
    const color = propValueAt(p.color, frame, ctxInfo) || '#ffd479';
    const color2 = propValueAt(p.color2, frame, ctxInfo) || '#ff5c8a';
    const shape = p.shape?.value || 'circle';
    const rotSpeed = propValueAt(p.rotationSpeed, frame, ctxInfo) || 0;
    const fadeOut = propValueAt(p.fadeOut, frame, ctxInfo);
    const seed = Math.round(propValueAt(p.seed, frame, ctxInfo) || 1);
    const fps = ctxInfo.fps || 30;
    const localFrame = frame - layer.inPoint;
    const cycle = count * interval;
    const rnd = (i, salt) => hash01(i * 127.1 + salt * 311.7, seed);

    ctx.save();
    for (let i = 0; i < count; i += 1) {
      const baseSpawn = i * interval;
      const k = Math.max(0, Math.floor((localFrame - baseSpawn) / cycle));
      const spawn = baseSpawn + k * cycle;
      const age = localFrame - spawn;
      if (age < 0 || age > lifetime) continue;
      const t = age / fps;
      const life = age / lifetime;
      const r1 = rnd(i, 1), r2 = rnd(i, 2), r3 = rnd(i, 3), r4 = rnd(i, 4);
      const ang = rad(direction + (r1 - 0.5) * spread);
      const vel = velocity * (0.55 + r2 * 0.9);
      const x = Math.cos(ang) * vel * t;
      const y = Math.sin(ang) * vel * t + 0.5 * gravity * t * t;
      const sz = Math.max(0.5, size * (1 - sizeVar / 2 + r3 * sizeVar));
      const alpha = fadeOut ? clamp(1 - life, 0, 1) ** 0.7 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rad(r4 * 360 + rotSpeed * t));
      ctx.fillStyle = mixColor(color, color2, r3);
      ctx.beginPath();
      if (shape === 'circle') ctx.arc(0, 0, sz / 2, 0, Math.PI * 2);
      else if (shape === 'square') ctx.rect(-sz / 2, -sz / 2, sz, sz);
      else if (shape === 'star') {
        for (let s = 0; s < 10; s += 1) {
          const a2 = (s / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = (s % 2 ? sz * 0.42 : sz) / 2;
          if (s === 0) ctx.moveTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
          else ctx.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
        }
      } else { ctx.moveTo(-sz / 2, 0); ctx.lineTo(sz / 2, 0); }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------------------------- لقطات ---------------------------- */
  renderToDataURL(comp, frame, { width = null, height = null, scale = 1, transparent = false } = {}) {
    const w = Math.max(1, Math.round(width || comp.width * scale));
    const h = Math.max(1, Math.round(height || comp.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    this.renderComp(ctx, comp, frame, { width: w, height: h, transparent });
    return c.toDataURL('image/png');
  }

  renderThumbnail(comp, frame, w = 120) {
    const h = Math.round((w * comp.height) / comp.width);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    try {
      this.renderComp(ctx, comp, frame, { width: w, height: h });
      return c.toDataURL('image/jpeg', 0.7);
    } catch (e) { return null; }
  }
}

/* ---------------------------- مصفوفات ---------------------------- */
function mul(m, n) {
  const a = m.a * n.a + m.c * n.b;
  const b = m.b * n.a + m.d * n.b;
  const c = m.a * n.c + m.c * n.d;
  const d = m.b * n.c + m.d * n.d;
  const e = m.a * n.e + m.c * n.f + m.e;
  const f = m.b * n.e + m.d * n.f + m.f;
  m.a = a; m.b = b; m.c = c; m.d = d; m.e = e; m.f = f;
  return m;
}
export const translation = (x, y) => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
export const scaling = (x, y) => ({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
export const rotation = (r) => ({ a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 });

function hash01(x, seed = 0) {
  let h = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
