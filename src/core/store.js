/**
 * المخزن المركزي (Store) — الحالة، التحديد، السجل (Undo/Redo) وكل الأوامر
 */
import { Emitter, deepClone, uid, clamp, debounce, downloadBlob, formatDate } from './util.js';
import {
  createProject, normalizeProject, createComp, createLayer, findComp, findLayer, iterProps,
  makeDefProp, LAYER_TYPES, normalizeLayer, createMarker,
} from './model.js';
import {
  propValueAt, propIsAnimated, propBaseValueAt, setPropValue, setKeyframe, toggleKeyframe,
  removeKeyframe, sortKeys, keyIndexAt, nearestKeyIndex, setKeyEase, offsetKeys,
} from './anim.js';
import { EFFECTS } from './effects.js';

const HISTORY_LIMIT = 120;

export class Store extends Emitter {
  constructor() {
    super();
    this.project = null;
    this.selection = { compId: null, layerIds: [], props: [] };
    this.playhead = 0;
    this.playing = false;
    this.loop = true;
    this.tool = 'select';
    this.viewer = { zoom: 1, resolution: 1, showGuides: true, checkerboard: true, gizmos: true, bgPreview: true };
    this.timeline = { zoom: 14, scrollX: 0, snap: true, graph: false, graphProps: [], height: 0 };
    this.history = { stack: [], index: -1, lastCommit: null };
    this.clipboard = null;
    this.status = 'جاهز';
    this.media = null;
    this.autosaveEnabled = true;
    this.dirty = false;
    this._autosave = debounce(() => this.persistLocal(), 1200);
  }

  /* ============================ الأساسيات ============================ */
  init(project) {
    this.project = project || createProject();
    this.selection = { compId: this.project.activeCompId, layerIds: [], props: [] };
    this.playhead = 0;
    this.playing = false;
    this.history = { stack: [], index: -1, lastCommit: null };
    this.pushHistory('بداية الجلسة', true);
    this.emit('project');
    this.emit('change');
    return this.project;
  }

  get comp() { return findComp(this.project, this.selection.compId) || this.project.comps[0] || null; }
  set comp(c) { if (c) { this.selection.compId = c.id; this.project.activeCompId = c.id; } }

  get fps() { return this.comp?.fps || 30; }
  get duration() { return this.comp?.duration || 300; }
  get width() { return this.comp?.width || 1920; }
  get height() { return this.comp?.height || 1080; }

  setStatus(msg) { this.status = msg; this.emit('status', msg); }

  /* ============================ السجل ============================ */
  snapshot() {
    return JSON.stringify({
      p: this.project,
      sel: this.selection,
      ph: this.playhead,
    });
  }

  pushHistory(label, force = false) {
    const data = this.snapshot();
    const h = this.history;
    if (!force && h.stack[h.index]?.data === data) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push({ label, data, time: Date.now() });
    if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
    h.index = h.stack.length - 1;
    this.emit('history');
    this.dirty = true;
    if (this.autosaveEnabled) this._autosave();
  }

  commit(label, { coalesce = null, ms = 700 } = {}) {
    const h = this.history;
    const last = h.lastCommit;
    const now = Date.now();
    if (coalesce && last && last.coalesce === coalesce && now - last.time < ms && h.index >= 0) {
      h.stack[h.index] = { label, data: this.snapshot(), time: now };
      h.lastCommit = { coalesce, time: now, label };
      this.emit('history');
      this.dirty = true;
      if (this.autosaveEnabled) this._autosave();
      return;
    }
    this.pushHistory(label);
    h.lastCommit = { coalesce, time: now, label };
  }

  applySnapshot(data) {
    const parsed = JSON.parse(data);
    this.project = parsed.p;
    this.selection = parsed.sel;
    this.playhead = parsed.ph ?? 0;
    this.project.activeCompId = this.selection.compId || this.project.activeCompId;
    this.emit('project');
    this.emit('change');
    this.emit('selection');
    this.emit('time');
  }

  undo() {
    const h = this.history;
    if (h.index <= 0) { this.setStatus('لا يوجد ما يمكن التراجع عنه'); return; }
    h.index -= 1;
    this.applySnapshot(h.stack[h.index].data);
    h.lastCommit = null;
    this.setStatus(`تراجع: ${h.stack[h.index + 1]?.label || ''}`);
    this.emit('history');
  }

