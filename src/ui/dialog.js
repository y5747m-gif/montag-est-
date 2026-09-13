/**
 * النوافذ الحوارية — عامة، تأكيد، إدخال، ألوان، اختصارات، حول البرنامج
 */
import { el, clear, icon } from './dom.js';

let openCount = 0;

export function openDialog({
  title, body, footer = [], width = 'normal', onMount, onClose, className = '', iconName = 'i-settings',
}) {
  const root = document.getElementById('dialog-root');
  const backdrop = el('div', { class: 'dialog-backdrop' });
  let api = null; // يُسنَد بعد بناء النافذة
  const dialog = el('div', { class: `dialog ${width === 'normal' ? '' : width} ${className}` }, [
    el('header', { class: 'dialog-head' }, [
      icon(iconName, 15),
      el('h3', { text: title || '' }),
      el('button', { class: 'tb-btn ghost sm', title: 'إغلاق', onclick: () => api?.close(null) }, [icon('i-plus', 14)]),
    ]),
    el('div', { class: 'dialog-body' }, [typeof body === 'string' ? el('div', { html: body }) : body]),
    footer.length ? el('footer', { class: 'dialog-foot' }, footer) : null,
  ]);
  root.appendChild(backdrop);
  root.appendChild(dialog);
  root.style.pointerEvents = 'auto';
  openCount += 1;

  api = {
    dialog,
    body: dialog.querySelector('.dialog-body'),
    close(result) {
      backdrop.remove();
      dialog.remove();
      openCount -= 1;
      if (openCount <= 0) { openCount = 0; root.style.pointerEvents = 'none'; }
      onClose?.(result);
    },
  };
  backdrop.addEventListener('pointerdown', () => api.close(null));
  const esc = (e) => {
    if (e.key === 'Escape') { api.close(null); document.removeEventListener('keydown', esc, true); }
  };
  document.addEventListener('keydown', esc, true);
  onMount?.(api);
  return api;
}

export function button(label, { onClick, primary = false, danger = false, iconName = null, disabled = false } = {}) {
  return el('button', {
    class: `btn ${primary ? 'primary' : ''} ${danger ? 'danger' : ''}`,
    disabled,
    onclick: onClick,
  }, [iconName ? icon(iconName, 14) : null, el('span', { text: label })]);
}

export function confirmDialog({ title = 'تأكيد', message = 'هل أنت متأكد؟', okLabel = 'موافق', cancelLabel = 'إلغاء', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const dlg = openDialog({
      title,
      width: 'narrow',
      body: el('div', { style: { lineHeight: '1.9' }, text: message }),
      footer: [
        el('div', { class: 'grow' }),
        button(cancelLabel, { onClick: () => { done(false); dlg.close(); } }),
        button(okLabel, { primary: !danger, danger, onClick: () => { done(true); dlg.close(); } }),
      ],
      onClose: () => done(false),
    });
  });
}

export function promptDialog({ title = 'إدخال', label = 'القيمة', value = '', placeholder = '', multiline = false, hint = '' }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const input = multiline
      ? el('textarea', { value, placeholder, style: { width: '100%' } })
      : el('input', { type: 'text', value, placeholder });
    const submit = () => { done(input.value); dlg.close(); };
    const dlg = openDialog({
      title,
      width: 'narrow',
      body: el('div', { class: 'form-field' }, [el('span', { text: label }), input, hint ? el('div', { class: 'form-hint', text: hint }) : null]),
      footer: [
        el('div', { class: 'grow' }),
        button('إلغاء', { onClick: () => { done(null); dlg.close(); } }),
        button('حسناً', { primary: true, onClick: submit }),
      ],
      onMount: () => setTimeout(() => { input.focus(); input.select?.(); }, 30),
      onClose: () => done(null),
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !multiline) submit();
    });
  });
}

const PRESET_COLORS = [
  '#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7',
  '#4a9dff', '#5856d6', '#a86bff', '#ff5c8a', '#ff8a3d', '#8bc34a', '#34d3d3', '#9aa4b2',
];

