/**
 * مدير فلاتر SVG — يولّد تعريفات الفلاتر التي تحتاجها المعاينة ويحقنها في المستند
 * (المعاينة تعتمد على CSS/SVG، بينما التصدير يعتمد على Canvas)
 */
import { EFFECTS } from '../core/effects.js';

export class SvgFilterManager {
  constructor() {
    this.defs = null;
    this.current = new Map();
  }

  ensureHost() {
    if (this.defs && this.defs.isConnected) return this.defs;
    let host = document.getElementById('ms-svg-filters');
    if (!host) {
      host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      host.setAttribute('id', 'ms-svg-filters');
      host.setAttribute('width', '0');
      host.setAttribute('height', '0');
      host.style.position = 'absolute';
      host.style.pointerEvents = 'none';
      document.body.appendChild(host);
    }
    this.defs = host;
    return host;
  }

  /**
   * يبني فلاتر لطبقة معيّنة ويعيد مصفوفة الأسماء بالترتيب
   * @param {object} layer
   * @param {object[]} effectStates [{id, type, params}]
   * @returns {string[]} أسماء الفلاتر (بالترتيب المطلوب)
   */
  build(layer, effectStates) {
    const host = this.ensureHost();
    const names = [];
    const wanted = new Map();
    effectStates.forEach((fxState) => {
      const def = EFFECTS[fxState.type];
      if (!def?.svg) return;
      const id = `msfx_${layer.id}_${fxState.id}`.replace(/[^\w-]/g, '');
      const markup = def.svg(fxState.params, id);
      wanted.set(id, markup);
      names.push(id);
    });
    // أضف الفلاتر المطلوبة فقط وأزل القديمة
    for (const [id, markup] of wanted) {
      if (this.current.get(id) === markup) continue;
      const old = host.querySelector(`#${id}`);
      if (old) old.remove();
      const tpl = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      tpl.innerHTML = markup;
      host.appendChild(tpl.firstElementChild);
      this.current.set(id, markup);
    }
    return names;
  }

  clearLayer(layerId) {
    const host = this.ensureHost();
    [...this.current.keys()].forEach((id) => {
      if (id.includes(layerId)) {
        host.querySelector(`#${id}`)?.remove();
        this.current.delete(id);
      }
    });
  }

  clearAll() {
    const host = this.ensureHost();
    host.innerHTML = '';
    this.current.clear();
  }
}
