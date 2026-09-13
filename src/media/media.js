/**
 * مدير الوسائط — استيراد الملفات، الصور المصغّرة، الموجات الصوتية، والقياس الزمني
 */
import { uid, clamp } from '../core/util.js';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'];
const PEAK_BUCKETS = 4096;

export function detectKind(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.type?.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'image';
  if (file.type?.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'video';
  if (file.type?.startsWith('audio/') || AUDIO_EXT.includes(ext)) return 'audio';
  return 'other';
}

export class MediaManager {
  constructor(store) {
    this.store = store;
    this.entries = new Map();
    this.audioCtx = null;
    this._ampCache = new Map();
  }

  /* --------------------------- الاستيراد --------------------------- */
  async importFiles(files, { folderId = null, fps = 30 } = {}) {
    const out = [];
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.mgeproj') || file.type === 'application/json') {
        const text = await file.text();
        this.store.loadProject(text);
        out.push({ kind: 'project', name: file.name });
        continue;
      }
      const asset = await this.importFile(file, { folderId, fps });
      if (asset) out.push(asset);
    }
    return out;
  }

  async importFile(file, { folderId = null, fps = 30 } = {}) {
    const kind = detectKind(file);
    if (kind === 'other') { this.store.setStatus(`نوع غير مدعوم: ${file.name}`); return null; }
    const id = uid('ast');
    const url = URL.createObjectURL(file);
    const entry = {
      id, file, kind, url, name: file.name, size: file.size,
      width: 0, height: 0, duration: 0, thumb: null,
      peaks: null, rms: null, buffer: null, img: null, video: null,
    };
    try {
      if (kind === 'image') await this.loadImage(entry);
      else if (kind === 'video') await this.loadVideo(entry);
      else if (kind === 'audio') await this.loadAudio(entry);
    } catch (e) {
      console.warn('فشل تحليل الوسائط', file.name, e);
    }
    this.entries.set(id, entry);
    const asset = this.store.addAsset({
      id,
      name: file.name,
      kind,
      fileType: file.type,
      size: file.size,
      width: entry.width,
      height: entry.height,
      durationFrames: Math.round((entry.duration || 0) * fps),
      fps,
      hasAudio: !!entry.rms,
      thumb: entry.thumb,
      waveform: entry.peaks ? entry.peaks.slice(0, 512) : null,
    }, { folderId });
    return asset;
  }

  async loadImage(entry) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = entry.url;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('تعذّر تحميل الصورة'));
    });
    entry.img = img;
    entry.width = img.naturalWidth;
    entry.height = img.naturalHeight;
    entry.thumb = this.makeThumb(img, img.naturalWidth, img.naturalHeight, 160);
  }

  async loadVideo(entry) {
    const v = document.createElement('video');
    v.src = entry.url;
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    await new Promise((res, rej) => {
      const done = () => res();
      v.onloadedmetadata = done;
      v.onerror = () => rej(new Error('تعذّر قراءة الفيديو'));
      setTimeout(done, 6000);
    });
    entry.video = v;
    entry.width = v.videoWidth || 0;
    entry.height = v.videoHeight || 0;
    entry.duration = Number.isFinite(v.duration) ? v.duration : 0;
    // الموجة الصوتية + الصورة المصغّرة
    try {
      const buf = await file_arrayBuffer(entry.file);
      const audio = await this.decodeAudio(buf);
      if (audio) {
        entry.buffer = audio;
        const analysis = analyzeBuffer(audio);
        entry.peaks = analysis.peaks;
        entry.rms = analysis.rms;
        entry.duration = Math.max(entry.duration, audio.duration);
      } else {
        entry.hasUnknownAudio = true;
      }
    } catch (e) { /* لا صوت */ }
    try { entry.thumb = await this.videoThumb(entry); } catch (e) { /* تجاهل */ }
    // اقرأ أول إطار ليكون محتوى الفيديو جاهزًا
    try { await this.seek(entry, Math.min(0.05, (entry.duration || 1) / 10)); } catch (e) { /* تجاهل */ }
  }

  async loadAudio(entry) {
    const buf = await file_arrayBuffer(entry.file);
    const audio = await this.decodeAudio(buf);
    if (!audio) throw new Error('تعذّر فك ترميز الصوت');
    entry.buffer = audio;
    entry.duration = audio.duration;
    const analysis = analyzeBuffer(audio);
    entry.peaks = analysis.peaks;
    entry.rms = analysis.rms;
    entry.thumb = waveformImage(analysis.peaks, '#38c172');
  }

  async decodeAudio(arrayBuffer) {
    try {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new Ctx();
      }
      if (this.audioCtx.state === 'suspended') { try { await this.audioCtx.resume(); } catch (e) {} }
      return await this.audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch (e) {
      return null;
    }
  }

  makeThumb(src, w, h, targetW = 160, time = null) {
    try {
      const c = document.createElement('canvas');
      const scale = targetW / Math.max(1, w);
      c.width = targetW;
      c.height = Math.max(1, Math.round(h * scale));
      const cx = c.getContext('2d');
      cx.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (e) { return null; }
  }

  async videoThumb(entry) {
    const v = entry.video;
    if (!v) return null;
    const t = Math.min(Math.max(0.1, (entry.duration || 1) * 0.1), 2);
    await this.seek(entry, t);
    return this.makeThumb(v, v.videoWidth, v.videoHeight, 160);
  }

  /* --------------------------- القراءة --------------------------- */
  get(id) { return this.entries.get(id) || null; }
  url(id) { return this.entries.get(id)?.url || null; }
  image(id) { return this.entries.get(id)?.img || null; }
  video(id) { return this.entries.get(id)?.video || null; }
  buffer(id) { return this.entries.get(id)?.buffer || null; }
  peaks(id) { return this.entries.get(id)?.peaks || null; }
  duration(id) { return this.entries.get(id)?.duration || 0; }
  thumb(id) { return this.entries.get(id)?.thumb || null; }

  release(id) {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.url) URL.revokeObjectURL(e.url);
    if (e.video) { e.video.pause(); e.video.src = ''; }
    this.entries.delete(id);
  }

  releaseAll() {
    [...this.entries.keys()].forEach((id) => this.release(id));
  }

  /** تقدّم الفيديو إلى زمن معيّن (ثواني) */
  seek(entry, seconds) {
    const v = entry.video;
    if (!v) return Promise.resolve(false);
    const dur = entry.duration || v.duration || 0;
    const t = clamp(seconds, 0, Math.max(0, dur - 0.001));
    if (Math.abs((v.currentTime || 0) - t) < 0.02 && v.readyState >= 2) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        v.removeEventListener('seeked', onSeeked);
        resolve(ok);
      };
      const onSeeked = () => finish(true);
      v.addEventListener('seeked', onSeeked);
      try { v.currentTime = t; } catch (e) { finish(false); }
      setTimeout(() => finish(v.readyState >= 2), 450);
    });
  }

  /** شدّة الصوت (RMS) عند إطار معيّن لكل الوسائط الصوتية في التركيب */
  ampAt(frame, comp, fps) {
    if (!comp) return 0;
    const key = `${comp.id}:${frame}`;
    if (this._ampCache.has(key)) return this._ampCache.get(key);
    let total = 0, count = 0;
    for (const layer of comp.layers) {
      if (layer.type !== 'audio' && layer.type !== 'video') continue;
      const assetId = layer.props.assetId?.value;
      if (!assetId) continue;
      const entry = this.entries.get(assetId);
      if (!entry?.rms) continue;
      const local = ((frame - layer.inPoint) + layer.startTime) / fps;
      const idx = clamp(Math.floor(local * (entry.rms.length / Math.max(0.001, entry.duration))), 0, entry.rms.length - 1);
      total += entry.rms[idx] || 0;
      count += 1;
    }
    const val = count ? total / count : 0;
    if (this._ampCache.size > 4000) this._ampCache.clear();
    this._ampCache.set(key, val);
    return val;
  }

  /** سلسلة قيم RMS حول إطار معيّن (للرسوم البيانية في الموجّه الصوتي) */
  rmsWindow(assetId, centerSec, count, windowSec) {
    const entry = this.entries.get(assetId);
    const out = new Float32Array(count);
    if (!entry?.rms) return out;
    const rate = entry.rms.length / Math.max(0.001, entry.duration);
    for (let i = 0; i < count; i += 1) {
      const t = centerSec + (i / count) * windowSec;
      const idx = clamp(Math.floor(t * rate), 0, entry.rms.length - 1);
      out[i] = entry.rms[idx] || 0;
    }
    return out;
  }

  /** بيانات الأصول الصوتية الافتراضية (مشروع العرض) */
  registerVirtual(id, { name, peaks, rms, duration }) {
    this.entries.set(id, { id, virtual: true, name, peaks, rms, duration, file: null, url: null });
  }
}

