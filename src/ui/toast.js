/**
 * التنبيهات السريعة
 */
import { el } from './dom.js';

let root = null;
export function toast(message, type = 'info', ms = 2800) {
  // إعادة تحديد الجذر إذا كان غير موجود أو ينتمي لمستند آخر (بيئات متعددة/اختبارات)
  if (!root || root.ownerDocument !== document) root = document.getElementById('toast-root');
  if (!root) return;
  const node = el('div', { class: `toast ${type}` }, [
    el('div', { text: message }),
  ]);
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateX(-10px)';
    setTimeout(() => node.remove(), 260);
  }, ms);
  return node;
}
export const toastOk = (m) => toast(m, 'ok');
export const toastWarn = (m) => toast(m, 'warn');
export const toastErr = (m) => toast(m, 'err', 4000);
