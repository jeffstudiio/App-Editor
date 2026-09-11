"use client";

// Photo retouch studio: manual adjustments + AI enhance
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { aiImageEdit } from "@/lib/ai/client/gateway";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Upload, Loader2, Download, Undo2, Wand2, Eye, RotateCcw } from "lucide-react";

interface Adjust {
  smooth: number; // 0..100 skin smoothing
  brightness: number; // 100 base
  contrast: number;
  saturate: number;
  temp: number; // -100..100
  vignette: number; // 0..100
}

const DEFAULT_ADJ: Adjust = { smooth: 0, brightness: 100, contrast: 100, saturate: 100, temp: 0, vignette: 0 };

const QUICK_PRESETS: { name: string; emoji: string; adj: Partial<Adjust> }[] = [
  { name: "گلاس طبیعی", emoji: "🤍", adj: { smooth: 35, brightness: 104, contrast: 102, saturate: 104 } },
  { name: "پرتره استودیویی", emoji: "📸", adj: { smooth: 45, brightness: 106, contrast: 112, saturate: 96, vignette: 25 } },
  { name: "سینمایی گرم", emoji: "🌇", adj: { smooth: 25, brightness: 102, contrast: 108, saturate: 106, temp: 35, vignette: 20 } },
  { name: "مات و خنک", emoji: "❄️", adj: { smooth: 30, brightness: 104, contrast: 96, saturate: 92, temp: -30 } },
  { name: "درخشان", emoji: "✨", adj: { smooth: 50, brightness: 110, contrast: 104, saturate: 110, temp: 10 } },
];

const AI_PRESETS: { name: string; emoji: string; prompt: string }[] = [
  {
    name: "روتوش طبیعی چهره",
    emoji: "🪄",
    prompt: "Natural professional face retouch: even out skin tone, gently smooth skin keeping natural texture, remove blemishes, brighten eyes subtly, keep identity and facial features exactly the same, photorealistic",
  },
  {
    name: "روشن و شفاف",
    emoji: "💡",
    prompt: "Brighten the photo with clean studio-like lighting, increase clarity and sharpness, keep colors natural and photorealistic, keep identity exactly the same",
  },
  {
    name: "سینمایی",
    emoji: "🎬",
    prompt: "Cinematic color grading, teal and orange tones, moody film look, shallow depth of field feel, photorealistic, keep subject identity exactly the same",
  },
  {
    name: "پس‌زمینه استودیو",
    emoji: "🏙️",
    prompt: "Replace the background with a clean soft studio backdrop with gentle gradient lighting, keep the subject exactly the same with natural edges, photorealistic",
  },
];

