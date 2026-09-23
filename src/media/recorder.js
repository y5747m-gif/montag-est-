/**
 * استوديو التسجيل المباشر — تسجيل التعليق الصوتي (Voiceover) وتسجيل الشاشة/الكاميرا
 * وإدراج المخرجات مباشرة كطبقات في الخط الزمني لمونتاج فوري.
 */
import { el, clear, icon } from '../ui/dom.js';
import { openDialog } from '../ui/dialog.js';
import { toast, toastOk, toastWarn, toastErr } from '../ui/toast.js';
import { framesToTimecode, uid } from '../core/util.js';

/** نافذة تسجيل التعليق الصوتي المباشر */
export function openVoiceoverRecorder(app) {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let animId = null;
  let startTime = 0;
  let timerInterval = null;
  let audioCtx = null;
  let analyser = null;

  const dlg = openDialog({
    title: 'تسجيل تعليق صوتي (Voiceover Studio)',
    body: '',
    width: '460px',
  });

  const body = dlg.body || dlg.bodyEl;
  clear(body);

  const container = el('div', { class: 'recorder-modal' });

  // عداد الوقت
  const timerDisplay = el('div', { class: 'rec-timer', text: '00:00:00' });

  // كانفاس رسم الموجة الصوتية الحية
  const canvas = el('canvas', { class: 'rec-canvas', width: '380', height: '80' });
  const ctx = canvas.getContext('2d');

  // رسالة الحالة
  const statusMsg = el('div', { class: 'rec-status', text: 'اضغط على "بدء التسجيل" للبدء بالحديث' });

  // أزرار التحكم
  const btnRecord = el('button', { class: 'btn primary lg', text: 'بدء التسجيل' }, [icon('i-mic', 16)]);
  const btnStop = el('button', { class: 'btn danger lg', text: 'إيقاف وحفظ', style: { display: 'none' } });
  const btnCancel = el('button', { class: 'btn ghost', text: 'إلغاء' });

  const btnRow = el('div', { class: 'rec-buttons' }, [btnRecord, btnStop, btnCancel]);

  container.append(timerDisplay, canvas, statusMsg, btnRow);
  body.appendChild(container);

  // إيقاف وتنظيف عند إغلاق النافذة
  const cleanup = () => {
    if (animId) cancelAnimationFrame(animId);
    if (timerInterval) clearInterval(timerInterval);
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      try { audioCtx.close(); } catch {}
    }
  };

  dlg.onClose = cleanup;
  btnCancel.addEventListener('click', () => { cleanup(); dlg.close(); });

  // رسم مؤشر الصوت المبدئي
  const drawWave = (dataArray) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#101524';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!dataArray) {
      ctx.strokeStyle = '#3d527a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      return;
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ff4d6d';
    ctx.beginPath();
    const sliceWidth = canvas.width / dataArray.length;
    let x = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  };
  drawWave(null);

  btnRecord.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toastErr('المتصفح لا يدعم الوصول للميكروفون');
      return;
    }

    try {
      btnRecord.disabled = true;
      statusMsg.textContent = 'جاري الاتصال بالميكروفون…';
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        audioCtx = new Ctx();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const renderLoop = () => {
          analyser.getByteTimeDomainData(dataArray);
          drawWave(dataArray);
          animId = requestAnimationFrame(renderLoop);
        };
        renderLoop();
      }

      // عداد 3.. 2.. 1..
      let countdown = 3;
      statusMsg.textContent = `التسجيل سيبدأ بعد: ${countdown}…`;
      const cdInterval = setInterval(() => {
        countdown -= 1;
        if (countdown > 0) {
          statusMsg.textContent = `التسجيل سيبدأ بعد: ${countdown}…`;
        } else {
          clearInterval(cdInterval);
          startMediaRecorder();
        }
      }, 700);

    } catch (err) {
      btnRecord.disabled = false;
      statusMsg.textContent = 'تعذّر تشغيل الميكروفون (تحقق من الصلاحيات)';
      toastErr(`تعذّر الوصول للميكروفون: ${err.message}`);
    }
  });

  const startMediaRecorder = () => {
    chunks = [];
    let mimeType = 'audio/webm';
    if (window.MediaRecorder?.isTypeSupported?.('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
    else if (window.MediaRecorder?.isTypeSupported?.('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';

    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      statusMsg.textContent = 'جاري معالجة الصوت وإدراجه في الخط الزمني…';
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      await processAndInsertAudio(blob);
      cleanup();
      dlg.close();
    };

    recorder.start(100);
    startTime = Date.now();
    statusMsg.innerHTML = '<span class="rec-dot"></span> جاري التسجيل الآن… تحدّث في الميكروفون';
    btnRecord.style.display = 'none';
    btnStop.style.display = '';

    timerInterval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const s = String(elapsedSec % 60).padStart(2, '0');
      timerDisplay.textContent = `00:${m}:${s}`;
    }, 500);
  };

  btnStop.addEventListener('click', () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  });

  const processAndInsertAudio = async (blob) => {
    try {
      const file = new File([blob], `voiceover_${Date.now()}.webm`, { type: blob.type });
      const asset = await app.media.importFile(file, { fps: app.store.fps });
      if (asset) {
        const layer = app.addAssetLayer(asset, app.store.playhead);
        if (layer) {
          layer.name = `تعليق صوتي ${app.store.comp.layers.filter((l) => l.type === 'audio').length}`;
          toastOk('تم تسجيل التعليق الصوتي وإدراجه في الخط الزمني بنجاح!');
          app.timeline.rebuild();
        }
      }
    } catch (err) {
      toastErr(`فشل إدراج التسجيل: ${err.message}`);
    }
  };
}

