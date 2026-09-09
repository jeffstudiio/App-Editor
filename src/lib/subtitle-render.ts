// Canvas rendering engine for subtitle overlays (shared by preview + export)

import type { SubtitleStyle } from "./studio-data";

export const GRADIENT_TEXT_COLORS = ["#c084fc", "#e879f9", "#f0abfc"];

export function fontFamilyCss(style: SubtitleStyle): string {
  return `"${style.fontFamily}", "Vazirmatn", sans-serif`;
}

export function buildFontString(style: SubtitleStyle, scale: number): string {
  return `${style.fontWeight} ${Math.round(style.fontSize * scale)}px ${fontFamilyCss(style)}`;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const out: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + " " + words[i];
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

function roundRect(
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

function applyLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  } catch {
    // Safari older versions: ignore
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface DrawOptions {
  transparent?: boolean;
  image?: HTMLImageElement | null;
}

/**
 * Draws a subtitle block centered horizontally at style.yPercent of canvas height.
 * Canvas must already be sized. Font must be loaded before calling.
 */
export function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: SubtitleStyle,
  W: number,
  H: number,
  opts: DrawOptions = {}
) {
  const scale = W / 1080;

  // Background
  if (!opts.transparent) {
    if (opts.image) {
      const img = opts.image;
      const imgRatio = img.width / img.height;
      const canvasRatio = W / H;
      let dw = W;
      let dh = H;
      let dx = 0;
      let dy = 0;
      if (imgRatio > canvasRatio) {
        dh = H;
        dw = dh * imgRatio;
        dx = (W - dw) / 2;
      } else {
        dw = W;
        dh = dw / imgRatio;
        dy = (H - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      // subtle darkening so text pops
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#171225");
      g.addColorStop(0.55, "#1d1330");
      g.addColorStop(1, "#241238");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  if (!text.trim()) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFontString(style, scale);
  applyLetterSpacing(ctx, style.letterSpacing * scale);

  const maxWidth = W * 0.86;
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = style.fontSize * scale * 1.3;
  const blockH = lineHeight * lines.length;
  const centerY = (H * style.yPercent) / 100;
  const startY = centerY - blockH / 2 + lineHeight / 2;

  // Background pill per block
  if (style.bgOpacity > 0) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = style.fontSize * scale * 0.55;
    const padY = style.fontSize * scale * 0.32;
    ctx.fillStyle = hexToRgba(style.bgColor, style.bgOpacity);
    roundRect(
      ctx,
      W / 2 - widest / 2 - padX,
      centerY - blockH / 2 - padY,
      widest + padX * 2,
      blockH + padY * 2,
      20 * scale + 8
    );
    ctx.fill();
  }

  if (style.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 22 * scale;
    ctx.shadowOffsetY = 5 * scale;
  }

  const drawFill = (line: string, x: number, y: number) => {
    if (style.gradient) {
      const grad = ctx.createLinearGradient(x - W * 0.3, y - lineHeight, x + W * 0.3, y + lineHeight);
      GRADIENT_TEXT_COLORS.forEach((c, i) => grad.addColorStop(i / (GRADIENT_TEXT_COLORS.length - 1), c));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = style.color;
    }
    ctx.fillText(line, x, y);
  };

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    if (style.strokeWidth > 0) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = style.strokeWidth * scale;
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(line, W / 2, y);
    }
    drawFill(line, W / 2, y);
  });

  ctx.restore();
}

// ───────────── SRT helpers ─────────────

export function secondsToSrt(t: number): string {
  const clamped = Math.max(0, t);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function buildSrt(lines: { text: string; start: number; end: number }[]): string {
  return lines
    .map((l, i) => `${i + 1}\n${secondsToSrt(l.start)} --> ${secondsToSrt(l.end)}\n${l.text.trim()}\n`)
    .join("\n");
}
