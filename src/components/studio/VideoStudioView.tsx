"use client";

// Video Studio — prompt-first text-to-video (like desktop "Video Studio").
// Idea chips → prompt → scene count / aspect / narrator → builds a full
// project with AI images + karaoke captions + Persian TTS, then opens
// the editor with everything on the timeline.

import { useState } from "react";
import { motion } from "framer-motion";
import type { ViewId } from "./BottomNav";
import { Loader2, Wand2, Film, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { buildAutoVideo } from "@/lib/video/autovid";
import { setPendingProject } from "@/lib/video/transfer";
import type { AspectId } from "@/lib/video/types";

const IDEA_CHIPS: { label: string; emoji: string; prompt: string }[] = [
  { label: "درام AI", emoji: "🎭", prompt: "یک درام کوتاه احساسی درباره‌ی دوستی که در ایستگاه قطار اتفاق می‌افتد" },
  { label: "آگهی محصول", emoji: "🛍️", prompt: "آگهی ۲۰ ثانیه‌ای برای عطر جدید با حس لوکس و شب" },
  { label: "دانش و آموزش", emoji: "💡", prompt: "ویدئوی آموزشی کوتاه: چرا آسمان آبی است؟" },
  { label: "طراحی کاراکتر", emoji: "🧙", prompt: "معرفی یک کاراکتر خیالی: جادوگر جوان ایرانی با شنل سبز" },
  { label: "ترند شبکه‌ها", emoji: "📱", prompt: "ویدئوی ترندی درباره‌ی عادت‌های صبحگاهی موفق‌ها" },
  { label: "انگیزشی", emoji: "🔥", prompt: "ویدئوی انگیزشی درباره‌ی شروع دوباره بعد از شکست" },
];

const SHOWCASE: { title: string; by: string; from: string; to: string; emoji: string }[] = [
  { title: "آخرین قطار", by: "استودیو تو", from: "from-slate-800", to: "to-sky-600", emoji: "🚂" },
  { title: "شب نئون", by: "استودیو تو", from: "from-fuchsia-700", to: "to-indigo-800", emoji: "🌃" },
  { title: "کوچه‌های قدیم", by: "استودیو تو", from: "from-amber-600", to: "to-rose-500", emoji: "🏚️" },
  { title: "دریای آرام", by: "استودیو تو", from: "from-cyan-600", to: "to-blue-800", emoji: "🌊" },
  { title: "قهرمان کوچک", by: "استودیو تو", from: "from-emerald-500", to: "to-teal-700", emoji: "🦸" },
];

const ASPECT_OPTS: { id: AspectId; label: string }[] = [
  { id: "9:16", label: "۹:۱۶ ریلز" },
  { id: "16:9", label: "۱۶:۹ یوتیوب" },
  { id: "1:1", label: "۱:۱ مربع" },
];

export function VideoStudioView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectId>("9:16");
  const [sceneCount, setSceneCount] = useState(4);
  const [tone, setTone] = useState("صمیمی و پرانرژی");
  const [withTts, setWithTts] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  const gen = async () => {
    if (!prompt.trim()) return toast.error("ایده یا سناریو را بنویس");
    setRunning(true);
    try {
      const res = await buildAutoVideo({
        script: prompt.trim(),
        sceneCount,
        tone,
        aspect,
        withTts,
        onProgress: ({ label }) => setStatus(label),
      });
      setPendingProject({ project: res.project, assets: res.assets, name: res.title || "ویدئوی AI" });
      toast.success("ویدئو ساخته شد 🎬 — در حال رفتن به ادیتور…");
      onNavigate("video");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ساخت ویدئو ناموفق بود");
    } finally {
      setRunning(false);
      setStatus("");
    }
  };

  return (
    <div className="px-4 pt-5 pb-8 mx-auto max-w-lg space-y-5">
      <header className="text-center space-y-1.5 pt-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary">
          <Film size={11} /> استودیو ویدئو با AI
        </div>
        <h1 className="font-display text-2xl leading-relaxed">
          بگو چه می‌خواهی، <span className="text-gradient">می‌سازیمش</span>
        </h1>
        <p className="text-xs text-muted-foreground leading-6">
          سناریو به صحنه‌ها شکسته می‌شود، برای هر صحنه تصویر سینمایی ساخته می‌شود، زیرنویس کارائوکه و گوینده فارسی خودکار اضافه می‌شود.
        </p>
      </header>

      {/* prompt box */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-primary/25 bg-gradient-to-br from-violet-950/50 to-fuchsia-950/30 p-4 space-y-3"
      >
        <Textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="ایده‌ات را بنویس… مثلاً: معرفی کافه دنجی در تهران که قهوه‌های ویژه‌اش معروف است"
          className="bg-black/30 border-white/10 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {IDEA_CHIPS.map((c) => (
            <button
              key={c.label}
              onClick={() => setPrompt(c.prompt)}
              className="text-[11px] px-2.5 py-1.5 rounded-full border border-border bg-secondary/60 hover:border-primary/40 transition-colors"
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {ASPECT_OPTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAspect(a.id)}
              className={`text-[11px] py-2 rounded-xl border transition-colors ${
                aspect === a.id ? "border-primary bg-primary/15 text-primary font-bold" : "border-border bg-secondary/50 text-muted-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">تعداد صحنه: {sceneCount}</span>
            <input
              type="range" min={3} max={6} value={sceneCount}
              onChange={(e) => setSceneCount(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">لحن روایت</span>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full h-9 rounded-xl bg-secondary/70 border border-border text-xs px-2 outline-none"
            >
              <option>صمیمی و پرانرژی</option>
              <option>آرام و شاعرانه</option>
              <option>طنز و بامزه</option>
              <option>حرفه‌ای و جدی</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => setWithTts(!withTts)}
          className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs transition-colors ${
            withTts ? "border-accent/50 bg-accent/10 text-accent" : "border-border bg-secondary/50 text-muted-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">{withTts ? <Mic size={14} /> : <MicOff size={14} />} گوینده‌ی عصبی فارسی (دلا)</span>
          <span className="text-[10px]">{withTts ? "فعال" : "خاموش"}</span>
        </button>

        <Button className="w-full gap-2" onClick={gen} disabled={running}>
          {running ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          {running ? "در حال ساخت…" : "ساخت ویدئو"}
        </Button>
        {running && status && (
          <p className="text-[11px] text-center text-muted-foreground animate-pulse">{status} — صفحه را باز نگه دار</p>
        )}
        {!running && (
          <p className="text-[10px] text-muted-foreground text-center">⚠️ ساخت کامل ۲-۴ دقیقه طول می‌کشد؛ نتیجه مستقیم در ادیتور باز می‌شود.</p>
        )}
      </motion.section>

      {/* showroom */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">شوروم — ساخته‌شده‌ها با همین ابزار</h3>
        </div>
        <div className="overflow-x-auto scroll-thin -mx-1 px-1">
          <div className="flex items-stretch gap-2.5 w-max">
            {SHOWCASE.map((s) => (
              <button
                key={s.title}
                onClick={() => { setPrompt(`الهام از «${s.title}»: ${prompt || ""}`); toast.info("ایده به پرامپت اضافه شد — ویرایشش کن و بساز"); }}
                className={`relative w-40 shrink-0 aspect-video rounded-2xl overflow-hidden bg-gradient-to-br ${s.from} ${s.to} border border-white/10 text-start`}
              >
                <span className="absolute inset-0 flex items-center justify-center text-4xl opacity-80">{s.emoji}</span>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2">
                  <div className="text-xs font-bold text-white">{s.title}</div>
                  <div className="text-[9px] text-white/70">🎬 {s.by}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">هر کارت را بزنی، ایده‌اش به پرامپت اضافه می‌شود تا نسخه‌ی خودت را بسازی.</p>
      </section>
    </div>
  );
}
