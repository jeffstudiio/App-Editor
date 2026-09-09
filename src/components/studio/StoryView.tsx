"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Download, Trash2, Type, Upload, Layers } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  STORY_GRADIENTS,
  STORY_SIZES,
  STORY_FONTS,
  STORY_STICKERS,
  type StorySizeId,
} from "@/lib/studio-data";

interface TextLayer {
  id: string;
  type: "text" | "sticker";
  text: string;
  x: number; // 0..1 relative center
  y: number;
  size: number; // px at 1080-width basis
  color: string;
  font: string;
  weight: number;
  mot?: string; // موشن از بانک استوری موشن
}

// بانک استوری موشن — انیمیشن‌های لایه روی بوم
const STORY_MOTIONS: { id: string; label: string; emoji: string }[] = [
  { id: "", label: "بدون", emoji: "⬜️" },
  { id: "pop", label: "پاپ", emoji: "💥" },
  { id: "rise", label: "اوریز", emoji: "⬆️" },
  { id: "drop", label: "دراپ", emoji: "⤵️" },
  { id: "float", label: "شناور", emoji: "🎈" },
  { id: "breathe", label: "نفس", emoji: "🫧" },
  { id: "pulse", label: "پالس", emoji: "💓" },
  { id: "swing", label: "تاب", emoji: "🪝" },
  { id: "wiggle", label: "جیرجیر", emoji: "🐛" },
  { id: "shake", label: "لرزش", emoji: "📳" },
  { id: "neon", label: "نئون", emoji: "💡" },
  { id: "flicker", label: "فلیکر", emoji: "🕯️" },
  { id: "spin", label: "چرخش", emoji: "🌀" },
  { id: "glow", label: "درخش", emoji: "✨" },
];

const eo = (p: number) => 1 - Math.pow(1 - p, 3);
const backOut = (p: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};

/** شروع تایم‌لاین انیمیشن استوری (module-level تا lint-immutable اذیت نکند) */
let storyAnimStart = 0;

/** پارامترهای موشن لایه در زمان t (ثانیه) */
function layerMotion(mot: string, t: number) {
  const o = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1, glow: 0 };
  const loop = t % 12;
  switch (mot) {
    case "pop": {
      const p = Math.min(1, loop / 0.55);
      o.sx = o.sy = 0.3 + backOut(p) * 0.7;
      o.alpha = Math.min(1, p * 3);
      break;
    }
    case "rise": {
      const p = Math.min(1, loop / 0.6);
      o.dy = (1 - eo(p)) * 46;
      o.alpha = p < 0.18 ? p / 0.18 : 1;
      break;
    }
    case "drop": {
      const p = Math.min(1, loop / 0.7);
      if (p < 0.55) {
        o.dy = -(1 - p / 0.55) * 64;
        o.sx = o.sy = 1.08;
      } else if (p < 0.78) {
        o.dy = ((p - 0.55) / 0.23) * -12;
      }
      o.alpha = Math.min(1, p * 4);
      break;
    }
    case "float":
      o.dy = Math.sin(loop * 2.4) * -24;
      break;
    case "breathe":
      o.sx = o.sy = 1 + Math.sin(loop * 2.4) * 0.05;
      break;
    case "pulse":
      o.sx = o.sy = 1 + Math.abs(Math.sin(loop * 3.4)) * 0.13;
      break;
    case "swing":
      o.rot = Math.sin(loop * 2.2) * 0.09;
      break;
    case "wiggle":
      o.dx = Math.sin(loop * 5) * 16;
      o.rot = Math.sin(loop * 5) * 0.045;
      break;
    case "shake":
      o.dx = Math.sin(loop * 27) * 7;
      o.dy = Math.cos(loop * 33) * 5;
      break;
    case "neon":
      o.glow = 12 + Math.sin(loop * 4) * 9 + (Math.sin(loop * 17) > 0.82 ? 22 : 0);
      break;
    case "flicker":
      o.alpha = 0.5 + 0.5 * (Math.sin(loop * 12) * 0.5 + 0.5) - (Math.sin(loop * 29) > 0.93 ? 0.3 : 0);
      break;
    case "spin":
      o.rot = loop * 0.9;
      break;
    case "glow":
      o.glow = 6 + (Math.sin(loop * 2.8) * 0.5 + 0.5) * 24;
      break;
  }
  return o;
}

const EXPORT_W = 1080;