  redo() {
    const h = this.history;
    if (h.index >= h.stack.length - 1) { this.setStatus('لا يوجد ما يمكن إعادته'); return; }
    h.index += 1;
    this.applySnapshot(h.stack[h.index].data);
    h.lastCommit = null;
    this.setStatus(`إعادة: ${h.stack[h.index].label}`);
    this.emit('history');
  }

  jumpHistory(i) {
    if (i < 0 || i >= this.history.stack.length) return;
    this.history.index = i;
    this.applySnapshot(this.history.stack[i].data);
    this.emit('history');
  }

  canUndo() { return this.history.index > 0; }
  canRedo() { return this.history.index < this.history.stack.length - 1; }

  /* ============================ التحديد ============================ */
  select(ids, { add = false, toggle = false } = {}) {
    ids = [].concat(ids || []).filter(Boolean);
    const cur = new Set(this.selection.layerIds);
    if (add || toggle) {
      ids.forEach((id) => {
        if (toggle && cur.has(id)) cur.delete(id);
        else cur.add(id);
      });
    } else {
      cur.clear();
      ids.forEach((id) => cur.add(id));
    }
    this.selection.layerIds = [...cur];
    this.selection.props = this.selection.props.filter((p) => cur.has(p.split('::')[0]));
    this.emit('selection');
    this.emit('render');
  }

  selectAll() {
    const comp = this.comp;
    if (!comp) return;
    this.select(comp.layers.map((l) => l.id));
  }
  deselectAll() { this.select([]); }
  isSelected(id) { return this.selection.layerIds.includes(id); }
  get primaryLayer() {
    const ids = this.selection.layerIds;
    if (!ids.length) return null;
    return findLayer(this.comp, ids[0]);
  }
  selectedLayers() {
    const comp = this.comp;
    if (!comp) return [];
    return comp.layers.filter((l) => this.selection.layerIds.includes(l.id));
  }
  selectLayer(id, opts) { this.select([id], opts); }

  selectProp(path, { add = false } = {}) {
    const cur = new Set(this.selection.props);
    if (add) { if (cur.has(path)) cur.delete(path); else cur.add(path); } else { cur.clear(); cur.add(path); }
    this.selection.props = [...cur];
    this.emit('selection');
  }
  isPropSelected(path) { return this.selection.props.includes(path); }
  clearPropSelection() { this.selection.props = []; this.emit('selection'); }

  /* ============================ الزمن ============================ */
  setPlayhead(frame, { silent = false } = {}) {
    const f = clamp(Math.round(frame), 0, Math.max(0, this.duration));
    if (f === this.playhead) return;
    this.playhead = f;
    if (!silent) this.emit('time', f);
  }
  setPlaying(v) {
    this.playing = !!v;
    this.emit('playing', this.playing);
  }
  togglePlay() { this.setPlaying(!this.playing); }
  stepFrame(delta) {
    let f = this.playhead + delta;
    const dur = this.duration;
    if (this.loop) f = ((f % (dur + 1)) + dur + 1) % (dur + 1);
    this.setPlayhead(clamp(f, 0, dur));
  }
  gotoStart() { this.setPlayhead(0); }
  gotoEnd() { this.setPlayhead(this.duration); }
  advance(deltaFrames) {
    let f = this.playhead + deltaFrames;
    if (f > this.duration) {
      if (this.loop) f = 0;
      else { f = this.duration; this.setPlaying(false); }
    }
    this.setPlayhead(f);
  }

  /* ============================ التركيبات ============================ */
  addComp(opts = {}) {
    const comp = createComp({ name: opts.name || `تركيبة ${this.project.comps.length + 1}`, ...opts });
    this.project.comps.push(comp);
    this.selection.compId = comp.id;
    this.project.activeCompId = comp.id;
    this.commit('تركيب جديد');
    this.emit('project');
    return comp;
  }

  removeComp(id) {
    if (this.project.comps.length <= 1) { this.setStatus('لا يمكن حذف التركيب الأخير'); return; }
    const used = this.project.comps.some((c) => c.layers.some((l) => l.type === 'precomp' && l.props.compId?.value === id));
    if (used) { this.setStatus('التركيب مستخدم داخل تركيب آخر (تركيب مسبق)'); return; }
    this.project.comps = this.project.comps.filter((c) => c.id !== id);
    if (this.selection.compId === id) {
      this.selection.compId = this.project.comps[0].id;
      this.project.activeCompId = this.selection.compId;
      this.selection.layerIds = [];
    }
    this.commit('حذف تركيب');
    this.emit('project');
  }

