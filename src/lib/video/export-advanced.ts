// ─────────────────────────────────────────────────────────────
// Export نسل ۲ — فریم‌به‌فریم دقیق با WebCodecs (H.264 + AAC)
// و مالتی‌پلکس MP4 با mp4-muxer.
// - صدا با OfflineAudioContext رندر می‌شود (مستقل از gesture/realtime)
// - فید/داک/اکو/سرعت دقیقاً مثل پیش‌نمایش
// - اگر مرورگر پشتیبانی نکرد → caller به MediaRecorder برمی‌گردد
// ─────────────────────────────────────────────────────────────

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { EditorEngine } from "./engine";
import { exportDims } from "./engine";
import { clipDur, clipStart, totalDur, type MediaAsset, type Project } from "./types";

export function supportsAdvancedExport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === "function" &&
    typeof (window as unknown as { AudioEncoder?: unknown }).AudioEncoder === "function" &&
    typeof (window as unknown as { OfflineAudioContext?: unknown }).OfflineAudioContext === "function"
  );
}

const AVC_CANDIDATES = [
  "avc1.640033", // High 5.1
  "avc1.64002a", // High 4.2
  "avc1.640028", // High 4.0
  "avc1.4d0032", // Main 5.0
  "avc1.4d0028", // Main 4.0
  "avc1.4d001f", // Main 3.1
  "avc1.42003e", // Baseline 6.2
  "avc1.420028", // Baseline 4.0
  "avc1.42001f", // Baseline 3.1
];

async function pickAvcCodec(w: number, h: number, fps: number, bitrate: number): Promise<string | null> {
  const VE = (window as unknown as { VideoEncoder: typeof VideoEncoder }).VideoEncoder;
  for (const codec of AVC_CANDIDATES) {
    try {
      const sup = await VE.isConfigSupported({ codec, width: w, height: h, framerate: fps, bitrate });
      if (sup.supported) return codec;
    } catch {
      // try next
    }
  }
  return null;
}

interface AudioSourceSpec {
  url: string;
  srcOffset: number; // ثانیه داخل فایل منبع
  srcDur: number; // طول مصرفی از منبع (قبل از rate)
  timelineAt: number; // ثانیه روی تایم‌لاین
  rate: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  echo: boolean;
  duck: boolean;
}

/** همهٔ منابع صوتی پروژه — ویدئوی فعال (بی‌صدا نشده) + تراک‌های صوتی */
function collectAudioSpecs(p: Project, assets: Map<string, MediaAsset>): AudioSourceSpec[] {
  const specs: AudioSourceSpec[] = [];
  let acc = 0;
  for (const c of p.clips) {
    const d = clipDur(c);
    if (c.kind === "video" && !c.muted && !c.reverse && c.volume > 0) {
      const asset = assets.get(c.assetId);
      if (asset) {
        specs.push({
          url: asset.url,
          srcOffset: c.in,
          srcDur: c.out - c.in,
          timelineAt: acc,
          rate: c.speed,
          volume: c.volume,
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
          echo: false,
          duck: false,
        });
      }
    }
    acc += d;
  }
  for (const a of p.audios) {
    const asset = assets.get(a.assetId);
    if (!asset) continue;
    specs.push({
      url: asset.url,
      srcOffset: a.in,
      srcDur: a.out - a.in,
      timelineAt: a.start,
      rate: a.effect === "deep" ? 0.82 : a.effect === "chipmunk" ? 1.28 : 1,
      volume: a.volume,
      fadeIn: a.fadeIn,
      fadeOut: a.fadeOut,
      echo: a.effect === "echo",
      duck: a.duckCaptions,
    });
  }
  return specs;
}

function captionIntervals(p: Project): { start: number; end: number }[] {
  return p.texts.filter((t) => t.isCaption).map((t) => ({ start: t.start, end: t.end }));
}

/** میکس کامل صدا با OfflineAudioContext — خروجی AudioBuffer 48k استریو */
async function mixAudio(
  specs: AudioSourceSpec[],
  total: number,
  p: Project,
  onProgress?: (p: number) => void
): Promise<AudioBuffer | null> {
  if (!specs.length) return null;
  const OAC = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const SR = 48000;
  const ctx = new OAC(2, Math.max(1, Math.ceil(total * SR)), SR);

  // کش دیکد بر اساس URL
  const decoded = new Map<string, AudioBuffer>();
  const AC = (window as unknown as { AudioContext: typeof AudioContext }).AudioContext;
  const decodeCtx = new AC();
  try {
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      if (!decoded.has(s.url)) {
        const ab = await (await fetch(s.url)).arrayBuffer();
        decoded.set(s.url, await decodeCtx.decodeAudioData(ab));
        onProgress?.(0.3 * ((i + 1) / specs.length));
      }
    }
  } finally {
    decodeCtx.close().catch(() => {});
  }

  const caps = captionIntervals(p);
  for (const s of specs) {
    const buf = decoded.get(s.url);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, s.rate));
    const gain = ctx.createGain();
    src.connect(gain);

    if (s.echo) {
      const echoIn = ctx.createGain();
      echoIn.gain.value = 0.9;
      const delay = ctx.createDelay(1.5);
      delay.delayTime.value = 0.24;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.34;
      src.connect(echoIn);
      echoIn.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(gain);
    }
    gain.connect(ctx.destination);

    const t0 = Math.max(0, s.timelineAt);
    const tEnd = Math.min(total, s.timelineAt + s.srcDur / s.rate);
    if (tEnd - t0 < 0.02) continue;
    const v = Math.max(0, Math.min(2, s.volume));
    const g = gain.gain;
    g.setValueAtTime(0, t0);
    if (s.fadeIn > 0.01) g.linearRampToValueAtTime(v, Math.min(tEnd, t0 + s.fadeIn));
    else g.setValueAtTime(v, t0);
    if (s.fadeOut > 0.01) {
      g.setValueAtTime(v, Math.max(t0, tEnd - s.fadeOut));
      g.linearRampToValueAtTime(0, tEnd);
    } else {
      g.setValueAtTime(v, tEnd);
    }
    if (s.duck) {
      for (const iv of caps) {
        const ds = Math.max(t0, iv.start);
        const de = Math.min(tEnd, iv.end);
        if (de - ds < 0.05) continue;
        g.setValueAtTime(v, Math.max(t0, ds - 0.08));
        g.linearRampToValueAtTime(v * 0.28, ds);
        g.setValueAtTime(v * 0.28, de);
        g.linearRampToValueAtTime(v, Math.min(tEnd, de + 0.12));
      }
    }
    src.start(t0, s.srcOffset, s.srcDur);
  }

  onProgress?.(0.4);
  const rendered = await ctx.startRendering();
  onProgress?.(0.55);
  return rendered;
}

