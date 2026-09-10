// ─────────────────────────────────────────────────────────────
// Video editor engine: preview render loop, audio graph,
// real-time export via MediaRecorder. Pure client-side.
// ─────────────────────────────────────────────────────────────

import {
  activeCaptionsAt,
  activeClipAt,
  aspectDims,
  clipDur,
  totalDur,
  type Clip,
  type MediaAsset,
  type Project,
  type StabData,
} from "./types";
import { evalKf } from "./keyframes";
import { buildMaskPath, chromaFrame, cssFilter, drawTempOverlay, drawTextItem, drawVignette, enhancedFilter, maskFrame } from "./filters";

type Tick = (t: number, playing: boolean) => void;

interface AudioChain {
  src: MediaElementAudioSourceNode;
  gain: GainNode;
  echoIn: GainNode;
  delay: DelayNode;
  feedback: GainNode;
}

const MP4_MIMES = [
  'video/mp4;codecs="avc1.4d002a,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4",
];
const WEBM_MIMES = ['video/webm;codecs="vp9,opus"', "video/webm;codecs=vp8,opus", "video/webm"];

export function pickRecorderMime(preferMp4: boolean): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const list = preferMp4 ? [...MP4_MIMES, ...WEBM_MIMES] : [...WEBM_MIMES, ...MP4_MIMES];
  for (const m of list) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

export function exportDims(aspect: Project["aspect"], longSide: number) {
  const { w, h } = aspectDims(aspect);
  // even numbers only (codec requirement); longSide = larger dimension
  let ew: number;
  let eh: number;
  if (w >= h) {
    ew = Math.round(longSide / 2) * 2;
    eh = Math.round(((ew * h) / w) / 2) * 2;
  } else {
    eh = Math.round(longSide / 2) * 2;
    ew = Math.round(((eh * w) / h) / 2) * 2;
  }
  return { w: ew, h: eh };
}