  setActiveComp(id) {
    if (!findComp(this.project, id)) return;
    this.selection.compId = id;
    this.project.activeCompId = id;
    this.selection.layerIds = [];
    this.playhead = clamp(this.playhead, 0, this.duration);
    this.commit('تبديل التركيب', { coalesce: 'comp' });
    this.emit('project');
    this.emit('selection');
    this.emit('render');
  }

  updateComp(patch, label = 'إعدادات التركيب') {
    const comp = this.comp;
    if (!comp) return;
    Object.assign(comp, patch);
    comp.duration = Math.max(1, Math.round(comp.duration));
    comp.workArea[1] = Math.min(comp.workArea[1], comp.duration);
    comp.workArea[0] = clamp(comp.workArea[0], 0, comp.duration);
    comp.modified = Date.now();
    this.commit(label, { coalesce: label });
    this.emit('project');
    this.emit('render');
  }

  setWorkArea(start, end) {
    const comp = this.comp;
    comp.workArea = [clamp(Math.round(start), 0, comp.duration), clamp(Math.round(end), 0, comp.duration)];
    this.commit('منطقة العمل', { coalesce: 'workarea' });
    this.emit('comp');
  }

  addMarker(frame, name) {
    const comp = this.comp;
    comp.markers.push(createMarker(Math.round(frame), name));
    comp.markers.sort((a, b) => a.t - b.t);
    this.commit('إضافة علامة');
    this.emit('timeline');
  }
  removeMarkerAt(frame) {
    const comp = this.comp;
    const before = comp.markers.length;
    comp.markers = comp.markers.filter((m) => Math.abs(m.t - frame) > 0);
    if (comp.markers.length !== before) this.commit('حذف علامة');
    this.emit('timeline');
  }

  /* ============================ الطبقات ============================ */
  addLayer(layer, { index = 0, select = true, emit = true } = {}) {
    const comp = this.comp;
    if (!comp) return null;
    if (!(layer instanceof Object)) return null;
    layer.inPoint = clamp(layer.inPoint ?? 0, 0, comp.duration);
    layer.outPoint = clamp(layer.outPoint ?? comp.duration, layer.inPoint + 1, comp.duration);
    comp.layers.splice(clamp(index, 0, comp.layers.length), 0, layer);
    if (select) this.select([layer.id]);
    this.commit(`إضافة طبقة: ${layer.name}`);
    if (emit) { this.emit('timeline'); this.emit('render'); }
    return layer;
  }

  createAndAddLayer(type, opts = {}) { return this.addLayer(createLayer(type, opts), opts); }

  removeLayers(ids) {
    const comp = this.comp;
    const set = new Set([].concat(ids));
    const removed = comp.layers.filter((l) => set.has(l.id));
    if (!removed.length) return;
    comp.layers = comp.layers.filter((l) => !set.has(l.id));
    // إزالة الروابط الأبوية والماسكات المرجعية
    comp.layers.forEach((l) => {
      if (set.has(l.parent)) l.parent = null;
      if (set.has(l.matteLayerId)) { l.matte = 'none'; l.matteLayerId = null; }
    });
    this.select(this.selection.layerIds.filter((id) => !set.has(id)));
    this.commit(`حذف ${removed.length} طبقة`);
    this.emit('timeline');
    this.emit('render');
  }

  rippleDelete(ids = null) {
    const comp = this.comp;
    const targetIds = ids || this.selection.layerIds;
    if (!targetIds || !targetIds.length) return;
    const targets = comp.layers.filter((l) => targetIds.includes(l.id));
    if (!targets.length) return;
    const minIn = Math.min(...targets.map((l) => l.inPoint));
    const maxOut = Math.max(...targets.map((l) => l.outPoint));
    const gap = maxOut - minIn;
    this.removeLayers(targetIds);
    if (gap > 0) {
      comp.layers.forEach((l) => {
        if (l.inPoint >= maxOut) {
          l.inPoint = Math.max(0, l.inPoint - gap);
          l.outPoint = Math.max(l.inPoint + 1, l.outPoint - gap);
          l.startTime = l.startTime - gap;
          iterProps(l).forEach(({ prop }) => {
            if (prop.keys?.length) offsetKeys(prop, -gap);
          });
        }
      });
      this.commit('حذف مع إزاحة (Ripple Delete)');
      this.emit('timeline');
      this.emit('render');
    }
  }

