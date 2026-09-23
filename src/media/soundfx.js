/**
 * مكتبة المؤثرات الصوتية المدمجة — توليد أصوات إجرائية عبر Web Audio API
 * تعمل 100% بدون إنترنت ودون الحاجة لتنزيل أي ملفات خارجية.
 */
import { audioBufferToWav } from './audio.js';
import { clamp } from '../core/util.js';

export const SOUND_EFFECTS = [
  {
    id: 'sfx_whoosh',
    name: 'حركة هوائية سريعة (Whoosh)',
    desc: 'صوت هواء سريع مثالي لانتقالات المشاهد وحركة النصوص',
    duration: 0.55,
    category: 'transitions',
    generate: (ctx, sampleRate = 44100) => {
      const len = Math.floor(0.55 * sampleRate);
      const buf = ctx.createBuffer(2, len, sampleRate);
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      // ضوضاء بيضاء مع مسح ترددات منخفضة لعالية ثم منخفضة (Bandpass)
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i += 1) {
        const t = i / len;
        const env = Math.sin(t * Math.PI) ** 2; // منحنى بيضاوي
        const noise = (Math.random() * 2 - 1) * 0.9;
        // فلتر ثنائي القطب بسيط
        const f = 0.04 + 0.3 * Math.sin(t * Math.PI);
        b0 = 0.88 * b0 + f * noise;
        b1 = 0.88 * b1 + f * b0;
        b2 = 0.88 * b2 + f * b1;
        const pan = Math.sin(t * Math.PI * 1.5) * 0.4;
        left[i] = clamp(b2 * env * (0.8 - pan), -1, 1);
        right[i] = clamp(b2 * env * (0.8 + pan), -1, 1);
      }
      return buf;
    },
  },
  {
    id: 'sfx_swoosh',
    name: 'سحب هوائي ناعم (Swoosh)',
    desc: 'صوت حركة خفيفة وناعمة للنوافذ والأيقونات',
    duration: 0.38,
    category: 'transitions',
    generate: (ctx, sampleRate = 44100) => {
      const len = Math.floor(0.38 * sampleRate);
      const buf = ctx.createBuffer(2, len, sampleRate);
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      let b0 = 0;
      for (let i = 0; i < len; i += 1) {
        const t = i / len;
        const env = Math.sin(t * Math.PI) ** 3;
        const noise = (Math.random() * 2 - 1);
        const f = 0.1 + 0.35 * Math.sin(t * Math.PI);
        b0 = 0.82 * b0 + f * noise;
        const s = b0 * env * 0.75;
        left[i] = clamp(s * (1 - t * 0.3), -1, 1);
        right[i] = clamp(s * (0.7 + t * 0.3), -1, 1);
      }
      return buf;
    },
  },
  {
    id: 'sfx_cinematic_boom',
    name: 'ضربة سينمائية عميقة (Cinematic Impact)',
    desc: 'صوت انفجار هبوط صب-بيس للمقدمات الدرامية',
    duration: 1.8,
    category: 'cinematic',
    generate: (ctx, sampleRate = 44100) => {
      const len = Math.floor(1.8 * sampleRate);
      const buf = ctx.createBuffer(2, len, sampleRate);
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      let phase = 0;
      for (let i = 0; i < len; i += 1) {
        const t = i / sampleRate;
        // تردد يبدأ من 130 هرتز ويهبط إلى 38 هرتز
        const freq = 38 + 92 * Math.exp(-t * 6.5);
        phase += 2 * Math.PI * freq / sampleRate;
        const sub = Math.sin(phase) * Math.exp(-t * 2.2);
        const sub2 = Math.sin(phase * 0.5) * Math.exp(-t * 1.6) * 0.5;
        const noise = (Math.random() * 2 - 1) * Math.exp(-t * 22) * 0.4;
        const s = clamp((sub + sub2 + noise) * 0.95, -1, 1);
        left[i] = s;
        right[i] = s;
      }
      return buf;
    },
  },
  {
    id: 'sfx_pop',
    name: 'فرقعة كرتونية لطيفة (Pop Bubble)',
    desc: 'صوت فرقعة مرح لظهور العناصر والملصقات',
    duration: 0.16,
    category: 'ui',
    generate: (ctx, sampleRate = 44100) => {
      const len = Math.floor(0.16 * sampleRate);
      const buf = ctx.createBuffer(2, len, sampleRate);
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      let phase = 0;
      for (let i = 0; i < len; i += 1) {
        const t = i / sampleRate;
        const freq = 160 + 900 * Math.exp(-t * 45);
        phase += 2 * Math.PI * freq / sampleRate;
        const s = Math.sin(phase) * Math.exp(-t * 32) * 0.85;
        left[i] = s;
        right[i] = s;
      }
      return buf;
    },
  },
  {
    id: 'sfx_camera_click',
    name: 'غالق كاميرا (Camera Shutter)',
    desc: 'نقرة مزدوجة واقعية لالتقاط الصور وتجميد الإطار',
    duration: 0.32,
    category: 'ui',
    generate: (ctx, sampleRate = 44100) => {
      const len = Math.floor(0.32 * sampleRate);
      const buf = ctx.createBuffer(2, len, sampleRate);
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      const t1 = 0.02, t2 = 0.11;
      for (let i = 0; i < len; i += 1) {
        const t = i / sampleRate;
        let s = 0;
        if (t >= t1 && t < t1 + 0.05) {
          const dt = t - t1;
          s += (Math.random() * 2 - 1) * Math.exp(-dt * 90) * 0.8;
          s += Math.sin(2 * Math.PI * 1800 * dt) * Math.exp(-dt * 120) * 0.4;
        }
        if (t >= t2 && t < t2 + 0.08) {
          const dt = t - t2;
          s += (Math.random() * 2 - 1) * Math.exp(-dt * 70) * 0.7;
          s += Math.sin(2 * Math.PI * 1200 * dt) * Math.exp(-dt * 90) * 0.3;
        }
        const val = clamp(s, -1, 1);
        left[i] = val;
        right[i] = val;
      }
      return buf;
    },
  },
  {
    id: 'sfx_glitch_zap',
    name: 'تشويش وشرارة رقمية (Glitch Zap)',
    desc: 'صوت عطل تقني وانتقال رقمي سايبربانك',
    duration: 0.45,
    category: 'transitions',
    generate: (ctx, sampleRate = 44100) => {
      const len = Math.floor(0.45 * sampleRate);
      const buf = ctx.createBuffer(2, len, sampleRate);
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      let phase = 0;
      for (let i = 0; i < len; i += 1) {
        const t = i / sampleRate;
        const step = Math.floor(t * 30);
        const freq = [440, 880, 220, 1320, 110, 660, 1760][step % 7];
        phase += 2 * Math.PI * freq / sampleRate;
        const wave = Math.sign(Math.sin(phase)) * 0.4;
        const noise = (Math.random() * 2 - 1) * ((step % 3 === 0) ? 0.6 : 0.1);
        const env = Math.exp(-t * 4);
        const s = clamp((wave + noise) * env * 0.7, -1, 1);
        left[i] = s;
        right[i] = clamp((wave - noise) * env * 0.7, -1, 1);
      }
      return buf;
    },
  },
  {
    id: 'sfx_success_ding',
    name: 'رنة تأكيد ونجاح (Success Ding)',
    desc: 'نغمة جرس بلورية لتأكيد الإنجاز أو النقاط الإيجابية',
    duration: 1.2,
    category: 'ui',
    generate: (ctx, sampleRate = 44100) => {
      const len = Math.floor(1.2 * sampleRate);
      const buf = ctx.createBuffer(2, len, sampleRate);
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      let p1 = 0, p2 = 0, p3 = 0;
      const f1 = 1046.5, f2 = 1318.5, f3 = 2093.0; // C6, E6, C7
      for (let i = 0; i < len; i += 1) {
        const t = i / sampleRate;
        p1 += 2 * Math.PI * f1 / sampleRate;
        p2 += 2 * Math.PI * f2 / sampleRate;
        p3 += 2 * Math.PI * f3 / sampleRate;
        const s = (Math.sin(p1) * 0.4 + Math.sin(p2) * 0.35 + Math.sin(p3) * 0.25) * Math.exp(-t * 3.5);
        left[i] = s;
        right[i] = s;
      }
      return buf;
    },
  },
  {
    id: 'sfx_countdown_beep',
    name: 'صافرة العد التنازلي (Countdown Beep)',
    desc: 'صافرة دقيقة للعد التنازلي وبداية التحديات والمشاهد',
    duration: 0.22,
    category: 'ui',
    generate: (ctx, sampleRate = 44100) => {
      const len = Math.floor(0.22 * sampleRate);
      const buf = ctx.createBuffer(2, len, sampleRate);
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      let phase = 0;
      const freq = 1000;
      for (let i = 0; i < len; i += 1) {
        const t = i / sampleRate;
        phase += 2 * Math.PI * freq / sampleRate;
        const s = Math.sin(phase) * Math.exp(-t * 12) * 0.7;
        left[i] = s;
        right[i] = s;
      }
      return buf;
    },
  },
];

