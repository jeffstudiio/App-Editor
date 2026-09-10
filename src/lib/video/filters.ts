// ─────────────────────────────────────────────────────────────
// Canvas drawing helpers for the video engine:
// filters, color temp, vignette, chroma key, text layers
// ─────────────────────────────────────────────────────────────

import type { ChromaState, FilterState, MaskState, TextItem } from "./types";

export function cssFilter(f: FilterState, scale: number): string {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.blur > 0) parts.push(`blur(${(f.blur * scale).toFixed(2)}px)`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  return parts.length ? parts.join(" ") : "none";
}

/** «ارتقای کیفیت» — subtle clarity boost applied on top of the clip's grade. */
export function enhancedFilter(f: FilterState, on: boolean): FilterState {
  if (!on) return f;
  return {
    ...f,
    brightness: Math.min(160, f.brightness * 1.02 + 2),
    contrast: Math.min(170, f.contrast * 1.08 + 4),
    saturate: Math.min(200, f.saturate * 1.1),
  };
}

// ── mask shapes (centered path builders) ──

export function buildMaskPath(
  ctx: CanvasRenderingContext2D,
  shape: MaskState["shape"],
  w: number,
  h: number
): void {
  const r = (Math.min(w, h) / 2) * 0.92;
  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case "rounded": {
      const rr = Math.min(w, h) * 0.14;
      const x = -w / 2;
      const y = -h / 2;
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
      break;
    }
    case "star": {
      const spikes = 5;
      const outer = r;
      const inner = r * 0.46;
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const a = (Math.PI * i) / spikes - Math.PI / 2;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case "heart": {
      const s = (Math.min(w, h) / 2) * 0.055;
      ctx.moveTo(0, 14 * s);
      ctx.bezierCurveTo(-22 * s, -2 * s, -14 * s, -20 * s, 0, -8 * s);
      ctx.bezierCurveTo(14 * s, -20 * s, 22 * s, -2 * s, 0, 14 * s);
      ctx.closePath();
      break;
    }
    default:
      break;
  }
}

/**
 * Mask a frame through an offscreen canvas (needed for feathered edges).
 * Returns a canvas the caller can draw like a normal source.
 */
const maskCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

export function maskFrame(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  mask: MaskState,
  w: number,
  h: number
): HTMLCanvasElement | null {
  if (!maskCanvas) return null;
  if (maskCanvas.width !== w || maskCanvas.height !== h) {
    maskCanvas.width = w;
    maskCanvas.height = h;
  }
  const m = maskCanvas.getContext("2d");
  if (!m) return null;
  m.clearRect(0, 0, w, h);
  m.drawImage(source, 0, 0, w, h);
  m.globalCompositeOperation = "destination-in";
  m.save();
  m.translate(w / 2, h / 2);
  buildMaskPath(m, mask.shape, w * mask.size, h * mask.size);
  if (mask.feather > 0.01) {
    const r = (Math.min(w, h) / 2) * mask.size;
    const g = m.createRadialGradient(0, 0, r * (1 - mask.feather), 0, 0, r);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    m.fillStyle = g;
    m.save();
    // circle gradient works for circle/star/heart; for rounded use solid fill
    if (mask.shape === "rounded") {
      m.fillStyle = "#fff";
      m.fill();
    } else {
      m.fill();
    }
    m.restore();
  } else {
    m.fillStyle = "#fff";
    m.fill();
  }
  m.restore();
  m.globalCompositeOperation = "source-over";
  return maskCanvas;
}