/* --------------------------- أدوات --------------------------- */
async function file_arrayBuffer(file) {
  return await file.arrayBuffer();
}

function analyzeBuffer(audioBuffer) {
  const ch = audioBuffer.getChannelData(0);
  const buckets = Math.min(PEAK_BUCKETS, Math.max(64, Math.floor(ch.length / 512)));
  const size = Math.floor(ch.length / buckets);
  const peaks = new Float32Array(buckets);
  const rms = new Float32Array(buckets);
  for (let b = 0; b < buckets; b += 1) {
    let max = 0, sum = 0;
    const start = b * size;
    for (let i = 0; i < size; i += 1) {
      const v = Math.abs(ch[start + i] || 0);
      if (v > max) max = v;
      sum += v * v;
    }
    peaks[b] = max;
    rms[b] = Math.sqrt(sum / Math.max(1, size));
  }
  // تنعيم خفيف
  const smooth = new Float32Array(rms.length);
  for (let i = 0; i < rms.length; i += 1) {
    const a = rms[Math.max(0, i - 1)], b = rms[i], c = rms[Math.min(rms.length - 1, i + 1)];
    smooth[i] = Math.max(b, (a + b + c) / 3);
  }
  return { peaks, rms: smooth, duration: audioBuffer.duration };
}

