/**
 * القوائم — شريط القوائم العلوي والقوائم السياقية (بزر الفأرة الأيمن)
 */
import { el, icon, positionPopup, clear } from './dom.js';

let activePopup = null;

export function closeMenus() {
  if (activePopup) { activePopup.remove(); activePopup = null; }
  document.querySelectorAll('.menu-btn.open').forEach((b) => b.classList.remove('open'));
}

document.addEventListener('pointerdown', (e) => {
  if (!activePopup) return;
  if (!activePopup.contains(e.target)) closeMenus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

function buildItems(items, { onDone, parentPopup = null }) {
  const pop = el('div', { class: 'menu-pop' });
  const subPopups = [];
  for (const item of items) {
    if (!item) continue;
    if (item.type === 'sep') { pop.appendChild(el('div', { class: 'menu-sep' })); continue; }
    if (item.type === 'title') { pop.appendChild(el('div', { class: 'menu-title', text: item.label })); continue; }
    const disabled = typeof item.disabled === 'function' ? item.disabled() : item.disabled;
    const checked = typeof item.checked === 'function' ? item.checked() : item.checked;
    const btn = el('button', {
      class: 'menu-item',
      disabled: !!disabled,
      onclick: (e) => {
        if (item.submenu) return;
        if (item.keepOpen) { item.action?.(); return; }
        closeAll();
        item.action?.(e);
        onDone?.();
      },
      onmouseenter: () => {
        subPopups.forEach((p) => p.remove());
        subPopups.length = 0;
        if (item.submenu) {
          const sub = buildItems(typeof item.submenu === 'function' ? item.submenu() : item.submenu, { onDone });
          positionPopup(sub, 0, 0, { anchorEl: btn, prefer: 'right-start' });
          subPopups.push(sub);
          if (parentPopup) parentPopup._subPopups?.add(sub);
        }
      },
      onmouseleave: (e) => {
        // لا تغلق إذا انتقل المؤشر للنافذة الفرعية
        if (item.submenu) return;
      },
    }, [
      el('span', { class: 'mi-icon' }, [item.checked != null ? (checked ? icon('i-diamond', 11) : el('span', { style: { width: '11px' } })) : (item.icon ? icon(item.icon, 13) : null)]),
      el('span', { class: 'mi-label', text: item.label }),
      item.shortcut ? el('span', { class: 'mi-key', text: item.shortcut }) : null,
      item.submenu ? icon('i-chevron', 11) : null,
    ]);
    pop.appendChild(btn);
  }
  pop._subPopups = new Set(subPopups);
  return pop;
}

function closeAll() {
  document.querySelectorAll('.menu-pop').forEach((p, i) => { if (i > 0) p.remove(); });
  closeMenus();
}

export function showContextMenu(items, { x = 0, y = 0, anchorEl = null, prefer = 'bottom-start' } = {}) {
  closeMenus();
  document.querySelectorAll('.menu-pop').forEach((p) => p.remove());
  const pop = buildItems(items, { onDone: () => {} });
  activePopup = pop;
  positionPopup(pop, x, y, { anchorEl, prefer });
  // إغلاق عند النقر خارج القائمة
  setTimeout(() => {
    const onDown = (e) => {
      if (!pop.contains(e.target)) {
        pop.remove();
        if (activePopup === pop) activePopup = null;
        document.removeEventListener('pointerdown', onDown, true);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
  }, 0);
  return pop;
}

export class MenuBar {
  constructor(root, defs) {
    this.root = root;
    this.defs = defs;
    this.render();
  }

  setDefs(defs) { this.defs = defs; this.render(); }

  render() {
    const root = this.root;
    clear(root);
    this.defs.forEach((def, i) => {
      const btn = el('button', {
        class: 'menu-btn',
        text: def.label,
        onclick: (e) => {
          e.stopPropagation();
          const wasOpen = btn.classList.contains('open');
          closeMenus();
          document.querySelectorAll('.menu-pop').forEach((p) => p.remove());
          if (wasOpen) return;
          btn.classList.add('open');
          const items = typeof def.items === 'function' ? def.items() : def.items;
          const pop = buildItems(items, { onDone: () => {} });
          activePopup = pop;
          positionPopup(pop, 0, 0, { anchorEl: btn, prefer: 'bottom-start' });
        },
        onmouseenter: () => {
          if (document.querySelector('.menu-btn.open') && !btn.classList.contains('open')) btn.click();
        },
      });
      root.appendChild(btn);
      if (i === this.defs.length - 1) root.dataset.count = String(i + 1);
    });
  }
}