  duplicateLayers(ids) {
    const comp = this.comp;
    const set = new Set([].concat(ids));
    const out = [];
    comp.layers.forEach((l, i) => {
      if (!set.has(l.id)) return;
      const copy = deepClone(l);
      copy.id = uid('lyr');
      copy.name = `${l.name} نسخة`;
      copy.effects.forEach((fx) => { fx.id = uid('fx'); });
      copy.masks.forEach((m) => { m.id = uid('msk'); });
      out.push({ index: i, layer: copy });
    });
    out.reverse().forEach(({ index, layer }) => comp.layers.splice(index, 0, layer));
    this.select(out.map((o) => o.layer.id));
    this.commit(`مضاعفة ${out.length} طبقة`);
    this.emit('timeline');
    this.emit('render');
  }

  reorderLayer(id, newIndex, { commit = true, label = 'ترتيب الطبقات' } = {}) {
    const comp = this.comp;
    const from = comp.layers.findIndex((l) => l.id === id);
    if (from < 0) return;
    const [layer] = comp.layers.splice(from, 1);
    comp.layers.splice(clamp(newIndex, 0, comp.layers.length), 0, layer);
    if (commit) this.commit(label);
    this.emit('timeline');
    this.emit('render');
  }

  moveLayers(ids, targetIndex) {
    const comp = this.comp;
    const set = new Set([].concat(ids));
    const moving = comp.layers.filter((l) => set.has(l.id));
    const rest = comp.layers.filter((l) => !set.has(l.id));
    const idx = clamp(targetIndex, 0, rest.length);
    comp.layers = [...rest.slice(0, idx), ...moving, ...rest.slice(idx)];
    this.commit('نقل الطبقات');
    this.emit('timeline');
    this.emit('render');
  }

  updateLayer(id, patch, label = 'تعديل طبقة', opts = {}) {
    const layer = findLayer(this.comp, id);
    if (!layer) return null;
    Object.assign(layer, patch);
    this.commit(label, opts);
    this.emit('timeline');
    this.emit('render');
    return layer;
  }

  renameLayer(id, name) {
    this.updateLayer(id, { name }, 'إعادة تسمية');
  }

  setLayerFlag(id, flag, value) {
    const layer = findLayer(this.comp, id);
    if (!layer) return;
    layer[flag] = value;
    this.commit(`تبديل ${flag}`, { coalesce: `flag-${id}-${flag}` });
    this.emit('timeline');
    this.emit('render');
  }

  setLayerTime(id, patch) {
    const layer = findLayer(this.comp, id);
    const comp = this.comp;
    if (!layer) return;
    const next = { ...layer, ...patch };
    next.inPoint = clamp(Math.round(next.inPoint), 0, comp.duration - 1);
    next.outPoint = clamp(Math.round(next.outPoint), next.inPoint + 1, comp.duration);
    next.startTime = Math.round(next.startTime);
    Object.assign(layer, { inPoint: next.inPoint, outPoint: next.outPoint, startTime: next.startTime, stretch: next.stretch });
    this.commit('توقيت الطبقة', { coalesce: `time-${id}` });
    this.emit('timeline');
    this.emit('render');
  }

  splitLayersAt(frame, ids = null) {
    const comp = this.comp;
    const targets = comp.layers.filter((l) => (!ids || ids.includes(l.id)) && frame > l.inPoint && frame < l.outPoint);
    if (!targets.length) { this.setStatus('ضع المؤشر داخل الطبقة للتقسيم'); return; }
    targets.forEach((l) => {
      const copy = deepClone(l);
      copy.id = uid('lyr');
      copy.name = `${l.name} (2)`;
      copy.effects.forEach((fx) => { fx.id = uid('fx'); });
      copy.masks.forEach((m) => { m.id = uid('msk'); });
      const localSplit = frame - l.inPoint;
      copy.inPoint = frame;
      copy.outPoint = l.outPoint;
      copy.startTime = l.startTime + localSplit * l.stretch;
      l.outPoint = frame;
      // أزح المفاتيح في النسخة الثانية
      iterProps(copy).forEach(({ path, prop }) => {
        if (prop.keys?.length) offsetKeys(prop, -localSplit * copy.stretch);
      });
      iterProps(l).forEach(({ prop }) => {
        if (prop.keys?.length) {
          prop.keys = prop.keys.filter((k) => k.t <= frame);
          if (!prop.keys.length) prop.keys = [];
        }
      });
      const idx = comp.layers.indexOf(l);
      comp.layers.splice(idx, 0, copy);
    });
    this.commit(`تقسيم عند الإطار ${frame}`);
    this.emit('timeline');
    this.emit('render');
  }