const _cachedBuffers = new Map();

export function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!window.__MS_SHARED_AUDIO_CTX__) {
    window.__MS_SHARED_AUDIO_CTX__ = new Ctx();
  }
  return window.__MS_SHARED_AUDIO_CTX__;
}

/** توليد مخزن الصوت للتأثير الصوتي المحدّد */
export function generateSoundBuffer(sfxId) {
  if (_cachedBuffers.has(sfxId)) return _cachedBuffers.get(sfxId);
  const def = SOUND_EFFECTS.find((s) => s.id === sfxId);
  if (!def) return null;
  const ctx = getAudioContext();
  if (!ctx) return null;
  const buf = def.generate(ctx, ctx.sampleRate || 44100);
  _cachedBuffers.set(sfxId, buf);
  return buf;
}

/** تشغيل معاينة للتأثير الصوتي فورًا */
export function previewSoundEffect(sfxId) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const buf = generateSoundBuffer(sfxId);
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = 0.85;
  src.connect(gain).connect(ctx.destination);
  src.start(0);
}

/** تحويل التأثير الصوتي لأصل مسجّل في مدير الوسائط وإضافته للخط الزمني */
export async function addSoundEffectToTimeline(app, sfxId, targetFrame = null) {
  const def = SOUND_EFFECTS.find((s) => s.id === sfxId);
  if (!def) return null;
  const ctx = getAudioContext();
  if (!ctx) return null;
  const buf = generateSoundBuffer(sfxId);
  if (!buf) return null;

  // تسجيل الأصل في الوسائط إذا لم يكن مسجلًا
  const assetId = `sfx_${sfxId}`;
  let asset = app.store.project.assets.find((a) => a.id === assetId);
  if (!asset) {
    const wavBlob = audioBufferToWav(buf);
    const url = URL.createObjectURL(wavBlob);
    const durationFrames = Math.max(1, Math.round(def.duration * app.store.fps));
    // حساب الـ peaks
    const ch = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / 256));
    const peaks = [];
    for (let i = 0; i < ch.length; i += step) {
      let max = 0;
      for (let j = 0; j < step && i + j < ch.length; j += 1) {
        max = Math.max(max, Math.abs(ch[i + j]));
      }
      peaks.push(max);
    }

    asset = {
      id: assetId,
      name: def.name,
      kind: 'audio',
      fileType: 'audio/wav',
      size: wavBlob.size,
      width: 0,
      height: 0,
      durationFrames,
      fps: app.store.fps,
      hasAudio: true,
      offline: false,
      thumb: null,
      peaks,
      folderId: null,
    };
    app.store.project.assets.push(asset);
    app.media.entries.set(assetId, {
      id: assetId,
      kind: 'audio',
      name: def.name,
      url,
      size: wavBlob.size,
      duration: def.duration,
      buffer: buf,
      peaks,
    });
    app.store.emit('assets');
  }

  // إضافة طبقة صوت للخط الزمني
  const frame = targetFrame ?? app.store.playhead;
  const dur = Math.max(1, Math.round(def.duration * app.store.fps));
  const layer = app.addAssetLayer(asset, frame);
  if (layer) {
    layer.outPoint = frame + dur;
    app.store.commit('إضافة مؤثر صوتي');
    app.timeline.rebuild();
  }
  return layer;
}
