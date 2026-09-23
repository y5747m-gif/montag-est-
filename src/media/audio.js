/**
 * محرّك الصوت — تشغيل طبقات الصوت أثناء المعاينة ومزجها عند التصدير
 */
import { clamp } from '../core/util.js';
import { propValueAt } from '../core/anim.js';

export class AudioEngine {
  constructor(store, media) {
    this.store = store;
    this.media = media;
    this.ctx = null;
    this.master = null;
    this.sources = [];
    this.playing = false;
  }

  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      try {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
        this.master.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      } catch {
        this.master.connect(this.ctx.destination);
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setMasterVolume(val) {
    const v = clamp(val, 0, 2);
    if (this.master) this.master.gain.value = v;
  }

  getAudioLevels() {
    if (!this.analyser || !this.playing) return { left: 0, right: 0, peak: 0, db: -100 };
    const data = new Uint8Array(this.analyser.frequencyBinCount || 32);
    try {
      this.analyser.getByteTimeDomainData(data);
    } catch { return { left: 0, right: 0, peak: 0, db: -100 }; }
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      const s = (data[i] - 128) / 128;
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / data.length);
    const db = rms > 0.0001 ? 20 * Math.log10(rms) : -100;
    const left = clamp(rms * 1.8, 0, 1);
    const right = clamp((rms + (peak - rms) * 0.3) * 1.8, 0, 1);
    return { left, right, peak: clamp(peak, 0, 1), db: Math.round(db) };
  }

  /** تشغيل كل طبقات الصوت بدءًا من إطار معيّن */
  play(fromFrame, rate = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stop();
    const comp = this.store.comp;
    if (!comp) return;
    this.playing = true;
    const now = ctx.currentTime + 0.06;
    const fps = comp.fps;
    comp.layers.forEach((layer) => {
      if (layer.type !== 'audio' && layer.type !== 'video') return;
      if (!layer.enabled) return;
      if (layer.audio?.muted && propValueAt(layer.audio.muted, fromFrame)) return;
      if (fromFrame > layer.outPoint || fromFrame < layer.inPoint) return;
      const assetId = layer.props.assetId?.value;
      const buf = this.media?.buffer(assetId);
      if (!buf) return;
      const speed = clamp((propValueAt(layer.props.speed, fromFrame) || 100) / 100, 0.1, 8) * rate;
      const localFrames = (fromFrame - layer.inPoint) + layer.startTime;
      const offset = localFrames / fps;
      if (offset < 0) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = speed;
      const gain = ctx.createGain();
      const vol = clamp((propValueAt(layer.audio.volume, fromFrame) ?? 100) / 100, 0, 4);
      gain.gain.value = vol;
      src.connect(gain).connect(this.master);
      const remaining = Math.max(0.05, ((layer.outPoint - Math.max(fromFrame, layer.inPoint)) / fps) / speed);
      try {
        src.start(now, offset, remaining);
      } catch (e) { return; }
      this.sources.push(src);
      // تخفيف تدريجي عند نهاية الطبقة إذا كان هناك تأثير تلاشٍ
      src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch (e) {} };
    });
  }

  stop() {
    this.sources.forEach((s) => { try { s.stop(); } catch (e) {} try { s.disconnect(); } catch (e) {} });
    this.sources = [];
    this.playing = false;
  }

  /** مزج الصوت إلى مخزن مؤقت (للتصدير) */
  async renderMixdown(comp, { sampleRate = 48000, fps = 30, startFrame = 0, endFrame = null } = {}) {
    const duration = ((endFrame ?? comp.duration) - startFrame) / fps;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) throw new Error('المتصفح لا يدعم التصدير الصوتي');
    const ctx = new OfflineCtx(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    let hasAudio = false;
    comp.layers.forEach((layer) => {
      if (layer.type !== 'audio' && layer.type !== 'video') return;
      if (!layer.enabled) return;
      const assetId = layer.props.assetId?.value;
      const buf = this.media?.buffer(assetId);
      if (!buf) return;
      const inLayer = Math.max(layer.inPoint, startFrame);
      const outLayer = Math.min(layer.outPoint, endFrame ?? comp.duration);
      if (outLayer <= inLayer) return;
      const speed = clamp((propValueAt(layer.props.speed, inLayer) || 100) / 100, 0.1, 8);
      const startOffset = ((inLayer - startFrame) / fps);
      const srcTime = ((inLayer - layer.inPoint) + layer.startTime) / fps;
      if (srcTime < 0) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = speed;
      const gain = ctx.createGain();
      const vol = clamp((propValueAt(layer.audio.volume, inLayer) ?? 100) / 100, 0, 2);
      gain.gain.value = vol;
      src.connect(gain).connect(master);
      try {
        src.start(startOffset, srcTime, Math.max(0.02, ((outLayer - inLayer) / fps) / speed));
        hasAudio = true;
      } catch (e) { /* تجاهل */ }
    });
    if (!hasAudio) return null;
    const rendered = await ctx.startRendering();
    return rendered;
  }
}

/** ترميز AudioBuffer إلى WAV 16-bit */
export function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const length = buffer.length * numCh * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, length - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, length - 44, true);
  const channels = [];
  for (let c = 0; c < numCh; c += 1) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let c = 0; c < numCh; c += 1) {
      const s = clamp(channels[c][i], -1, 1);
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}