  setParent(id, parentId) {
    const layer = findLayer(this.comp, id);
    if (!layer) return;
    if (id === parentId) return;
    // منع الحلقات
    let p = parentId;
    const seen = new Set();
    while (p && !seen.has(p)) {
      if (p === id) { this.setStatus('لا يمكن ربط الطبقة بنفسها أو بأحد أبنائها'); return; }
      seen.add(p);
      p = findLayer(this.comp, p)?.parent || null;
    }
    layer.parent = parentId || null;
    this.commit('الربط الأبوي');
    this.emit('timeline');
    this.emit('render');
  }

  setBlend(id, mode) { this.updateLayer(id, { blend: mode }, 'نمط الدمج'); }

  setMatte(id, mode, matteLayerId = null) {
    const layer = findLayer(this.comp, id);
    if (!layer) return;
    layer.matte = mode;
    layer.matteLayerId = mode === 'none' ? null : matteLayerId;
    this.commit('القناع (Track Matte)');
    this.emit('timeline');
    this.emit('render');
  }

  precompose(ids, name = 'تركيب مسبق') {
    const comp = this.comp;
    const set = new Set([].concat(ids));
    const layers = comp.layers.filter((l) => set.has(l.id));
    if (!layers.length) return;
    const sub = createComp({
      name,
      width: comp.width,
      height: comp.height,
      fps: comp.fps,
      duration: comp.duration,
      bg: '#00000000',
      transparent: true,
      layers,
    });
    this.project.comps.push(sub);
    const firstIndex = comp.layers.findIndex((l) => set.has(l.id));
    comp.layers = comp.layers.filter((l) => !set.has(l.id));
    const pre = createLayer('precomp', { name, inPoint: 0, outPoint: comp.duration });
    pre.props.compId = { type: 'select', value: sub.id, keys: [], expr: '' };
    comp.layers.splice(clamp(firstIndex, 0, comp.layers.length), 0, pre);
    this.select([pre.id]);
    this.commit('تركيب مسبق');
    this.emit('project');
    this.emit('timeline');
    this.emit('render');
  }

  /* ============================ الخصائص والمفاتيح ============================ */
  resolveProp(layer, path) {
    if (!layer || !path) return null;
    const parts = String(path).split('::')[0].split('.');
    let obj = layer;
    for (const p of parts) {
      if (obj == null) return null;
      if (Array.isArray(obj)) {
        const fx = obj.find((f) => f.id === p);
        if (!fx) return null;
        obj = fx;
        continue;
      }
      obj = obj[p];
      if (obj === undefined) return null;
    }
    return obj;
  }

  getPropValue(layer, path, frame = this.playhead) {
    const prop = this.resolveProp(layer, path);
    if (!prop || typeof prop !== 'object') return undefined;
    if (prop.type) return propValueAt(prop, frame, { fps: this.fps, comp: this.comp, layerName: layer.name });
    return prop;
  }

  setProp(layerId, path, value, { animate, frame = this.playhead, label = 'تعديل خاصية', coalesce } = {}) {
    const layer = findLayer(this.comp, layerId);
    const prop = this.resolveProp(layer, path);
    if (!prop || !prop.type) return;
    setPropValue(prop, frame, value, { animate });
    this.commit(label, { coalesce: coalesce || `${label}-${layerId}-${path}` });
    this.emit('props', { layerId, path });
    this.emit('render');
  }

