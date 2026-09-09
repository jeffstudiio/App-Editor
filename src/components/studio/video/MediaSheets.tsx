"use client";

// Media import, text editor, audio/music + TTS sheets
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Film, Image as ImageIcon, AudioLines, Loader2, Trash2, Wand2, Drum } from "lucide-react";
import {
  EDGE_VOICES, VOICE_EFFECTS, uid,
  type TextItem, type VoiceEffect,
} from "@/lib/video/types";
import { detectBeats } from "@/lib/video/sfx";
import type { EditorCtx } from "./ctx";
import { SectionTitle, SliderRow, SwitchRow } from "./ClipSheets";

// ── media import ──

export function MediaSheet({ ctx }: { ctx: EditorCtx }) {
  const videoRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  const handle = async (file: File | undefined, mode: "clip" | "overlay" | "audio") => {
    if (!file) return;
    setPending(true);
    try {
      const asset = await ctx.importFile(file);
      if (!asset) return;
      if (mode === "clip" && asset.type === "audio") ctx.addAudioFromAsset(asset, 0);
      else if (mode === "overlay") ctx.addOverlayFromAsset(asset);
      else if (asset.type === "video" || asset.type === "image") ctx.addClipFromAsset(asset);
      else ctx.addAudioFromAsset(asset);
      ctx.closeSheet();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <input ref={videoRef} type="file" accept="video/*" hidden onChange={(e) => handle(e.target.files?.[0], "clip")} />
      <input ref={imageRef} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0], "clip")} />
      <input ref={audioRef} type="file" accept="audio/*" hidden onChange={(e) => handle(e.target.files?.[0], "audio")} />
      <input ref={overlayRef} type="file" accept="video/*,image/*" hidden onChange={(e) => handle(e.target.files?.[0], "overlay")} />

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" className="h-16 flex-col gap-1.5" disabled={pending} onClick={() => videoRef.current?.click()}>
          {pending ? <Loader2 className="animate-spin" size={20} /> : <Film size={20} />}
          ویدئو → تایم‌لاین
        </Button>
        <Button variant="outline" className="h-16 flex-col gap-1.5" disabled={pending} onClick={() => imageRef.current?.click()}>
          <ImageIcon size={20} />
          عکس → تایم‌لاین
        </Button>
        <Button variant="outline" className="h-16 flex-col gap-1.5" disabled={pending} onClick={() => audioRef.current?.click()}>
          <AudioLines size={20} />
          موزیک / صدا
        </Button>
        <Button variant="outline" className="h-16 flex-col gap-1.5 border-accent/40 text-accent" disabled={pending} onClick={() => overlayRef.current?.click()}>
          <LayersIcon />
          لایه رویی (PiP)
        </Button>
      </div>
      <Button
        variant="secondary"
        className="w-full gap-2"
        onClick={() => {
          ctx.closeSheet();
          ctx.toast("از ابزار «ویدئوساز AI» در نوار ابزار استفاده کن", "info");
        }}
      >
        <Wand2 size={16} />
        سناریو داری ولی فیلم نداری؟ ویدئوساز AI را امتحان کن
      </Button>
      <p className="text-[11px] text-muted-foreground leading-5">
        💡 «لایه رویی» ویدئو یا عکس را روی ویدئوی اصلی می‌گذارد (تصویر در تصویر) — بعد از افزودن، از ابزار «کروما» می‌توانی پس‌زمینه سبز را حذف کنی.
      </p>
    </div>
  );
}

function LayersIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
}

// ── text editor ──

const TEXT_PRESETS: { name: string; emoji: string; patch: Partial<TextItem> }[] = [
  { name: "تیتر لاله‌زار", emoji: "🔥", patch: { font: "Lalezar", weight: 400, size: 92, color: "#ffffff", strokeColor: "#000000", strokeW: 10, shadow: true, gradient: false, animIn: "pop", y: 0.3 } },
  { name: "زیرنویس امپکت", emoji: "💥", patch: { font: "Vazirmatn", weight: 900, size: 52, color: "#ffffff", strokeColor: "#000000", strokeW: 12, shadow: true, y: 0.8, animIn: "fade" } },
  { name: "هایلایت زرد", emoji: "🟡", patch: { font: "Vazirmatn", weight: 800, size: 56, color: "#111111", strokeW: 0, bgColor: "#facc15", bgOpacity: 1, shadow: false, y: 0.82, animIn: "slideUp" } },
  { name: "گرادیانت", emoji: "💜", patch: { font: "Vazirmatn", weight: 900, size: 68, gradient: true, strokeW: 6, strokeColor: "#3b0764", shadow: true, y: 0.35, animIn: "pop" } },
  { name: "مینیمال", emoji: "⚪️", patch: { font: "Vazirmatn", weight: 500, size: 44, color: "#ffffff", strokeW: 0, shadow: true, y: 0.85, animIn: "fade" } },
];

