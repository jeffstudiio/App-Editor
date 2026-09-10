"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Download, Trash2, Copy, ImageIcon, Minus, AudioLines, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_PRESETS,
  type SubtitleStyle,
} from "@/lib/studio-data";
import { drawSubtitle, buildSrt, buildVtt } from "@/lib/subtitle-render";
import { transcribeMedia } from "@/lib/video/asr-client";

interface Line {
  id: string;
  text: string;
  start: number;
  end: number;
}

const newLine = (text = ""): Line => ({
  id: Math.random().toString(36).slice(2, 9),
  text,
  start: 0,
  end: 3,
});

const ASPECTS = [
  { id: "9:16", label: "استوری ۹:۱۶", w: 720, h: 1280 },
  { id: "16:9", label: "۱۶:۹", w: 1280, h: 720 },
] as const;

export function SubtitleView() {
  const [style, setStyle] = useState<SubtitleStyle>({ ...DEFAULT_SUBTITLE_STYLE });
  const [lines, setLines] = useState<Line[]>([newLine("زیرنویس اولت رو اینجا بنویس")]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]["id"]>("9:16");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const asrRef = useRef<HTMLInputElement>(null);
  const [asrBusy, setAsrBusy] = useState(false);

  const runAutoTranscribe = useCallback(async (file: File | null) => {
    if (!file) return;
    setAsrBusy(true);
    toast.info("در حال خواندن صدا و تشخیص جمله‌ها…");
    try {
      const segs = await transcribeMedia(file, (p) => {
        if (p.phase === "transcribe" && p.total > 0) {
          toast.info(`تبدیل گفتار به متن (${p.done}/${p.total})`, { id: "asr-progress" });
        }
      });
      if (!segs.length) {
        toast.error("متنی پیدا نشد؛ کیفیت صدا را چک کن");
        return;
      }
      setLines(
        segs.map((s, i) => ({
          id: `asr_${i}_${Date.now().toString(36)}`,
          text: s.text,
          start: Math.round(s.start * 10) / 10,
          end: Math.round(s.end * 10) / 10,
        }))
      );
      setSelectedId("");
      toast.success(`${segs.length} خط زیرنویس خودکار ساخته شد — تایم‌کدها را چک کن`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تشخیص گفتار ناموفق بود");
    } finally {
      setAsrBusy(false);
    }
  }, []);

  const selected = lines.find((l) => l.id === selectedId) ?? lines[0];
  const previewText = selected?.text?.trim() || "پیش‌نمایش زیرنویس";

  const set = <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) =>
    setStyle((s) => ({ ...s, [key]: value }));

  // Wait for fonts (needed by canvas)
  useEffect(() => {
    let alive = true;
    Promise.all([
      document.fonts.load('900 64px "Vazirmatn"'),
      document.fonts.load('500 64px "Vazirmatn"'),
      document.fonts.load('400 64px "Lalezar"'),
      document.fonts.ready,
    ])
      .then(() => alive && setFontsReady(true))
      .catch(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Draw preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fontsReady) return;
    const spec = ASPECTS.find((a) => a.id === aspect)!;
    canvas.width = spec.w;
    canvas.height = spec.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawSubtitle(ctx, previewText, style, spec.w, spec.h, { image: bgImage });
  }, [previewText, style, aspect, bgImage, fontsReady]);

  const updateLine = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const addLine = () => {
    const l = newLine("");
    const last = lines[lines.length - 1];
    if (last) {
      l.start = last.end;
      l.end = last.end + 3;
    }
    setLines((ls) => [...ls, l]);
    setSelectedId(l.id);
  };

  const duplicateLine = (line: Line) => {
    const l = { ...line, id: Math.random().toString(36).slice(2, 9) };
    setLines((ls) => [...ls, l]);
    setSelectedId(l.id);
  };

  const removeLine = (id: string) => {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));
    if (selectedId === id) setSelectedId("");
  };

  const onUploadBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setBgImage(img);
      toast.success("تصویر پیش‌زمینه اضافه شد");
    };
    img.src = url;
    e.target.value = "";
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const exportSrt = () => {
    const valid = lines.filter((l) => l.text.trim());
    if (valid.length === 0) {
      toast.error("هیچ خطی برای خروجی وجود نداره");
      return;
    }
    const srt = buildSrt(valid);
    downloadBlob(new Blob(["\ufeff" + srt], { type: "text/plain;charset=utf-8" }), "subtitles.srt");
    toast.success("فایل SRT دانلود شد");
  };

  const exportVtt = () => {
    const valid = lines.filter((l) => l.text.trim());
    if (valid.length === 0) {
      toast.error("هیچ خطی برای خروجی وجود نداره");
      return;
    }
    const vtt = buildVtt(valid);
    downloadBlob(new Blob(["\ufeff" + vtt], { type: "text/vtt;charset=utf-8" }), "subtitles.vtt");
    toast.success("فایل VTT دانلود شد");
  };

  const exportPng = useCallback(
    (lineText: string, filename: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawSubtitle(ctx, lineText, style, canvas.width, canvas.height, { transparent: true });
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, filename);
          toast.success("PNG شفاف ذخیره شد — بکش توی کپ‌کات یا پریمیر");
        }
      }, "image/png");
    },
    [style]
  );

  const exportAllPng = async () => {
    const valid = lines.filter((l) => l.text.trim());
    if (valid.length === 0) {
      toast.error("هیچ خطی برای خروجی وجود نداره");
      return;
    }
    for (let i = 0; i < valid.length; i++) {
      exportPng(valid[i].text, `subtitle-${String(i + 1).padStart(2, "0")}.png`);
      await new Promise((r) => setTimeout(r, 350));
    }
    toast.info(`${valid.length} فایل PNG در حال دانلوده`);
  };

  const spec = ASPECTS.find((a) => a.id === aspect)!;
  const previewRatio = spec.w / spec.h;

  return (
    <div className="px-4 pt-4 pb-6 mx-auto max-w-lg space-y-4">
      <header className="pt-2">
        <h1 className="font-display text-xl">زیرنویس‌ساز حرفه‌ای</h1>
        <p className="text-xs text-muted-foreground mt-1">تمپلیت بزن، استایل بده، خروجی PNG شفاف و SRT بگیر</p>
      </header>

      {/* Aspect + preview */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAspect(a.id)}
              className={`text-[11px] rounded-full px-3 py-1.5 border transition-colors ${
                aspect === a.id
                  ? "bg-primary/15 text-primary border-primary/40 font-bold"
                  : "border-border text-muted-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:text-foreground transition-colors"
        >
          <ImageIcon size={13} />
          {bgImage ? "تغییر فریم" : "فریم ویدئو"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUploadBg} />
      </div>

      <div className="rounded-2xl overflow-hidden border border-border bg-black/40 flex justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto"
          style={{ aspectRatio: `${previewRatio}`, width: aspect === "9:16" ? "72%" : "100%" }}
          aria-label="پیش‌نمایش زیرنویس"
        />
      </div>

      {/* Presets */}
      <div>
        <h2 className="text-xs font-bold text-muted-foreground mb-2">تمپلیت‌های آماده</h2>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {SUBTITLE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setStyle({ ...p.style });
                toast.success(`تمپلیت «${p.name}» اعمال شد`);
              }}
              className="shrink-0 flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-3.5 py-2.5 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <span className="text-lg leading-none">{p.emoji}</span>
              <span className="text-[10px] text-muted-foreground">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Style controls */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <h2 className="text-xs font-bold text-muted-foreground">استایل</h2>

        {/* Font family */}
        <div className="flex gap-2">
          {(["Vazirmatn", "Lalezar"] as const).map((f) => (
            <button
              key={f}
              onClick={() => set("fontFamily", f)}
              className={`flex-1 text-xs rounded-xl border px-3 py-2 transition-colors ${
                style.fontFamily === f
                  ? "bg-primary/15 text-primary border-primary/40 font-bold"
                  : "border-border text-muted-foreground"
              }`}
            >
              {f === "Vazirmatn" ? "وزیرمتن" : "لاله‌زار"}
            </button>
          ))}
        </div>

        {/* Size */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>اندازه</span>
            <span className="tabular-nums">{style.fontSize}</span>
          </div>
          <Slider
            value={[style.fontSize]}
            min={28}
            max={130}
            step={2}
            onValueChange={([v]) => set("fontSize", v)}
          />
        </div>

        {/* Position */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>ارتفاع در فریم</span>
            <span className="tabular-nums">{style.yPercent}٪</span>
          </div>
          <Slider value={[style.yPercent]} min={10} max={90} step={1} onValueChange={([v]) => set("yPercent", v)} />
        </div>

        {/* Colors row */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            رنگ متن
            <input
              type="color"
              value={style.color}
              onChange={(e) => set("color", e.target.value)}
              className="w-9 h-9 rounded-lg"
              aria-label="رنگ متن"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            رنگ دورخط
            <input
              type="color"
              value={style.strokeColor}
              onChange={(e) => set("strokeColor", e.target.value)}
              className="w-9 h-9 rounded-lg"
              aria-label="رنگ دورخط"
            />
          </label>
        </div>

        {/* Stroke width */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>ضخامت دورخط</span>
            <span className="tabular-nums">{style.strokeWidth}</span>
          </div>
          <Slider value={[style.strokeWidth]} min={0} max={20} step={1} onValueChange={([v]) => set("strokeWidth", v)} />
        </div>

        {/* BG opacity */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>شفافیت پس‌زمینه متن</span>
            <span className="tabular-nums">{Math.round(style.bgOpacity * 100)}٪</span>
          </div>
          <Slider
            value={[style.bgOpacity * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => set("bgOpacity", v / 100)}
          />
        </div>

        {/* Toggles */}
        <div className="flex gap-2">
          <button
            onClick={() => set("gradient", !style.gradient)}
            className={`flex-1 text-[11px] rounded-xl border px-3 py-2 transition-colors ${
              style.gradient ? "bg-accent/15 text-accent border-accent/40" : "border-border text-muted-foreground"
            }`}
          >
            🌈 متن گرادیانی
          </button>
          <button
            onClick={() => set("shadow", !style.shadow)}
            className={`flex-1 text-[11px] rounded-xl border px-3 py-2 transition-colors ${
              style.shadow ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground"
            }`}
          >
            🌑 سایه
          </button>
        </div>
      </section>

      {/* Lines editor */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-muted-foreground">خطوط زیرنویس ({lines.length})</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => asrRef.current?.click()}
              disabled={asrBusy}
              className="flex items-center gap-1 text-[11px] text-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg px-2 py-1 disabled:opacity-50"
            >
              {asrBusy ? <Loader2 size={14} className="animate-spin" /> : <AudioLines size={14} />}
              {asrBusy ? "در حال تشخیص…" : "تشخیص خودکار گفتار"}
            </button>
            <button
              onClick={addLine}
              className="flex items-center gap-1 text-[11px] text-primary hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-lg px-2 py-1"
            >
              <Plus size={14} />
              خط جدید
            </button>
          </div>
        </div>
        <input
          ref={asrRef}
          type="file"
          accept="video/*,audio/*"
          hidden
          onChange={(e) => runAutoTranscribe(e.target.files?.[0] ?? null)}
        />

        <div className="space-y-2 max-h-72 overflow-y-auto scroll-thin pl-1">
          {lines.map((line, i) => (
            <div
              key={line.id}
              className={`rounded-xl border p-2.5 transition-colors ${
                selected?.id === line.id ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedId(line.id)}
                  className={`w-6 h-6 shrink-0 rounded-lg text-[10px] font-bold flex items-center justify-center ${
                    selected?.id === line.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                  aria-label={`انتخاب خط ${i + 1}`}
                >
                  {i + 1}
                </button>
                <input
                  value={line.text}
                  onChange={(e) => updateLine(line.id, { text: e.target.value })}
                  onFocus={() => setSelectedId(line.id)}
                  placeholder="متن زیرنویس…"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60 min-w-0"
                />
                <div className="flex items-center shrink-0">
                  <button onClick={() => duplicateLine(line)} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="تکثیر خط">
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={() => removeLine(line.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    disabled={lines.length <= 1}
                    aria-label="حذف خط"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span>شروع</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={line.start}
                    onChange={(e) => updateLine(line.id, { start: parseFloat(e.target.value) || 0 })}
                    className="w-16 bg-secondary border border-border rounded-md px-1.5 py-0.5 text-center tabular-nums outline-none focus:border-primary/50"
                    aria-label="زمان شروع به ثانیه"
                  />
                  <span>ثانیه</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>پایان</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={line.end}
                    onChange={(e) => updateLine(line.id, { end: parseFloat(e.target.value) || 0 })}
                    className="w-16 bg-secondary border border-border rounded-md px-1.5 py-0.5 text-center tabular-nums outline-none focus:border-primary/50"
                    aria-label="زمان پایان به ثانیه"
                  />
                  <span>ثانیه</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Export */}
      <section className="grid grid-cols-3 gap-2">
        <button
          onClick={exportSrt}
          className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card py-3.5 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Download size={17} className="text-primary" />
          <span className="text-[10px] text-muted-foreground">خروجی SRT</span>
        </button>
        <button
          onClick={exportVtt}
          className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card py-3.5 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Download size={17} className="text-primary" />
          <span className="text-[10px] text-muted-foreground">خروجی VTT</span>
        </button>
        <button
          onClick={() => exportPng(previewText, `subtitle-${Date.now()}.png`)}
          className="flex flex-col items-center gap-1 rounded-2xl border border-primary/40 bg-primary/10 py-3.5 hover:bg-primary/15 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Download size={17} className="text-primary" />
          <span className="text-[10px] text-primary font-bold">PNG همین خط</span>
        </button>
        <button
          onClick={exportAllPng}
          className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card py-3.5 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Download size={17} className="text-primary" />
          <span className="text-[10px] text-muted-foreground">PNG همه خط‌ها</span>
        </button>
      </section>

      {/* Tip */}
      <p className="text-[10px] text-muted-foreground leading-5 px-1 flex items-start gap-1.5">
        <Minus className="rotate-90 mt-0.5 shrink-0" size={10} />
        نکته: PNGها پس‌زمینه شفاف دارن؛ توی کپ‌کات/پریمیر بکشش روی ویدئو و با تایم‌کد فایل SRT هماهنگشون کن.
      </p>
    </div>
  );
}
