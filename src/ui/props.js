/**
 * لوحة الخصائص — التحويل، خصائص النوع، التأثيرات، الأقنعة، التعبيرات
 */
import { el, clear, icon, dragHandler } from './dom.js';
import { clamp, fmtNum, round } from '../core/util.js';
import { propValueAt, propIsAnimated, keyIndexAt, nearestKeyIndex } from '../core/anim.js';
import { SCHEMAS, BLEND_MODES, MATTE_MODES, FONTS, LAYER_TYPES, PropType } from '../core/model.js';
import { EFFECTS, EFFECT_CATEGORIES } from '../core/effects.js';
import { showContextMenu } from './menu.js';
import { toast } from './toast.js';
import { colorDialog, promptDialog } from './dialog.js';

export class PropsPanel {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.root = document.getElementById('props-body');
    this.expanded = new Set(['transform']);
    this.store.on('selection', () => this.requestRender());
    this.store.on('change', () => this.requestRender());
    this.store.on('props', () => this.requestRender());
    this.store.on('project', () => this.requestRender());
    this.store.on('time', () => this.requestRender());
    this._pending = false;
  }

  requestRender() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this.render();
    });
  }

  render() {
    const root = this.root;
    if (!root) return;
    const scrollTop = root.scrollTop;
    clear(root);
    const layer = this.store.primaryLayer;
    if (!layer) {
      this.renderCompSettings(root);
    } else {
      this.renderLayer(root, layer);
    }
    root.scrollTop = scrollTop;
  }

  /* --------------------------- إعدادات التركيب --------------------------- */
  renderCompSettings(root) {
    const comp = this.store.comp;
    if (!comp) return;
    root.appendChild(el('div', { class: 'group-head' }, [icon('i-comp', 12), el('span', { text: comp.name }), el('span', { class: 'grow' }), el('span', { class: 'tag', text: 'إعدادات التركيب' })]));
    const wrap = el('div', { style: { padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' } });
    const field = (label, input) => el('label', { class: 'form-field' }, [el('span', { text: label }), input]);
    wrap.append(
      field('الاسم', el('input', {
        type: 'text', value: comp.name,
        onchange: (e) => this.store.updateComp({ name: e.target.value }, 'اسم التركيب'),
      })),
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
        field('العرض', el('input', { type: 'number', value: comp.width, min: 16, max: 8192, onchange: (e) => this.store.updateComp({ width: clamp(+e.target.value || 1920, 16, 8192) }) })),
        field('الارتفاع', el('input', { type: 'number', value: comp.height, min: 16, max: 8192, onchange: (e) => this.store.updateComp({ height: clamp(+e.target.value || 1080, 16, 8192) }) })),
      ]),
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
        field('معدل الإطارات', el('input', { type: 'number', value: comp.fps, min: 1, max: 120, onchange: (e) => this.store.updateComp({ fps: clamp(+e.target.value || 30, 1, 120) }) })),
        field('المدة (إطارات)', el('input', { type: 'number', value: comp.duration, min: 1, max: 100000, onchange: (e) => this.store.updateComp({ duration: clamp(+e.target.value || 300, 1, 100000) }) })),
      ]),
      field('لون الخلفية', el('input', { type: 'color', value: comp.bg, oninput: (e) => this.store.updateComp({ bg: e.target.value }, 'لون الخلفية') })),
      el('label', { class: 'check-row' }, [
        el('input', { type: 'checkbox', checked: comp.transparent, onchange: (e) => this.store.updateComp({ transparent: e.target.checked }, 'خلفية شفافة') }),
        el('span', { text: 'خلفية شفافة (بدون تعبئة)' }),
      ]),
      el('div', { class: 'form-hint', text: 'حدّد طبقة في الخط الزمني لعرض خصائصها الكاملة (التحويل، التأثيرات، الأقنعة).' }),
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' } }, [
        el('button', { class: 'btn sm', onclick: () => this.app.newComposition(), text: 'تركيب جديد' }),
        el('button', { class: 'btn sm', onclick: () => this.app.exportDialog(), text: 'تصدير' }),
      ]),
    );
    root.appendChild(wrap);
  }

  /* --------------------------- لوحة الطبقة --------------------------- */
  renderLayer(root, layer) {
    const multi = this.store.selection.layerIds.length > 1;
    const meta = LAYER_TYPES[layer.type] || LAYER_TYPES.null;
    // رأس الطابعة
    root.appendChild(el('div', { class: 'prop-toolbar' }, [
      el('span', { class: 'layer-color-chip', style: { background: layer.color || '#4a9dff' } }),
      el('span', { class: 'who' }, [
        el('span', { text: layer.name }),
        multi ? el('span', { class: 'sub', text: ` +${this.store.selection.layerIds.length - 1}` }) : null,
        el('span', { class: 'sub', text: ` · ${meta.icon === 'i-text' ? 'نص' : layer.type}` }),
      ]),
      el('button', { class: 'tb-btn ghost sm', title: 'تأثيرات', onclick: () => this.scrollToGroup('effects') }, [icon('i-effects', 13)]),
      el('button', { class: 'tb-btn ghost sm', title: 'قناع جديد', onclick: () => this.store.addMask(layer.id) }, [icon('i-mask', 13)]),
      el('button', { class: 'tb-btn ghost sm', title: 'خيارات الطبقة', onclick: (e) => this.layerMenu(e, layer) }, [icon('i-chevron', 13)]),
    ]));

    // دمج/قناع/أب
    const selects = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', padding: '6px' } }, [
      el('label', { class: 'form-field' }, [
        el('span', { text: 'نمط الدمج' }),
        el('select', { class: 'prop-select', onchange: (e) => this.store.setBlend(layer.id, e.target.value) },
          BLEND_MODES.map(([v, l]) => el('option', { value: v, text: l, selected: layer.blend === v }))),
      ]),
      el('label', { class: 'form-field' }, [
        el('span', { text: 'القناع (Matte)' }),
        el('select', { class: 'prop-select', onchange: (e) => this.store.setMatte(layer.id, e.target.value) },
          MATTE_MODES.map(([v, l]) => el('option', { value: v, text: l, selected: layer.matte === v }))),
      ]),
      el('label', { class: 'form-field' }, [
        el('span', { text: 'الأب (Parent)' }),
        el('select', {
          class: 'prop-select',
          onchange: (e) => this.store.setParent(layer.id, e.target.value || null),
        }, [
          el('option', { value: '', text: 'بدون' }),
          ...this.store.comp.layers.filter((l) => l.id !== layer.id).map((l) => el('option', { value: l.id, text: l.name, selected: layer.parent === l.id })),
        ]),
      ]),
      el('label', { class: 'form-field' }, [
        el('span', { text: 'الطبقة ثلاثية الأبعاد' }),
        el('label', { class: 'check-row' }, [
          el('input', { type: 'checkbox', checked: layer.threeD?.enable, onchange: (e) => { layer.threeD.enable = e.target.checked; this.store.commit('تفعيل 3D'); this.requestRender(); } }),
          el('span', { text: 'تفعيل' }),
        ]),
      ]),
    ]);
    root.appendChild(selects);

    // مجموعات
    this.group(root, 'transform', 'التحويل', 'i-transform', () => this.renderTransform(layer));
    if (layer.threeD?.enable) this.group(root, '3d', 'خيارات 3D', 'i-guides', () => this.render3D(layer));
    const schema = SCHEMAS[layer.type];
    if (schema) schema.forEach((grp) => this.group(root, `schema-${grp.key}`, grp.label.ar, meta.icon, () => this.renderSchema(layer, grp)));
    if (layer.type === 'audio' || layer.type === 'video' || layer.type === 'visualizer') {
      this.group(root, 'audio', 'الصوت', 'i-audio', () => this.renderAudio(layer));
    }
    this.group(root, 'effects', 'التأثيرات', 'i-effects', () => this.renderEffects(layer), { badge: layer.effects.length });
    this.group(root, 'masks', 'الأقنعة', 'i-mask', () => this.renderMasks(layer), { badge: layer.masks.length });
  }

  scrollToGroup(key) {
    this.expanded.add(key);
    this.requestRender();
    setTimeout(() => {
      this.root.querySelector(`[data-group="${key}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 30);
  }

  group(root, key, label, iconName, renderBody, { badge = null } = {}) {
    const open = this.expanded.has(key);
    const head = el('div', {
      class: 'group-head',
      dataset: { group: key },
      style: { cursor: 'pointer' },
      onclick: () => { if (open) this.expanded.delete(key); else this.expanded.add(key); this.requestRender(); },
    }, [
      el('span', { style: { display: 'grid', placeItems: 'center', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' } }, [icon('i-chevron', 11)]),
      iconName ? icon(iconName, 12) : null,
      el('span', { text: label }),
      el('span', { class: 'grow' }),
      badge ? el('span', { class: 'tag-pill', text: String(badge) }) : null,
    ]);
    root.appendChild(head);
    if (open) renderBody();
  }

  renderTransform(layer) {
    const t = layer.transform;
    const rows = [
      ['anchor', 'نقطة الارتكاز', 'vec2'],
      ['position', 'الموضع', 'vec2'],
      ['scale', 'المقياس', 'vec2', '%'],
      ['rotation', 'الدوران', 'number', '°'],
      ['opacity', 'الشفافية', 'number', '%', 0, 100],
      ['skew', 'الانحراف', 'number', '°'],
    ];
    rows.forEach(([k, label, type, unit, min, max]) => {
      if (!t[k]) return;
      this.propRow(this.root, layer, `transform.${k}`, label, t[k], { type, unit, min, max });
    });
  }

  render3D(layer) {
    const d = layer.threeD;
    [['z', 'العمق (Z)'], ['rotationX', 'دوران X'], ['rotationY', 'دوران Y'], ['rotationZ', 'دوران Z']].forEach(([k, label]) => {
      if (d[k]) this.propRow(this.root, layer, `threeD.${k}`, label, d[k], { type: 'number', unit: k === 'z' ? 'px' : '°' });
    });
  }

  renderSchema(layer, grp) {
    grp.props.forEach((p) => {
      const prop = layer.props[p.k];
      if (!prop) return;
      if (p.type === 'text' && p.k === 'text') {
        this.propRow(this.root, layer, `props.${p.k}`, p.label.ar, prop, { type: 'textarea', hint: p.hint });
        return;
      }
      this.propRow(this.root, layer, `props.${p.k}`, p.label.ar, prop, {
        type: p.type, options: p.options, unit: p.unit, min: p.min, max: p.max, step: p.step, hint: p.hint,
      });
    });
  }

  renderAudio(layer) {
    const a = layer.audio;
    this.propRow(this.root, layer, 'audio.volume', 'مستوى الصوت', a.volume, { type: 'number', unit: '%', min: 0, max: 400 });
    const row = el('div', { class: 'prop-row' }, [
      el('span'),
      el('span', { class: 'label', text: 'كتم الصوت' }),
      el('label', { class: 'check-row' }, [el('input', { type: 'checkbox', checked: a.muted.value, onchange: (e) => this.store.setProp(layer.id, 'audio.muted', e.target.checked) })]),
    ]);
    this.root.appendChild(row);
  }

  /* --------------------------- التأثيرات --------------------------- */
  renderEffects(layer) {
    const host = el('div');
    host.appendChild(el('div', { style: { padding: '5px 6px' } }, [
      el('button', {
        class: 'btn sm primary',
        style: { width: '100%', justifyContent: 'center' },
        onclick: (e) => this.effectPicker(e, layer),
      }, [icon('i-plus', 13), el('span', { text: 'إضافة تأثير' })]),
    ]));
    layer.effects.forEach((fx, index) => {
      const def = EFFECTS[fx.type];
      const open = !fx.collapsed;
      const header = el('div', {
        class: 'group-head',
        style: { gap: '5px' },
      }, [
        el('button', {
          class: 'tb-btn ghost sm',
          title: 'طي/فتح',
          onclick: (e) => { e.stopPropagation(); fx.collapsed = !fx.collapsed; this.requestRender(); },
        }, [el('span', { style: { transform: open ? 'rotate(90deg)' : 'rotate(0)', display: 'grid', placeItems: 'center' } }, [icon('i-chevron', 11)])]),
        el('button', {
          class: 'tb-btn ghost sm',
          title: 'تفعيل/تعطيل',
          onclick: (e) => { e.stopPropagation(); this.store.toggleEffect(layer.id, fx.id); },
        }, [icon(fx.enabled ? 'i-eye' : 'i-eye-off', 12)]),
        el('span', { text: def?.name.ar || fx.type, style: { flex: '1' } }),
        def?.dom === 'canvas-only' ? el('span', { class: 'tag-pill', title: 'يظهر بالكامل عند التصدير فقط', text: 'تقريبي' }) : null,
        el('button', { class: 'tb-btn ghost sm', title: 'أعلى', onclick: (e) => { e.stopPropagation(); this.store.moveEffect(layer.id, fx.id, -1); } }, [el('span', { text: '↑' })]),
        el('button', { class: 'tb-btn ghost sm', title: 'أسفل', onclick: (e) => { e.stopPropagation(); this.store.moveEffect(layer.id, fx.id, 1); } }, [el('span', { text: '↓' })]),
        el('button', { class: 'tb-btn ghost sm', title: 'حذف التأثير', onclick: (e) => { e.stopPropagation(); this.store.removeEffect(layer.id, fx.id); } }, [icon('i-trash', 12)]),
      ]);
      host.appendChild(header);
      if (open && def) {
        def.params.forEach((p) => {
          const prop = fx.params[p.k];
          if (!prop) return;
          this.propRow(host, layer, `effects.${fx.id}.${p.k}`, p.label.ar, prop, {
            type: p.type, options: p.options, unit: p.unit, min: p.min, max: p.max, step: p.step, indent: true,
            onRemove: () => this.store.removeEffect(layer.id, fx.id),
          }, fx);
        });
        if (def.desc) host.appendChild(el('div', { class: 'form-hint', style: { padding: '4px 10px 8px' }, text: def.desc.ar }));
      }
    });
    this.root.appendChild(host);
  }

  effectPicker(e, layer) {
    const rect = e.currentTarget.getBoundingClientRect();
    showContextMenu(EFFECT_CATEGORIES.map((cat) => ({
      label: cat.ar,
      submenu: Object.values(EFFECTS).filter((fx) => fx.cat === cat.key).map((fx) => ({
        label: fx.name.ar,
        action: () => this.store.addEffect(layer.id, fx.id),
      })),
    })), { x: rect.left, y: rect.bottom + 2 });
  }

  /* --------------------------- الأقنعة --------------------------- */
  renderMasks(layer) {
    const host = el('div');
    host.appendChild(el('div', { style: { padding: '5px 6px', display: 'flex', gap: '5px' } }, [
      el('button', { class: 'btn sm', onclick: () => this.store.addMask(layer.id), text: 'مستطيل' }),
      el('button', {
        class: 'btn sm',
        onclick: () => { this.app.setTool('pen'); toast('ارسم القناع على العارض — نقرة لكل نقطة، ودبل-كليك للإنهاء', 'ok', 5000); },
        text: 'قلم حر',
      }),
    ]));
    layer.masks.forEach((mask, i) => {
      const row = el('div', { class: 'prop-row', style: { gridTemplateColumns: '1fr auto' } }, [
        el('span', { class: 'label', text: `قناع ${i + 1}` }),
        el('div', { class: 'value-cell' }, [
          el('select', {
            class: 'prop-select', style: { width: '80px' },
            onchange: (ev) => this.store.updateMask(layer.id, mask.id, { mode: ev.target.value }),
          }, [['add', 'إضافة'], ['subtract', 'طرح'], ['intersect', 'تقاطع'], ['none', 'بدون']].map(([v, l]) => el('option', { value: v, text: l, selected: mask.mode === v }))),
          el('button', { class: 'tb-btn ghost sm', title: 'حذف', onclick: () => this.store.removeMask(layer.id, mask.id) }, [icon('i-trash', 12)]),
        ]),
      ]);
      host.appendChild(row);
      [['feather', 'تنعيم الحواف', 0, 200], ['expansion', 'توسيع/تقليص', -200, 200], ['opacity', 'شفافية القناع', 0, 100]].forEach(([k, label, min, max]) => {
        host.appendChild(el('div', { class: 'prop-row' }, [
          el('span'),
          el('span', { class: 'label', text: label }),
          el('div', { class: 'value-cell' }, [
            el('input', {
              class: 'prop-num', type: 'number', value: mask[k] ?? 0, min, max,
              onchange: (ev) => this.store.updateMask(layer.id, mask.id, { [k]: Number(ev.target.value) }),
            }),
          ]),
        ]));
      });
      host.appendChild(el('div', { class: 'prop-row' }, [
        el('span'),
        el('span', { class: 'label', text: 'عكس القناع' }),
        el('label', { class: 'check-row' }, [el('input', { type: 'checkbox', checked: mask.inverted, onchange: (ev) => this.store.updateMask(layer.id, mask.id, { inverted: ev.target.checked }) })]),
      ]));
    });
    this.root.appendChild(host);
  }

  /* --------------------------- صف خاصية --------------------------- */
  propRow(root, layer, path, label, prop, opts = {}, fx = null) {
    const frame = this.store.playhead;
    const ctxInfo = { fps: this.store.fps, comp: this.store.comp, layer, layerName: layer.name };
    const value = propValueAt(prop, frame, ctxInfo);
    const animated = propIsAnimated(prop);
    const hasKeyHere = animated && keyIndexAt(prop, frame) >= 0;
    const row = el('div', { class: `prop-row ${opts.disabled ? 'disabled' : ''}`, dataset: { path } });
    row.appendChild(el('span', { class: 'twirl' }, [animated ? icon('i-diamond', 9) : null]));
    row.appendChild(el('span', { class: 'label', text: label, title: opts.hint || label }));
    const cell = el('div', { class: 'value-cell' });
    row.appendChild(cell);

    // أدوات المفاتيح
    const nav = el('div', { class: 'kf-nav' }, [
      el('button', { title: 'المفتاح السابق', onclick: () => this.gotoKey(layer, prop, path, -1) }, [icon('i-keyprev', 11)]),
      el('button', {
        class: 'stopwatch',
        title: 'مؤقّت المفاتيح',
        onclick: () => {
          if (!animated) this.store.addKeyframe(layer.id, path);
          else this.store.removeKeyframeAt(layer.id, path, frame);
        },
      }, [icon('i-stopwatch', 13)]),
      el('button', { title: 'المفتاح التالي', onclick: () => this.gotoKey(layer, prop, path, 1) }, [icon('i-keynext', 11)]),
    ]);
    nav.querySelector('.stopwatch').classList.toggle('on', animated);
    cell.appendChild(nav);
    cell.appendChild(el('button', {
      class: `kf-toggle ${hasKeyHere ? 'on' : ''}`,
      title: 'إضافة/حذف مفتاح عند المؤشر',
      onclick: () => this.store.toggleKeyframe(layer.id, path),
    }, [icon('i-diamond', 10)]));

    // حقل القيمة
    const type = opts.type || prop.type;
    const setValue = (v, coalesce = true) => {
      this.store.setProp(layer.id, path, v, { coalesce: coalesce ? `${path}-${layer.id}` : undefined, label: `تعديل ${label}` });
    };
    if (type === 'vec2' || prop.type === PropType.VEC2) {
      const isScale = path === 'transform.scale';
      if (isScale && layer._scaleLinked == null) layer._scaleLinked = true;
      let xInput, yInput;
      const makeInput = (axis) => {
        const input = el('input', {
          class: `prop-num scrub ${animated ? 'animated' : ''}`,
          type: 'text',
          value: fmtNum(value?.[axis] ?? 0, 1),
          title: `${label} ${axis.toUpperCase()}`,
        });
        const applyDelta = (d) => {
          const cur = propValueAt(prop, frame, ctxInfo) || { x: 0, y: 0 };
          if (isScale && layer._scaleLinked) {
            const nextX = round((cur.x ?? 0) + d, 1);
            const ratio = (cur.x !== 0 && cur.y !== 0) ? cur.y / cur.x : 1;
            const nextY = axis === 'x' ? round(nextX * ratio, 1) : round((cur.y ?? 0) + d, 1);
            const finalX = axis === 'x' ? nextX : round(nextY / (ratio || 1), 1);
            if (xInput) xInput.value = fmtNum(finalX, 1);
            if (yInput) yInput.value = fmtNum(nextY, 1);
            setValue({ x: finalX, y: nextY });
          } else {
            const next = { ...cur, [axis]: round((cur[axis] ?? 0) + d, 1) };
            input.value = fmtNum(next[axis], 1);
            setValue(next);
          }
        };
        const applyDirect = (val) => {
          const cur = propValueAt(prop, frame, ctxInfo) || { x: 0, y: 0 };
          if (isScale && layer._scaleLinked) {
            const ratio = (cur.x !== 0 && cur.y !== 0) ? cur.y / cur.x : 1;
            const finalX = axis === 'x' ? round(val, 1) : round(val / (ratio || 1), 1);
            const finalY = axis === 'x' ? round(val * ratio, 1) : round(val, 1);
            if (xInput) xInput.value = fmtNum(finalX, 1);
            if (yInput) yInput.value = fmtNum(finalY, 1);
            setValue({ x: finalX, y: finalY });
          } else {
            const next = { ...cur, [axis]: round(val, 1) };
            input.value = fmtNum(next[axis], 1);
            setValue(next);
          }
        };
        input.addEventListener('change', () => applyDirect(parseFloat(input.value) || 0));
        this.makeScrubbable(input, { onDelta: (d) => applyDelta(d) });
        return input;
      };
      xInput = makeInput('x');
      yInput = makeInput('y');
      cell.append(xInput);
      if (isScale) {
        const linkBtn = el('button', {
          class: `tb-btn ghost sm link-btn ${layer._scaleLinked ? 'active on' : ''}`,
          title: layer._scaleLinked ? 'فك ربط الطول والعرض' : 'ربط تناسب الطول والعرض',
          onclick: () => {
            layer._scaleLinked = !layer._scaleLinked;
            linkBtn.classList.toggle('active', layer._scaleLinked);
            linkBtn.classList.toggle('on', layer._scaleLinked);
          },
        }, [icon('i-link', 11)]);
        cell.append(linkBtn);
      }
      cell.append(yInput);
      cell.appendChild(el('button', { class: 'tb-btn ghost sm', title: 'إعادة ضبط', onclick: () => this.store.resetProp(layer.id, path) }, [icon('i-undo', 11)]));
    } else if (type === 'number' || prop.type === PropType.NUMBER) {
      const min = opts.min ?? prop.min;
      const max = opts.max ?? prop.max;
      const input = el('input', {
        class: `prop-num scrub ${animated ? 'animated' : ''}`,
        type: 'text',
        value: fmtNum(value ?? 0, opts.step && opts.step < 1 ? 2 : 1),
      });
      input.addEventListener('change', () => setValue(parseFloat(input.value) || 0));
      const step = opts.step || (max != null && min != null && max - min <= 2 ? 0.01 : 1);
      this.makeScrubbable(input, {
        step,
        onDelta: (d) => {
          let next = round((propValueAt(prop, frame, ctxInfo) ?? 0) + d, 2);
          if (min != null) next = Math.max(min, next);
          if (max != null) next = Math.min(max, next);
          input.value = fmtNum(next, step < 1 ? 2 : 1);
          setValue(next);
        },
      });
      cell.appendChild(input);
      if (opts.unit) cell.appendChild(el('span', { class: 'muted', style: { fontSize: '10px' }, text: opts.unit }));
      if (min != null && max != null) {
        const slider = el('input', {
          class: 'slider-mini', type: 'range', min, max, step: step || 1, value: clamp(value ?? 0, min, max),
          oninput: (e) => setValue(Number(e.target.value)),
        });
        cell.appendChild(slider);
      }
      cell.appendChild(el('button', { class: 'tb-btn ghost sm', title: 'إعادة ضبط', onclick: () => this.store.resetProp(layer.id, path) }, [icon('i-undo', 11)]));
    } else if (type === 'color' || prop.type === PropType.COLOR) {
      const swatch = el('input', { class: 'prop-color', type: 'color', value: norm(value), oninput: (e) => setValue(e.target.value) });
      const hex = el('input', { class: 'prop-text', style: { width: '82px', textAlign: 'center' }, value: norm(value), onchange: (e) => setValue(e.target.value) });
      cell.append(swatch, hex);
    } else if (type === 'textarea') {
      const ta = el('textarea', {
        class: 'prop-text', style: { minHeight: '54px', width: '100%' }, value: String(value ?? ''),
        oninput: debounceInput((v) => setValue(v)),
      });
      cell.appendChild(ta);
      row.style.gridTemplateColumns = '18px 1fr';
      row.style.alignItems = 'start';
    } else if (type === 'text') {
      const input = el('input', { class: 'prop-text', type: 'text', value: String(value ?? ''), oninput: debounceInput((v) => setValue(v)) });
      cell.appendChild(input);
      row.style.gridTemplateColumns = '18px auto 1fr';
    } else if (type === 'bool' || prop.type === PropType.BOOL) {
      cell.appendChild(el('input', { class: 'prop-check', type: 'checkbox', checked: !!value, onchange: (e) => setValue(e.target.checked, false) }));
    } else if (type === 'font') {
      const sel = el('select', { class: 'prop-select', onchange: (e) => setValue(e.target.value, false) },
        FONTS.map((f) => el('option', { value: f, text: f, selected: String(value) === f, style: { fontFamily: f } })));
      cell.appendChild(sel);
    } else if (type === 'asset') {
      const kind = layer.type === 'audio' || layer.type === 'visualizer' ? 'audio' : (layer.type === 'video' ? 'video' : (layer.type === 'image' ? 'image' : null));
      const assets = this.store.project.assets.filter((a) => a.kind !== 'folder' && (!kind || a.kind === kind || (kind === 'audio' && a.hasAudio)));
      const sel = el('select', { class: 'prop-select', onchange: (e) => setValue(e.target.value, false) },
        [el('option', { value: '', text: '— اختر ملفًا —' }), ...assets.map((a) => el('option', { value: a.id, text: a.name, selected: value === a.id }))]);
      cell.appendChild(sel);
      cell.appendChild(el('button', {
        class: 'tb-btn ghost sm', title: 'استيراد ملف',
        onclick: () => this.app.openImportDialog({ folderId: null }),
      }, [icon('i-plus', 12)]));
    } else if (type === 'comp') {
      const sel = el('select', { class: 'prop-select', onchange: (e) => setValue(e.target.value, false) },
        this.store.project.comps.map((c) => el('option', { value: c.id, text: c.name, selected: value === c.id })));
      cell.appendChild(sel);
    } else if (type === 'select') {
      const options = opts.options || [];
      const sel = el('select', { class: 'prop-select', onchange: (e) => setValue(e.target.value, false) },
        options.map(([v, l]) => el('option', { value: v, text: l, selected: String(value) === String(v) })));
      cell.appendChild(sel);
    }
    if (prop.expr) {
      cell.appendChild(el('button', {
        class: 'tb-btn ghost sm', title: `تعبير: ${prop.expr}`, style: { color: 'var(--violet)' },
        onclick: () => this.editExpression(layer, path, prop),
      }, [el('span', { text: 'ƒ' })]));
    }
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu([
        { label: 'إضافة/حذف مفتاح عند المؤشر', icon: 'i-diamond', action: () => this.store.toggleKeyframe(layer.id, path) },
        { label: 'إضافة مفتاح بقيمة الحقل', action: () => this.store.addKeyframe(layer.id, path) },
        { type: 'sep' },
        { label: 'خطي', action: () => this.store.setKeyEase(layer.id, path, frame, 'linear') },
        { label: 'ناعم', action: () => this.store.setKeyEase(layer.id, path, frame, 'ease') },
        { label: 'ثابت (Hold)', action: () => this.store.setKeyEase(layer.id, path, frame, 'hold') },
        { label: 'ارتداد', action: () => this.store.setKeyEase(layer.id, path, frame, 'bounceOut') },
        { label: 'مرن', action: () => this.store.setKeyEase(layer.id, path, frame, 'elasticOut') },
        { type: 'sep' },
        { label: 'إضافة تعبير…', icon: 'i-effects', action: () => this.editExpression(layer, path, prop) },
        { label: 'حذف التحريك', disabled: !animated, action: () => this.store.deleteAnimation(layer.id, path) },
        { label: 'إعادة الضبط', action: () => this.store.resetProp(layer.id, path) },
      ], { x: e.clientX, y: e.clientY });
    });
    root.appendChild(row);
  }

  gotoKey(layer, prop, path, dir) {
    const i = nearestKeyIndex(prop, this.store.playhead, dir);
    if (i < 0 || !prop.keys?.length) return;
    const key = prop.keys[clamp(i, 0, prop.keys.length - 1)];
    this.store.setPlayhead(key.t);
    this.app.timeline?.scrollToFrame(key.t);
  }

  makeScrubbable(input, { onDelta, step = 1 }) {
    let accum = 0;
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      input.select();
      accum = 0;
      let moved = false;
      const prevCursor = document.body.style.cursor;
      document.body.style.cursor = 'ew-resize';
      const move = (ev) => {
        moved = true;
        accum += ev.movementX || 0;
        const d = Math.trunc(accum / 3) * step;
        if (d !== 0) { accum -= Math.trunc(accum / 3) * 3; onDelta(d); }
      };
      const up = () => {
        document.body.style.cursor = prevCursor;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (moved) this.store.commit('تعديل قيمة');
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    input.addEventListener('pointerdown', down);
  }

  editExpression(layer, path, prop) {
    promptDialog({
      title: 'تعبير (Expression)',
      label: 'اكتب التعبير — يستطيع استخدام value, time, wiggle(), noise(), linear()…',
      value: prop.expr || '',
      multiline: true,
      hint: 'أمثلة: wiggle(2, 40) · value * 1.5 + Math.sin(time * 6) * 20 · linear(time, 0, 2, 0, 100)',
    }).then((v) => { if (v != null) this.store.setExpression(layer.id, path, v); });
  }

  layerMenu(e, layer) {
    showContextMenu([
      { label: 'إعادة تسمية', icon: 'i-text', action: () => this.app.timeline?.startRename(document.querySelector(`#tl-layers [data-layer="${layer.id}"]`), layer) },
      { label: 'مضاعفة', icon: 'i-copy', action: () => this.store.duplicateLayers([layer.id]) },
      { label: 'حذف', icon: 'i-trash', action: () => this.store.removeLayers([layer.id]) },
      { type: 'sep' },
      { label: 'إظهار/إخفاء', action: () => this.store.setLayerFlag(layer.id, 'enabled', !layer.enabled) },
      { label: 'قفل', action: () => this.store.setLayerFlag(layer.id, 'locked', !layer.locked) },
      { label: 'عزل (Solo)', action: () => this.store.setLayerFlag(layer.id, 'solo', !layer.solo) },
      { type: 'sep' },
      { label: 'تركيب مسبق', icon: 'i-comp', action: () => this.store.precompose([layer.id], layer.name) },
      { label: 'نسخ', icon: 'i-copy', action: async () => { const v = await promptDialog({ title: 'نسخ الطبقة كتركيب', label: 'اسم التركيب الجديد', value: `${layer.name} — تركيب` }); if (v) this.store.precompose([layer.id], v); } },
      { type: 'sep' },
      { label: 'حذف كل التأثيرات', disabled: !layer.effects.length, action: () => { layer.effects = []; this.store.commit('حذف التأثيرات'); this.requestRender(); } },
      { label: 'حذف كل الأقنعة', disabled: !layer.masks.length, action: () => { layer.masks = []; this.store.commit('حذف الأقنعة'); this.requestRender(); } },
    ], { x: e.clientX, y: e.clientY });
  }
}

function norm(v) {
  const s = String(v ?? '#ffffff');
  return /^#[0-9a-f]{6}$/i.test(s) ? s : '#ffffff';
}

function debounceInput(fn, ms = 260) {
  let t = null;
  return (e) => {
    const v = e.target.value;
    clearTimeout(t);
    t = setTimeout(() => fn(v), ms);
  };
}