export function drawTempOverlay(
  ctx: CanvasRenderingContext2D,
  temp: number,
  W: number,
  H: number
) {
  if (temp === 0) return;
  const a = (Math.abs(temp) / 100) * 0.22;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = temp > 0 ? `rgba(255,138,42,${a})` : `rgba(52,120,255,${a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function drawVignette(ctx: CanvasRenderingContext2D, v: number, W: number, H: number) {
  if (v <= 0) return;
  const g = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.42,
    W / 2, H / 2, Math.max(W, H) * 0.75
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${(v * 0.75).toFixed(3)})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Chroma-key a frame: draws source onto a small offscreen canvas, kills keyed
 * pixels and returns the processed canvas. Down-scaled for performance.
 */
const chromaCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

export function chromaFrame(
  source: HTMLVideoElement | HTMLImageElement,
  chroma: ChromaState,
  outW: number,
  outH: number
): HTMLCanvasElement | null {
  if (!chromaCanvas) return null;
  const srcW = "videoWidth" in source ? source.videoWidth : source.width;
  const srcH = "videoHeight" in source ? source.videoHeight : source.height;
  if (!srcW || !srcH) return null;

  const maxDim = 540;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(2, Math.round(srcW * scale));
  const h = Math.max(2, Math.round(srcH * scale));
  chromaCanvas.width = w;
  chromaCanvas.height = h;

  const c2d = chromaCanvas.getContext("2d", { willReadFrequently: true });
  if (!c2d) return null;
  c2d.clearRect(0, 0, w, h);
  c2d.drawImage(source, 0, 0, w, h);

  let img: ImageData;
  try {
    img = c2d.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const d = img.data;
  const key = hexToRgb(chroma.color);
  const thr = chroma.similarity * 441; // max euclidean distance in RGB space
  const soft = Math.max(1, chroma.smoothness * 220);

  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - key.r;
    const dg = d[i + 1] - key.g;
    const db = d[i + 2] - key.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < thr) {
      d[i + 3] = 0;
    } else if (dist < thr + soft) {
      d[i + 3] = Math.round(d[i + 3] * ((dist - thr) / soft));
    }
  }
  c2d.putImageData(img, 0, 0);

  // draw processed result onto an output-sized canvas
  const out = document.createElement("canvas");
  out.width = Math.max(2, Math.round(outW));
  out.height = Math.max(2, Math.round(outH));
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(chromaCanvas, 0, 0, out.width, out.height);
  return out;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// ───────────── Text layer drawing ─────────────

function fitFont(ctx: CanvasRenderingContext2D, item: TextItem, W: number, scale: number) {
  let size = item.size * scale;
  ctx.font = `${item.weight} ${size}px "${item.font}", "Vazirmatn", sans-serif`;
  const words = item.text.split(/\s+/).filter(Boolean);
  const spaceW = ctx.measureText(" ").width;
  const total = words.reduce((a, w) => a + ctx.measureText(w).width, 0) + spaceW * Math.max(0, words.length - 1);
  const maxW = W * 0.9;
  if (total > maxW && total > 0) {
    size = size * (maxW / total);
    ctx.font = `${item.weight} ${size}px "${item.font}", "Vazirmatn", sans-serif`;
  }
  return size;
}

export interface TextRenderState {
  alpha: number; // 0..1 overall
  scale: number; // extra multiplier (pop anim)
  dy: number; // px offset (slideUp)
  reveal: number; // 0..1 typewriter
}

export function textAnimState(item: TextItem, t: number): TextRenderState {
  const dur = item.end - item.start;
  const inDur = Math.min(0.35, dur * 0.3);
  const outDur = Math.min(0.35, dur * 0.3);
  const local = t - item.start;
  const untilEnd = item.end - t;
  const st: TextRenderState = { alpha: item.opacity, scale: 1, dy: 0, reveal: 1 };

  if (item.animIn !== "none" && local < inDur) {
    const p = Math.max(0, local / inDur);
    if (item.animIn === "fade") st.alpha *= p;
    else if (item.animIn === "pop") {
      st.alpha *= p;
      st.scale *= 0.6 + 0.4 * easeOutBack(p);
    } else if (item.animIn === "slideUp") {
      st.alpha *= p;
      st.dy += (1 - easeOutCubic(p)) * 40;
    } else if (item.animIn === "typewriter") {
      st.reveal = Math.min(st.reveal, p);
    }
  }
  if (item.animOut !== "none" && untilEnd < outDur) {
    const p = Math.max(0, untilEnd / outDur);
    if (item.animOut === "fade") st.alpha *= p;
    else if (item.animOut === "pop") {
      st.alpha *= p;
      st.scale *= 0.6 + 0.4 * p; // فیکس: خروج pop حالا واقعاً کوچک می‌شود
    } else if (item.animOut === "slideUp") {
      st.alpha *= p;
      st.dy -= (1 - easeOutCubic(p)) * 40; // فیکس: قبلاً انتخابش اثر نداشت
    } else if (item.animOut === "typewriter") {
      st.reveal = Math.min(st.reveal, p); // فیکس: قبلاً انتخابش اثر نداشت
    }
  }
  return st;
}

function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - p, 3);
}
function easeOutBack(p: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

/** Draws one text item (RTL-aware, word-by-word so bidi is stable). */
export function drawTextItem(
  ctx: CanvasRenderingContext2D,
  item: TextItem,
  t: number,
  W: number,
  H: number
) {
  if (!item.text.trim()) return;
  const scale = W / 1080;
  const st = textAnimState(item, t);
  if (st.alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, st.alpha));
  ctx.translate(item.x * W, item.y * H + st.dy * scale);
  ctx.rotate((item.rotate * Math.PI) / 180);
  ctx.scale(st.scale, st.scale);

  const size = fitFont(ctx, item, W, scale);
  const words = item.text.split(/\s+/).filter(Boolean);
  if (item.animIn === "typewriter") {
    const chars = Math.ceil(item.text.length * st.reveal);
    let acc = 0;
    let shown = words;
    for (let i = 0; i < words.length; i++) {
      acc += words[i].length + 1;
      if (acc > chars) {
        shown = words.slice(0, i);
        if (i === 0) {
          ctx.restore();
          return;
        }
        break;
      }
    }
    words.length = 0;
    words.push(...shown);
  }

  const spaceW = ctx.measureText(" ").width;
  const widths = words.map((w) => ctx.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, words.length - 1);

  // background pill
  if (item.bgOpacity > 0) {
    const padX = size * 0.5;
    const padY = size * 0.3;
    ctx.fillStyle = rgba(item.bgColor, item.bgOpacity);
    roundRectPath(ctx, -total / 2 - padX, -size / 2 - padY, total + padX * 2, size + padY * 2, size * 0.28);
    ctx.fill();
  }

  if (item.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 16 * scale;
    ctx.shadowOffsetY = 4 * scale;
  }

  // lay words out visually right-to-left (first word = rightmost)
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const grad = ctx.createLinearGradient(-total / 2, -size, total / 2, size);
  grad.addColorStop(0, "#f0abfc");
  grad.addColorStop(0.5, item.color);
  grad.addColorStop(1, "#a78bfa");

  // karaoke progress
  let activeIdx = -1;
  if (item.karaoke) {
    const p = (t - item.start) / Math.max(0.2, item.end - item.start);
    activeIdx = Math.min(words.length - 1, Math.floor(p * words.length));
  }

  let xRight = total / 2;
  for (let i = 0; i < words.length; i++) {
    const w = widths[i];
    const x = xRight - w;
    if (item.strokeW > 0) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = item.strokeW * scale;
      ctx.strokeStyle = item.strokeColor;
      ctx.strokeText(words[i], x, 0);
    }
    if (i === activeIdx) ctx.fillStyle = item.accent;
    else if (item.gradient) ctx.fillStyle = grad;
    else ctx.fillStyle = item.color;
    ctx.fillText(words[i], x, 0);
    xRight = x - spaceW;
  }
  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
