/**
 * التنزيل والتثبيت — مشترك بين صفحة التحميل ونسخة الهاتف
 *
 * زر «تثبيت نسخة الهاتف»: ينزّل ملف APK مباشرةً كأي تطبيق هاتف عادي،
 * ويعرض خطوات التثبيت (السماح بالمصادر غير المعروفة مرة واحدة).
 * زر «تحميل نسخة الكمبيوتر»: ينزّل ملف EXE مباشرة.
 * يبقى التثبيت المباشر (PWA) متاحًا برمجيًا عبر window.MS_INSTALL.
 *
 * الواجهة: window.MS_INSTALL = { promptInstall(), isInstalled(), canPrompt() }
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
    .msi-logo{width:40px;height:40px;display:grid;place-items:center;flex:0 0 auto}.msi-logo img{width:40px;height:40px;display:block;filter:drop-shadow(0 6px 16px rgba(139,92,246,.45))}
    .msi-sub{font-size:12px;color:#b3a8d4;line-height:1.7;margin:0 0 14px}
    .msi-steps{list-style:none;margin:0;padding:0;counter-reset:msi}
    .msi-steps li{display:flex;gap:11px;align-items:flex-start;padding:9px 0;font-size:13px;line-height:1.7;color:#e6e0f5}
    .msi-steps li::before{counter-increment:msi;content:counter(msi);flex:0 0 auto;width:24px;height:24px;border-radius:8px;background:rgba(139,92,246,.22);border:1px solid rgba(139,92,246,.5);color:#d8c9ff;font-size:12px;font-weight:800;display:grid;place-items:center;margin-top:2px}
    .msi-actions{display:flex;gap:10px;margin-top:16px}
    .msi-btn{flex:1;padding:13px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#f5f2fc;font:inherit;font-size:13px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center;transition:transform .12s}
    .msi-btn:active{transform:scale(.96)}
    .msi-btn.primary{background:linear-gradient(135deg,#8b5cf6,#ec4899);border:0;box-shadow:0 8px 22px rgba(236,72,153,.35)}
  `;

  function showGuide({ title, subtitle, steps = [], actionLabel = 'فهمت', actionHref, onClose }) {
    if (document.getElementById('msi-backdrop')) return;
    const style = document.createElement('style');
    style.textContent = STYLE;
    style.id = 'msi-style';
    const backdrop = document.createElement('div');
    backdrop.className = 'msi-backdrop';
    backdrop.id = 'msi-backdrop';
    backdrop.innerHTML = `
      <div class="msi-sheet" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="msi-title"><span class="msi-logo"><img src="assets/icon-192.png" alt="" width="40" height="40" /></span><span>${title}</span></div>
        <p class="msi-sub">${subtitle}</p>
        <ol class="msi-steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
        <div class="msi-actions">
          <button class="msi-btn" data-msi-close>لاحقًا</button>
          ${actionHref ? `<a class="msi-btn primary" href="${actionHref}">${actionLabel}</a>` : `<button class="msi-btn primary" data-msi-close>${actionLabel}</button>`}
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

  /* ------------------------------ التثبيت المباشر (PWA) — يبقى متاحًا برمجيًا ------------------------------ */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
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
        subtitle: 'ستجد Montage Studio على شاشتك الرئيسية بأيقونته.',
        steps: ['ابحث عن أيقونة <b>M</b> البنفسجية بين تطبيقاتك'],
        actionLabel: 'رائع',
      });
      return 'installed';
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
      deferredPrompt = null;
      return outcome === 'accepted' ? 'accepted' : 'dismissed';
    }
    // iOS أو متصفح بلا دعم: إرشاد «إضافة إلى الشاشة الرئيسية»
    const iosSteps = [
      'افتح هذه الصفحة في متصفح <b>Safari</b>',
      'اضغط أيقونة <b>المشاركة</b> ▲ في الشريط السفلي',
      'اختر <b>«إضافة إلى الشاشة الرئيسية»</b> ثم اضغط <b>إضافة</b>',
    ];
    const androidSteps = [
      'افتح قائمة المتصفح <b>⋮</b>',
      'اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>',
    ];
    showGuide({
      title: 'تثبيت نسخة الويب',
      subtitle: 'أضف التطبيق إلى شاشتك الرئيسية (نسخة خفيفة تعمل من المتصفح):',
      steps: isIOS() ? iosSteps : androidSteps,
      actionLabel: 'فهمت',
    });
    return 'guide';
  }

  /* ------------------------------ الأزرار: تنزيل مباشر ------------------------------ */
  function bindButtons() {
    const phoneBtn = document.getElementById('dl-phone');
    if (phoneBtn) {
      // زر الهاتف: تنزيل APK مباشرة (href يشير إلى الملف) + دليل التثبيت
      phoneBtn.addEventListener('click', () => {
        if (installed || isStandalone()) { window.location.href = phoneBtn.dataset.fallback || 'mobile.html'; return; }
        showGuide({
          title: 'جارٍ تنزيل تطبيق الهاتف…',
          subtitle: 'بعد اكتمال التنزيل ثبّته مثل أي تطبيق:',
          steps: [
            'افتح <b>التنزيلات</b> واضغط <b>MontageStudio.apk</b>',
            'إذا سألك النظام، اسمح بـ<b>التثبيت من مصادر غير معروفة</b> (مرة واحدة فقط)',
            'اضغط <b>تثبيت</b> — ستجد أيقونة <b>Montage</b> مع تطبيقاتك ويعمل بلا إنترنت',
          ],
          actionLabel: 'تم',
        });
      });
    }

    const pcBtn = document.getElementById('dl-pc');
    if (pcBtn) {
      pcBtn.addEventListener('click', (e) => {
        if (!isMobileDevice()) return; // على الكمبيوتر: التنزيل يجري عبر href مباشرة
        // من هاتف: نوضح أن EXE لويندوز ونقترح نسخة الهاتف
        e.preventDefault();
        showGuide({
          title: 'أنت تستخدم هاتفًا 📱',
          subtitle: 'ملف EXE مخصص لويندوز. لهاتفك يوجد تطبيق APK يعمل بلا إنترنت:',
          steps: [
            'ارجع لأعلى الصفحة واضغط <b>«تثبيت نسخة الهاتف»</b>',
            'أو انتقل لنسخة الويب بالأسفل',
          ],
          actionLabel: 'فتح نسخة الويب',
          actionHref: pcBtn.dataset.fallback || 'desktop.html',
        });
      });
    }

    document.addEventListener('ms:installed', () => {
      const btn = document.getElementById('dl-phone');
      if (btn) {
        const span = btn.querySelector('span');
        if (span) span.textContent = 'تم التثبيت ✓ — افتح التطبيق';
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