export function TextSheet({ ctx }: { ctx: EditorCtx }) {
  const item = ctx.selection?.type === "text"
    ? ctx.project.texts.find((t) => t.id === ctx.selection!.id) ?? null
    : null;
  if (!item) return <p className="text-sm text-muted-foreground text-center py-6">اول یک متن از تایم‌لاین انتخاب کن یا از نوار ابزار «متن» بزن.</p>;

  const set = (patch: Partial<TextItem>) =>
    ctx.mutate((p) => {
      const t = p.texts.find((x) => x.id === item.id);
      if (t) Object.assign(t, patch);
    });

  return (
    <div className="space-y-4">
      <Textarea value={item.text} onChange={(e) => set({ text: e.target.value })} rows={2} className="text-base" placeholder="متن را بنویس…" />

      <SectionTitle>استایل آماده</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {TEXT_PRESETS.map((pr) => (
          <button key={pr.name} onClick={() => set(pr.patch)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary/60">
            {pr.emoji} {pr.name}
          </button>
        ))}
      </div>

      <SectionTitle>فونت و اندازه</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Select value={item.font} onValueChange={(v) => set({ font: v as TextItem["font"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Vazirmatn">وزیرمتن</SelectItem>
            <SelectItem value="Lalezar">لاله‌زار (تیتر)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(item.weight)} onValueChange={(v) => set({ weight: Number(v) })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {[400, 500, 700, 800, 900].map((w) => (
              <SelectItem key={w} value={String(w)}>وزن {w}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SliderRow label="اندازه" value={item.size} min={24} max={140} onChange={(v) => set({ size: v })} />

      <SectionTitle>رنگ و افکت</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4">
        <ColorPick label="رنگ متن" value={item.color} onChange={(v) => set({ color: v })} />
        <ColorPick label="رنگ هایلایت کارائوکه" value={item.accent} onChange={(v) => set({ accent: v })} />
        <ColorPick label="رنگ دورخط" value={item.strokeColor} onChange={(v) => set({ strokeColor: v })} />
        <ColorPick label="رنگ پس‌زمینه" value={item.bgColor} onChange={(v) => set({ bgColor: v })} />
      </div>
      <SliderRow label="ضخامت دورخط" value={item.strokeW} min={0} max={20} onChange={(v) => set({ strokeW: v })} />
      <SliderRow label="شفافیت پس‌زمینه" value={item.bgOpacity} min={0} max={1} step={0.05} onChange={(v) => set({ bgOpacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <SwitchRow label="سایه" checked={item.shadow} onChange={(v) => set({ shadow: v })} />
      <SwitchRow label="فیل گرادیانت" checked={item.gradient} onChange={(v) => set({ gradient: v })} />
      <SwitchRow label="هایلایت کلمه‌به‌کلمه (کارائوکه)" checked={item.karaoke} onChange={(v) => set({ karaoke: v })} />

      <SectionTitle>انیمیشن</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <AnimSelect label="ورود" value={item.animIn} onChange={(v) => set({ animIn: v })} />
        <AnimSelect label="خروج" value={item.animOut} onChange={(v) => set({ animOut: v })} />
      </div>

      <SectionTitle>جایگاه و زمان</SectionTitle>
      <SliderRow label="موقعیت افقی" value={item.x} min={0.05} max={0.95} step={0.01} onChange={(v) => set({ x: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="موقعیت عمودی" value={item.y} min={0.05} max={0.95} step={0.01} onChange={(v) => set({ y: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="چرخش" value={item.rotate} min={-45} max={45} onChange={(v) => set({ rotate: v })} fmt={(v) => `${v}°`} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => set({ start: Math.min(ctx.time, item.end - 0.2) })}>
          شروع از نشانگر
        </Button>
        <Button variant="outline" size="sm" onClick={() => set({ end: Math.max(ctx.time, item.start + 0.2) })}>
          پایان روی نشانگر
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SliderRow label="شروع" value={item.start} min={0} max={Math.max(1, item.end - 0.2)} step={0.05} onChange={(v) => set({ start: v })} fmt={(v) => `${v.toFixed(1)}s`} />
        <SliderRow label="پایان" value={item.end} min={0.2} max={Math.max(0.4, ctx.project.clips.reduce((a, c) => a + (c.out - c.in) / c.speed, 0) || 10)} step={0.05} onChange={(v) => set({ end: v })} fmt={(v) => `${v.toFixed(1)}s`} />
      </div>

      <Button
        variant="destructive"
        size="sm"
        className="w-full"
        onClick={() => {
          ctx.mutate((p) => (p.texts = p.texts.filter((t) => t.id !== item.id)));
          ctx.select(null);
          ctx.closeSheet();
        }}
      >
        <Trash2 size={15} className="ml-1" /> حذف متن
      </Button>
    </div>
  );
}

function ColorPick({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-7 rounded-md bg-transparent border border-border" />
    </label>
  );
}

function AnimSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: TextItem["animIn"]) => void }) {
  const opts = [
    { v: "none", l: "بدون" },
    { v: "fade", l: "محو" },
    { v: "pop", l: "پاپ" },
    { v: "slideUp", l: "سواید بالا" },
    { v: "typewriter", l: "تایپ" },
  ];
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as TextItem["animIn"])}>
        <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── audio sheet: music + TTS + per-item controls ──

export function AudioSheet({ ctx }: { ctx: EditorCtx }) {
  const musicRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"items" | "tts">("items");
  const [ttsText, setTtsText] = useState("");
  const [voice, setVoice] = useState("fa-IR-DilaraNeural");
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [beating, setBeating] = useState(false);

  const selected = ctx.selection?.type === "audio"
    ? ctx.project.audios.find((a) => a.id === ctx.selection!.id) ?? null
    : null;

  const detectBeatsNow = async () => {
    const target = selected ?? ctx.project.audios[0] ?? null;
    if (!target) return ctx.toast("اول یک موزیک به تایم‌لاین اضافه کن", "error");
    const asset = ctx.assets.get(target.assetId);
    if (!asset) return ctx.toast("فایل صوتی پیدا نشد", "error");
    setBeating(true);
    ctx.setBusy({ label: "تشخیص ضرب‌های موزیک…" });
    try {
      const blob = await (await fetch(asset.url)).blob();
      const { beats, bpm } = await detectBeats(blob);
      const strong = beats.filter((b) => b.strength > 0.45).slice(0, 40);
      if (!strong.length) throw new Error("ضرب واضحی پیدا نشد");
      ctx.mutate((p) => {
        for (const b of strong) {
          p.markers.push({ id: uid("mk"), t: Math.max(0, target.start + b.t - target.in), label: "ضرب" });
        }
      });
      ctx.toast(`${strong.length} ضرب علامت خورد 🥁 (حدود ${bpm || "؟"} BPM) — حالا کات‌ها را روی نشانگرها بزن`, "success");
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "تشخیص ضرب ناموفق بود", "error");
    } finally {
      setBeating(false);
      ctx.setBusy(null);
    }
  };

  const genTts = async () => {
    if (!ttsText.trim()) return ctx.toast("متن گوینده را بنویس", "error");
    setLoading(true);
    ctx.setBusy({ label: "تولید صدای عصبی گوینده…" });
    try {
      const res = await fetch("/api/edge-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText.trim(), voice, rate: speed }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "خطا در تولید صدا");
      }
      const blob = await res.blob();
      const file = new File([blob], `گوینده-${Date.now()}.mp3`, { type: "audio/mpeg" });
      const asset = await ctx.importFile(file);
      if (!asset) throw new Error("asset failed");
      ctx.addAudioFromAsset(asset);
      setTab("items");
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "تولید صدا ناموفق بود", "error");
    } finally {
      setLoading(false);
      ctx.setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <input ref={musicRef} type="file" accept="audio/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const asset = await ctx.importFile(f);
        if (asset) ctx.addAudioFromAsset(asset);
      }} />

      <div className="grid grid-cols-2 gap-2">
        <Button variant={tab === "items" ? "secondary" : "outline"} size="sm" onClick={() => setTab("items")}>
          تراک‌های تایم‌لاین
        </Button>
        <Button variant={tab === "tts" ? "secondary" : "outline"} size="sm" onClick={() => setTab("tts")}>
          گوینده هوشمند (TTS)
        </Button>
      </div>

      {tab === "items" && (
        <>
          <Button variant="outline" className="w-full" onClick={() => musicRef.current?.click()}>
            <AudioLines size={16} className="ml-1" /> افزودن موزیک یا فایل صوتی
          </Button>
          {ctx.project.audios.length > 0 && (
            <Button variant="secondary" className="w-full gap-1.5" disabled={beating} onClick={detectBeatsNow}>
              {beating ? <Loader2 size={15} className="animate-spin ml-1" /> : <Drum size={15} className="ml-1" />}
              تشخیص ضرب موزیک (کات روی بیت)
            </Button>
          )}
          {ctx.project.audios.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">هنوز تراکی اضافه نشده.</p>
          )}
          {ctx.project.audios.map((a) => (
            <div key={a.id} className={`rounded-xl border p-3 space-y-2 ${selected?.id === a.id ? "border-primary" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <button className="text-sm font-bold truncate" onClick={() => ctx.select({ type: "audio", id: a.id })}>
                  🎵 {a.name} {a.fromTts && <span className="text-[9px] text-accent">(TTS)</span>}
                </button>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { ctx.seek(a.start + 0.05); ctx.select({ type: "audio", id: a.id }); }}>
                    ▶
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-300" onClick={() => ctx.mutate((p) => (p.audios = p.audios.filter((x) => x.id !== a.id)))}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              <SliderRow label="بلندی صدا" value={a.volume} min={0} max={2} step={0.05} onChange={(v) => ctx.mutate((p) => { const x = p.audios.find((y) => y.id === a.id); if (x) x.volume = v; })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <div className="grid grid-cols-2 gap-2">
                <SliderRow label="Fade In" value={a.fadeIn} min={0} max={4} step={0.1} onChange={(v) => ctx.mutate((p) => { const x = p.audios.find((y) => y.id === a.id); if (x) x.fadeIn = v; })} fmt={(v) => `${v.toFixed(1)}s`} />
                <SliderRow label="Fade Out" value={a.fadeOut} min={0} max={4} step={0.1} onChange={(v) => ctx.mutate((p) => { const x = p.audios.find((y) => y.id === a.id); if (x) x.fadeOut = v; })} fmt={(v) => `${v.toFixed(1)}s`} />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">افکت صدا</span>
                <div className="flex flex-wrap gap-1.5">
                  {VOICE_EFFECTS.map((ef) => (
                    <button
                      key={ef.id}
                      onClick={() => ctx.mutate((p) => { const x = p.audios.find((y) => y.id === a.id); if (x) x.effect = ef.id as VoiceEffect; })}
                      className={`text-xs px-2.5 py-1 rounded-lg border ${a.effect === ef.id ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}
                    >
                      {ef.emoji} {ef.name}
                    </button>
                  ))}
                </div>
              </div>
              <SwitchRow
                label="کم‌کردن خودکار هنگام زیرنویس (Ducking)"
                checked={a.duckCaptions}
                onChange={(v) => ctx.mutate((p) => { const x = p.audios.find((y) => y.id === a.id); if (x) x.duckCaptions = v; })}
              />
              <SliderRow label="شروع روی تایم‌لاین" value={a.start} min={0} max={Math.max(2, ctx.project.clips.reduce((acc, c) => acc + (c.out - c.in) / c.speed, 0))} step={0.1} onChange={(v) => ctx.mutate((p) => { const x = p.audios.find((y) => y.id === a.id); if (x) x.start = v; })} fmt={(v) => `${v.toFixed(1)}s`} />
            </div>
          ))}
        </>
      )}

      {tab === "tts" && (
        <div className="space-y-3">
          <Textarea rows={4} value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="متنی که گوینده بخواند… (حداکثر ۱۲۰۰ کاراکتر)" />
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">صدای عصبی (فارسی و ۵ زبان دیگر)</span>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EDGE_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SliderRow label="سرعت گفتار" value={speed} min={0.5} max={2} step={0.05} onChange={setSpeed} fmt={(v) => `${v.toFixed(2)}x`} />
          <Button className="w-full" onClick={genTts} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin ml-1" /> : <Wand2 size={16} className="ml-1" />}
            ساخت صدا و افزودن به تایم‌لاین
          </Button>
          <p className="text-[11px] text-muted-foreground leading-5">
            ✅ صدای عصبی طبیعی — گوینده‌های فارسی «دلا» (زن) و «فرید» (مرد) برای متن فارسی عالی‌اند. خروجی روی نشانگر فعلی تایم‌لاین قرار می‌گیرد.
          </p>
        </div>
      )}
    </div>
  );
}
