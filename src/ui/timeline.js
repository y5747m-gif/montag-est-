/**
 * الخط الزمني — رأس الطبقات، القصاصات، المفاتيح، المؤشر، الالتصاق، القوائم
 */
import { el, clear, icon, dragHandler } from './dom.js';
import { clamp, framesToTimecode, timecodeToFrames, LAYER_COLORS, mixColor } from '../core/util.js';
import { propValueAt, propIsAnimated, keyIndexAt, nearestKeyIndex } from '../core/anim.js';
import { iterProps, LAYER_TYPES, SCHEMAS, BLEND_MODES, MATTE_MODES } from '../core/model.js';
import { EFFECTS, EFFECT_CATEGORIES } from '../core/effects.js';
import { showContextMenu } from './menu.js';
import { toast, toastWarn } from './toast.js';
import { colorDialog, promptDialog } from './dialog.js';
import { GraphEditor } from './graphs.js';

export class Timeline {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.zoom = 14;
    this.scrollX = 0;
    this.rowHeight = 30;
    this.rows = [];
    this.selectedKeys = new Set();
    this.dragging = null;
    this.elements = {
      body: document.getElementById('timeline-body'),
      head: document.getElementById('timeline-head'),
      rulerWrap: document.getElementById('tl-ruler-wrap'),
      ruler: document.getElementById('tl-ruler'),
      layers: document.getElementById('tl-layers'),
      tracksWrap: document.getElementById('tl-tracks-wrap'),
      tracks: document.getElementById('tl-tracks'),
      graph: document.getElementById('graph-editor'),
      graphCanvas: document.getElementById('graph-canvas'),
      graphToolbar: document.getElementById('graph-toolbar'),
      info: document.getElementById('tl-info'),
    };
    this.graphEditor = new GraphEditor(this);
    this.bind();
    this.store.on('timeline', () => this.requestRebuild());
    this.store.on('change', () => this.requestRebuild());
    this.store.on('project', () => this.requestRebuild());
    this.store.on('selection', () => { this.requestRebuild(); });
    this.store.on('time', () => this.updatePlayhead());
    this.store.on('assets', () => this.requestRebuild());
    window.addEventListener('resize', () => this.requestRebuild());
  }

  get comp() { return this.store.comp; }
  get fps() { return this.comp?.fps || 30; }
  get duration() { return this.comp?.duration || 300; }

  /* --------------------------- البناء --------------------------- */
  requestRebuild() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this.rebuild();
    });
  }

  rebuild() {
    const comp = this.comp;
    if (!comp) return;
    const { layers, tracks } = this.elements;
    const scrollTop = this.elements.tracksWrap.scrollTop;
    clear(layers);
    clear(tracks);
    tracks.style.width = `${Math.max(this.duration * this.zoom + 200, this.elements.tracksWrap.clientWidth)}px`;
    this.rows = [];
    let y = 0;

    comp.layers.forEach((layer, index) => {
      // صف الطبقة
      const head = this.buildLayerHeader(layer, index);
      head.style.height = `${this.rowHeight}px`;
      layers.appendChild(head);
      const trackRow = el('div', { class: 'tl-row layer-row', dataset: { layer: layer.id }, style: { height: `${this.rowHeight}px` } });
      trackRow.appendChild(this.buildClip(layer, index));
      tracks.appendChild(trackRow);
      this.rows.push({ type: 'layer', layerId: layer.id, y, h: this.rowHeight });
      y += this.rowHeight;

      // صفوف الخصائص عند التوسيع
      if (!layer.collapsed) {
        this.propertyRows(layer).forEach((rowDef) => {
          const h = this.buildPropHeader(layer, rowDef);
          h.style.height = `${rowDef.group ? 24 : 22}px`;
          layers.appendChild(h);
          const tr = el('div', { class: `tl-row prop-row-tl ${rowDef.group ? 'group' : ''}`, dataset: { layer: layer.id, path: rowDef.path || '' }, style: { height: `${rowDef.group ? 24 : 22}px` } });
          if (!rowDef.group && rowDef.prop) tr.appendChild(this.buildKeyRow(layer, rowDef));
          tracks.appendChild(tr);
          this.rows.push({ type: rowDef.group ? 'group' : 'prop', layerId: layer.id, path: rowDef.path, y, h: rowDef.group ? 24 : 22 });
          y += rowDef.group ? 24 : 22;
        });
      }
    });

    // خطوط الشبكة + منطقة العمل + العلامات
    this.drawGridLines(tracks);
    this.elements.tracksWrap.scrollTop = scrollTop;
    this.elements.layers.scrollTop = scrollTop;
    this.scrollX = this.elements.tracksWrap.scrollLeft;
    this.updatePlayhead();
    this.drawRuler();
    this.updateInfo();
    if (this.store.timeline.graph) this.graphEditor.render();
  }

  buildLayerHeader(layer, index) {
    const typeMeta = LAYER_TYPES[layer.type] || LAYER_TYPES.null;
    const head = el('div', {
      class: `layer-head ${this.store.isSelected(layer.id) ? 'selected' : ''} ${layer.shy ? 'shy' : ''}`,
      dataset: { layer: layer.id },
      style: { '--row-h': `${this.rowHeight}px` },
      onclick: (e) => {
        if (e.target.closest('button, input, select, .twirl')) return;
        this.store.select([layer.id], { add: e.shiftKey, toggle: e.shiftKey });
      },
      oncontextmenu: (e) => { e.preventDefault(); this.layerMenu(e, layer); },
      ondblclick: () => this.startRename(head, layer),
    }, [
      el('button', {
        class: 'toggle twirl-btn',
        title: 'إظهار الخصائص',
        onclick: (e) => { e.stopPropagation(); layer.collapsed = !layer.collapsed; this.requestRebuild(); },
      }, [icon('i-chevron', 11)]),
      el('span', { class: 'color-chip', style: { background: layer.color || '#4a9dff' } }),
      el('span', { class: 'num', text: String(index + 1) }),
      el('span', { class: 'lyr-name', text: layer.name, title: `${layer.name} — ${typeMeta.group || ''}` }),
      el('button', { class: `toggle ${layer.solo ? 'solo on' : ''}`, title: 'العزل (Solo)', onclick: (e) => { e.stopPropagation(); this.store.setLayerFlag(layer.id, 'solo', !layer.solo); } }, [icon('i-solo', 12)]),
      el('button', { class: `toggle ${layer.locked ? 'on' : ''}`, title: 'قفل الطبقة', onclick: (e) => { e.stopPropagation(); this.store.setLayerFlag(layer.id, 'locked', !layer.locked); } }, [icon('i-lock', 12)]),
      el('button', { class: `toggle ${layer.enabled ? 'on' : ''}`, title: 'إظهار/إخفاء', onclick: (e) => { e.stopPropagation(); this.store.setLayerFlag(layer.id, 'enabled', !layer.enabled); } }, [icon(layer.enabled ? 'i-eye' : 'i-eye-off', 12)]),
    ]);
    if (layer.type === 'precomp' || layer.type === 'adjustment') {
      head.insertBefore(el('button', {
        class: `toggle ${layer.type === 'adjustment' ? 'on' : ''}`,
        title: 'طبقة ضبط',
        onclick: (e) => { e.stopPropagation(); },
      }, [icon('i-adjust', 12)]), head.children[4]);
    }
    return head;
  }

  startRename(head, layer) {
    const span = head.querySelector('.lyr-name');
    const input = el('input', { value: layer.name });
    span.replaceWith(input);
    input.focus();
    input.select();
    const done = () => {
      const v = input.value.trim() || layer.name;
      input.replaceWith(el('span', { class: 'lyr-name', text: v }));
      if (v !== layer.name) this.store.renameLayer(layer.id, v);
    };
    input.addEventListener('blur', done);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = layer.name; input.blur(); }
    });
  }

  buildClip(layer, index) {
    const z = this.zoom;
    const left = layer.inPoint * z;
    const width = Math.max(6, (layer.outPoint - layer.inPoint) * z);
    const typeClass = `type-${layer.type}`;
    const clip = el('div', {
      class: `clip ${typeClass} ${this.store.isSelected(layer.id) ? 'selected' : ''} ${layer.enabled ? '' : 'hidden-layer'}`,
      style: { left: `${left}px`, width: `${width}px`, background: this.clipBg(layer) },
      dataset: { layer: layer.id },
      oncontextmenu: (e) => { e.preventDefault(); if (!this.store.isSelected(layer.id)) this.store.select([layer.id]); this.clipMenu(e, layer); },
      onpointerdown: (e) => {
        if (e.button !== 0) return;
        if (this.app.tool === 'razor') {
          e.stopPropagation();
          const rect = clip.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickedFrame = Math.round(layer.inPoint + (clickX / z));
          if (clickedFrame > layer.inPoint && clickedFrame < layer.outPoint) {
            this.store.splitLayersAt(clickedFrame, [layer.id]);
            toast(`تم قص "${layer.name}" عند الإطار ${clickedFrame}`, 'ok');
          }
          return;
        }
        if (e.target.classList.contains('clip-edge') || e.target.classList.contains('fade-handle')) return;
        if (!this.store.isSelected(layer.id)) this.store.select([layer.id], { add: e.shiftKey });
        this.startClipDrag(e, layer, 'move');
      },
      ondblclick: () => { this.store.setPlayhead(layer.inPoint); },
    });
    const assetThumb = this.assetThumb(layer);
    if (assetThumb) clip.appendChild(el('div', { style: { position: 'absolute', inset: '0', backgroundImage: `url(${assetThumb})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x', opacity: '0.55', borderRadius: '3px' } }));
    if (layer.type === 'audio' || (layer.type === 'video' && layer.props.assetId?.value && this.app.media.peaks(layer.props.assetId.value))) {
      clip.appendChild(this.buildWaveform(layer, width));
    }
    clip.appendChild(el('span', { class: 'clip-label', text: layer.name }));
    if (layer.effects.length) clip.appendChild(el('span', { class: 'clip-badge', text: `fx ${layer.effects.length}` }));
    if (layer.blend && layer.blend !== 'normal') clip.appendChild(el('span', { class: 'clip-badge', style: { insetInlineEnd: 'auto', insetInlineStart: '3px', top: '14px' }, text: layer.blend }));
    // مقابض القص
    const startEdge = el('div', { class: 'clip-edge start', title: 'قص البداية' });
    const endEdge = el('div', { class: 'clip-edge end', title: 'قص النهاية' });
    startEdge.addEventListener('pointerdown', dragHandler(startEdge, { cursor: 'ew-resize', onStart: () => this.app.beginGesture?.('قص الطبقة'), onMove: (e, g) => this.trim(e, layer, 'start', g.dx), onEnd: () => this.app.endGesture?.() }));
    endEdge.addEventListener('pointerdown', dragHandler(endEdge, { cursor: 'ew-resize', onStart: () => this.app.beginGesture?.('قص الطبقة'), onMove: (e, g) => this.trim(e, layer, 'end', g.dx), onEnd: () => this.app.endGesture?.() }));
    clip.append(startEdge, endEdge);
    // مقبض إضافة تأثير تلاشٍ سريع
    const fadeIn = el('div', { class: 'fade-handle in', title: 'إضافة تأثير تلاشٍ للطبقة' });
    fadeIn.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      const has = layer.effects.some((f) => f.type === 'fade');
      if (!has) {
        this.store.addEffect(layer.id, 'fade');
        toast('تمت إضافة تأثير التلاشي — عدّل مدته من لوحة الخصائص', 'ok');
      } else {
        this.app.focusLayerProps(layer);
      }
    });
    clip.appendChild(fadeIn);
    return clip;
  }

  clipBg(layer) {
    const meta = LAYER_TYPES[layer.type] || LAYER_TYPES.null;
    const base = meta.color;
    return `linear-gradient(180deg, ${mixColor(base, '#ffffff', 0.18)}, ${mixColor(base, '#000000', 0.25)})`;
  }

  assetThumb(layer) {
    const id = layer.props?.assetId?.value;
    if (!id) return null;
    const asset = this.store.project.assets.find((a) => a.id === id);
    return this.app.media.thumb(id) || asset?.thumb || null;
  }

  buildWaveform(layer, width) {
    const id = layer.props.assetId?.value;
    const peaks = this.app.media.peaks(id);
    const canvas = el('canvas', { width: String(Math.max(2, Math.round(width))), height: '18', style: { opacity: '.85' } });
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (peaks && peaks.length) {
      const totalFrames = this.app.media.get(id)?.duration * this.fps || 1;
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += 1) {
        const p = Math.max(0, Math.min(peaks.length - 1, Math.floor((x / canvas.width) * (totalFrames / Math.max(1, layer.outPoint - layer.inPoint)) * peaks.length)));
        const v = (peaks[p] || 0) * 8;
        ctx.moveTo(x + 0.5, 9 - v);
        ctx.lineTo(x + 0.5, 9 + v);
      }
      ctx.stroke();
    }
    return canvas;
  }

  /** صفوف الخصائص داخل الخط الزمني */
  propertyRows(layer) {
    const rows = [];
    rows.push({ group: true, label: 'التحويل', iconName: 'i-transform' });
    const transform = layer.transform;
    const transformLabels = {
      anchor: 'نقطة الارتكاز', position: 'الموضع', scale: 'المقياس', rotation: 'الدوران',
      opacity: 'الشفافية', skew: 'الانحراف', skewAxis: 'محور الانحراف',
    };
    Object.keys(transformLabels).forEach((k) => {
      if (transform[k]) rows.push({ group: false, label: transformLabels[k], path: `transform.${k}`, prop: transform[k] });
    });
    const schema = SCHEMAS[layer.type] || [];
    schema.forEach((grp) => {
      rows.push({ group: true, label: grp.label.ar });
      grp.props.forEach((p) => {
        if (['text', 'bool', 'select', 'font', 'asset', 'comp'].includes(p.type)) return;
        const prop = layer.props[p.k];
        if (!prop) return;
        rows.push({ group: false, label: p.label.ar, path: `props.${p.k}`, prop });
      });
    });
    if (layer.effects.length) {
      rows.push({ group: true, label: 'التأثيرات', iconName: 'i-effects' });
      layer.effects.forEach((fx) => {
        rows.push({ group: true, label: fx.name || fx.type, fxId: fx.id, enabled: fx.enabled });
        const def = EFFECTS[fx.type];
        def?.params.forEach((p) => {
          const prop = fx.params[p.k];
          if (!prop || !prop.type) return;
          rows.push({ group: false, label: p.label.ar, path: `effects.${fx.id}.${p.k}`, prop, fxId: fx.id, visible: !fx.collapsed });
        });
      });
    }
    if (layer.masks.length) {
      rows.push({ group: true, label: 'الأقنعة' });
      layer.masks.forEach((m, i) => {
        rows.push({ group: false, label: `قناع ${i + 1} (${m.mode})`, path: `mask.${m.id}`, prop: null, maskId: m.id });
      });
    }
    return rows;
  }

  buildPropHeader(layer, row) {
    if (row.group) {
      const head = el('div', {
        class: 'tl-prop group-head-inline',
        style: { background: 'var(--bg-2)', fontWeight: '700', color: 'var(--txt-0)', paddingInlineStart: '10px', height: '24px' },
        onclick: (e) => {
          if (row.fxId) {
            const fx = layer.effects.find((f) => f.id === row.fxId);
            if (fx) { fx.collapsed = !fx.collapsed; this.requestRebuild(); }
          }
          e.stopPropagation();
        },
      }, [
        el('span', { class: 'tl-prop-name', text: row.label }),
        row.fxId ? el('button', {
          class: `tb-btn ghost sm`,
          title: 'تفعيل/تعطيل التأثير',
          onclick: (e) => { e.stopPropagation(); this.store.toggleEffect(layer.id, row.fxId); },
        }, [icon(row.enabled ? 'i-eye' : 'i-eye-off', 12)]) : null,
      ]);
      return head;
    }
    const prop = row.prop;
    const animated = prop ? propIsAnimated(prop) : false;
    const path = row.path;
    const valueText = prop ? this.propValueText(layer, prop, path) : '';
    const head = el('div', { class: 'tl-prop', dataset: { layer: layer.id, path } }, [
      el('span', { class: 'tl-prop-name', text: row.label }),
      el('span', { class: 'mini-value', text: valueText }),
      prop ? el('button', {
        class: `stopwatch ${animated ? 'on' : ''}`,
        title: 'مؤقّت المفاتيح (إضافة مفتاح أول)',
        style: { marginInlineStart: '4px' },
        onclick: (e) => {
          e.stopPropagation();
          if (!animated) this.store.toggleKeyframe(layer.id, path);
          else this.store.deleteAnimation(layer.id, path);
        },
      }, [icon('i-stopwatch', 12)]) : null,
    ]);
    return head;
  }

  propValueText(layer, prop, path) {
    const v = propValueAt(prop, this.store.playhead, { fps: this.fps });
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
    if (v && typeof v === 'object') return `${Math.round(v.x)}, ${Math.round(v.y)}`;
    return String(v);
  }

  buildKeyRow(layer, row) {
    const z = this.zoom;
    const wrapper = el('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    const prop = row.prop;
    if (!prop?.keys?.length) {
      if (prop?.expr) wrapper.appendChild(el('span', { class: 'mini-value', style: { position: 'absolute', insetInlineStart: '8px' }, text: 'تعبير مخفي' }));
      return wrapper;
    }
    // ملخص المفاتيح في صف الطبقة
    prop.keys.forEach((k) => {
      wrapper.appendChild(el('div', {
        class: 'kf',
        style: { left: `${k.t * z + 3}px`, top: '50%', pointerEvents: 'auto', background: k.i === 'hold' ? '#ffd479' : (k.i === 'linear' ? '#ffb02e' : '#34d3d3') },
        dataset: { layer: layer.id, path: row.path, t: String(k.t) },
        title: `إطار ${k.t}`,
        onpointerdown: (e) => this.startKeyDrag(e, layer, row.path, k),
        oncontextmenu: (e) => { e.preventDefault(); this.keyMenu(e, layer, row.path, k); },
        ondblclick: () => this.store.setPlayhead(k.t),
      }));
    });
    return wrapper;
  }

  drawGridLines(tracks) {
    const comp = this.comp;
    const z = this.zoom;
    const stepFrames = this.gridStep();
    for (let f = 0; f <= comp.duration; f += stepFrames) {
      tracks.appendChild(el('div', { class: 'tl-grid-line', style: { left: `${f * z}px` } }));
    }
    // منطقة العمل
    tracks.appendChild(el('div', {
      class: 'tl-workarea',
      style: { left: `${comp.workArea[0] * z}px`, width: `${Math.max(2, (comp.workArea[1] - comp.workArea[0]) * z)}px`, top: '0', height: '100%', background: 'rgba(74,157,255,.06)' },
    }));
    comp.markers.forEach((m) => {
      tracks.appendChild(el('div', { class: 'tl-marker', style: { left: `${m.t * z}px` }, title: m.name }));
    });
  }

  gridStep() {
    const z = this.zoom;
    const targetPx = 90;
    const fps = this.fps;
    const candidates = [1, 2, 5, 10, Math.round(fps / 2), fps, fps * 2, fps * 5, fps * 10, fps * 30, fps * 60];
    return candidates.find((c) => c * z >= targetPx) || fps * 60;
  }

  updatePlayhead() {
    const z = this.zoom;
    const x = this.store.playhead * z;
    const { tracks, rulerWrap, layers } = this.elements;
    [tracks, rulerWrap].forEach((host) => {
      if (!host) return;
      let ph = host.querySelector('.tl-playhead');
      if (!ph) { ph = el('div', { class: 'tl-playhead' }); host.appendChild(ph); }
      ph.style.left = `${host === rulerWrap ? x - this.scrollX : x}px`;
    });
    this.updateInfo();
    if (this.store.timeline.graph) this.graphEditor.render();
  }

  updateInfo() {
    const comp = this.comp;
    if (!this.elements.info || !comp) return;
    const sel = this.store.selection.layerIds.length;
    this.elements.info.textContent = `الإطار ${Math.round(this.store.playhead)} / ${comp.duration} · ${framesToTimecode(this.store.playhead, comp.fps)} · طبقات محدّدة: ${sel}`;
  }

  /* --------------------------- الرأس (الرولر) --------------------------- */
  drawRuler() {
    const canvas = this.elements.ruler;
    if (!canvas) return;
    const wrap = this.elements.rulerWrap;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, wrap.clientWidth);
    const h = wrap.clientHeight || 28;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.width = `${Math.max(w + this.scrollX, this.duration * this.zoom + 40)}px`;
    canvas.style.marginInlineStart = `${-this.scrollX}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#212328';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const z = this.zoom;
    const step = this.gridStep();
    const minor = Math.max(1, Math.round(step / 5));
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.fillStyle = '#8b919b';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    for (let f = 0; f <= this.duration + step; f += minor) {
      const x = f * z;
      if (x > w + this.scrollX + 60) break;
      const major = f % step === 0;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, major ? 8 : 18);
      ctx.lineTo(x + 0.5, h);
      ctx.strokeStyle = major ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.1)';
      ctx.stroke();
      if (major) ctx.fillText(framesToTimecode(f, this.fps), x + 3, 2);
    }
    // منطقة العمل
    const [wa0, wa1] = this.comp.workArea;
    ctx.fillStyle = 'rgba(74,157,255,.22)';
    ctx.fillRect(wa0 * z, 0, (wa1 - wa0) * z, 7);
    // العلامات
    this.comp.markers.forEach((m) => {
      ctx.fillStyle = m.color || '#38c172';
      ctx.beginPath();
      ctx.moveTo(m.t * z, 0);
      ctx.lineTo(m.t * z + 7, 0);
      ctx.lineTo(m.t * z + 3.5, 8);
      ctx.closePath();
      ctx.fill();
    });
    this.updatePlayhead();
  }

  bind() {
    const { rulerWrap, tracksWrap, layers, body } = this.elements;
    // التمرير
    tracksWrap.addEventListener('scroll', () => {
      this.scrollX = tracksWrap.scrollLeft;
      layers.scrollTop = tracksWrap.scrollTop;
      this.drawRuler();
      this.updatePlayhead();
    });
    layers.addEventListener('scroll', () => {
      tracksWrap.scrollTop = layers.scrollTop;
    });
    // النقر على الرولر للتنقل
    const scrub = (e) => {
      const rect = this.elements.ruler.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const f = clamp(Math.round(x / this.zoom), 0, this.duration);
      this.store.setPlayhead(f);
    };
    const startScrub = (e) => {
      if (e.button !== 0) return;
      this.store.setPlaying(false);
      this.app.viewer?.stop();
      scrub(e);
      const move = (ev) => scrub(ev);
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    rulerWrap.addEventListener('pointerdown', startScrub);
    rulerWrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = this.elements.ruler.getBoundingClientRect();
      const f = clamp(Math.round((e.clientX - rect.left) / this.zoom), 0, this.duration);
      const existing = this.comp.markers.find((m) => Math.abs(m.t - f) < 3);
      showContextMenu([
        { label: 'إضافة علامة هنا', icon: 'i-diamond', action: async () => { const n = await promptDialog({ title: 'علامة جديدة', label: 'اسم العلامة', value: 'علامة' }); if (n != null) this.store.addMarker(f, n || 'علامة'); } },
        { label: 'حذف أقرب علامة', disabled: !existing, action: () => this.store.removeMarkerAt(existing.t) },
        { type: 'sep' },
        { label: 'تحديد منطقة العمل من البداية', action: () => this.store.setWorkArea(f, this.comp.workArea[1]) },
        { label: 'تحديد منطقة العمل إلى النهاية', action: () => this.store.setWorkArea(this.comp.workArea[0], f) },
        { label: 'إعادة ضبط منطقة العمل', action: () => this.store.setWorkArea(0, this.comp.duration) },
        { type: 'sep' },
        { label: 'تصغير / تكبير', action: () => this.setZoom(this.zoom > 20 ? 14 : 30) },
      ], { x: e.clientX, y: e.clientY });
    });
    // النقر الأوسط أو المسافة للتحريك الأفقي
    tracksWrap.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const dir = e.deltaY > 0 ? -1 : 1;
        this.setZoom(this.zoom * (1 + dir * 0.15));
      } else if (e.shiftKey) {
        e.preventDefault();
        tracksWrap.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    // إفلات الوسائط على الخط الزمني
    body.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-ms-asset') || e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    body.addEventListener('drop', (e) => {
      const assetId = e.dataTransfer.getData('application/x-ms-asset');
      const asset = this.store.project.assets.find((a) => a.id === assetId);
      const rect = this.elements.ruler.getBoundingClientRect();
      const frame = clamp(Math.round((e.clientX - rect.left + this.scrollX) / this.zoom), 0, this.duration);
      if (asset) {
        e.preventDefault();
        this.app.addAssetLayer(asset, frame);
      } else if (e.dataTransfer.files?.length) {
        e.preventDefault();
        this.app.importFiles([...e.dataTransfer.files], { atFrame: frame });
      }
    });
    // إفلات طبقة لإعادة الترتيب
    layers.addEventListener('dragover', (e) => e.preventDefault());
  }

  setZoom(z) {
    this.zoom = clamp(z, 1, 120);
    const slider = document.getElementById('tl-zoom');
    if (slider) slider.value = String(this.zoom);
    this.store.timeline.zoom = this.zoom;
    this.rebuild();
    this.app.updateStatusStats?.();
  }

  fitView() {
    const comp = this.comp;
    const w = this.elements.tracksWrap.clientWidth - 20;
    this.setZoom(clamp(w / Math.max(1, comp.duration), 1, 120));
    this.elements.tracksWrap.scrollLeft = 0;
  }

  scrollToFrame(frame) {
    const z = this.zoom;
    const wrap = this.elements.tracksWrap;
    const x = frame * z;
    if (x < wrap.scrollLeft || x > wrap.scrollLeft + wrap.clientWidth - 40) {
      wrap.scrollLeft = Math.max(0, x - wrap.clientWidth / 2);
    }
  }

  /* --------------------------- السحب والتحرير --------------------------- */
  startClipDrag(e, layer, mode) {
    const comp = this.comp;
    const startFrame = this.store.playhead;
    const moving = this.store.selectedLayers().length > 1 ? this.store.selectedLayers() : [layer];
    const original = moving.map((l) => ({ id: l.id, inPoint: l.inPoint, outPoint: l.outPoint, startTime: l.startTime }));
    const rect = this.elements.ruler.getBoundingClientRect();
    const startX = e.clientX;
    this.app.beginGesture?.('تحريك الطبقة');
    const move = (ev) => {
      const deltaFrames = Math.round((ev.clientX - startX) / this.zoom);
      let snapInfo = null;
      moving.forEach((l) => {
        const o = original.find((x) => x.id === l.id);
        let inP = clamp(o.inPoint + deltaFrames, 0, comp.duration - 1);
        let outP = clamp(o.outPoint + deltaFrames, inP + 1, comp.duration);
        if (this.store.timeline.snap) {
          const snapped = this.snapFrame([inP, outP], ev.clientX);
          if (snapped != null) {
            const diff = snapped - (Math.abs(snapped - inP) <= Math.abs(snapped - outP) ? inP : outP);
            inP = clamp(inP + diff, 0, comp.duration - 1);
            outP = clamp(outP + diff, inP + 1, comp.duration);
            snapInfo = snapped;
          }
        }
        l.inPoint = inP;
        l.outPoint = outP;
      });
      this.showSnapLine(snapInfo);
      this.requestRebuild();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.hideSnapLine();
      this.store.commit('تحريك الطبقات');
      this.app.endGesture?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  trim(e, layer, edge, dx) {
    const deltaFrames = Math.round(dx / this.zoom);
    const comp = this.comp;
    if (edge === 'start') {
      const newIn = clamp(layer.inPoint + deltaFrames, 0, layer.outPoint - 1);
      const change = newIn - layer.inPoint;
      layer.inPoint = newIn;
      layer.startTime += change * layer.stretch;
    } else {
      layer.outPoint = clamp(layer.outPoint + deltaFrames, layer.inPoint + 1, comp.duration);
    }
    this.requestRebuild();
  }

  snapFrame(frames, clientX) {
    const comp = this.comp;
    const z = this.zoom;
    const tolerance = 8 / z;
    const rect = this.elements.ruler.getBoundingClientRect();
    const cursorFrame = (clientX - rect.left + this.scrollX) / z;
    const candidates = [0, comp.duration, this.store.playhead, comp.workArea[0], comp.workArea[1]];
    comp.markers.forEach((m) => candidates.push(m.t));
    comp.layers.forEach((l) => { candidates.push(l.inPoint); candidates.push(l.outPoint); });
    comp.layers.forEach((l) => {
      iterProps(l).forEach(({ prop }) => {
        prop.keys?.forEach((k) => { if (Math.abs(k.t - cursorFrame) < tolerance) candidates.push(k.t); });
      });
    });
    for (const c of candidates) {
      if (Math.abs(c - cursorFrame) < tolerance) return c;
    }
    return null;
  }

  showSnapLine(frame) {
    if (frame == null) return this.hideSnapLine();
    if (!this._snapLine) {
      this._snapLine = el('div', { class: 'tl-snap-line' });
      this.elements.tracks.appendChild(this._snapLine);
    }
    this._snapLine.style.left = `${frame * this.zoom}px`;
    this._snapLine.style.display = 'block';
  }

  hideSnapLine() {
    if (this._snapLine) this._snapLine.style.display = 'none';
  }

  startKeyDrag(e, layer, path, key) {
    const prop = this.store.resolveProp(layer, path);
    if (!prop) return;
    const startX = e.clientX, startY = e.clientY;
    const startT = key.t, startV = key.v;
    this.app.beginGesture?.('تحريك مفتاح');
    let moved = false;
    const move = (ev) => {
      moved = true;
      const dFrames = Math.round((ev.clientX - startX) / this.zoom);
      const newT = Math.max(0, Math.round(startT + dFrames));
      key.t = newT;
      prop.keys.sort((a, b) => a.t - b.t);
      this.requestRebuild();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) this.store.commit('تحريك مفتاح');
      this.app.endGesture?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* --------------------------- القوائم --------------------------- */
  layerMenu(e, layer) {
    if (!this.store.isSelected(layer.id)) this.store.select([layer.id]);
    const items = [
      { label: 'إعادة تسمية', icon: 'i-text', action: () => { const head = this.elements.layers.querySelector(`[data-layer="${layer.id}"]`); if (head) this.startRename(head, layer); } },
      { label: 'مضاعفة', icon: 'i-copy', shortcut: 'Ctrl+D', action: () => this.store.duplicateLayers([layer.id]) },
      { label: 'تقسيم عند المؤشر', icon: 'i-razor', shortcut: 'Ctrl+Shift+D', action: () => this.store.splitLayersAt(this.store.playhead, this.store.selection.layerIds.length ? this.store.selection.layerIds : [layer.id]) },
      { label: 'حذف', icon: 'i-trash', shortcut: 'Del', action: () => this.store.removeLayers([layer.id]) },
      { label: 'حذف مع إزاحة (Ripple Delete)', icon: 'i-trash', shortcut: 'Shift+Del', action: () => this.store.rippleDelete([layer.id]) },
      { type: 'sep' },
      {
        label: 'نمط الدمج',
        submenu: BLEND_MODES.map(([m, label]) => ({ label, checked: layer.blend === m, action: () => this.store.setBlend(layer.id, m) })),
      },
      {
        label: 'قناع الطبقة (Track Matte)',
        submenu: [
          ...MATTE_MODES.map(([m, label]) => ({ label, checked: layer.matte === m, action: () => this.store.setMatte(layer.id, m) })),
          { type: 'sep' },
          { label: 'استخدام الطبقة التي فوقها', action: () => this.store.setMatte(layer.id, layer.matte === 'none' ? 'alpha' : layer.matte, null) },
        ],
      },
      {
        label: 'الربط الأبوي',
        submenu: [
          { label: 'بدون', checked: !layer.parent, action: () => this.store.setParent(layer.id, null) },
          ...this.comp.layers.filter((l) => l.id !== layer.id).map((l) => ({ label: l.name, checked: layer.parent === l.id, action: () => this.store.setParent(layer.id, l.id) })),
        ],
      },
      {
        label: 'إضافة تأثير',
        icon: 'i-effects',
        submenu: EFFECT_CATEGORIES.map((cat) => ({
          label: cat.ar,
          submenu: Object.values(EFFECTS).filter((fx) => fx.cat === cat.key).map((fx) => ({
            label: fx.name.ar,
            action: () => this.store.addEffect(layer.id, fx.id),
          })),
        })),
      },
      { label: 'إضافة قناع مستطيل', icon: 'i-mask', action: () => this.store.addMask(layer.id) },
      { label: 'تركيب مسبق (Pre-compose)', icon: 'i-comp', action: () => this.store.precompose(this.store.selection.layerIds.length ? this.store.selection.layerIds : [layer.id], layer.name) },
      { type: 'sep' },
      { label: 'لون الطبقة…', icon: 'i-solid', action: async () => { const c = await colorDialog(layer.color || '#4a9dff'); if (c) this.store.updateLayer(layer.id, { color: c }, 'لون الطبقة'); } },
      { label: 'خصائص الطبقة', icon: 'i-settings', action: () => this.app.focusLayerProps(layer) },
      { type: 'sep' },
      {
        label: 'الوقت',
        submenu: [
          { label: 'البداية عند المؤشر ([)', action: () => this.store.setLayerTime(layer.id, { inPoint: this.store.playhead, startTime: layer.startTime }) },
          { label: 'النهاية عند المؤشر (])', action: () => this.store.setLayerTime(layer.id, { outPoint: this.store.playhead }) },
          { label: 'قصّ البداية (Alt+[)', action: () => this.store.setLayerTime(layer.id, { inPoint: this.store.playhead, startTime: layer.startTime + (this.store.playhead - layer.inPoint) }) },
          { label: 'قصّ النهاية (Alt+])', action: () => this.store.setLayerTime(layer.id, { outPoint: this.store.playhead }) },
          { label: 'تمديد إلى كامل التركيب', action: () => this.store.setLayerTime(layer.id, { inPoint: 0, outPoint: this.comp.duration }) },
        ],
      },
    ];
    showContextMenu(items, { x: e.clientX, y: e.clientY });
  }

  clipMenu(e, layer) {
    this.layerMenu(e, layer);
  }

  keyMenu(e, layer, path, key) {
    const prop = this.store.resolveProp(layer, path);
    const items = [
      { label: 'القيمة الحالية', type: 'title' },
      ...['linear', 'ease', 'easeIn', 'easeOut', 'hold', 'bounceOut', 'elasticOut', 'backOut'].map((kind) => ({
        label: { linear: 'خطي', ease: 'ناعم (Ease)', easeIn: 'دخول ناعم', easeOut: 'خروج ناعم', hold: 'ثابت (Hold)', bounceOut: 'ارتداد', elasticOut: 'مرن', backOut: 'رجوع' }[kind],
        checked: key.i === ({ linear: 'linear', hold: 'hold', bounceOut: 'bounce', elasticOut: 'elastic', backOut: 'back' }[kind] || 'bezier'),
        action: () => this.store.setKeyEase(layer.id, path, key.t, kind),
      })),
      { type: 'sep' },
      { label: 'الانتقال إلى المفتاح', icon: 'i-diamond', action: () => this.store.setPlayhead(key.t) },
      { label: 'حذف المفتاح', icon: 'i-trash', action: () => this.store.removeKeyframeAt(layer.id, path, key.t) },
      { label: 'حذف كل التحريك', action: () => this.store.deleteAnimation(layer.id, path) },
      { type: 'sep' },
      { label: 'إضافة تعبير…', icon: 'i-effects', action: async () => {
        const v = await promptDialog({ title: 'تعبير', label: 'التعبير (Expression)', value: prop?.expr || '', hint: 'مثال: wiggle(2, 40) أو value * 1.2 أو time * 100', multiline: true });
        if (v != null) this.store.setExpression(layer.id, path, v);
      } },
    ];
    showContextMenu(items, { x: e.clientX, y: e.clientY });
  }

  /* --------------------------- واجهة الرأس --------------------------- */
  showGraphMode(on) {
    this.store.timeline.graph = on;
    this.elements.graph.hidden = !on;
    document.getElementById('tab-timeline')?.classList.toggle('active', !on);
    document.getElementById('tab-graph')?.classList.toggle('active', on);
    if (on) this.graphEditor.mount();
    else this.rebuild();
  }

  addLayerMenu() {
    const groups = [
      { label: 'طبقات أساسية', items: [['text', 'نص'], ['shape', 'شكل'], ['solid', 'خلفية صلبة'], ['adjustment', 'طبقة ضبط'], ['null', 'كائن فارغ']] },
      { label: 'توليد', items: [['particles', 'جزيئات'], ['visualizer', 'موجّه صوتي'], ['light', 'إضاءة']] },
      { label: 'ثلاثي الأبعاد', items: [['camera', 'كاميرا']] },
    ];
    showContextMenu([
      { type: 'title', label: 'طبقة جديدة' },
      ...groups.flatMap((g) => g.items.map(([type, label]) => ({
        label,
        icon: LAYER_TYPES[type]?.icon,
        action: () => this.app.createLayerOfType(type, { inPoint: this.store.playhead }),
      }))),
      { type: 'sep' },
      { label: 'من الوسائط المحدّدة', action: () => this.app.addSelectedAssetAsLayer(this.store.playhead) },
    ], { anchorEl: document.querySelector('[data-tl-action="add-layer"]'), prefer: 'top-start' });
  }
}

