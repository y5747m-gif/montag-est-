/**
 * تثبيت التطبيق من الموقع (PWA) + زر التحميل
 *
 * - يسجّل عامل الخدمة (sw.js) ليعمل التطبيق بلا اتصال ويُثبَّت على الهاتف.
 * - زر "تحميل التطبيق" في شريط القوائم يتصرّف حسب الجهاز:
 *   • متصفح يدعم التثبيت الذكي (Chrome/Android/Edge): نافذة التثبيت الرسمية فورًا.
 *   • iOS (Safari): إرشادات "مشاركة ← إضافة إلى الشاشة الرئيسية".
 *   • أندرويد بمتصفح لا يدعم التثبيت: رابط تنزيل APK مباشر من آخر إصدار.
 *   • سطح المكتب: تلميح + روابط نسختي ويندوز وأندرويد.
 */
import { openDialog } from '../ui/dialog.js';
import { el } from '../ui/dom.js';
import { toastOk } from '../ui/toast.js';
import { t } from './i18n.js';

export const RELEASES_PAGE = 'https://github.com/y5747m-gif/montag-est-/releases/latest';
export const APK_DIRECT_URL = `${RELEASES_PAGE}/download/app-release.apk`;

const ua = () => navigator.userAgent || '';
const isIOS = () => /iphone|ipad|ipod/i.test(ua());
const isAndroid = () => /android/i.test(ua());
const isCapacitor = () => typeof window !== 'undefined' && !!window.Capacitor;
const isStandalone = () =>
  isCapacitor() ||
  (typeof window !== 'undefined' &&
    ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true));

const LINK_STYLE =
  'display:inline-flex;align-items:center;gap:.4em;margin-top:.7em;padding:.55em 1em;border-radius:8px;' +
  'background:linear-gradient(180deg,#4a9dff,#2f7fe0);color:#fff;text-decoration:none;font-weight:600;';
const NOTE_STYLE = 'color:var(--txt-2);font-size:.92em;line-height:1.9;';

function installDialogBody(html, link) {
  return el('div', {}, [
    el('div', { html, style: NOTE_STYLE }),
    ...(link ? [el('a', { href: link.url, target: '_blank', rel: 'noopener', style: LINK_STYLE, text: link.label })] : []),
  ]);
}

function openInstallHelp(deferredRef) {
  const T = (k, f) => t(k, f);
  if (isIOS()) {
    openDialog({
      title: T('installDialogTitle', 'تحميل التطبيق'),
      iconName: 'i-install',
      body: installDialogBody(
        T(
          'installIOSHow',
          'على iPhone / iPad:<br>١) اضغط زر <b>مشاركة</b> (المربّع بسهم لأعلى) في أسفل المتصفح.<br>٢) اختر <b>«إضافة إلى الشاشة الرئيسية»</b>.<br>٣) اضغط <b>إضافة</b> — سيظهر التطبيق بأيقونته ويعمل بلا اتصال.'
        ),
        null
      ),
    });
    return;
  }
  if (isAndroid()) {
    openDialog({
      title: T('installDialogTitle', 'تحميل التطبيق'),
      iconName: 'i-install',
      body: installDialogBody(
        T(
          'installAndroidHow',
          'للتثبيت كتطبيق: من قائمة المتصفح <b>(⋮)</b> اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.<br>أو نزّل <b>نسخة أندرويد APK</b> مباشرة:'
        ),
        { url: APK_DIRECT_URL, label: T('getApk', 'تنزيل APK لأندرويد') }
      ),
    });
    return;
  }
  // سطح المكتب ومتصفحات أخرى
  openDialog({
    title: T('installDialogTitle', 'تحميل التطبيق'),
    iconName: 'i-install',
    body: el('div', {}, [
      el('div', {
        style: NOTE_STYLE,
        html: T(
          'installDesktopHow',
          'على الهاتف: افتح هذا الموقع في المتصفح ثم اضغط <b>«تثبيت التطبيق»</b> من نافذة المتصفح.<br>على الحاسوب: ثبّته من أيقونة التثبيت في شريط العنوان، أو نزّل النسخ الجاهزة:'
        ),
      }),
      el('div', { style: 'display:flex;gap:.7em;flex-wrap:wrap;margin-top:.2em' }, [
        el('a', { href: RELEASES_PAGE, target: '_blank', rel: 'noopener', style: LINK_STYLE, text: T('getExe', 'تنزيل نسخة ويندوز (EXE)') }),
        el('a', { href: APK_DIRECT_URL, target: '_blank', rel: 'noopener', style: LINK_STYLE, text: T('getApk', 'تنزيل APK لأندرويد') }),
      ]),
    ]),
  });
}

export function initPWA() {
  // تسجيل عامل الخدمة في المتصفح فقط (ليس داخل Electron ولا Capacitor)
  const isElectron = ua().includes('Electron');
  if (!isElectron && !isCapacitor() && 'serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* بيئات التطوير المحلية قد تمنعه — لا مشكلة */
      });
    });
  }

  let deferredPrompt = null;
  const btnInstall = () => document.getElementById('btn-install');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // إبراز الزر لأن التثبيت المباشر أصبح متاحًا
    btnInstall()?.classList.add('ready');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    toastOk(t('installDone', 'تم التثبيت — ستجد التطبيق على شاشتك الرئيسية ✓'));
  });

  btnInstall()?.addEventListener('click', async () => {
    if (isStandalone()) {
      toastOk(t('installedAlready', 'التطبيق مثبّت ويعمل على هذا الجهاز ✓'));
      return;
    }
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch { /* أغلق المستخدم النافذة */ }
      deferredPrompt = null;
      return;
    }
    openInstallHelp();
  });
}