export function colorDialog(initial = '#ffffff', { title = 'اختيار لون' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let value = normHex(initial) || '#ffffff';
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const picker = el('input', { type: 'color', value, style: { width: '100%', height: '52px', border: 'none', background: 'none' } });
    const hex = el('input', { type: 'text', value });
    const preview = el('div', { style: { height: '40px', borderRadius: '6px', background: value, border: '1px solid #3d424a' } });
    const swatches = el('div', { class: 'swatch-pop', style: { gridTemplateColumns: 'repeat(8, 1fr)', padding: '0' } },
      PRESET_COLORS.map((c) => el('i', {
        style: { background: c },
        onclick: () => { value = c; sync(); },
      })));
    const rgb = el('div', { class: 'form-hint' });
    const sync = () => {
      picker.value = value;
      hex.value = value;
      preview.style.background = value;
      const h = value.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
      rgb.textContent = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    picker.addEventListener('input', () => { value = picker.value; sync(); });
    hex.addEventListener('input', () => { const v = normHex(hex.value); if (v) { value = v; sync(); } });
    sync();
    const dlg = openDialog({
      title,
      width: 'narrow',
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        preview, picker,
        el('div', { class: 'form-field' }, [el('span', { text: 'كود اللون (HEX)' }), hex]),
        swatches, rgb,
      ]),
      footer: [
        el('div', { class: 'grow' }),
        button('إلغاء', { onClick: () => { done(null); dlg.close(); } }),
        button('تطبيق', { primary: true, onClick: () => { done(value); dlg.close(); } }),
      ],
      onClose: () => done(null),
    });
  });
}

function normHex(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.toLowerCase();
  return null;
}

export const SHORTCUTS = [
  ['Ctrl+N', 'مشروع جديد'],
  ['Ctrl+O', 'فتح مشروع'],
  ['Ctrl+S', 'حفظ المشروع'],
  ['Ctrl+Z', 'تراجع'],
  ['Ctrl+Shift+Z', 'إعادة'],
  ['Ctrl+K', 'تركيب جديد'],
  ['Ctrl+Y', 'طبقة خلفية صلبة'],
  ['Ctrl+Alt+Shift+T', 'طبقة نص'],
  ['Ctrl+Shift+D', 'تقسيم الطبقات'],
  ['Ctrl+D', 'مضاعفة الطبقة'],
  ['Ctrl+C / Ctrl+V', 'نسخ / لصق'],
  ['Ctrl+A', 'تحديد الكل'],
  ['Space', 'تشغيل / إيقاف'],
  ['Home / End', 'بداية / نهاية'],
  ['PageUp / PageDown', 'الإطار السابق / التالي'],
  ['Shift+PageUp/Down', '10 إطارات'],
  ['J / K / L', 'سرعة التشغيل / إيقاف'],
  ['↑ ↓ ← →', 'تحريك الطبقة المحدّدة'],
  ['Shift + الأسهم', 'تحريك بعشر وحدات'],
  ['+ / -', 'تكبير / تصغير العرض'],
  ['[ / ]', 'ضبط بداية / نهاية الطبقة عند المؤشر'],
  ['Alt+[ / Alt+]', 'قص الطبقة عند المؤشر'],
  ['U', 'إظهار الخصائص المتحركة'],
  ['S / R / T / P / A', 'المقياس / الدوران / الشفافية / الموضع / الارتكاز'],
  ['M', 'إضافة قناع'],
  ['Ctrl+Shift+E', 'تصدير'],
  ['Ctrl+/', 'شاشة كاملة للمعاينة'],
  ['Del / Backspace', 'حذف الطبقة'],
  ['Shift+/', 'تبديل منطقة العمل'],
];

export function shortcutsDialog() {
  const rows = SHORTCUTS.map(([k, v]) => el('div', { class: 'kbd-row' }, [
    el('span', { class: 'kbd', text: k }),
    el('span', { class: 'grow', text: v }),
  ]));
  return openDialog({
    title: 'اختصارات لوحة المفاتيح',
    width: 'wide',
    iconName: 'i-settings',
    body: el('div', { class: 'kbd-grid' }, rows),
    footer: [el('div', { class: 'grow' })],
  });
}

export function aboutDialog() {
  return openDialog({
    title: 'حول Montage Studio',
    width: 'narrow',
    iconName: 'i-comp',
    body: `
      <div style="line-height:2;font-size:12.5px">
        <b>Montage Studio 1.0</b> — استوديو مونتاج وموشن جرافيك يعمل بالكامل داخل المتصفح.<br/>
        محرّك رسم على Canvas، تحريك بالمفاتيح والمنحنيات، تأثيرات وفلاتر، انتقالات،
        أصوات وموجات، تصدير فيديو (WebM) وصور متحركة (APNG) وسلاسل PNG ومقاطع WAV.<br/><br/>
        <span class="muted">يعمل دون أي مكتبات خارجية — HTML + CSS + JavaScript فقط.</span>
      </div>`,
    footer: [el('div', { class: 'grow' })],
  });
}
