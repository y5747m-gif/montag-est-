/**
 * نافذة عرض التطبيق والموقع (Showcase & Studio Tour)
 * تعرض صور استوديو المونتاج والموقع التعريفي مع استعراض شامل لكافة الخصائص الاحترافية
 */
import { el, clear, icon } from './dom.js';
import { openDialog } from './dialog.js';

export function openShowcaseDialog(app) {
  const dlg = openDialog({
    title: 'معرض استوديو المونتاج والموقع الرسمي — Montage Studio Showcase',
    body: '',
    width: '820px',
  });

  const body = dlg.body || dlg.bodyEl;
  clear(body);

  const container = el('div', { class: 'showcase-dialog' });

  // شريط التبويبات العلوية داخل النافذة
  const tabsBar = el('div', { class: 'showcase-tabs' }, [
    el('button', { class: 's-tab active', dataset: { view: 'app' }, text: '🖥️ استعراض التطبيق (Studio)' }),
    el('button', { class: 's-tab', dataset: { view: 'site' }, text: '🌐 استعراض الموقع (Website)' }),
    el('button', { class: 's-tab', dataset: { view: 'features' }, text: '⚡ المزايا الاحترافية' }),
    el('button', { class: 's-tab', dataset: { view: 'guide' }, text: '📖 دليل الاستخدام السريع' }),
  ]);

  // محتوى التبويبات
  const contentArea = el('div', { class: 'showcase-content' });

  // 1) تبويب صورة التطبيق
  const viewApp = el('div', { class: 's-view active', dataset: { view: 'app' } }, [
    el('div', { class: 'showcase-hero' }, [
      el('img', {
        src: 'assets/montag-studio-showcase.png',
        alt: 'Montage Studio Application Showcase',
        class: 'showcase-img',
      }),
      el('div', { class: 'showcase-caption' }, [
        el('h3', { text: 'استوديو المونتاج والموشن جرافيك الكامل في المتصفح' }),
        el('p', { text: 'بيئة عمل مظلمة واحترافية متطورة مع شاشة معاينة 4K، خط زمني سينمائي، مقاييس ديسيبل حية (VU Meters)، وأدوات قص وتحريك دقيقة.' }),
        el('div', { class: 'showcase-actions' }, [
          el('a', {
            href: 'assets/montag-studio-showcase.png',
            target: '_blank',
            download: 'montag-studio-app-showcase.png',
            class: 'btn primary sm',
            text: 'تحميل الصورة الأصلية (4K)',
          }),
          el('a', {
            href: 'assets/montag-studio-showcase.png',
            target: '_blank',
            class: 'btn sm',
            text: 'عرض بالحجم الكامل ↗',
          }),
        ]),
      ]),
    ]),
  ]);

  // 2) تبويب صورة الموقع
  const viewSite = el('div', { class: 's-view', dataset: { view: 'site' } }, [
    el('div', { class: 'showcase-hero' }, [
      el('img', {
        src: 'assets/website-showcase.png',
        alt: 'Montage Studio Official Website',
        class: 'showcase-img',
      }),
      el('div', { class: 'showcase-caption' }, [
        el('h3', { text: 'الموقع الرسمي وبوابة المونتاج السحابي' }),
        el('p', { text: 'تصميم زجاجي عصري (Glassmorphism) مع تكامل كامل لأدوات الذكاء الاصطناعي، التصدير فائق الدقة، وحزم الانتقالات والقوالب الجاهزة.' }),
        el('div', { class: 'showcase-actions' }, [
          el('a', {
            href: 'assets/website-showcase.png',
            target: '_blank',
            download: 'montag-studio-website-showcase.png',
            class: 'btn primary sm',
            text: 'تحميل صورة الموقع',
          }),
          el('a', {
            href: 'assets/website-showcase.png',
            target: '_blank',
            class: 'btn sm',
            text: 'عرض بالحجم الكامل ↗',
          }),
        ]),
      ]),
    ]),
  ]);

  // 3) تبويب المزايا والمواصفات
  const viewFeatures = el('div', { class: 's-view', dataset: { view: 'features' } }, [
    el('div', { class: 'features-grid' }, [
      el('div', { class: 'f-card' }, [
        el('span', { class: 'f-icon', text: '✂️' }),
        el('h4', { text: 'أداة المشرط والقص اللحظي (Razor C)' }),
        el('p', { text: 'قص وتقسيم المقاطع بنقرة واحدة مباشرة على أي مسار أو عند مؤشر التشغيل.' }),
      ]),
      el('div', { class: 'f-card' }, [
        el('span', { class: 'f-icon', text: '🎬' }),
        el('h4', { text: 'انتقالات سينمائية جاهزة' }),
        el('p', { text: 'تلاشٍ متقاطع، تلاشٍ للسواد/البياض، انزلاق، تقريب Zoom، تشويش Glitch، ومسح دائري.' }),
      ]),
      el('div', { class: 'f-card' }, [
        el('span', { class: 'f-icon', text: '🎙️' }),
        el('h4', { text: 'استوديو التعليق الصوتي (Voiceover)' }),
        el('p', { text: 'تسجيل مباشر من الميكروفون مع عداد زمني ورسم بياني للموجة الصوتية وإدراج فوري بالخط الزمني.' }),
      ]),
      el('div', { class: 'f-card' }, [
        el('span', { class: 'f-icon', text: '📹' }),
        el('h4', { text: 'تسجيل الشاشة والكاميرا' }),
        el('p', { text: 'تسجيل سطح المكتب أو كاميرا الويب لإنشاء شروحات وفيديوهات ألعاب داخل البرنامج مباشرة.' }),
      ]),
      el('div', { class: 'f-card' }, [
        el('span', { class: 'f-icon', text: '🔊' }),
        el('h4', { text: 'مكتبة مؤثرات صوتية مدمجة (SFX)' }),
        el('p', { text: 'Whoosh، Swoosh، ضربات سينمائية Boom، فرقعة Pop، نقرة كاميرا، وتشويش رقمي بدون إنترنت.' }),
      ]),
      el('div', { class: 'f-card' }, [
        el('span', { class: 'f-icon', text: '🎛️' }),
        el('h4', { text: 'مقياس ديسيبل حي (Stereo VU Meter)' }),
        el('p', { text: 'متابعة بصرية دقيقة لمستويات الصوت (L/R) مع تحذير من التشويه وتعديل المستوى العام.' }),
      ]),
      el('div', { class: 'f-card' }, [
        el('span', { class: 'f-icon', text: '🎨' }),
        el('h4', { text: 'تلوين سينمائي (LUT Grading)' }),
        el('p', { text: 'تلوين هوليوود تيل وبرتقالي (Teal & Orange)، كاميرا فيلم 35 مم، سايبربانك، وسينما نوار.' }),
      ]),
      el('div', { class: 'f-card' }, [
        el('span', { class: 'f-icon', text: '📱' }),
        el('h4', { text: 'مقاسات جميع المنصات بضغطة زر' }),
        el('p', { text: 'يوتيوب 16:9، تيك توك وريلز 9:16، إنستغرام 1:1 و4:5، وشاشات سينمائية 21:9 و4K.' }),
      ]),
    ]),
  ]);

  // 4) تبويب الدليل السريع
  const viewGuide = el('div', { class: 's-view', dataset: { view: 'guide' } }, [
    el('div', { class: 'guide-card' }, [
      el('h4', { text: '🚀 كيف تبدأ مونتاج أول فيديو احترافي؟' }),
      el('ol', { class: 'guide-steps' }, [
        el('li', { html: '<b>استيراد الوسائط:</b> اسحب مقاطع الفيديو أو الصوت أو الصور إلى لوحة <i>المشروع</i>، أو اضغط زر <b>استيراد (+)</b>.' }),
        el('li', { html: '<b>إضافة للخط الزمني:</b> اسحب المقاطع إلى الخط الزمني أو انقر مرتين عليها لتبدأ من موضع المؤشر.' }),
        el('li', { html: '<b>القص والتقطيع:</b> اختر أداة <b>المشرط (C)</b> وانقر على المقطع للقص، أو اضغط <b>Ctrl+Shift+D</b> للتقسيم عند المؤشر.' }),
        el('li', { html: '<b>إضافة انتقالات ومؤثرات:</b> افتح تبويب <i>الانتقالات</i> واختر الانتقال المناسب (مثل التلاشي أو التقريب).' }),
        el('li', { html: '<b>تسجيل تعليق صوتي:</b> اضغط أيقونة الميكروفون 🎙️ في الشريط لبدء تسجيل صوتك وإدراجه مباشرة.' }),
        el('li', { html: '<b>التصدير:</b> اضغط زر <b>تصدير</b> الأزرق أعلى الشاشة لتصدير الفيديو بصيغة WebM أو سلسلة صور أو صوت WAV عالي الجودة.' }),
      ]),
    ]),
  ]);

  contentArea.append(viewApp, viewSite, viewFeatures, viewGuide);

  tabsBar.querySelectorAll('.s-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      tabsBar.querySelectorAll('.s-tab').forEach((t) => t.classList.toggle('active', t === tab));
      contentArea.querySelectorAll('.s-view').forEach((v) => v.classList.toggle('active', v.dataset.view === tab.dataset.view));
    });
  });

  const footer = el('div', { class: 'showcase-footer' }, [
    el('span', { class: 'showcase-ver', text: 'Montage Studio v1.5 Pro Edition • استوديو المونتاج العربي المتكامل' }),
    el('button', {
      class: 'btn primary',
      text: 'إغلاق ومتابعة المونتاج',
      onclick: () => dlg.close(),
    }),
  ]);

  container.append(tabsBar, contentArea, footer);
  body.appendChild(container);
}
