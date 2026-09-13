/**
 * التصدير — فيديو WebM، سلسلة صور PNG، صور متحركة APNG، صوت WAV، ومشروع
 */
import { el, clear, icon } from '../ui/dom.js';
import { clamp, framesToTimecode, downloadBlob, sleep } from '../core/util.js';
import { openDialog, button } from '../ui/dialog.js';
import { toast, toastOk, toastErr } from '../ui/toast.js';
import { ZipWriter, crc32 } from '../core/zip.js';
import { audioBufferToWav } from '../media/audio.js';

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || 'video/webm';
}

/** تحويل Blob إلى مصفوفة بايتات — مع بديل FileReader للمتصفحات القديمة */
export function blobToUint8(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then((buf) => new Uint8Array(buf));
  }
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(new Uint8Array(fr.result));
    fr.onerror = () => rej(new Error('تعذّر قراءة البيانات'));
    fr.readAsArrayBuffer(blob);
  });
}

async function canvasToUint8(canvas, type = 'image/png', quality) {
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('فشل توليد الصورة'))), type, quality));
  return blobToUint8(blob);
}

/** تصدير إطار واحد PNG */
export function exportFramePNG(app, { scale = 1, transparent = false } = {}) {
  const comp = app.store.comp;
  const url = app.renderer.renderToDataURL(comp, app.store.playhead, { scale, transparent });
  fetch(url).then((r) => r.blob()).then((b) => downloadBlob(b, `${safeName(comp.name)}_${app.store.playhead}.png`));
  toastOk('تم تصدير الإطار');
}

/** سلسلة صور PNG داخل ملف ZIP */
export async function exportPNGSequence(app, { start, end, scale = 1, onProgress, shouldCancel, transparent = false }) {
  const comp = app.store.comp;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(comp.width * scale));
  canvas.height = Math.max(1, Math.round(comp.height * scale));
  const ctx = canvas.getContext('2d');
  const zip = new ZipWriter();
  const total = end - start + 1;
  for (let f = start; f <= end; f += 1) {
    if (shouldCancel?.()) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    app.renderer.renderComp(ctx, comp, f, { width: canvas.width, height: canvas.height, transparent });
    const bytes = await canvasToUint8(canvas, 'image/png');
    zip.add(`frame_${String(f).padStart(5, '0')}.png`, bytes);
    onProgress?.((f - start + 1) / total, `إطار ${f - start + 1} / ${total}`);
    if ((f - start) % 4 === 0) await sleep(0);
  }
  const blob = zip.blob();
  downloadBlob(blob, `${safeName(comp.name)}_PNG.zip`);
  return blob;
}

/* ------------------------------ APNG ------------------------------ */
function pngChunks(bytes) {
  const chunks = [];
  let off = 8; // تخطّي التوقيع
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const data = bytes.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}

function makeChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcData = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcData));
  return out;
}