export class EditorEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private project: Project;
  private assets = new Map<string, MediaAsset>();
  private videos = new Map<string, HTMLVideoElement>();
  private images = new Map<string, HTMLImageElement>();
  private audios = new Map<string, HTMLAudioElement>();
  private chains = new Map<string, AudioChain>();
  private audioCtx: AudioContext | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private raf = 0;
  private lastTs = 0;
  private ticks = new Set<Tick>();
  private reverseImgs = new Map<string, HTMLImageElement>(); // reverse frame cache

  playing = false;
  time = 0;
  exporting = false;

  constructor(project: Project) {
    this.project = project;
  }

  // ── lifecycle ──
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.loop(performance.now());
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.canvas = null;
    this.ctx = null;
    for (const el of this.videos.values()) el.pause();
    for (const el of this.audios.values()) el.pause();
    // فیکس نشتی: کانتکست صوتی باید بسته شود و گراف‌ها آزماند
    try {
      this.audioCtx?.close();
    } catch {}
    this.audioCtx = null;
    this.streamDest = null;
    this.chains.clear();
  }

  onTick(fn: Tick) {
    this.ticks.add(fn);
    return () => this.ticks.delete(fn);
  }

  setProject(p: Project, assets: Map<string, MediaAsset>) {
    const wasPlaying = this.playing;
    this.project = p;
    this.assets = assets;

    // drop elements for removed assets
    const alive = new Set(assets.keys());
    for (const id of [...this.videos.keys()]) if (!alive.has(id)) this.videos.delete(id);
    for (const id of [...this.images.keys()]) if (!alive.has(id)) this.images.delete(id);
    for (const id of [...this.audios.keys()]) {
      if (!alive.has(id)) {
        this.audios.get(id)?.pause();
        this.audios.delete(id);
      }
    }

    // ensure elements for used assets
    const used = new Set<string>();
    p.clips.forEach((c) => used.add(c.assetId));
    p.overlays.forEach((o) => used.add(o.assetId));
    p.audios.forEach((a) => used.add(a.assetId));
    for (const id of used) {
      const asset = assets.get(id);
      if (!asset) continue;
      if (asset.type === "video") this.ensureVideo(id);
      else if (asset.type === "image") this.ensureImage(id);
      else this.ensureAudio(id);
    }
    if (!wasPlaying) this.render();
  }

  private ensureVideo(id: string): HTMLVideoElement {
    let el = this.videos.get(id);
    if (!el) {
      const asset = this.assets.get(id)!;
      el = document.createElement("video");
      el.src = asset.url;
      el.muted = false;
      el.playsInline = true;
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      this.videos.set(id, el);
      this.buildChain(id, el);
    }
    return el;
  }

  private ensureImage(id: string): HTMLImageElement {
    let el = this.images.get(id);
    if (!el) {
      const asset = this.assets.get(id)!;
      el = new Image();
      el.src = asset.url;
      this.images.set(id, el);
    }
    return el;
  }

  private ensureAudio(id: string): HTMLAudioElement {
    let el = this.audios.get(id);
    if (!el) {
      const asset = this.assets.get(id)!;
      el = document.createElement("audio");
      el.src = asset.url;
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      this.audios.set(id, el);
      this.buildChain(id, el);
    }
    return el;
  }

  private buildChain(id: string, el: HTMLMediaElement) {
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx) this.audioCtx = new AC();
      if (!this.streamDest) this.streamDest = this.audioCtx.createMediaStreamDestination();
      if (this.chains.has(id)) return;
      const src = this.audioCtx.createMediaElementSource(el);
      const gain = this.audioCtx.createGain();
      const echoIn = this.audioCtx.createGain();
      const delay = this.audioCtx.createDelay(1.5);
      const feedback = this.audioCtx.createGain();
      delay.delayTime.value = 0.24;
      feedback.gain.value = 0.34;
      echoIn.gain.value = 0;
      src.connect(gain);
      src.connect(echoIn);
      echoIn.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(gain);
      gain.connect(this.audioCtx.destination);
      gain.connect(this.streamDest!);
      this.chains.set(id, { src, gain, echoIn, delay, feedback });
    } catch {
      // audio graph unavailable (e.g. no user gesture yet) — video still plays
    }
  }

  private resumeAudio() {
    if (this.audioCtx && this.audioCtx.state === "suspended") this.audioCtx.resume().catch(() => {});
  }

  // ── transport ──
  play() {
    if (!totalDur(this.project)) return;
    if (this.time >= totalDur(this.project) - 0.01) this.time = 0;
    this.playing = true;
    this.resumeAudio();
    this.lastTs = performance.now();
  }

  pause() {
    this.playing = false;
    for (const el of this.videos.values()) el.pause();
    for (const el of this.audios.values()) el.pause();
  }

  seek(t: number) {
    const total = totalDur(this.project);
    this.time = Math.max(0, Math.min(total, t));
    this.render();
    this.emit(false);
  }

  private emit(playing: boolean) {
    this.ticks.forEach((fn) => fn(this.time, playing));
  }

  private loop = (ts: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.ctx) return;
    const dt = Math.min(0.1, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    if (this.playing) {
      this.time += dt;
      const total = totalDur(this.project);
      if (this.time >= total) {
        this.time = total;
        this.playing = false;
        this.pause();
      }
    }
    this.render();
    this.emit(this.playing);
  };

  // ── rendering ──
  private render() {
    if (!this.ctx || !this.canvas) return;
    this.drawFrame(this.ctx, this.time, this.canvas.width, this.canvas.height);
    this.syncAudio();
  }

  /** Draws the whole composition at time t onto any 2D context. */
  drawFrame(ctx: CanvasRenderingContext2D, t: number, W: number, H: number) {
    const p = this.project;
    ctx.save();
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // main track
    const act = activeClipAt(p, t);
    if (act) this.drawClip(ctx, act.clip, act.local, t, W, H);

    // overlays
    for (const ov of p.overlays) {
      if (t >= ov.start && t < ov.start + ov.dur) {
        this.drawOverlay(ctx, ov, t - ov.start, W, H);
      }
    }

    // texts (captions + titles) — با پشتیبانی keyframe
    for (let item of p.texts) {
      if (t >= item.start && t < item.end) {
        if (item.kf) {
          const lt = t - item.start;
          item = {
            ...item,
            opacity: evalKf(item.kf.opacity, lt, item.opacity),
            x: evalKf(item.kf.x, lt, item.x),
            y: evalKf(item.kf.y, lt, item.y),
            rotate: evalKf(item.kf.rotate, lt, item.rotate),
            size: item.size * evalKf(item.kf.scale, lt, 1),
          };
        }
        drawTextItem(ctx, item, t, W, H);
      }
    }
    ctx.restore();
  }

  private transitionState(clip: Clip, local: number): { alpha: number; dx: number; scale: number; black: number } {
    const tr = clip.transitionIn;
    const st = { alpha: 1, dx: 0, scale: 1, black: 0 };
    if (!tr || tr.type === "none" || local >= tr.dur) return st;
    const p = Math.max(0.0001, Math.min(1, local / Math.max(0.05, tr.dur)));
    const e = 1 - Math.pow(1 - p, 3);
    if (tr.type === "fade") st.alpha = e;
    else if (tr.type === "black") st.black = 1 - e;
    else if (tr.type === "slide") st.dx = -(1 - e);
    else if (tr.type === "zoom") {
      st.alpha = e;
      st.scale = 0.55 + 0.45 * e;
    }
    return st;
  }

  private drawClip(ctx: CanvasRenderingContext2D, clip: Clip, local: number, t: number, W: number, H: number) {
    const dur = clipDur(clip);
    const tr = this.transitionState(clip, local);
    const scale = W / 1080;
    // ترنسفورم مؤثر: اگر keyframe برای پراپرتی‌ای هست، مقدار همان لحظه جایگزین می‌شود
    const ktf = clip.kf
      ? {
          ...clip.transform,
          scale: evalKf(clip.kf.scale, local, clip.transform.scale),
          x: evalKf(clip.kf.x, local, clip.transform.x),
          y: evalKf(clip.kf.y, local, clip.transform.y),
          rotate: evalKf(clip.kf.rotate, local, clip.transform.rotate),
          opacity: evalKf(clip.kf.opacity, local, clip.transform.opacity),
        }
      : clip.transform;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, ktf.opacity * tr.alpha));

    if (clip.transitionIn.type === "slide") {
      ctx.translate(tr.dx * W, 0);
    } else {
      ctx.translate(0, 0);
    }
    ctx.scale(tr.scale, tr.scale);

    let source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | null = null;
    let srcW = clip.srcW;
    let srcH = clip.srcH;

    if (clip.reverse) {
      const idx = Math.min(clip.reverse.frames.length - 1, Math.floor(local * clip.reverse.fps));
      const url = clip.reverse.frames[idx];
      let img = this.reverseImgs.get(url);
      if (!img) {
        img = new Image();
        img.src = url;
        this.reverseImgs.set(url, img);
      }
      if (img.complete && img.naturalWidth) {
        source = img;
        srcW = img.naturalWidth;
        srcH = img.naturalHeight;
      }
    } else if (clip.kind === "video") {
      const el = this.videos.get(clip.assetId);
      if (el) {
        const expected = clip.in + local * clip.speed;
        if (Math.abs(el.currentTime - expected) > 0.22 && !this.playing) {
          try {
            el.currentTime = expected;
          } catch {}
        }
        if (el.readyState >= 2) {
          source = el;
          srcW = el.videoWidth || clip.srcW;
          srcH = el.videoHeight || clip.srcH;
        }
      }
    } else {
      const el = this.images.get(clip.assetId);
      if (el && el.complete && el.naturalWidth) {
        source = el;
        srcW = el.naturalWidth;
        srcH = el.naturalHeight;
      }
    }

    if (source) {
      const tf = ktf;

      // smart stabilization: per-frame counter-offset + zoom margin to hide edges
      let stabDx = 0;
      let stabDy = 0;
      let stabZoom = 1;
      const stab = clip.stab;
      if (stab && !clip.reverse && stab.offsets.length >= 2 && stab.srcOut > stab.srcIn) {
        const srcTime = clip.in + local * clip.speed;
        const f = (srcTime - stab.srcIn) * stab.fps;
        const n = stab.offsets.length / 2;
        const i0 = Math.max(0, Math.min(n - 1, Math.floor(f)));
        const i1 = Math.min(n - 1, i0 + 1);
        const fr = Math.max(0, Math.min(1, f - i0));
        stabDx = (stab.offsets[2 * i0] * (1 - fr) + stab.offsets[2 * i1] * fr);
        stabDy = (stab.offsets[2 * i0 + 1] * (1 - fr) + stab.offsets[2 * i1 + 1] * fr);
        stabZoom = stab.zoom || 1;
      }

      const base = Math.max(W / srcW, H / srcH) * stabZoom; // cover (+ stabilization margin)
      ctx.filter = cssFilter(enhancedFilter(clip.filter, !!clip.enhance), scale);

      let drawSource: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement = source;
      if (clip.chroma.enabled && !clip.reverse) {
        const processed = chromaFrame(source as HTMLVideoElement, clip.chroma, srcW, srcH);
        if (processed) {
          drawSource = processed;
          srcW = processed.width;
          srcH = processed.height;
        }
      }

      // mask: feathered → pre-process frame; hard → clip path at draw time
      let hardMask: Clip["mask"] = undefined;
      if (clip.mask && clip.mask.shape !== "none") {
        if (clip.mask.feather > 0.01) {
          const masked = maskFrame(drawSource, clip.mask, srcW, srcH);
          if (masked) {
            drawSource = masked;
          }
        } else {
          hardMask = clip.mask;
        }
      }

      ctx.translate(
        W / 2 + tf.x * W + stabDx * srcW * base,
        H / 2 + tf.y * H + stabDy * srcH * base
      );
      ctx.rotate((tf.rotate * Math.PI) / 180);
      ctx.scale(tf.scale * (tf.flipH ? -1 : 1), tf.scale * (tf.flipV ? -1 : 1));
      const dw = srcW * base;
      const dh = srcH * base;
      try {
        if (hardMask) {
          ctx.save();
          buildMaskPath(ctx, hardMask.shape, dw * hardMask.size, dh * hardMask.size);
          ctx.clip();
        }
        ctx.drawImage(drawSource, -dw / 2, -dh / 2, dw, dh);
        if (hardMask) ctx.restore();
      } catch {}
      ctx.filter = "none";
      drawTempOverlay(ctx, clip.filter.temp, W, H);
      drawVignette(ctx, clip.filter.vignette, W, H);
    }

    if (tr.black > 0) {
      ctx.filter = "none";
      ctx.fillStyle = `rgba(0,0,0,${tr.black})`;
      ctx.fillRect(-W, -H, W * 3, H * 3);
    }
    ctx.restore();
    void t;
    void dur;
    void scale;
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    ov: Project["overlays"][number],
    local: number,
    W: number,
    H: number
  ) {
    const scale = W / 1080;
    let source: HTMLVideoElement | HTMLImageElement | null = null;
    let srcW = 0;
    let srcH = 0;
    if (ov.kind === "video") {
      const el = this.videos.get(ov.assetId);
      if (el) {
        const expected = ov.srcIn + local;
        if (Math.abs(el.currentTime - expected) > 0.22 && !this.playing) {
          try {
            el.currentTime = expected;
          } catch {}
        }
        if (el.readyState >= 2) {
          source = el;
          srcW = el.videoWidth;
          srcH = el.videoHeight;
        }
      }
    } else {
      const el = this.images.get(ov.assetId);
      if (el && el.complete && el.naturalWidth) {
        source = el;
        srcW = el.naturalWidth;
        srcH = el.naturalHeight;
      }
    }
    if (!source || !srcW) return;

    ctx.save();
    // ترنسفورم مؤثر overlay با keyframe (زمان لوکال)
    const otf = ov.kf
      ? {
          ...ov.transform,
          scale: evalKf(ov.kf.scale, local, ov.transform.scale),
          x: evalKf(ov.kf.x, local, ov.transform.x),
          y: evalKf(ov.kf.y, local, ov.transform.y),
          rotate: evalKf(ov.kf.rotate, local, ov.transform.rotate),
          opacity: evalKf(ov.kf.opacity, local, ov.transform.opacity),
        }
      : ov.transform;
    ctx.globalAlpha = Math.max(0, Math.min(1, otf.opacity));
    ctx.filter = cssFilter(ov.filter, scale);

    let drawSource: HTMLVideoElement | HTMLImageElement = source;
    if (ov.chroma.enabled) {
      const processed = chromaFrame(source as HTMLVideoElement, ov.chroma, srcW, srcH);
      if (processed) {
        drawSource = processed as unknown as HTMLImageElement;
        srcW = processed.width;
        srcH = processed.height;
      }
    }

    let ovHardMask: Project["overlays"][number]["mask"] = undefined;
    if (ov.mask && ov.mask.shape !== "none") {
      if (ov.mask.feather > 0.01) {
        const masked = maskFrame(drawSource, ov.mask, srcW, srcH);
        if (masked) {
          drawSource = masked as unknown as HTMLImageElement;
        }
      } else {
        ovHardMask = ov.mask;
      }
    }

    const base = Math.min(W / srcW, H / srcH); // contain
    const tf = otf;
    ctx.translate(W / 2 + tf.x * W, H / 2 + tf.y * H);
    ctx.rotate((tf.rotate * Math.PI) / 180);
    ctx.scale(tf.scale * (tf.flipH ? -1 : 1), tf.scale * (tf.flipV ? -1 : 1));
    const dw = srcW * base;
    const dh = srcH * base;
    try {
      if (ovHardMask) {
        ctx.save();
        buildMaskPath(ctx, ovHardMask.shape, dw * ovHardMask.size, dh * ovHardMask.size);
        ctx.clip();
      }
      ctx.drawImage(drawSource, -dw / 2, -dh / 2, dw, dh);
      if (ovHardMask) ctx.restore();
    } catch {}
    ctx.filter = "none";
    drawTempOverlay(ctx, ov.filter.temp, W, H);
    ctx.restore();
  }

  // ── audio sync ──
  private syncAudio() {
    const p = this.project;
    const t = this.time;
    const captionsOn = activeCaptionsAt(p.texts, t).length > 0;

    // main clips
    const act = activeClipAt(p, t);
    for (const el of this.videos.values()) el.playbackRate = 1;
    if (act && act.clip.kind === "video" && !act.clip.reverse) {
      const el = this.videos.get(act.clip.assetId);
      if (el) {
        const expected = act.clip.in + act.local * act.clip.speed;
        el.playbackRate = Math.max(0.25, Math.min(4, act.clip.speed));
        if (this.playing) {
          if (el.paused) el.play().catch(() => {});
          if (Math.abs(el.currentTime - expected) > 0.2) {
            try {
              el.currentTime = expected;
            } catch {}
          }
        } else if (!el.paused) el.pause();
        const vol = act.clip.muted ? 0 : act.clip.volume;
        this.applyGain(act.clip.assetId, vol * fadeEnv(act.local, clipDur(act.clip), act.clip.fadeIn, act.clip.fadeOut));
      }
    }

    // overlays: video overlays stay muted (ambient handled by main track)
    for (const ov of p.overlays) {
      if (ov.kind !== "video") continue;
      const el = this.videos.get(ov.assetId);
      if (!el) continue;
      const inRange = t >= ov.start && t < ov.start + ov.dur;
      if (this.playing && inRange) {
        const expected = ov.srcIn + (t - ov.start);
        if (el.paused) el.play().catch(() => {});
        if (Math.abs(el.currentTime - expected) > 0.25) {
          try {
            el.currentTime = expected;
          } catch {}
        }
      } else if (!el.paused) el.pause();
      this.applyGain(ov.assetId, 0); // overlays muted
    }

    // audio items
    for (const a of p.audios) {
      const el = this.audios.get(a.assetId);
      if (!el) continue;
      const local = t - a.start;
      const dur = a.out - a.in;
      const inRange = local >= 0 && local < dur;
      if (this.playing && inRange) {
        const expected = a.in + local;
        const rate = a.effect === "deep" ? 0.82 : a.effect === "chipmunk" ? 1.28 : 1;
        el.playbackRate = rate;
        if (el.paused) el.play().catch(() => {});
        if (Math.abs(el.currentTime - expected) > 0.25) {
          try {
            el.currentTime = expected;
          } catch {}
        }
      } else if (!el.paused) el.pause();
      let g = inRange ? a.volume * fadeEnv(local, dur, a.fadeIn, a.fadeOut) : 0;
      if (a.duckCaptions && captionsOn && inRange) g *= 0.28;
      this.applyGain(a.assetId, g, a.effect === "echo");
    }

    if (!this.playing) {
      // ensure gains settle to 0 for paused audio items
      for (const a of p.audios) this.applyGain(a.assetId, 0, a.effect === "echo");
    }
  }

  private applyGain(assetId: string, value: number, echo = false) {
    const chain = this.chains.get(assetId);
    if (!chain) return;
    const v = Math.max(0, Math.min(2, value));
    chain.gain.gain.value = v;
    chain.echoIn.gain.value = echo ? 0.9 : 0;
  }

  // ── export ──
  async exportVideo(
    opts: {
      longSide: number;
      fps: number;
      preferMp4: boolean;
      bitrateMbps: number;
      onProgress?: (p: number) => void;
      signal?: { cancelled: boolean };
    }
  ): Promise<{ blob: Blob; mime: string }> {
    const total = totalDur(this.project);
    if (total <= 0) throw new Error("تایم‌لاین خالی است");
    const mime = pickRecorderMime(opts.preferMp4);
    if (!mime) throw new Error("مرورگر از ضبط ویدئو پشتیبانی نمی‌کند (کروم را به‌روز کن)");

    const { w, h } = exportDims(this.project.aspect, opts.longSide);
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d");
    if (!octx) throw new Error("Canvas در دسترس نیست");

    this.resumeAudio();
    const stream = off.captureStream(opts.fps);
    if (this.streamDest) {
      this.streamDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: Math.round(opts.bitrateMbps * 1_000_000),
      audioBitsPerSecond: 128_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    const wasTime = this.time;
    this.exporting = true;
    this.time = 0;
    recorder.start(400);

    await new Promise<void>((resolve) => {
      const step = () => {
        if (opts.signal?.cancelled) {
          resolve();
          return;
        }
        const now = performance.now();
        const dt = Math.min(0.12, (now - this.lastTs) / 1000);
        this.lastTs = now;
        this.time += dt;
        if (this.time >= total) this.time = total;
        this.drawFrame(octx, this.time, w, h);
        this.syncAudio();
        opts.onProgress?.(this.time / total);
        // also refresh preview canvas
        if (this.ctx && this.canvas) this.drawFrame(this.ctx, this.time, this.canvas.width, this.canvas.height);
        if (this.time >= total) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      this.lastTs = performance.now();
      requestAnimationFrame(step);
    });

    // small tail so the last frame is captured
    await new Promise((r) => setTimeout(r, 350));
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
      if (recorder.state !== "inactive") recorder.stop();
      else resolve(new Blob(chunks, { type: mime }));
    });
    this.exporting = false;
    this.time = wasTime;
    return { blob, mime };
  }

  /** Ensure a media element is decoded & ready at given source time (thumbnails, freeze). */
  static async grabFrame(assetUrl: string, at: number, maxW = 720): Promise<HTMLCanvasElement> {
    const v = document.createElement("video");
    v.src = assetUrl;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("ویدئو قابل خواندن نیست"));
      setTimeout(() => rej(new Error("خواندن ویدئو timeout شد")), 15000);
    });
    await seekVideo(v, Math.min(at, Math.max(0, (v.duration || 1) - 0.05)));
    const c = document.createElement("canvas");
    const scale = Math.min(1, maxW / (v.videoWidth || maxW));
    c.width = Math.max(2, Math.round((v.videoWidth || maxW) * scale));
    c.height = Math.max(2, Math.round((v.videoHeight || (maxW * 16) / 9) * scale));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    v.src = "";
    return c;
  }
}

