// ─────────────────────────────────────────────────────────────
// Client-side speech extraction for auto-captions:
// decode audio → energy-based VAD → per-segment WAV → /api/transcribe
// ─────────────────────────────────────────────────────────────

export interface SpeechSegment {
  start: number;
  end: number;
}

export interface CaptionSegment extends SpeechSegment {
  text: string;
}

/** Decode any media blob into a mono Float32 signal + sample rate. */
export async function decodeToMono(
  blob: Blob
): Promise<{ data: Float32Array; sampleRate: number }> {
  const buf = await blob.arrayBuffer();
  const AC: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const chs = audio.numberOfChannels;
    const len = audio.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < chs; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += d[i] / chs;
    }
    return { data: mono, sampleRate: audio.sampleRate };
  } finally {
    ctx.close();
  }
}

/**
 * Simple energy-based voice activity detection.
 * Returns speech segments (seconds), merged and padded.
 */
export function detectSpeechSegments(
  data: Float32Array,
  sampleRate: number,
  opts: { maxSegments?: number; sensitivity?: number } = {}
): SpeechSegment[] {
  const maxSegments = opts.maxSegments ?? 26;
  const sensitivity = opts.sensitivity ?? 1; // 0.6..1.6 (lower = more speech)

  const win = Math.round(sampleRate * 0.05); // 50 ms
  const n = Math.floor(data.length / win);
  const rms = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * win;
    for (let j = 0; j < win; j++) {
      const v = data[off + j];
      s += v * v;
    }
    rms[i] = Math.sqrt(s / win);
    if (rms[i] > peak) peak = rms[i];
  }
  if (peak < 1e-4) return [];

  // noise floor: 15th percentile
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.15)] || 0;
  const thr = Math.max(floor * 3, peak * 0.06) * sensitivity;

  const winDur = win / sampleRate;
  const raw: SpeechSegment[] = [];
  let startIdx = -1;
  for (let i = 0; i < n; i++) {
    const on = rms[i] >= thr;
    if (on && startIdx < 0) startIdx = i;
    if (!on && startIdx >= 0) {
      raw.push({ start: startIdx * winDur, end: i * winDur });
      startIdx = -1;
    }
  }
  if (startIdx >= 0) raw.push({ start: startIdx * winDur, end: n * winDur });

  // merge gaps < 0.4s
  const merged: SpeechSegment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg.start - last.end < 0.4) last.end = seg.end;
    else merged.push({ ...seg });
  }

  // drop < 0.35s, pad ±0.12s
  const out = merged
    .filter((s) => s.end - s.start >= 0.35)
    .map((s) => ({
      start: Math.max(0, s.start - 0.12),
      end: s.end + 0.12,
    }));

  if (out.length <= maxSegments) return out;

  // too many: keep the longest N by merging neighbours pairwise
  let cur = [...out];
  while (cur.length > maxSegments) {
    // merge the pair with the smallest gap
    let bestI = 0;
    let bestGap = Infinity;
    for (let i = 0; i < cur.length - 1; i++) {
      const gap = cur[i + 1].start - cur[i].end;
      if (gap < bestGap) {
        bestGap = gap;
        bestI = i;
      }
    }
    cur[bestI] = { start: cur[bestI].start, end: cur[bestI + 1].end };
    cur.splice(bestI + 1, 1);
  }
  return cur;
}

/** Resample a slice to 16 kHz mono WAV (base64), sized for the ASR API. */
export async function sliceToWavBase64(
  data: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number
): Promise<string> {
  const s = Math.max(0, Math.floor(startSec * sampleRate));
  const e = Math.min(data.length, Math.ceil(endSec * sampleRate));
  const slice = data.slice(s, e);
  const targetRate = 16000;
  const outLen = Math.max(1, Math.round((slice.length / sampleRate) * targetRate));

  const OAC: typeof OfflineAudioContext =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const off = new OAC(1, outLen, targetRate);
  const srcBuf = off.createBuffer(1, slice.length, sampleRate);
  srcBuf.copyToChannel(slice, 0);
  const src = off.createBufferSource();
  src.buffer = srcBuf;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const pcm = rendered.getChannelData(0);

  return floatToWavBase64(pcm, targetRate);
}

function floatToWavBase64(samples: Float32Array, rate: number): string {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const w = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  w(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export interface TranscribeProgress {
  phase: "decode" | "detect" | "transcribe";
  done: number;
  total: number;
}

/**
 * Full pipeline: blob → segments → texts (via /api/transcribe per segment).
 */
export async function transcribeMedia(
  blob: Blob,
  onProgress: (p: TranscribeProgress) => void,
  opts: { sensitivity?: number; maxSegments?: number } = {}
): Promise<CaptionSegment[]> {
  onProgress({ phase: "decode", done: 0, total: 1 });
  const { data, sampleRate } = await decodeToMono(blob);
  const dur = data.length / sampleRate;
  if (dur > 300) throw new Error("ویدئو برای زیرنویس خودکار طولانی‌تر از ۵ دقیقه است");

  onProgress({ phase: "detect", done: 0, total: 1 });
  const segments = detectSpeechSegments(data, sampleRate, {
    sensitivity: opts.sensitivity ?? 1,
    maxSegments: opts.maxSegments ?? 26,
  });
  if (!segments.length) throw new Error("صدای واضحی پیدا نشد؛ حساسیت را کمتر کن یا دوباره تلاش کن");

  const out: CaptionSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    onProgress({ phase: "transcribe", done: i, total: segments.length });
    const b64 = await sliceToWavBase64(data, sampleRate, seg.start, seg.end);
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_base64: b64 }),
    });
    const json = await res.json();
    if (!res.ok || !json.text) continue;
    const text = String(json.text).trim();
    if (text) out.push({ ...seg, text });
  }
  onProgress({ phase: "transcribe", done: segments.length, total: segments.length });
  return out;
}