export function RetouchView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [adj, setAdj] = useState<Adjust>(DEFAULT_ADJ);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const historyRef = useRef<{ img: HTMLImageElement; adj: Adjust }[]>([]);
  const [histCount, setHistCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageEngine, setImageEngine] = useState<"internal" | "gemini">("internal");
  // Nano Banana toggle is always available — the server has a Google key installed,
  // and a personal key saved in assistant settings (if any) takes precedence
  const [hasGemKey, setHasGemKey] = useState(true);
  void setHasGemKey;

  // render pipeline
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth * scale);
    const H = Math.round(img.naturalHeight * scale);
    canvas.width = W;
    canvas.height = H;

    const a = adj;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.filter = `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%)`;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();

    // skin smoothing: blurred copy blended over
    if (a.smooth > 0) {
      ctx.save();
      ctx.globalAlpha = (a.smooth / 100) * 0.55;
      ctx.filter = `blur(${Math.max(2, (a.smooth / 100) * 10)}px) brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%)`;
      ctx.drawImage(img, 0, 0, W, H);
      ctx.restore();
    }

    // warmth
    if (a.temp !== 0) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      const alpha = (Math.abs(a.temp) / 100) * 0.3;
      ctx.fillStyle = a.temp > 0 ? `rgba(255,140,40,${alpha})` : `rgba(50,120,255,${alpha})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // vignette
    if (a.vignette > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${(a.vignette / 100) * 0.6})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }, [adj]);

  useEffect(() => {
    if (showOriginal) {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      return;
    }
    render();
  }, [adj, src, render, showOriginal]);

  const loadFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("bad"));
    });
    imgRef.current = img;
    historyRef.current = [];
    setHistCount(0);
    setAdj(DEFAULT_ADJ);
    setSrc(url);
  };

  const pushHistory = () => {
    if (!imgRef.current) return;
    // snapshot current pixels as image
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snap = new Image();
    snap.src = canvas.toDataURL("image/jpeg", 0.95);
    historyRef.current.push({ img: imgRef.current, adj });
    setHistCount(historyRef.current.length);
    imgRef.current = snap;
    const ready = new Promise<void>((res) => {
      snap.onload = () => res();
    });
    return ready;
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    setHistCount(historyRef.current.length);
    if (!prev) return;
    imgRef.current = prev.img;
    setAdj(prev.adj);
  };

  const aiEnhance = async (preset: (typeof AI_PRESETS)[number]) => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return toast.error("اول یک عکس انتخاب کن");
    setBusy(preset.name);
    const beforeImg = imgRef.current;
    const beforeAdj = adj;
    try {
      await pushHistory();
      const b64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
      // Optional Nano Banana (Gemini) engine from assistant settings
      // (server-installed key is used automatically when no personal key is saved)
      let engine: Record<string, unknown> = {};
      if (imageEngine === "gemini") {
        let gemKey = "";
        let gemModel = "gemini-3.1-flash-image";
        try {
          const raw = localStorage.getItem("ai-assistant-settings");
          if (raw) {
            const s = JSON.parse(raw);
            gemKey = String(s?.gemini?.apiKey ?? "");
            gemModel = String(s?.gemini?.model ?? "") || gemModel;
          }
        } catch {
          // ignore
        }
        engine = { engine: "gemini", apiKey: gemKey, model: gemModel };
      }
      const j = await aiImageEdit({ prompt: preset.prompt, image_base64: b64, size: "1024x1024", ...engine });
      if (j.error || !j.image_base64) throw new Error(j.error || "خطا");
      const img = new Image();
      img.src = `data:image/png;base64,${j.image_base64}`;
      await new Promise<void>((r, rej) => {
        img.onload = () => r();
        img.onerror = () => rej(new Error("bad"));
      });
      imgRef.current = img;
      setAdj(DEFAULT_ADJ);
      setSrc(img.src);
      toast.success(`${preset.emoji} ${preset.name} انجام شد${j.engine === "gemini" ? " (نانو‌بنانا)" : ""}`);
    } catch (e) {
      imgRef.current = beforeImg;
      setAdj(beforeAdj);
      toast.error(e instanceof Error ? e.message : "ویرایش هوشمند ناموفق بود");
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `retouch-${Date.now()}.jpg`;
      a.click();
    }, "image/jpeg", 0.95);
  };

  const set = (patch: Partial<Adjust>) => setAdj((a) => ({ ...a, ...patch }));

  return (
    <div className="px-4 pt-6 pb-4 mx-auto max-w-lg space-y-4">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500/25 to-orange-500/25 border border-white/5 flex items-center justify-center">
          <Wand2 size={20} className="text-rose-300" />
        </div>
        <div>
          <h1 className="font-display text-xl">روتوش و پوست</h1>
          <p className="text-xs text-muted-foreground mt-0.5">روتوش دستی + ارتقای هوشمند چهره</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
        <Button size="sm" variant="outline" className="mr-auto" onClick={() => fileRef.current?.click()}>
          <Upload size={15} className="ml-1" /> عکس
        </Button>
      </header>

      {!src ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-3xl border-2 border-dashed border-white/15 bg-card/50 py-16 flex flex-col items-center gap-3 text-muted-foreground"
        >
          <Upload size={34} className="opacity-60" />
          <span className="text-sm">عکس را انتخاب کن تا شروع کنیم</span>
          <span className="text-[11px]">JPG / PNG — بهترین نتیجه با پرتره</span>
        </button>
      ) : (
        <>
          <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black/40">
            <canvas ref={canvasRef} className="w-full h-auto block" />
            {busy && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-primary" size={26} />
                <span className="text-xs">AI در حال {busy}…</span>
              </div>
            )}
            <button
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onTouchStart={() => setShowOriginal(true)}
              onTouchEnd={() => setShowOriginal(false)}
              className="absolute bottom-3 left-3 text-[10px] px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 flex items-center gap-1"
            >
              <Eye size={12} /> نگه‌دار برای اصل عکس
            </button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={undo} disabled={histCount === 0}>
              <Undo2 size={14} className="ml-1" /> واگرد ({histCount})
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => set(DEFAULT_ADJ)}>
              <RotateCcw size={14} className="ml-1" /> ریست تنظیمات
            </Button>
            <Button size="sm" className="flex-1" onClick={download}>
              <Download size={14} className="ml-1" /> ذخیره
            </Button>
          </div>

          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold text-accent">پرست‌های سریع</h3>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.map((p) => (
                <button key={p.name} onClick={() => set(p.adj)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary/60">
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>

            <h3 className="text-xs font-bold text-accent pt-1">تنظیم دستی</h3>
            <SliderRow label="نرمی پوست (روتوش)" v={adj.smooth} set={(v) => set({ smooth: v })} suffix="٪" />
            <SliderRow label="روشنایی" v={adj.brightness} min={60} max={150} set={(v) => set({ brightness: v })} suffix="٪" />
            <SliderRow label="کنتراست" v={adj.contrast} min={60} max={160} set={(v) => set({ contrast: v })} suffix="٪" />
            <SliderRow label="اشباع رنگ" v={adj.saturate} min={0} max={180} set={(v) => set({ saturate: v })} suffix="٪" />
            <SliderRow label="دما (گرم ↔ سرد)" v={adj.temp} min={-100} max={100} set={(v) => set({ temp: v })} />
            <SliderRow label="وینیت" v={adj.vignette} min={0} max={100} set={(v) => set({ vignette: v })} suffix="٪" />
          </section>

          <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-primary">ارتقای هوشمند (AI)</h3>
            {hasGemKey && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-3 py-2">
                <span className="text-[11px] text-emerald-200/90">🍌 موتور ویرایش</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setImageEngine("internal")}
                    className={`rounded-lg px-2.5 py-1 text-[10px] ${imageEngine === "internal" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"}`}
                  >
                    داخلی
                  </button>
                  <button
                    onClick={() => setImageEngine("gemini")}
                    className={`rounded-lg px-2.5 py-1 text-[10px] ${imageEngine === "gemini" ? "bg-emerald-500 text-white font-bold" : "text-muted-foreground"}`}
                  >
                    نانو‌بنانا
                  </button>
                </div>
              </div>
            )}
            {AI_PRESETS.map((p) => (
              <Button key={p.name} variant="outline" size="sm" className="w-full justify-start" disabled={!!busy} onClick={() => aiEnhance(p)}>
                {busy === p.name ? <Loader2 size={14} className="animate-spin ml-1" /> : <span className="ml-1">{p.emoji}</span>}
                {p.name}
              </Button>
            ))}
            <p className="text-[11px] text-muted-foreground leading-5">هر بار AI روی نتیجه فعلی اعمال می‌شود و می‌توانی با «واگرد» برگردی.</p>
          </section>
        </>
      )}
    </div>
  );
}

function SliderRow({
  label, v, set, min = 0, max = 100, suffix = "",
}: {
  label: string;
  v: number;
  set: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{v}{suffix}</span>
      </div>
      <Slider value={[v]} min={min} max={max} step={1} onValueChange={(x) => set(x[0])} className="py-1" />
    </div>
  );
}