function fadeEnv(local: number, dur: number, fadeIn: number, fadeOut: number): number {
  let g = 1;
  if (fadeIn > 0) g = Math.min(g, local / fadeIn);
  if (fadeOut > 0) g = Math.min(g, (dur - local) / fadeOut);
  return Math.max(0, Math.min(1, g));
}

export function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    if (Math.abs(v.currentTime - t) < 0.01) {
      res();
      return;
    }
    const done = () => {
      v.removeEventListener("seeked", done);
      res();
    };
    v.addEventListener("seeked", done);
    try {
      v.currentTime = t;
    } catch {
      done();
    }
    setTimeout(done, 4000);
  });
}

/** Extract frames reversed → jpeg blob URLs (for Reverse). Audio is dropped. */
export async function buildReverse(
  assetUrl: string,
  inSec: number,
  outSec: number,
  fps = 12,
  onProgress?: (p: number) => void
): Promise<{ frames: string[]; fps: number }> {
  const v = document.createElement("video");
  v.src = assetUrl;
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error("ویدئو قابل خواندن نیست"));
  });
  const dur = Math.min(outSec, v.duration) - inSec;
  const capDur = Math.min(dur, 10);
  const step = 1 / fps;
  const times: number[] = [];
  for (let t = inSec; t < inSec + capDur - 0.01; t += step) times.push(t);

  const c = document.createElement("canvas");
  const vw = v.videoWidth || 720;
  const scale = Math.min(1, 480 / vw);
  c.width = Math.round(vw * scale);
  c.height = Math.round((v.videoHeight || 1280) * scale);
  const ctx = c.getContext("2d")!;

  const frames: string[] = [];
  for (let i = times.length - 1; i >= 0; i--) {
    await seekVideo(v, times[i]);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.72));
    if (blob) frames.push(URL.createObjectURL(blob));
    onProgress?.(1 - i / times.length);
  }
  return { frames, fps };
}

