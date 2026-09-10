// ─────────────────────────────────────────────────────────────
// Real audio extraction — «جدا کردن صدا» از کلیپ ویدئویی.
// decodeAudioData → OfflineAudioContext (با playbackRate واقعی)
// → خروجی WAV ۱۶بیتی. بدون MediaRecorder و بدون gesture.
// ─────────────────────────────────────────────────────────────

/** AudioBuffer → WAV (PCM 16-bit) — بدون فشرده‌سازی، دقیق و پایدار */
export function audioBufferToWav(buf: AudioBuffer): Blob {
  const numCh = Math.max(1, buf.numberOfChannels);
  const sr = buf.sampleRate;
  const frames = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = frames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);

  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true); // bits
  wstr(36, "data");
  v.setUint32(40, dataSize, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = chans[c][i];
      s = Math.max(-1, Math.min(1, s));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

export interface ExtractResult {
  blob: Blob;
  duration: number; // ثانیه خروجی
}

/**
 * استخراج بازهٔ [inSec..outSec] از فایل صوتی/ویدئویی با سرعت playback واقعی.
 * speed = 1..4 / 0.25..1 → طول خروجی = (out-in)/speed ثانیه.
 */
export async function extractAudio(
  assetUrl: string,
  inSec: number,
  outSec: number,
  speed = 1,
  onProgress?: (p: number) => void
): Promise<ExtractResult> {
  onProgress?.(0.02);
  const res = await fetch(assetUrl);
  const ab = await res.arrayBuffer();
  onProgress?.(0.15);

  const AC: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(ab);
  } finally {
    decodeCtx.close().catch(() => {});
  }
  onProgress?.(0.45);

  const srcDur = Math.max(0.05, outSec - inSec);
  const outDur = srcDur / speed;
  const sr = decoded.sampleRate;
  const outFrames = Math.max(1, Math.ceil(outDur * sr));
  const numCh = Math.min(2, decoded.numberOfChannels);
  const OAC: typeof OfflineAudioContext =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OAC) throw new Error("مرورگر از رندر آفلاین صدا پشتیبانی نمی‌کند");
  const off = new OAC(numCh, outFrames, sr);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.playbackRate.value = Math.max(0.25, Math.min(4, speed));
  src.connect(off.destination);
  src.start(0, inSec, srcDur);
  const rendered = await off.startRendering();
  onProgress?.(0.85);

  const wav = audioBufferToWav(rendered);
  onProgress?.(1);
  return { blob: wav, duration: outFrames / sr };
}