  toggleKeyframe(layerId, path, frame = this.playhead, ease = 'ease') {
    const layer = findLayer(this.comp, layerId);
    const prop = this.resolveProp(layer, path);
    if (!prop || !prop.type) return;
    if (keyIndexAt(prop, Math.round(frame)) >= 0) {
      removeKeyframe(prop, frame);
      this.commit('حذف مفتاح');
    } else {
      setKeyframe(prop, frame, propBaseValueAt(prop, frame), ease);
      this.commit('إضافة مفتاح');
    }
    this.emit('timeline');
    this.emit('props');
    this.emit('render');
  }

  addKeyframe(layerId, path, frame = this.playhead, ease = 'ease') {
    const layer = findLayer(this.comp, layerId);
    const prop = this.resolveProp(layer, path);
    if (!prop || !prop.type) return;
    setKeyframe(prop, frame, propBaseValueAt(prop, frame), ease);
    this.commit('إضافة مفتاح');
    this.emit('timeline');
    this.emit('props');
    this.emit('render');
  }

  removeKeyframeAt(layerId, path, frame = this.playhead) {
    const layer = findLayer(this.comp, layerId);
    const prop = this.resolveProp(layer, path);
    if (!prop?.keys) return;
    removeKeyframe(prop, frame);
    this.commit('حذف مفتاح');
    this.emit('timeline');
    this.emit('props');
    this.emit('render');
  }

  setKeyEase(layerId, path, frame, ease) {
    const layer = findLayer(this.comp, layerId);
    const prop = this.resolveProp(layer, path);
    if (!prop?.keys) return;
    setKeyEase(prop, frame, ease);
    this.commit('نوع المفتاح');
    this.emit('timeline');
    this.emit('props');
  }

  moveKeyframe(layerId, path, from, to) {
    const layer = findLayer(this.comp, layerId);
    const prop = this.resolveProp(layer, path);
    if (!prop?.keys) return;
    const k = prop.keys.find((x) => x.t === Math.round(from));
    if (!k) return;
    k.t = Math.max(0, Math.round(to));
    sortKeys(prop);
    this.commit('تحريك مفتاح', { coalesce: `kfmove-${layerId}-${path}` });
    this.emit('timeline');
    this.emit('props');
    this.emit('render');
  }

  deleteAnimation(layerId, path) {
    const layer = findLayer(this.comp, layerId);
    const prop = this.resolveProp(layer, path);
    if (!prop?.keys) return;
    prop.value = propBaseValueAt(prop, this.playhead);
    prop.keys = [];
    this.commit('حذف التحريك');
    this.emit('timeline');
    this.emit('props');
    this.emit('render');
  }

  setExpression(layerId, path, expr) {
    const layer = findLayer(this.comp, layerId);
    const prop = this.resolveProp(layer, path);
    if (!prop) return;
    prop.expr = expr || '';
    this.commit('تعبير');
    this.emit('props');
    this.emit('render');
  }

  resetProp(layerId, path) {
    const layer = findLayer(this.comp, layerId);
    const def = makeDefProp({ type: 'number', def: 0 });
    const prop = this.resolveProp(layer, path);
    if (!prop) return;
    if (prop.type === 'vec2') prop.value = { x: 0, y: 0 };
    else if (prop.type === 'number') prop.value = prop.value === 0 ? def.value : 0;
    prop.keys = [];
    this.commit('إعادة الضبط');
    this.emit('props');
    this.emit('render');
  }

  nudgeSelected(dx, dy, { frame = this.playhead, big = false } = {}) {
    const mult = big ? 10 : 1;
    this.selectedLayers().forEach((l) => {
      const pos = l.transform.position;
      const base = propValueAt(pos, frame, { fps: this.fps });
      const v = { x: (base.x || 0) + dx * mult, y: (base.y || 0) + dy * mult };
      setPropValue(pos, frame, v);
    });
    this.commit('تحريك الطبقة', { coalesce: 'nudge' });
    this.emit('props');
    this.emit('render');
  }

  /* ============================ التأثيرات ============================ */
  addEffect(layerId, type, { index = 0 } = {}) {
    const layer = findLayer(this.comp, layerId);
    const def = EFFECTS[type];
    if (!layer || !def) return null;
    const params = {};
    def.params.forEach((p) => { params[p.k] = makeDefProp(p); });
    const fx = { id: uid('fx'), type, name: def.name.ar, enabled: true, params, collapsed: true };
    layer.effects.splice(clamp(index, 0, layer.effects.length), 0, fx);
    this.commit(`إضافة تأثير: ${def.name.ar}`);
    this.emit('timeline');
    this.emit('props');
    this.emit('render');
    return fx;
  }

