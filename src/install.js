/**
 * التثبيت كتطبيق (PWA) — مشترك بين صفحة التحميل ونسخة الهاتف
 *
 * عند الضغط على زرّي التنزيل في صفحة التحميل:
 *  - أندرويد/كروم: يظهر مربع حوار التثبيت الرسمي فيُثبَّت التطبيق على الهاتف بأيقونته.
 *  - آيفون/آيباد: تظهر نافذة إرشادية بخطوات "إضافة إلى الشاشة الرئيسية".
 *  - أجهزة الكمبيوتر: الانتقال إلى النسخة كما هو متوقع (وتثبيتها ممكن من شريط المتصفح).
 *
 * الواجهة العامة: window.MS_INSTALL = { promptInstall(), isInstalled(), canPrompt() }
 */
(() => {
  'use strict';
  if (!(location.protocol === 'http:' || location.protocol === 'https:')) return;

  let deferredPrompt = null;
  let installed = false;

  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true;
  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobileDevice = () =>
    (window.matchMedia?.('(pointer: coarse)').matches && Math.min(window.innerWidth || 9e9, window.screen?.width || 9e9) < 820);

  /* ------------------------------ نافذة الإرشاد ------------------------------ */
  const STYLE = `
    .msi-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(8,4,16,.62);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .22s;direction:rtl}
    .msi-backdrop.in{opacity:1}
    .msi-sheet{background:#1d1435;color:#f5f2fc;font-family:Cairo,Tajawal,"Segoe UI",system-ui,sans-serif;border-radius:22px 22px 0 0;border-top:1px solid rgba(255,255,255,.1);max-width:430px;width:100%;padding:18px 20px calc(24px + env(safe-area-inset-bottom,0px));transform:translateY(40px);transition:transform .28s cubic-bezier(.3,.9,.3,1);box-shadow:0 -18px 50px rgba(0,0,0,.5)}
    .msi-backdrop.in .msi-sheet{transform:none}
    .msi-title{display:flex;align-items:center;gap:10px;font-size:15.5px;font-weight:800;margin-bottom:6px}
    .msi-logo{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#ec4899);display:grid;place-items:center;font-weight:800;font-size:19px;color:#fff;flex:0 0 auto}
    .msi-sub{font-size:12px;color:#b3a8d4;line-height:1.7;margin:0 0 14px}
    .msi-steps{list-style:none;margin:0;padding:0;counter-reset:msi}
    .msi-steps li{display:flex;gap:11px;align-items:flex-start;padding:9px 0;font-size:13px;line-height:1.7;color:#e6e0f5}
    .msi-steps li::before{counter-increment:msi;content:counter(msi);flex:0 0 auto;width:24px;height:24px;border-radius:8px;background:rgba(139,92,246,.22);border:1px solid rgba(139,92,246,.5);color:#d8c9ff;font-size:12px;font-weight:800;display:grid;place-items:center;margin-top:2px}
    .msi-actions{display:flex;gap:10px;margin-top:16px}
    .msi-btn{flex:1;padding:13px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#f5f2fc;font:inherit;font-size:13px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center;transition:transform .12s}
    .msi-btn:active{transform:scale(.96)}
    .msi-btn.primary{background:linear-gradient(135deg,#8b5cf6,#ec4899);border:0;box-shadow:0 8px 22px rgba(236,72,153,.35)}
  `;

  function showGuide({ title, subtitle, steps, actionLabel, actionHref, onClose }) {
    if (document.getElementById('msi-backdrop')) return;
    const style = document.createElement('style');
    style.textContent = STYLE;
    style.id = 'msi-style';
    const backdrop = document.createElement('div');
    backdrop.className = 'msi-backdrop';
    backdrop.id = 'msi-backdrop';
    backdrop.innerHTML = `
      <div class="msi-sheet" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="msi-title"><span class="msi-logo">M</span><span>${title}</span></div>
        <p class="msi-sub">${subtitle}</p>
        <ol class="msi-steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
        <div class="msi-actions">
          <button class="msi-btn" data-msi-close>لاحقًا</button>
          ${actionHref ? `<a class="msi-btn primary" href="${actionHref}">${actionLabel}</a>` : `<button class="msi-btn primary" data-msi-close>${actionLabel || 'فهمت'}</button>`}
        </div>
      </div>`;
    const close = () => {
      backdrop.classList.remove('in');
      setTimeout(() => { backdrop.remove(); style.remove(); }, 240);
      onClose?.();
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-msi-close]')) close();
    });
    document.body.append(style, backdrop);
    requestAnimationFrame(() => backdrop.classList.add('in'));
  }

  const IOS_STEPS = [
    'افتح هذه الصفحة في متصفح <b>Safari</b>',
    'اضغط أيقونة <b>المشاركة</b> ▲ (المربع مع السهم في الشريط السفلي)',
    'اختر <b>«إضافة إلى الشاشة الرئيسية»</b> ثم اضغط <b>إضافة</b>',
  ];
  const ANDROID_STEPS = [
    'افتح قائمة المتصفح <b>⋮</b> أعلى الشاشة',
    'اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>',
    'سيظهر تطبيق <b>Montage</b> بأيقونته على هاتفك ويعمل بلا إنترنت',
  ];

  /* ------------------------------ منطق التثبيت ------------------------------ */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // نستولي على الحوار لعرضه عند الضغط على زرنا
    deferredPrompt = e;
    document.dispatchEvent(new CustomEvent('ms:installavailable'));
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    document.dispatchEvent(new CustomEvent('ms:installed'));
  });

  async function promptInstall() {
    if (installed || isStandalone()) {
      showGuide({
        title: 'التطبيق مثبت بالفعل',
        subtitle: 'ستجد Montage Studio على شاشتك الرئيسية بأيقونته — يعمل دون اتصال بالإنترنت.',
        steps: ['ابحث عن أيقونة <b>M</b> البنفسجية بين تطبيقاتك', 'افتحها وابدأ المونتاج مباشرة'],
        actionLabel: 'رائع',
      });
      return 'installed';
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
      deferredPrompt = null;
      if (outcome === 'accepted') return 'accepted';
      return 'dismissed';
    }
    // لا يوجد حوار رسمي (iOS أو متصفح بلا دعم) → إرشاد يدوي
    showGuide({
      title: 'ثبّت Montage على هاتفك',
      subtitle: 'أضف التطبيق إلى شاشتك الرئيسية بخطوات بسيطة — سيعمل بعدها كأي تطبيق وبلا إنترنت:',
      steps: isIOS() ? IOS_STEPS : ANDROID_STEPS,
      actionLabel: 'فهمت',
      onClose: () => {},
    });
    return 'guide';
  }

  /* ------------------------------ الأزرار ------------------------------ */
  function bindButtons() {
    // زر تحميل نسخة الهاتف
    const phoneBtn = document.getElementById('dl-phone');
    if (phoneBtn) {
      phoneBtn.addEventListener('click', async (e) => {
        if (installed || isStandalone()) { window.location.href = phoneBtn.dataset.fallback || 'mobile.html'; return; }
        e.preventDefault();
        const result = await promptInstall();
        if (result === 'dismissed') window.location.href = phoneBtn.dataset.fallback || 'mobile.html';
      });
    }
    // زر تحميل نسخة الكمبيوتر: على الهاتف ننصح بنسخة الهاتف أولًا
    const pcBtn = document.getElementById('dl-pc');
    if (pcBtn) {
      pcBtn.addEventListener('click', (e) => {
        if (!isMobileDevice()) return; // على الكمبيوتر: انتقال عادي
        e.preventDefault();
        showGuide({
          title: 'أنت تستخدم هاتفًا 📱',
          subtitle: 'نسخة الكمبيوتر مصممة للشاشات الكبيرة. لدينا نسخة مخصصة للهاتف بتصميم لمسي — وأنصح بتثبيتها:',
          steps: ['اضغط <b>«تثبيت نسخة الهاتف»</b> ليظهر التطبيق على شاشتك الرئيسية', 'أو افتح نسخة الكمبيوتر مع ذلك إن أردت'],
          actionLabel: 'فتح نسخة الكمبيوتر مع ذلك',
          actionHref: pcBtn.dataset.fallback || 'desktop.html',
          onClose: () => {},
        });
        // إضافة زر تثبيت نسخة الهاتف داخل النافذة
        const actions = document.querySelector('#msi-backdrop .msi-actions');
        if (actions) {
          const installFirst = document.createElement('button');
          installFirst.className = 'msi-btn primary';
          installFirst.textContent = 'تثبيت نسخة الهاتف';
          actions.prepend(installFirst);
          installFirst.addEventListener('click', async () => {
            document.querySelector('#msi-backdrop')?.remove();
            document.getElementById('msi-style')?.remove();
            await promptInstall();
          });
        }
      });
    }
    // تحديث شكل الزر بعد التثبيت الناجح
    document.addEventListener('ms:installed', () => {
      const btn = document.getElementById('dl-phone');
      if (btn) {
        btn.querySelector('span')?.remove();
        btn.insertAdjacentHTML('beforeend', '<span>تم التثبيت ✓ — افتح التطبيق</span>');
        btn.dataset.fallback = 'mobile.html';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindButtons);
  else bindButtons();

  /* ------------------------------ تسجيل العامل الخدمي ------------------------------ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  window.MS_INSTALL = {
    promptInstall,
    isInstalled: () => installed || isStandalone(),
    canPrompt: () => !!deferredPrompt,
  };
})();