const makeLayer = (patch: Partial<TextLayer> = {}): TextLayer => ({
  id: Math.random().toString(36).slice(2, 9),
  type: "text",
  text: "متن جدید",
  x: 0.5,
  y: 0.5,
  size: 72,
  color: "#ffffff",
  font: "Vazirmatn",
  weight: 900,
  ...patch,
});

export function StoryView() {
  const [sizeId, setSizeId] = useState<StorySizeId>("story");
  const [gradientId, setGradientId] = useState<string>(STORY_GRADIENTS[0].id);
  const [solidColor, setSolidColor] = useState<string>("#111118");
  const [bgMode, setBgMode] = useState<"gradient" | "solid" | "image">("gradient");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [layers, setLayers] = useState<TextLayer[]>([makeLayer({ text: "استودیو خلاق", y: 0.42 })]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string } | null>(null);

  const size = STORY_SIZES.find((s) => s.id === sizeId)!;
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const setLayer = (id: string, patch: Partial<TextLayer>) =>
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  useEffect(() => {
    let alive = true;
    Promise.all([
      document.fonts.load('900 72px "Vazirmatn"'),
      document.fonts.load('400 72px "Vazirmatn"'),
      document.fonts.load('400 72px "Lalezar"'),
      document.fonts.ready,
    ])
      .then(() => alive && setFontsReady(true))
      .catch(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Render canvas — تابع مشترک برای رندر ثابت و انیمیشن زنده
  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fontsReady) return;
    // internal resolution: width fixed 720 for perf, height per ratio
    const W = size.w >= size.h ? 1080 : 720;
    const H = Math.round((W * size.h) / size.w);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    if (bgMode === "image" && bgImage) {
      const img = bgImage;
      const imgRatio = img.width / img.height;
      const canvasRatio = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (imgRatio > canvasRatio) {
        dh = H; dw = dh * imgRatio; dx = (W - dw) / 2;
      } else {
        dw = W; dh = dw / imgRatio; dy = (H - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    } else if (bgMode === "solid") {
      ctx.fillStyle = solidColor;
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = STORY_GRADIENTS.find((gr) => gr.id === gradientId) ?? STORY_GRADIENTS[0];
      const rad = (g.angle * Math.PI) / 180;
      const cx = W / 2;
      const cy = H / 2;
      const len = Math.abs(W * Math.cos(rad)) + Math.abs(H * Math.sin(rad));
      const grad = ctx.createLinearGradient(
        cx - (Math.cos(rad) * len) / 2,
        cy - (Math.sin(rad) * len) / 2,
        cx + (Math.cos(rad) * len) / 2,
        cy + (Math.sin(rad) * len) / 2
      );
      grad.addColorStop(0, g.stops[0]);
      grad.addColorStop(0.5, g.stops[1]);
      grad.addColorStop(1, g.stops[2]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Layers — با موشن بانک استوری (پیش‌نمایش زنده)
    const scale = W / EXPORT_W;
    const now = storyAnimStart ? (performance.now() - storyAnimStart) / 1000 : 0;
    for (const layer of layers) {
      const mo = layerMotion(layer.mot ?? "", now);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${layer.weight} ${Math.round(layer.size * scale)}px "${layer.font}", "Vazirmatn", sans-serif`;
      const x = layer.x * W;
      const y = layer.y * H;
      // موشن: انتقال/چرخش/مقیاس دور مرکز لایه
      if (layer.mot) {
        ctx.globalAlpha = Math.max(0, Math.min(1, mo.alpha));
        ctx.translate(x + mo.dx * scale, y + mo.dy * scale);
        ctx.rotate(mo.rot);
        ctx.scale(mo.sx, mo.sy);
        ctx.translate(-x, -y);
      }
      if (layer.type === "text") {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 18 * scale + mo.glow * scale;
        ctx.shadowOffsetY = 4 * scale;
        ctx.fillStyle = layer.color;
        // wrap
        const words = layer.text.split(/\s+/).filter(Boolean);
        const maxWidth = W * 0.84;
        const out: string[] = [];
        if (words.length) {
          let line = words[0];
          for (let i = 1; i < words.length; i++) {
            const test = line + " " + words[i];
            if (ctx.measureText(test).width <= maxWidth) line = test;
            else { out.push(line); line = words[i]; }
          }
          out.push(line);
        } else out.push("");
        const lh = layer.size * scale * 1.3;
        out.forEach((ln, i) => ctx.fillText(ln, x, y + (i - (out.length - 1) / 2) * lh));
      } else {
        if (mo.glow > 0) {
          ctx.shadowColor = "rgba(224,167,143,0.95)";
          ctx.shadowBlur = mo.glow * scale;
        }
        ctx.font = `${Math.round(layer.size * scale)}px sans-serif`;
        ctx.fillText(layer.text, x, y);
      }
      ctx.restore();

      // selection outline
      if (layer.id === selectedId) {
        const m = ctx.measureText(layer.type === "text" ? (layer.text.split(/\s+/)[0] ?? "") : layer.text);
        ctx.save();
        ctx.strokeStyle = "rgba(193,106,82,0.9)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        const w = Math.min(W * 0.86, Math.max(m.width * 1.2, 80 * scale));
        const h = layer.size * scale * 1.5;
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        ctx.restore();
      }
    }
  }, [sizeId, gradientId, solidColor, bgMode, bgImage, layers, selectedId, fontsReady, size]);

  // رندر اولیه و واکنش به تغییرات
  useEffect(() => {
    drawScene();
  }, [drawScene]);

  // حلقهٔ انیمیشن: فقط وقتی لایه‌ای موشن دارد
  const rafRef = useRef(0);
  const hasMotion = layers.some((l) => l.mot);
  useEffect(() => {
    if (!hasMotion) {
      cancelAnimationFrame(rafRef.current);
      storyAnimStart = 0;
      return;
    }
    if (!storyAnimStart) storyAnimStart = performance.now();
    const tick = () => {
      drawScene();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [hasMotion, drawScene]);

  // Drag handling (pointer events)
  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    // hit-test topmost layer
    const hit = [...layers].reverse().find((l) => {
      const dx = (p.x - l.x) * size.w;
      const dy = (p.y - l.y) * size.h;
      const w = l.size / EXPORT_W / 1.6;
      const h = (l.size * 1.4) / 1000 / (size.h / size.w);
      return Math.abs(dx) < Math.max(w, 0.09) && Math.abs(dy) < Math.max(h, 0.13);
    });
    if (hit) {
      setSelectedId(hit.id);
      dragRef.current = { id: hit.id };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      setSelectedId(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const p = pointerPos(e);
    setLayer(dragRef.current.id, {
      x: Math.min(0.97, Math.max(0.03, p.x)),
      y: Math.min(0.97, Math.max(0.03, p.y)),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setBgImage(img);
      setBgMode("image");
      toast.success("تصویر پس‌زمینه اعمال شد");
    };
    img.src = url;
    e.target.value = "";
  };

  const exportPng = useCallback(() => {
    const src = canvasRef.current;
    if (!src) return;
    // Re-render at full export resolution on an offscreen canvas
    const W = EXPORT_W;
    const H = Math.round((W * size.h) / size.w);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (bgMode === "image" && bgImage) {
      const img = bgImage;
      const imgRatio = img.width / img.height;
      const canvasRatio = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (imgRatio > canvasRatio) { dh = H; dw = dh * imgRatio; dx = (W - dw) / 2; }
      else { dw = W; dh = dw / imgRatio; dy = (H - dh) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    } else if (bgMode === "solid") {
      ctx.fillStyle = solidColor;
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = STORY_GRADIENTS.find((gr) => gr.id === gradientId) ?? STORY_GRADIENTS[0];
      const rad = (g.angle * Math.PI) / 180;
      const cx = W / 2, cy = H / 2;
      const len = Math.abs(W * Math.cos(rad)) + Math.abs(H * Math.sin(rad));
      const grad = ctx.createLinearGradient(
        cx - (Math.cos(rad) * len) / 2, cy - (Math.sin(rad) * len) / 2,
        cx + (Math.cos(rad) * len) / 2, cy + (Math.sin(rad) * len) / 2
      );
      grad.addColorStop(0, g.stops[0]);
      grad.addColorStop(0.5, g.stops[1]);
      grad.addColorStop(1, g.stops[2]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    const scale = W / EXPORT_W;
    for (const layer of layers) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${layer.weight} ${Math.round(layer.size * scale)}px "${layer.font}", "Vazirmatn", sans-serif`;
      const x = layer.x * W;
      const y = layer.y * H;
      if (layer.type === "text") {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 18 * scale;
        ctx.shadowOffsetY = 4 * scale;
        ctx.fillStyle = layer.color;
        const words = layer.text.split(/\s+/).filter(Boolean);
        const maxWidth = W * 0.84;
        const out: string[] = [];
        if (words.length) {
          let line = words[0];
          for (let i = 1; i < words.length; i++) {
            const test = line + " " + words[i];
            if (ctx.measureText(test).width <= maxWidth) line = test;
            else { out.push(line); line = words[i]; }
          }
          out.push(line);
        } else out.push("");
        const lh = layer.size * scale * 1.3;
        out.forEach((ln, i) => ctx.fillText(ln, x, y + (i - (out.length - 1) / 2) * lh));
      } else {
        ctx.font = `${Math.round(layer.size * scale)}px sans-serif`;
        ctx.fillText(layer.text, x, y);
      }
      ctx.restore();
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `story-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("طرح با کیفیت کامل ذخیره شد 🎉");
    }, "image/png");
  }, [bgImage, bgMode, gradientId, layers, size, solidColor]);

  const ratio = size.w / size.h;

  return (
    <div className="px-4 pt-4 pb-6 mx-auto max-w-lg space-y-4">
      <header className="pt-2">
        <h1 className="font-display text-xl">استودیو استوری و پست</h1>
        <p className="text-xs text-muted-foreground mt-1">گرادیان و عکس بذار، متن فارسی اضافه کن، خروجی PNG بگیر</p>
      </header>

      {/* Size toggle */}
      <div className="flex gap-1.5">
        {STORY_SIZES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSizeId(s.id)}
            className={`flex-1 text-[11px] rounded-xl border px-3 py-2 transition-colors ${
              sizeId === s.id
                ? "bg-primary/15 text-primary border-primary/40 font-bold"
                : "border-border text-muted-foreground"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="rounded-2xl overflow-hidden border border-border flex justify-center bg-black/40">
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto touch-none cursor-move"
          style={{ aspectRatio: `${ratio}`, width: ratio < 1 ? "72%" : "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="بوم طراحی"
        />
      </div>

      {/* Tabs: background / text / stickers */}
      <TabsSection
        bgMode={bgMode}
        setBgMode={setBgMode}
        gradientId={gradientId}
        setGradientId={(id) => { setGradientId(id); setBgMode("gradient"); }}
        solidColor={solidColor}
        setSolidColor={(c) => { setSolidColor(c); setBgMode("solid"); }}
        onUpload={() => fileRef.current?.click()}
        onAddText={() => {
          const l = makeLayer();
          setLayers((ls) => [...ls, l]);
          setSelectedId(l.id);
        }}
        onAddSticker={(s) => {
          const l = makeLayer({ type: "sticker", text: s, size: 140 });
          setLayers((ls) => [...ls, l]);
          setSelectedId(l.id);
        }}
      />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />

      {/* Selected layer editor */}
      {selected && (
        <section className="rounded-2xl border border-primary/30 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Layers size={13} />
              ویرایش لایه انتخاب‌شده
            </h2>
            <button
              onClick={() => {
                setLayers((ls) => ls.filter((l) => l.id !== selected.id));
                setSelectedId(null);
              }}
              className="flex items-center gap-1 text-[11px] text-destructive"
            >
              <Trash2 size={12} />
              حذف لایه
            </button>
          </div>

          {selected.type === "text" && (
            <input
              value={selected.text}
              onChange={(e) => setLayer(selected.id, { text: e.target.value })}
              placeholder="متن لایه…"
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-primary/50"
            />
          )}

          {/* Font picker for text layers */}
          {selected.type === "text" && (
            <div className="flex gap-2">
              {STORY_FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setLayer(selected.id, { font: f.id, weight: f.weights[f.weights.length - 1] })}
                  className={`flex-1 text-xs rounded-xl border px-3 py-2 transition-colors ${
                    selected.font === f.id
                      ? "bg-primary/15 text-primary border-primary/40 font-bold"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          <div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
              <span>اندازه</span>
              <span className="tabular-nums">{selected.size}</span>
            </div>
            <Slider
              value={[selected.size]}
              min={selected.type === "sticker" ? 48 : 28}
              max={selected.type === "sticker" ? 320 : 160}
              step={2}
              onValueChange={([v]) => setLayer(selected.id, { size: v })}
            />
          </div>

          {selected.type === "text" && (
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              رنگ متن
              <input
                type="color"
                value={selected.color}
                onChange={(e) => setLayer(selected.id, { color: e.target.value })}
                className="w-9 h-9 rounded-lg"
                aria-label="رنگ متن لایه"
              />
            </label>
          )}

          {/* موشن استوری — از بانک موشن */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>موشن استوری (پیش‌نمایش زنده)</span>
              <span className="text-[9px]">خروجی PNG ثابت است</span>
            </div>
            <div className="mot-options">
              {STORY_MOTIONS.map((m) => (
                <button
                  key={m.id || "none"}
                  data-on={selected.mot === m.id ? "1" : "0"}
                  onClick={() => setLayer(selected.id, { mot: m.id || undefined })}
                  aria-label={`موشن ${m.label}`}
                >
                  <span className="mot-demo" style={m.id === "neon" || m.id === "glow" ? { color: "#e0a78f" } : undefined}>
                    {m.emoji}
                  </span>
                  <span className={selected.mot === m.id ? "text-[#e0a78f] font-bold" : "text-muted-foreground"}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground/80 leading-5">
            💡 برای جابه‌جایی، لایه را روی بوم بکش و رها کن
          </p>
        </section>
      )}

      {/* Layers list */}
      {layers.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {layers.map((l, i) => (
            <button
              key={l.id}
              onClick={() => setSelectedId(l.id)}
              className={`shrink-0 max-w-[150px] truncate text-[11px] rounded-full px-3 py-1.5 border transition-colors ${
                selectedId === l.id
                  ? "bg-accent/15 text-accent border-accent/40"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {l.type === "sticker" ? l.text : l.text || `لایه ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Export */}
      <button
        onClick={exportPng}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#c16a52] to-[#9c453d] text-[#faf7f5] font-bold text-sm py-3.5 shadow-lg shadow-[#c16a52]/25 active:scale-[0.98] transition-transform outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Download size={17} />
        دانلود PNG با کیفیت کامل
      </button>
    </div>
  );
}

// ─────────── Tabs: background / text / stickers ───────────

function TabsSection(props: {
  bgMode: "gradient" | "solid" | "image";
  setBgMode: (m: "gradient" | "solid" | "image") => void;
  gradientId: string;
  setGradientId: (id: string) => void;
  solidColor: string;
  setSolidColor: (c: string) => void;
  onUpload: () => void;
  onAddText: () => void;
  onAddSticker: (s: string) => void;
}) {
  const [tab, setTab] = useState<"bg" | "text" | "sticker">("bg");
  const { bgMode, setBgMode, gradientId, setGradientId, solidColor, setSolidColor, onUpload, onAddText, onAddSticker } = props;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex gap-1.5 mb-3">
        {([
          { id: "bg", label: "پس‌زمینه", icon: Upload },
          { id: "text", label: "متن", icon: Type },
          { id: "sticker", label: "استیکر", icon: Plus },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] rounded-xl border px-3 py-2 transition-colors ${
                tab === t.id
                  ? "bg-primary/15 text-primary border-primary/40 font-bold"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "bg" && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {STORY_GRADIENTS.map((g) => (
              <button
                key={g.id}
                onClick={() => setGradientId(g.id)}
                aria-label={`گرادیان ${g.name}`}
                className={`h-14 rounded-xl border-2 transition-all ${
                  bgMode === "gradient" && gradientId === g.id ? "border-primary scale-105" : "border-transparent opacity-80 hover:opacity-100"
                }`}
                style={{ background: `linear-gradient(135deg, ${g.stops[0]}, ${g.stops[1]}, ${g.stops[2]})` }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground flex-1">
              رنگ ساده
              <input
                type="color"
                value={solidColor}
                onChange={(e) => setSolidColor(e.target.value)}
                onFocus={() => setBgMode("solid")}
                className="w-9 h-9 rounded-lg"
                aria-label="رنگ پس‌زمینه ساده"
              />
            </label>
            <button
              onClick={onUpload}
              className={`flex items-center gap-1.5 text-[11px] rounded-xl border px-3.5 py-2 transition-colors ${
                bgMode === "image" ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground"
              }`}
            >
              <Upload size={13} />
              آپلود عکس
            </button>
          </div>
        </div>
      )}

      {tab === "text" && (
        <div className="flex items-center justify-center py-2">
          <button
            onClick={onAddText}
            className="flex items-center gap-2 text-xs font-bold text-primary border border-primary/40 bg-primary/10 rounded-xl px-4 py-2.5 hover:bg-primary/15 transition-colors"
          >
            <Plus size={15} />
            افزودن لایه متن
          </button>
        </div>
      )}

      {tab === "sticker" && (
        <div className="grid grid-cols-9 gap-1">
          {STORY_STICKERS.map((s) => (
            <button
              key={s}
              onClick={() => onAddSticker(s)}
              className="h-9 rounded-lg hover:bg-secondary text-lg leading-none transition-colors"
              aria-label={`استیکر ${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