  removeEffect(layerId, fxId) {
    const layer = findLayer(this.comp, layerId);
    if (!layer) return;
    const fx = layer.effects.find((f) => f.id === fxId);
    layer.effects = layer.effects.filter((f) => f.id !== fxId);
    this.commit(`حذف تأثير ${fx?.name || ''}`);
    this.emit('timeline');
    this.emit('props');
    this.emit('render');
  }

  toggleEffect(layerId, fxId) {
    const layer = findLayer(this.comp, layerId);
    const fx = layer?.effects.find((f) => f.id === fxId);
    if (!fx) return;
    fx.enabled = !fx.enabled;
    this.commit('تفعيل/تعطيل تأثير');
    this.emit('timeline');
    this.emit('props');
    this.emit('render');
  }

  moveEffect(layerId, fxId, dir) {
    const layer = findLayer(this.comp, layerId);
    const i = layer?.effects.findIndex((f) => f.id === fxId) ?? -1;
    if (i < 0) return;
    const j = clamp(i + dir, 0, layer.effects.length - 1);
    if (i === j) return;
    const [fx] = layer.effects.splice(i, 1);
    layer.effects.splice(j, 0, fx);
    this.commit('ترتيب التأثيرات');
    this.emit('props');
    this.emit('render');
  }

  /* ============================ الأقنعة ============================ */
  addMask(layerId, points, mode = 'add') {
    const layer = findLayer(this.comp, layerId);
    if (!layer) return;
    const mask = {
      id: uid('msk'), mode, inverted: false, closed: true, feather: 0, expansion: 0, opacity: 100,
      points: points || defaultMaskPoints(this.width, this.height),
    };
    layer.masks.push(mask);
    this.commit('إضافة قناع');
    this.emit('props');
    this.emit('render');
    return mask;
  }

  removeMask(layerId, maskId) {
    const layer = findLayer(this.comp, layerId);
    if (!layer) return;
    layer.masks = layer.masks.filter((m) => m.id !== maskId);
    this.commit('حذف قناع');
    this.emit('props');
    this.emit('render');
  }

  updateMask(layerId, maskId, patch, { coalesce = null } = {}) {
    const layer = findLayer(this.comp, layerId);
    const mask = layer?.masks.find((m) => m.id === maskId);
    if (!mask) return;
    Object.assign(mask, patch);
    this.commit('تعديل قناع', { coalesce: coalesce || `mask-${maskId}` });
    this.emit('props');
    this.emit('render');
  }

  /* ============================ الأصول ============================ */
  addAsset(meta, { folderId = null } = {}) {
    const asset = {
      id: meta.id || uid('ast'), name: meta.name || 'ملف', kind: meta.kind || 'image',
      fileType: meta.fileType || '', size: meta.size || 0, width: meta.width || 0, height: meta.height || 0,
      durationFrames: meta.durationFrames || 0, fps: meta.fps || 0, hasAudio: !!meta.hasAudio,
      folderId, offline: false, thumb: meta.thumb || null, waveform: meta.waveform || null,
      created: Date.now(),
    };
    this.project.assets.push(asset);
    this.commit('استيراد وسائط', { coalesce: 'import' });
    this.emit('assets');
    return asset;
  }

  createFolder(name) {
    const asset = { id: uid('fld'), name: name || 'مجلد جديد', kind: 'folder', folderId: null, offline: false, created: Date.now() };
    this.project.assets.push(asset);
    this.commit('مجلد جديد');
    this.emit('assets');
    return asset;
  }

  removeAsset(id, { removeUsed = false } = {}) {
    const used = this.project.comps.some((c) => c.layers.some((l) => l.props.assetId?.value === id));
    if (used && !removeUsed) { this.setStatus('الملف مستخدم في تركيبة — احذف الطبقات أولًا'); return; }
    this.project.assets = this.project.assets.filter((a) => a.id !== id && a.folderId !== id);
    this.media?.release(id);
    this.commit('حذف من المشروع');
    this.emit('assets');
    this.emit('render');
  }

  renameAsset(id, name) {
    const a = this.project.assets.find((x) => x.id === id);
    if (!a) return;
    a.name = name;
    this.commit('إعادة تسمية');
    this.emit('assets');
  }