/**
 * Smart anti-shake (لرزش‌گیر هوشمند) — digital stabilization:
 * 1. sample frames at a reduced fps, downscaled to 96px width
 * 2. estimate global camera motion between neighbours (SAD block matching)
 * 3. smooth the camera path and compute per-frame counter-offsets
 * 4. rendering applies the offsets + a slight zoom so edges never show
 */
export async function analyzeStabilization(
  assetUrl: string,
  inSec: number,
  outSec: number,
  onProgress?: (p: number) => void
): Promise<StabData> {
  const v = document.createElement("video");
  v.src = assetUrl;
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error("ویدئو قابل خواندن نیست"));
  });

  const dur = Math.min(outSec, v.duration || outSec) - inSec;
  if (dur <= 0.25) throw new Error("کلیپ برای لرزش‌گیر خیلی کوتاه است");
  const fps = Math.max(5, Math.min(12, 480 / dur)); // ≤ 480 sampled frames
  const step = 1 / fps;
  const times: number[] = [];
  for (let t = inSec; t < inSec + dur - 0.01; t += step) times.push(t);

  const vw = v.videoWidth || 720;
  const vh = v.videoHeight || 1280;
  const w = 96;
  const h = Math.max(24, Math.round((vh / vw) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const c2d = c.getContext("2d", { willReadFrequently: true });
  if (!c2d) throw new Error("Canvas در دسترس نیست");

  const grabGray = async (t: number): Promise<Float32Array> => {
    await seekVideo(v, t);
    c2d.drawImage(v, 0, 0, w, h);
    const img = c2d.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0, p = 0; p < g.length; i += 4, p++) {
      g[p] = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    }
    return g;
  };

  const SEARCH = 7; // px search radius in the small space
  const deltas: number[] = [0, 0]; // frame 0 has no motion (pairs dx,dy = content shift)
  let prev = await grabGray(times[0]);
  for (let i = 1; i < times.length; i++) {
    const cur = await grabGray(times[i]);
    // find m that minimizes SAD: cur(x,y) ≈ prev(x+mx, y+my)
    let bestMx = 0;
    let bestMy = 0;
    let bestSAD = Infinity;
    for (let my = -SEARCH; my <= SEARCH; my++) {
      for (let mx = -SEARCH; mx <= SEARCH; mx++) {
        let sad = 0;
        for (let y = SEARCH; y < h - SEARCH; y += 2) {
          const row = y * w;
          const prow = (y + my) * w;
          for (let x = SEARCH; x < w - SEARCH; x += 2) {
            sad += Math.abs(cur[row + x] - prev[prow + x + mx]);
          }
        }
        if (sad < bestSAD) {
          bestSAD = sad;
          bestMx = mx;
          bestMy = my;
        }
      }
    }
    // cur(x) ≈ prev(x+m) ⇒ content moved by -m
    deltas.push(-bestMx, -bestMy);
    prev = cur;
    onProgress?.(i / (times.length - 1));
  }
  v.src = "";

  // cumulative content path C[i], smoothed path S[i], correction D = S - C
  const n = deltas.length / 2;
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    cx[i] = cx[i - 1] + deltas[2 * i];
    cy[i] = cy[i - 1] + deltas[2 * i + 1];
  }
  const win = Math.max(3, Math.round(fps * 1.2)); // ~1.2s smoothing window
  const offsets: number[] = new Array(n * 2);
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
      sx += cx[j];
      sy += cy[j];
      cnt++;
    }
    const dx = (sx / cnt - cx[i]) / w; // normalize by source width
    const dy = (sy / cnt - cy[i]) / h; // normalize by source height
    offsets[2 * i] = dx;
    offsets[2 * i + 1] = dy;
    maxAbs = Math.max(maxAbs, Math.abs(dx), Math.abs(dy));
  }

  const zoom = Math.min(1.35, 1 + 2.15 * maxAbs + 0.03);
  return { fps, srcIn: inSec, srcOut: inSec + dur, speed: 1, zoom, offsets };
}
