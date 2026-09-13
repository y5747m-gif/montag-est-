/**
 * أدوات DOM — بناء العناصر بسرعة
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

export function applyProps(node, props = {}) {
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') node.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'style') {
      if (typeof v === 'string') node.style.cssText = v;
      else Object.entries(v).forEach(([sk, sv]) => { if (sv != null) node.style.setProperty(sk, String(sv)); });
    } else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { node.dataset[dk] = dv; });
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'readOnly') node[k] = !!v;
    else if (k === 'ref' && typeof v === 'function') v(node);
    else node.setAttribute(k, String(v));
  }
  return node;
}

export function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function svg(html) {
  const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wrap.innerHTML = html;
  return wrap.firstElementChild;
}

/** أيقونة من الـ sprite */
export function icon(name, size = 16) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(size));
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  s.appendChild(use);
  return s;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function fmtShortcut(s) {
  const isMac = navigator.platform?.toLowerCase().includes('mac');
  return s.replace(/Ctrl/g, isMac ? '⌘' : 'Ctrl').replace(/Shift/g, isMac ? '⇧' : 'Shift').replace(/Alt/g, isMac ? '⌥' : 'Alt');
}

/** تحديد موقع نافذة منبثقة داخل الشاشة */
export function positionPopup(popup, x, y, { anchorEl = null, prefer = 'bottom-start' } = {}) {
  popup.style.left = '0px';
  popup.style.top = '0px';
  popup.style.visibility = 'hidden';
  document.body.appendChild(popup);
  const rect = popup.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let px = x, py = y;
  if (anchorEl) {
    const a = anchorEl.getBoundingClientRect();
    if (prefer.startsWith('bottom')) { py = a.bottom + 2; px = a.left; }
    else if (prefer.startsWith('top')) { py = a.top - rect.height - 2; px = a.left; }
    else if (prefer.startsWith('right')) { px = a.right + 2; py = a.top; }
    else { px = a.left - rect.width - 2; py = a.top; }
  }
  px = Math.min(Math.max(4, px), vw - rect.width - 4);
  py = Math.min(Math.max(4, py), vh - rect.height - 4);
  if (py + rect.height > vh - 4) py = Math.max(4, vh - rect.height - 4);
  popup.style.left = `${px}px`;
  popup.style.top = `${py}px`;
  popup.style.visibility = 'visible';
  return popup;
}

/** سحب عام: يعيد دوال البدء/الحركة/النهاية */
export function dragHandler(target, { onStart, onMove, onEnd, cursor = 'default' } = {}) {
  return (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX, startY = ev.clientY;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = cursor;
    document.body.classList.add('dragging');
    let started = false;
    const move = (e) => {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!started) { started = true; onStart?.(e, { dx, dy }); }
      onMove?.(e, { dx, dy, x: e.clientX, y: e.clientY });
    };
    const up = (e) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.style.cursor = prevCursor;
      document.body.classList.remove('dragging');
      onEnd?.(e, { dx: e.clientX - startX, dy: e.clientY - startY });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
}

/** تأخير بسيط */
export const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