async function encodeAudioTrack(
  buffer: AudioBuffer,
  muxer: Muxer<ArrayBufferTarget>,
  onProgress?: (p: number) => void
): Promise<void> {
  const AE = (window as unknown as { AudioEncoder: typeof AudioEncoder }).AudioEncoder;
  const sr = buffer.sampleRate;
  const ch = Math.min(2, buffer.numberOfChannels);
  const enc = new AE({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: () => {},
  });
  enc.configure({ codec: "mp4a.40.2", sampleRate: sr, numberOfChannels: ch, bitrate: 128_000 });

  const CH = 4800; // ~100ms
  const totalFrames = buffer.length;
  const c0 = buffer.getChannelData(0);
  const c1 = ch > 1 ? buffer.getChannelData(1) : null;
  for (let off = 0; off < totalFrames; off += CH) {
    const n = Math.min(CH, totalFrames - off);
    const data = new Float32Array(n * ch);
    data.set(c0.subarray(off, off + n), 0);
    if (c1) data.set(c1.subarray(off, off + n), n);
    const ad = new AudioData({
      format: "f32-planar",
      sampleRate: sr,
      numberOfFrames: n,
      numberOfChannels: ch,
      timestamp: Math.round((off / sr) * 1e6),
      data,
    });
    enc.encode(ad);
    ad.close();
    if (enc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 2));
    if (off % (CH * 20) === 0) onProgress?.(0.55 + 0.25 * (off / Math.max(1, totalFrames)));
  }
  await enc.flush();
  enc.close();
  onProgress?.(0.8);
}

export interface AdvancedExportOpts {
  longSide: number;
  fps: number;
  bitrateMbps: number;
  onProgress?: (p: number) => void;
  signal?: { cancelled: boolean };
}

/**
 * خروجی MP4 فریم‌به‌فریم. خطا ← caller به MediaRecorder realtime برمی‌گردد.
 */
export async function exportProjectAdvanced(
  engine: EditorEngine,
  project: Project,
  assets: Map<string, MediaAsset>,
  opts: AdvancedExportOpts
): Promise<{ blob: Blob; mime: string }> {
  if (!supportsAdvancedExport()) throw new Error("مرورگر از WebCodecs پشتیبانی نمی‌کند");
  const total = totalDur(project);
  if (total <= 0) throw new Error("تایم‌لاین خالی است");

  const { w, h } = exportDims(project.aspect, opts.longSide);
  const fps = opts.fps;
  const bitrate = Math.round(opts.bitrateMbps * 1_000_000);

  const codec = await pickAvcCodec(w, h, fps, bitrate);
  if (!codec) throw new Error("هیچ انکودر H.264 سازگار پیدا نشد");

  // ── صدا (مستقل از gesture) ──
  const specs = collectAudioSpecs(project, assets);
  const mix = await mixAudio(specs, total, project, (p) => opts.onProgress?.(p * 0.1));

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: w, height: h },
    ...(mix ? { audio: { codec: "aac" as const, numberOfChannels: Math.min(2, mix.numberOfChannels), sampleRate: mix.sampleRate } } : {}),
    fastStart: "in-memory",
  });

  // ── ویدئو: فریم‌به‌فریم دقیق ──
  const VE = (window as unknown as { VideoEncoder: typeof VideoEncoder }).VideoEncoder;
  const enc = new VE({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: () => {},
  });
  enc.configure({ codec, width: w, height: h, framerate: fps, bitrate });

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d", { alpha: false });
  if (!octx) throw new Error("Canvas در دسترس نیست");

  const N = Math.max(1, Math.ceil(total * fps));
  const keyEvery = Math.max(1, Math.round(fps * 2));
  try {
    for (let i = 0; i < N; i++) {
      if (opts.signal?.cancelled) throw new Error("خروجی لغو شد");
      const t = Math.min(total, i / fps);
      await engine.renderStill(octx, t, w, h);
      const frame = new VideoFrame(off, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      });
      enc.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();
      if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 3));
      opts.onProgress?.(0.1 + 0.85 * ((i + 1) / N));
    }
    await enc.flush();
  } finally {
    try {
      if (enc.state !== "closed") enc.close();
    } catch {}
  }

  // ── تراک صدا ──
  if (mix) await encodeAudioTrack(mix, muxer, (p) => opts.onProgress?.(p));

  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  opts.onProgress?.(1);
  return { blob: new Blob([buffer], { type: "video/mp4" }), mime: "video/mp4" };
}
