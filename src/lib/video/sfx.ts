// Synthesized sound effects (100% original, no sample assets).
// Each SFX renders offline with WebAudio and returns a WAV Blob ready to
// drop on the timeline as a normal audio asset.

export interface SfxDef {
  id: string;
  name: string;
  emoji: string;
  dur: number; // seconds
}

export const SFX_LIST: SfxDef[] = [
  { id: "whoosh", name: "ووش سوایپ", emoji: "🌪️", dur: 0.7 },
  { id: "pop", name: "پاپ", emoji: "🫧", dur: 0.25 },
  { id: "riser", name: "رایزِر", emoji: "📈", dur: 1.6 },
  { id: "impact", name: "ایمپکت", emoji: "💥", dur: 1.1 },
  { id: "ding", name: "زنگ", emoji: "🔔", dur: 0.9 },
  { id: "heartbeat", name: "ضربان قلب", emoji: "❤️", dur: 1.2 },
  { id: "click", name: "کلیک تیک‌تاکی", emoji: "🖱️", dur: 0.12 },
  { id: "gleam", name: "درخشش جادویی", emoji: "✨", dur: 1.0 },
];

function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const bytes = 44 + len * numCh * 2;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  wstr(36, "data");
  view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

type Render = (ctx: OfflineAudioContext, out: GainNode) => void;

function env(ctx: OfflineAudioContext, t0: number, a: number, d: number, peak = 1): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  return g;
}

function noiseBuf(ctx: OfflineAudioContext, dur: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

const RENDERERS: Record<string, Render> = {
  whoosh(ctx, out) {
    const t = 0;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 0.8);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.32);
    bp.frequency.exponentialRampToValueAtTime(220, t + 0.68);
    const g = env(ctx, t, 0.18, 0.5, 0.85);
    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.75);
  },
  pop(ctx, out) {
    const t = 0;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.12);
    const g = env(ctx, t, 0.006, 0.14, 1);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
    // click transient
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 0.03);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2000;
    const g2 = env(ctx, t, 0.002, 0.03, 0.5);
    src.connect(hp).connect(g2).connect(out);
    src.start(t);
  },
  riser(ctx, out) {
    const t = 0;
    const dur = 1.6;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, dur + 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(240, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    src.connect(bp).connect(g).connect(out);
    src.start(t);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(880, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.9);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  },
  impact(ctx, out) {
    const t = 0;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
    const g = env(ctx, t, 0.004, 0.9, 1.2);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.05);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.35);
    const g2 = env(ctx, t, 0.003, 0.38, 0.7);
    src.connect(lp).connect(g2).connect(out);
    src.start(t);
  },
  ding(ctx, out) {
    const t = 0;
    [1318.5, 1975.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = env(ctx, t, 0.004, 0.8 - i * 0.2, i ? 0.25 : 0.6);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.9);
    });
  },
  heartbeat(ctx, out) {
    const thump = (t: number, amp: number) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(64, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.16);
      const g = env(ctx, t, 0.012, 0.2, amp);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.3);
    };
    thump(0.05, 1.1);
    thump(0.38, 0.8);
    thump(0.75, 1.0);
  },
  click(ctx, out) {
    const t = 0;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 2400;
    const g = env(ctx, t, 0.001, 0.05, 0.35);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200;
    o.connect(hp).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.08);
  },
  gleam(ctx, out) {
    const t = 0;
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = env(ctx, t + i * 0.09, 0.008, 0.55, 0.3);
      o.connect(g).connect(out);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.65);
    });
  },
};

export async function renderSfx(id: string): Promise<Blob> {
  const def = SFX_LIST.find((s) => s.id === id);
  const render = RENDERERS[id];
  if (!def || !render) throw new Error("جلوه صوتی پیدا نشد");
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * (def.dur + 0.2)), sr);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  // gentle limiter-ish: keep peaks sane
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 6;
  out.connect(comp).connect(ctx.destination);
  render(ctx, out);
  const buffer = await ctx.startRendering();
  return encodeWav(buffer);
}

// ── beat detection (energy onsets) — used by «برش روی ضرب» ──

export interface BeatPoint {
  t: number; // seconds within the analyzed audio
  strength: number; // 0..1
}

/** Decode audio and find rhythmic onsets via spectral-flux-lite (band energy). */
export async function detectBeats(
  blob: Blob,
  opts?: { onProgress?: (p: number) => void }
): Promise<{ beats: BeatPoint[]; duration: number; bpm: number }> {
  const ab = await blob.arrayBuffer();
  const ac = new AudioContext();
  try {
    const audio = await ac.decodeAudioData(ab);
    const ch = audio.getChannelData(0);
    const sr = audio.sampleRate;
    const hop = Math.floor(sr * 0.0116); // ~86 fps analysis
    const win = hop * 2;
    const n = Math.floor((ch.length - win) / hop);
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const off = i * hop;
      for (let j = 0; j < win; j += 2) s += ch[off + j] * ch[off + j];
      energy[i] = s;
    }
    // onset = positive derivative of energy vs local mean
    const flux = new Float32Array(n);
    const w = 24; // ~0.28s local window
    for (let i = w; i < n; i++) {
      let mean = 0;
      for (let j = i - w; j < i; j++) mean += energy[j];
      mean /= w;
      flux[i] = Math.max(0, energy[i] - mean);
    }
    // adaptive threshold peak picking
    const beats: BeatPoint[] = [];
    let maxF = 0.000001;
    for (let i = 0; i < n; i++) maxF = Math.max(maxF, flux[i]);
    const minGap = Math.floor(0.22 / (hop / sr));
    let last = -1e9;
    for (let i = 2; i < n - 2; i++) {
      const v = flux[i];
      if (v > 0.28 * maxF && v >= flux[i - 1] && v >= flux[i + 1] && v >= flux[i - 2] && v >= flux[i + 2]) {
        if (i - last < minGap) continue;
        last = i;
        beats.push({ t: (i * hop) / sr, strength: Math.min(1, v / maxF) });
      }
      if (opts?.onProgress && i % 20000 === 0) opts.onProgress(i / n);
    }
    // rough bpm from median inter-beat interval (of strong beats)
    let bpm = 0;
    const strong = beats.filter((b) => b.strength > 0.5);
    if (strong.length >= 3) {
      const iv: number[] = [];
      for (let i = 1; i < strong.length; i++) iv.push(strong[i].t - strong[i - 1].t);
      iv.sort((a, b) => a - b);
      const med = iv[Math.floor(iv.length / 2)];
      if (med > 0.15) {
        bpm = Math.round(60 / med);
        while (bpm < 70) bpm *= 2;
        while (bpm > 190) bpm = Math.round(bpm / 2);
      }
    }
    opts?.onProgress?.(1);
    return { beats, duration: audio.duration, bpm };
  } finally {
    void ac.close();
  }
}