/** نافذة تسجيل الشاشة أو الكاميرا */
export function openScreenRecorder(app) {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let startTime = 0;
  let timerInterval = null;

  const dlg = openDialog({
    title: 'تسجيل الشاشة والكاميرا (Screen & Cam Studio)',
    body: '',
    width: '520px',
  });

  const body = dlg.body || dlg.bodyEl;
  clear(body);

  const container = el('div', { class: 'recorder-modal' });

  // اختيار المصدر
  const sourceRow = el('div', { class: 'rec-mode-select' }, [
    el('label', { class: 'radio-card active' }, [
      el('input', { type: 'radio', name: 'rec-mode', value: 'screen', checked: true }),
      icon('i-video', 16),
      el('span', { text: 'شاشة الحاسوب (Screen)' }),
    ]),
    el('label', { class: 'radio-card' }, [
      el('input', { type: 'radio', name: 'rec-mode', value: 'camera' }),
      icon('i-camera', 16),
      el('span', { text: 'الكاميرا (Webcam)' }),
    ]),
  ]);

  sourceRow.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      sourceRow.querySelectorAll('.radio-card').forEach((c) => c.classList.toggle('active', c.contains(input)));
    });
  });

  // معاينة الفيديو
  const videoPreview = el('video', { class: 'rec-video-preview', autoplay: true, muted: true, playsinline: true });
  videoPreview.style.display = 'none';

  // عداد الوقت
  const timerDisplay = el('div', { class: 'rec-timer', text: '00:00:00' });

  const statusMsg = el('div', { class: 'rec-status', text: 'اختر مصدر التسجيل واضغط على "بدء التسجيل"' });

  const btnRecord = el('button', { class: 'btn primary lg', text: 'بدء التسجيل' }, [icon('i-video', 16)]);
  const btnStop = el('button', { class: 'btn danger lg', text: 'إيقاف التسجيل وحفظ بالفيديو', style: { display: 'none' } });
  const btnCancel = el('button', { class: 'btn ghost', text: 'إلغاء' });

  const btnRow = el('div', { class: 'rec-buttons' }, [btnRecord, btnStop, btnCancel]);

  container.append(sourceRow, timerDisplay, videoPreview, statusMsg, btnRow);
  body.appendChild(container);

  const cleanup = () => {
    if (timerInterval) clearInterval(timerInterval);
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
  };

  dlg.onClose = cleanup;
  btnCancel.addEventListener('click', () => { cleanup(); dlg.close(); });

  btnRecord.addEventListener('click', async () => {
    const mode = container.querySelector('input[name="rec-mode"]:checked')?.value || 'screen';
    try {
      btnRecord.disabled = true;
      statusMsg.textContent = 'جاري تهيئة المصدر…';

      if (mode === 'screen') {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('المتصفح لا يدعم تسجيل الشاشة');
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } else {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح لا يدعم الوصول للكاميرا');
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }

      videoPreview.srcObject = stream;
      videoPreview.style.display = 'block';

      // ربط حدث إيقاف مشاركة الشاشة من المتصفح مباشرة
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder && recorder.state === 'recording') recorder.stop();
      });

      chunks = [];
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!window.MediaRecorder?.isTypeSupported?.(mimeType)) {
        mimeType = window.MediaRecorder?.isTypeSupported?.('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
      }

      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        statusMsg.textContent = 'جاري استيراد الفيديو المسجل إلى مشروع المونتاج…';
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
        await processAndInsertVideo(blob, mode);
        cleanup();
        dlg.close();
      };

      recorder.start(250);
      startTime = Date.now();
      statusMsg.innerHTML = '<span class="rec-dot"></span> جاري التسجيل الآن…';
      btnRecord.style.display = 'none';
      sourceRow.style.display = 'none';
      btnStop.style.display = '';

      timerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const s = String(elapsedSec % 60).padStart(2, '0');
        timerDisplay.textContent = `00:${m}:${s}`;
      }, 500);

    } catch (err) {
      btnRecord.disabled = false;
      statusMsg.textContent = 'تعذّر بدء التسجيل';
      toastErr(`خطأ في التسجيل: ${err.message}`);
    }
  });

  btnStop.addEventListener('click', () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  });

  const processAndInsertVideo = async (blob, mode) => {
    try {
      const name = mode === 'screen' ? `تسجيل_شاشة_${Date.now()}.webm` : `تسجيل_كاميرا_${Date.now()}.webm`;
      const file = new File([blob], name, { type: blob.type });
      const asset = await app.media.importFile(file, { fps: app.store.fps });
      if (asset) {
        const layer = app.addAssetLayer(asset, app.store.playhead);
        if (layer) {
          layer.name = mode === 'screen' ? 'تسجيل شاشة' : 'تسجيل كاميرا';
          toastOk('تم تسجيل الفيديو وإضافته إلى مسار المونتاج بنجاح!');
          app.timeline.rebuild();
        }
      }
    } catch (err) {
      toastErr(`فشل إضافة الفيديو: ${err.message}`);
    }
  };
}