function waveformImage(peaks, color = '#38c172') {
  try {
    const w = 160, h = 90;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.fillStyle = '#101216';
    cx.fillRect(0, 0, w, h);
    cx.strokeStyle = color;
    cx.lineWidth = 1;
    cx.beginPath();
    for (let x = 0; x < w; x += 1) {
      const idx = Math.floor((x / w) * peaks.length);
      const v = (peaks[idx] || 0) * (h / 2) * 0.92;
      cx.moveTo(x + 0.5, h / 2 - v);
      cx.lineTo(x + 0.5, h / 2 + v);
    }
    cx.stroke();
    return c.toDataURL('image/png');
  } catch (e) { return null; }
}

/** يقوم بتوليد "إيقاع" افتراضي لمشروع العرض التقديمي */
export function makeDemoBeat(durationSec = 10, bpm = 120) {
  const buckets = Math.floor(durationSec * 30);
  const rms = new Float32Array(buckets);
  const peaks = new Float32Array(buckets);
  const beat = 60 / bpm;
  for (let i = 0; i < buckets; i += 1) {
    const t = i / 30;
    const phase = (t % beat) / beat;
    const kick = Math.exp(-phase * 14) * (Math.floor(t / beat) % 2 === 0 ? 1 : 0.55);
    const hat = Math.exp(-((t % (beat / 2)) / (beat / 2)) * 30) * 0.35;
    const swell = 0.4 + 0.35 * Math.sin(t * 0.4);
    const v = clamp((kick + hat) * 1.4 * swell, 0, 1);
    rms[i] = v; peaks[i] = Math.min(1, v * 1.25);
  }
  return { peaks, rms, duration: durationSec };
}