export async function exportAPNG(app, { start, end, scale = 1, fps, onProgress, shouldCancel, loops = 0 }) {
  const comp = app.store.comp;
  const fpsUsed = fps || comp.fps;
  const w = Math.max(1, Math.round(comp.width * scale));
  const h = Math.max(1, Math.round(comp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const frames = [];
  const total = end - start + 1;
  for (let f = start; f <= end; f += 1) {
    if (shouldCancel?.()) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    app.renderer.renderComp(ctx, comp, f, { width: w, height: h, transparent: false });
    frames.push(await canvasToUint8(canvas, 'image/png'));
    onProgress?.((f - start + 1) / total, `إطار ${f - start + 1} / ${total}`);
    if ((f - start) % 3 === 0) await sleep(0);
  }
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const first = frames[0];
  const chunks = pngChunks(first);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const idat = chunks.filter((c) => c.type === 'IDAT');
  const parts = [sig];
  parts.push(makeChunk('IHDR', ihdr));
  const acTL = new Uint8Array(8);
  const acTLdv = new DataView(acTL.buffer);
  acTLdv.setUint32(0, frames.length);
  acTLdv.setUint32(4, loops);
  parts.push(makeChunk('acTL', acTL));
  let seq = 0;
  const fcTL = (num) => {
    const d = new Uint8Array(26);
    const dv = new DataView(d.buffer);
    dv.setUint32(0, seq++);
    dv.setUint32(4, w);
    dv.setUint32(8, h);
    dv.setUint32(12, 0);
    dv.setUint32(16, 0);
    dv.setUint16(20, Math.max(1, Math.round(1000 / fpsUsed)));
    dv.setUint16(22, 1000);
    d[24] = 0; // dispose
    d[25] = 0; // blend
    return makeChunk('fcTL', d);
  };
  parts.push(fcTL(0));
  idat.forEach((c) => parts.push(makeChunk('IDAT', c.data)));
  for (let i = 1; i < frames.length; i += 1) {
    parts.push(fcTL(i));
    const cs = pngChunks(frames[i]).filter((c) => c.type === 'IDAT');
    const all = concat(cs.map((c) => c.data));
    const d = new Uint8Array(4 + all.length);
    new DataView(d.buffer).setUint32(0, seq++);
    d.set(all, 4);
    parts.push(makeChunk('fdAT', d));
  }
  parts.push(makeChunk('IEND', new Uint8Array(0)));
  const blob = new Blob(parts, { type: 'image/apng' });
  downloadBlob(blob, `${safeName(comp.name)}.apng.png`);
  return blob;
}

function concat(arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  arrays.forEach((a) => { out.set(a, o); o += a.length; });
  return out;
}

/* ------------------------------ WebM ------------------------------ */
export async function exportWebM(app, { start, end, scale = 1, fps, quality = 0.9, onProgress, shouldCancel }) {
  const comp = app.store.comp;
  const fpsUsed = fps || comp.fps;
  const w = Math.max(2, Math.round(comp.width * scale));
  const h = Math.max(2, Math.round(comp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const mime = pickMime();
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(w * h * fpsUsed * 0.12 * quality) });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { recorder.onstop = () => res(new Blob(chunks, { type: mime })); });
  recorder.start();
  const total = end - start + 1;
  const frameDelay = 1000 / fpsUsed;
  for (let f = start; f <= end; f += 1) {
    if (shouldCancel?.()) { recorder.stop(); return null; }
    const t0 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    app.renderer.renderComp(ctx, comp, f, { width: w, height: h, transparent: false });
    if (track.requestFrame) track.requestFrame();
    onProgress?.((f - start + 1) / total, `إطار ${f - start + 1} / ${total}`);
    const elapsed = performance.now() - t0;
    await sleep(Math.max(0, frameDelay - elapsed));
  }
  await sleep(120);
  recorder.stop();
  const blob = await done;
  downloadBlob(blob, `${safeName(comp.name)}.webm`);
  return blob;
}

/* ------------------------------ WAV ------------------------------ */
export async function exportWav(app, { start, end, onProgress }) {
  const comp = app.store.comp;
  onProgress?.(0.1, 'مزج المسار الصوتي…');
  const buffer = await app.audio.renderMixdown(comp, { fps: comp.fps, startFrame: start, endFrame: end });
  if (!buffer) { toastErr('لا توجد طبقات صوت لتصديرها'); return null; }
  onProgress?.(0.8, 'ترميز WAV…');
  const blob = audioBufferToWav(buffer);
  downloadBlob(blob, `${safeName(comp.name)}.wav`);
  return blob;
}

function safeName(name) {
  return String(name || 'project').replace(/[^\w\u0600-\u06FF-]+/g, '_');
}

/* ------------------------------ نافذة التصدير ------------------------------ */
export function exportDialog(app) {
  const comp = app.store.comp;
  let state = {
    format: 'webm',
    range: 'workarea',
    scale: 1,
    fps: comp.fps,
    quality: 90,
    transparent: false,
  };
  let cancelled = false;
  let running = false;

  const body = el('div', { class: 'form-grid' });
  const progressWrap = el('div', { style: { marginTop: '12px', display: 'none' } }, [
    el('div', { class: 'progress-bar' }, [el('i', {})]),
    el('div', { class: 'form-hint', style: { marginTop: '6px' }, text: 'جارٍ التصدير…' }),
  ]);

  const rebuild = () => {
    clear(body);
    const formatField = el('label', { class: 'form-field full' }, [
      el('span', { text: 'الصيغة' }),
      el('div', { class: 'radio-row' }, [
        ['webm', 'فيديو WebM'], ['png', 'سلسلة PNG (ZIP)'], ['apng', 'صورة متحركة APNG'], ['wav', 'صوت WAV'], ['json', 'مشروع JSON'], ['frame', 'إطار PNG واحد'],
      ].map(([v, l]) => el('label', {}, [
        el('input', {
          type: 'radio', name: 'fmt', value: v, checked: state.format === v,
          onchange: () => { state.format = v; rebuild(); },
        }),
        el('span', { text: l }),
      ]))),
    ]);
    body.appendChild(formatField);
    if (state.format !== 'frame' && state.format !== 'json') {
      body.appendChild(el('label', { class: 'form-field' }, [
        el('span', { text: 'النطاق' }),
        el('select', {
          onchange: (e) => { state.range = e.target.value; rebuild(); },
        }, [
          el('option', { value: 'workarea', text: `منطقة العمل (${framesToTimecode(comp.workArea[0], comp.fps)} → ${framesToTimecode(comp.workArea[1], comp.fps)})`, selected: state.range === 'workarea' }),
          el('option', { value: 'all', text: `كامل التركيب (${framesToTimecode(comp.duration, comp.fps)})`, selected: state.range === 'all' }),
          el('option', { value: 'tail', text: 'من المؤشر إلى النهاية', selected: state.range === 'tail' }),
        ]),
      ]));
    }
    if (['webm', 'png', 'apng'].includes(state.format)) {
      body.appendChild(el('label', { class: 'form-field' }, [
        el('span', { text: 'دقة التصدير' }),
        el('select', { onchange: (e) => { state.scale = parseFloat(e.target.value); } },
          [[1, '100%'], [0.75, '75%'], [0.5, '50%'], [2, '200%']].map(([v, l]) => el('option', { value: String(v), text: `${l} (${Math.round(comp.width * v)}×${Math.round(comp.height * v)})`, selected: state.scale === v }))),
      ]));
      body.appendChild(el('label', { class: 'form-field' }, [
        el('span', { text: 'معدل الإطارات' }),
        el('input', { type: 'number', value: state.fps, min: 1, max: 120, onchange: (e) => { state.fps = clamp(+e.target.value || comp.fps, 1, 120); } }),
      ]));
    }
    if (state.format === 'webm') {
      body.appendChild(el('label', { class: 'form-field' }, [
        el('span', { text: 'الجودة (بت/بكسل)' }),
        el('input', { type: 'range', min: 20, max: 200, value: state.quality, oninput: (e) => { state.quality = +e.target.value; } }),
      ]));
      body.appendChild(el('div', { class: 'form-hint full', text: 'ملاحظة: تسجيل WebM يجري بالزمن الحقيقي (مدة التصدير ≈ مدة المقطع). لتصدير الصوت استخدم صيغة WAV ثم ادمجه في برنامج المونتاج.' }));
    }
    body.appendChild(progressWrap);
    const info = el('div', { class: 'form-hint full' });
    const { start, end } = computeRange();
    info.textContent = `الإطارات: ${end - start + 1} · المدة: ${((end - start + 1) / state.fps).toFixed(1)} ثانية`;
    body.appendChild(info);
  };

  const computeRange = () => {
    if (state.range === 'all') return { start: 0, end: comp.duration };
    if (state.range === 'tail') return { start: app.store.playhead, end: comp.duration };
    return { start: comp.workArea[0], end: comp.workArea[1] };
  };

  const dialog = openDialog({
    title: `تصدير — ${comp.name}`,
    iconName: 'i-export',
    body,
    footer: [
      el('div', { class: 'grow' }),
      button('إغلاق', { onClick: () => dialog.close() }),
      button('ابدأ التصدير', {
        primary: true, iconName: 'i-export',
        onClick: async (e) => {
          const { start, end } = computeRange();
          const total = end - start + 1;
          if (total < 1) { toastErr('النطاق غير صالح'); return; }
          const needsFrames = ['webm', 'png', 'apng'].includes(state.format);
          if (needsFrames && state.scale === 1 && total > 900) {
            toast('تحذير: عدد الإطارات كبير — قد يستهلك ذاكرة عالية', 'warn', 5000);
          }
          running = true;
          cancelled = false;
          progressWrap.style.display = 'block';
          const bar = progressWrap.querySelector('i');
          const hint = progressWrap.querySelector('.form-hint');
          const onProgress = (p, msg) => {
            bar.style.width = `${Math.round(p * 100)}%`;
            if (msg) hint.textContent = msg;
          };
          try {
            if (state.format === 'png') await exportPNGSequence(app, { start, end, scale: state.scale, onProgress, shouldCancel: () => cancelled });
            else if (state.format === 'apng') await exportAPNG(app, { start, end, scale: state.scale, fps: state.fps, onProgress, shouldCancel: () => cancelled });
            else if (state.format === 'webm') await exportWebM(app, { start, end, scale: state.scale, fps: state.fps, quality: state.quality / 100, onProgress, shouldCancel: () => cancelled });
            else if (state.format === 'wav') await exportWav(app, { start, end, onProgress });
            else if (state.format === 'json') {
              const blob = new Blob([app.store.serialize({ pretty: true })], { type: 'application/json' });
              downloadBlob(blob, `${safeName(comp.name)}.mgeproj.json`);
            } else if (state.format === 'frame') {
              const blob = await fetch(app.renderer.renderToDataURL(comp, app.store.playhead, { scale: state.scale })).then((r) => r.blob());
              downloadBlob(blob, `${safeName(comp.name)}_${app.store.playhead}.png`);
            }
            onProgress(1, cancelled ? 'تم الإلغاء' : 'تم التصدير بنجاح ✔');
            if (!cancelled) toastOk('تم التصدير بنجاح');
          } catch (err) {
            console.error(err);
            toastErr(`فشل التصدير: ${err.message}`);
          } finally {
            running = false;
          }
        },
      }),
      button('إلغاء', { danger: true, onClick: () => { cancelled = true; } }),
    ],
  });
  rebuild();
  return dialog;
}