  /* ============================ الحافظة ============================ */
  copySelection() {
    const layers = this.selectedLayers();
    if (!layers.length) return;
    this.clipboard = { layers: deepClone(layers), time: Date.now() };
    this.setStatus(`تم نسخ ${layers.length} طبقة`);
  }

  cutSelection() {
    this.copySelection();
    this.removeLayers(this.selection.layerIds);
  }

  pasteLayers({ offset = 0 } = {}) {
    if (!this.clipboard?.layers?.length) { this.setStatus('الحافظة فارغة'); return; }
    const comp = this.comp;
    const news = this.clipboard.layers.map((l) => {
      const copy = deepClone(l);
      copy.id = uid('lyr');
      copy.name = l.name;
      copy.effects.forEach((fx) => { fx.id = uid('fx'); });
      copy.masks.forEach((m) => { m.id = uid('msk'); });
      copy.inPoint += offset;
      copy.outPoint += offset;
      copy.startTime += offset;
      return copy;
    });
    comp.layers.unshift(...news);
    this.select(news.map((l) => l.id));
    this.commit(`لصق ${news.length} طبقة`);
    this.emit('timeline');
    this.emit('render');
  }

  /* ============================ الحفظ والتحميل ============================ */
  serialize({ pretty = false } = {}) {
    const payload = {
      meta: {
        app: 'Montage Studio', version: this.project.version, saved: Date.now(),
        date: formatDate(),
      },
      project: this.project,
      // بيانات العرض لا تُحفظ داخل المشروع
    };
    return JSON.stringify(payload, (k, v) => (k === 'offline' ? undefined : v), pretty ? 2 : 0);
  }

  loadProject(raw, { resetHistory = true, silent = false } = {}) {
    let obj = raw;
    if (typeof raw === 'string') {
      try { obj = JSON.parse(raw); } catch (e) { this.setStatus('ملف غير صالح'); return false; }
    }
    const project = normalizeProject(obj?.project || obj);
    // ربط الوسائط الموجودة في الجلسة الحالية
    if (this.media) {
      project.assets.forEach((a) => {
        const m = this.media.get(a.id);
        if (m) { a.offline = false; if (!a.thumb && m.thumb) a.thumb = m.thumb; }
      });
    }
    this.project = project;
    this.selection = { compId: project.activeCompId, layerIds: [], props: [] };
    this.playhead = 0;
    this.playing = false;
    if (resetHistory) {
      this.history = { stack: [], index: -1, lastCommit: null };
      this.pushHistory('فتح مشروع', true);
    }
    this.emit('project');
    this.emit('assets');
    this.emit('timeline');
    this.emit('selection');
    this.emit('render');
    if (!silent) this.emit('loaded', project);
    return true;
  }

  newProject(opts = {}) {
    this.loadProject(createProject(opts), { resetHistory: true });
    this.setStatus('مشروع جديد');
  }

  saveToFile() {
    const name = (this.project.name || 'project').replace(/[^\w\u0600-\u06FF-]+/g, '_');
    downloadBlob(new Blob([this.serialize({ pretty: false })], { type: 'application/json' }), `${name}.mgeproj`);
    this.setStatus('تم حفظ ملف المشروع');
    this.dirty = false;
  }

  persistLocal() {
    try {
      localStorage.setItem('ms.autosave', this.serialize());
      localStorage.setItem('ms.autosave.time', String(Date.now()));
      this.emit('autosave');
    } catch (e) { /* تجاهل تجاوز حجم التخزين */ }
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem('ms.autosave');
      if (!raw) return false;
      return this.loadProject(raw, { resetHistory: true, silent: true });
    } catch (e) { return false; }
  }

  clearLocal() { localStorage.removeItem('ms.autosave'); }
}

export function defaultMaskPoints(width, height) {
  const w = width * 0.35, h = height * 0.35;
  const cx = width / 2, cy = height / 2;
  return [
    { x: cx - w, y: cy - h, inX: 0, inY: 0, outX: 0, outY: 0 },
    { x: cx + w, y: cy - h, inX: 0, inY: 0, outX: 0, outY: 0 },
    { x: cx + w, y: cy + h, inX: 0, inY: 0, outX: 0, outY: 0 },
    { x: cx - w, y: cy + h, inX: 0, inY: 0, outX: 0, outY: 0 },
  ];
}
