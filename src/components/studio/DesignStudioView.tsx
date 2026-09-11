"use client";

// Design Studio — "تصور کن. طراحی کن."
// Tab 1 «تصویر هوشمند»: prompt → 1-4 AI images with aspect + engine choice
//   (internal / Nano Banana via Gemini), gallery of results with actions.
// Tab 2 «ابزار مارکتینگ»: brand kit (name/slogan/colors/tone persisted)
//   → product poster prompt builder + AI ad caption writer.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ViewId } from "./BottomNav";
import { Download, Film, Loader2, Palette, Megaphone, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { aiImageGen, aiAssistant } from "@/lib/ai/client/gateway";
import { setPendingProject } from "@/lib/video/transfer";
import { emptyProject, uid, DEFAULT_CHROMA, DEFAULT_FILTER, DEFAULT_TRANSFORM, type MediaAsset, type Project } from "@/lib/video/types";

const AI_SETTINGS_KEY = "ai-assistant-settings";
const BRAND_KIT_KEY = "design-brand-kit";

const MODE_CHIPS: { id: string; label: string; emoji: string; suffix: string }[] = [
  { id: "social", label: "پست شبکه اجتماعی", emoji: "📱", suffix: "، طراحی پست اینستاگرامی چشم‌نواز با کامپوزیشن تمیز" },
  { id: "poster", label: "پوستر", emoji: "🖼️", suffix: "، پوستر حرفه‌ای با تایپوگرافی درشت و کنتراست سینمایی" },
  { id: "brand", label: "برند و لوگو", emoji: "🏷️", suffix: "، طراحی مینیمال هویت بصری برند با پس‌زمینه تمیز" },
  { id: "product", label: "عکس محصول", emoji: "📦", suffix: "، عکاسی تبلیغاتی محصول با نور استودیویی و پس‌زمینه گرادیان" },
  { id: "slides", label: "ارائه", emoji: "📊", suffix: "، اسلاید ارائه مدرن با فضای منفی و رنگ سازمانی" },
  { id: "story", label: "استوری", emoji: "⚡️", suffix: "، قاب استوری عمودی پرانرژی با حس حرکت" },
];

const STYLE_CHIPS: { label: string; suffix: string }[] = [
  { label: "سینمایی", suffix: " نور سینمایی، عمق میدان کم" },
  { label: "مینیمال", suffix: " مینیمال، فضای خالی، پالت محدود" },
  { label: "نئون", suffix: " نئون شب، بازتاب رنگی، فضا تاریک" },
  { label: "سه‌بعدی", suffix: " رندر سه‌بعدی، متریال نرم، نور گلوبال" },
  { label: "نقاشی دیجیتال", suffix: " نقاشی دیجیتال، براش‌های مرئی، بافت هنری" },
  { label: "فتورئال", suffix: " فتورئال، جزئیات بالا، ۸K" },
];

const ASPECTS = [
  { id: "9:16", size: "768x1344", label: "۹:۱۶" },
  { id: "1:1", size: "1024x1024", label: "۱:۱" },
  { id: "16:9", size: "1344x768", label: "۱۶:۹" },
  { id: "4:5", size: "896x1152", label: "۴:۵" },
] as const;

interface DesignResult {
  id: string;
  url: string;
  prompt: string;
  engine: string;
}

interface BrandKit {
  name: string;
  slogan: string;
  color: string;
  tone: string;
}

const DEFAULT_BRAND: BrandKit = { name: "", slogan: "", color: "#8b5cf6", tone: "لوکس و مینیمال" };

function b64ToBlobUrl(b64: string, type: string): string {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type }));
}

export function DesignStudioView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [tab, setTab] = useState<"image" | "marketing">("image");

  // ── image tab ──
  const [prompt, setPrompt] = useState("");
  const [modeId, setModeId] = useState("social");
  const [style, setStyle] = useState("سینمایی");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]["id"]>("9:16");
  const [count, setCount] = useState(2);
  const [engine, setEngine] = useState<"internal" | "gemini">("internal");
  const [geminiReady, setGeminiReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DesignResult[]>([]);

  // ── marketing tab ──
  const [brand, setBrand] = useState<BrandKit>(DEFAULT_BRAND);
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [mBusy, setMBusy] = useState<"" | "poster" | "caption">("");
  const [caption, setCaption] = useState("");

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || "{}");
      // ممیزی: شکل ذخیره‌شده gemini.apiKey است (نه gemini.key) — باگ key-pair اصلاح شد
      setGeminiReady(!!(s?.gemini?.apiKey || s?.provider === "gemini"));
    } catch {}
    try {
      const b = JSON.parse(localStorage.getItem(BRAND_KIT_KEY) || "null");
      if (b) setBrand({ ...DEFAULT_BRAND, ...b });
    } catch {}
  }, []);

  const saveBrand = (next: BrandKit) => {
    setBrand(next);
    localStorage.setItem(BRAND_KIT_KEY, JSON.stringify(next));
  };

  const generate = async () => {
    if (!prompt.trim()) return toast.error("ایده‌ات را بنویس");
    const mode = MODE_CHIPS.find((m) => m.id === modeId)!;
    const styleChip = STYLE_CHIPS.find((s) => s.label === style);
    const full = `${prompt.trim()}${mode.suffix}${styleChip ? "," + styleChip.suffix : ""}`;
    setBusy(true);
    try {
      const size = ASPECTS.find((a) => a.id === aspect)!.size;
      // ممیزی: کلید شخصی کاربر در تنظیمات دستیار به route ارسال شود (قبلاً نادیده بود)
      let byoKey: string | undefined;
      try {
        const s = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || "{}");
        if (s?.gemini?.apiKey) byoKey = String(s.gemini.apiKey);
      } catch {}
      const genOne = async () => {
        const j = await aiImageGen({ prompt: full, size, ...(engine === "gemini" ? { engine: "gemini" } : {}), apiKey: byoKey });
        if (!j.image_base64) throw new Error(j.error || "تولید تصویر ناموفق بود");
        return j.image_base64;
      };
      const outs: DesignResult[] = [];
      for (let i = 0; i < count; i++) {
        const b64 = await genOne();
        outs.push({ id: uid("ds"), url: b64ToBlobUrl(b64, "image/png"), prompt: full, engine: engine === "gemini" ? "نانوبانانا" : "داخلی" });
        setResults((r) => [...outs.map((o) => ({ ...o })), ...r].slice(0, 24));
      }
      toast.success(`${count} تصویر ساخته شد ✨`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تولید تصویر ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  const sendToEditor = (r: DesignResult) => {
    const asset: MediaAsset = {
      id: uid("as"), type: "image", url: r.url, name: "طراحی AI.png", duration: 0, width: 1080, height: 1920,
    };
    const p: Project = emptyProject(aspect === "4:5" ? "9:16" : aspect);
    p.clips.push({
      id: uid("cl"), kind: "image", assetId: asset.id, name: "طراحی AI",
      in: 0, out: 4, speed: 1, transform: { ...DEFAULT_TRANSFORM }, filter: { ...DEFAULT_FILTER },
      chroma: { ...DEFAULT_CHROMA }, volume: 0, muted: true, fadeIn: 0, fadeOut: 0,
      srcDur: 4, srcW: 1080, srcH: 1920,
    });
    setPendingProject({ project: p, assets: [asset], name: "طراحی AI" });
    toast.success("در ادیتور بارگذاری شد — ادامه بده 🎬");
    onNavigate("video");
  };

  const download = (r: DesignResult) => {
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `design-${r.id}.png`;
    a.click();
  };

  const genPoster = async () => {
    if (!product.trim()) return toast.error("محصولت را توصیف کن");
    setMBusy("poster");
    try {
      const size = ASPECTS.find((a) => a.id === aspect)!.size;
      const full = `پوستر تبلیغاتی ${brand.tone} برای «${product.trim()}»${brand.name ? ` برند ${brand.name}` : ""}${brand.slogan ? ` با شعار «${brand.slogan}»` : ""}${audience ? `، مخاطب: ${audience}` : ""}، رنگ اصلی ${brand.color}، عکاسی تبلیغاتی حرفه‌ای، کامپوزیشن تمیز`;
      const j = await aiImageGen({ prompt: full, size });
      if (!j.image_base64) throw new Error(j.error || "تولید پوستر ناموفق بود");
      setResults((r) => [{ id: uid("ds"), url: b64ToBlobUrl(j.image_base64!, "image/png"), prompt: full, engine: "پوستر برند" }, ...r].slice(0, 24));
      toast.success("پوستر تبلیغاتی ساخته شد 🎯");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ساخت پوستر ناموفق بود");
    } finally {
      setMBusy("");
    }
  };

  const genCaption = async () => {
    if (!product.trim()) return toast.error("محصولت را توصیف کن");
    setMBusy("caption");
    try {
      const j = await aiAssistant({
        personaId: "writer",
        messages: [
          {
            role: "user",
            content: `یک کپشن تبلیغاتی فارسی کوتاه (حداکثر ۳ جمله + ۳ هشتگ) برای محصول «${product.trim()}» بنویس. برند: ${brand.name || "نامشخص"}؛ لحن برند: ${brand.tone}؛ مخاطب: ${audience || "عموم"}. فقط کپشن را بده.`,
          },
        ],
      });
      if (!j.content) throw new Error(j.error || "ساخت کپشن ناموفق بود");
      setCaption(String(j.content || "").trim());
      toast.success("کپشن آماده شد ✍️");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ساخت کپشن ناموفق بود");
    } finally {
      setMBusy("");
    }
  };

  return (
    <div className="px-4 pt-5 pb-8 mx-auto max-w-lg space-y-5">
      <header className="text-center space-y-1.5 pt-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent">
          <Palette size={11} /> استودیو طراحی
        </div>
        <h1 className="font-display text-2xl">تصور کن. <span className="text-gradient">طراحی کن.</span></h1>
      </header>

      {/* tabs */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant={tab === "image" ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("image")}>
          <Sparkles size={14} /> تصویر هوشمند
        </Button>
        <Button variant={tab === "marketing" ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("marketing")}>
          <Megaphone size={14} /> ابزار مارکتینگ
        </Button>
      </div>

      {tab === "image" && (
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-border bg-card p-4 space-y-3">
          <Textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ایده‌ات یا عکسی که تصور می‌کنی… مثلاً: کافه‌ی دنج در باران با نور گرم پنجره"
          />
          <div className="flex flex-wrap gap-1.5">
            {MODE_CHIPS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModeId(m.id)}
                className={`text-[11px] px-2.5 py-1.5 rounded-full border transition-colors ${
                  modeId === m.id ? "border-primary bg-primary/15 text-primary font-bold" : "border-border bg-secondary/60 text-muted-foreground"
                }`}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_CHIPS.map((s) => (
              <button
                key={s.label}
                onClick={() => setStyle(s.label)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                  style === s.label ? "border-accent bg-accent/15 text-accent" : "border-border bg-secondary/50 text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {ASPECTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAspect(a.id)}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                  aspect === a.id ? "border-primary bg-primary/15 text-primary font-bold" : "border-border bg-secondary/50"
                }`}
              >
                {a.label}
              </button>
            ))}
            <span className="mx-1 w-px h-5 bg-border" />
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`text-[11px] w-8 h-8 rounded-lg border ${
                  count === n ? "border-primary bg-primary/15 text-primary font-bold" : "border-border bg-secondary/50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEngine("internal")}
              className={`flex-1 text-[11px] py-2 rounded-xl border ${engine === "internal" ? "border-primary bg-primary/15 text-primary font-bold" : "border-border bg-secondary/50 text-muted-foreground"}`}
            >
              🎨 موتور داخلی
            </button>
            <button
              onClick={() => {
                if (!geminiReady) {
                  toast.info("برای نانوبانانا، کلید جمینای را در دستیار → تنظیمات ذخیره کن");
                  return;
                }
                setEngine("gemini");
              }}
              className={`flex-1 text-[11px] py-2 rounded-xl border ${engine === "gemini" ? "border-emerald-400 bg-emerald-400/15 text-emerald-300 font-bold" : "border-border bg-secondary/50 text-muted-foreground"}`}
            >
              🍌 نانوبانانا {geminiReady ? "" : "(نیاز به کلید)"}
            </button>
          </div>
          <Button className="w-full gap-2" onClick={generate} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {busy ? "در حال ساخت…" : `ساخت ${count} تصویر`}
          </Button>
        </motion.section>
      )}

      {tab === "marketing" && (
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="rounded-3xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold text-accent">کیت برند (ذخیره می‌شود)</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={brand.name}
                onChange={(e) => saveBrand({ ...brand, name: e.target.value })}
                placeholder="اسم برند"
                className="h-10 rounded-xl bg-secondary/70 border border-border px-3 text-xs outline-none focus:border-primary/60"
              />
              <input
                value={brand.slogan}
                onChange={(e) => saveBrand({ ...brand, slogan: e.target.value })}
                placeholder="شعار برند"
                className="h-10 rounded-xl bg-secondary/70 border border-border px-3 text-xs outline-none focus:border-primary/60"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand.color}
                onChange={(e) => saveBrand({ ...brand, color: e.target.value })}
                className="w-10 h-10 rounded-xl bg-transparent border border-border"
                aria-label="رنگ برند"
              />
              <input
                value={brand.tone}
                onChange={(e) => saveBrand({ ...brand, tone: e.target.value })}
                placeholder="لحن برند (مثلاً لوکس و مینیمال)"
                className="flex-1 h-10 rounded-xl bg-secondary/70 border border-border px-3 text-xs outline-none focus:border-primary/60"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold text-accent">تبلیغ محصول</h3>
            <Textarea
              rows={2}
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="محصولت را توصیف کن… مثلاً: عطر یاس ایرانی با بطری شیشه‌ای سبز"
            />
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="مخاطب هدف (اختیاری) — مثلاً: خانم‌های ۲۰ تا ۳۵ سال"
              className="w-full h-10 rounded-xl bg-secondary/70 border border-border px-3 text-xs outline-none focus:border-primary/60"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={genPoster} disabled={!!mBusy}>
                {mBusy === "poster" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} پوستر تبلیغاتی
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={genCaption} disabled={!!mBusy}>
                {mBusy === "caption" ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} کپشن با AI
              </Button>
            </div>
            {caption && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="text-xs leading-6 whitespace-pre-wrap">{caption}</p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary" size="sm" className="h-7 text-[11px]"
                    onClick={() => { navigator.clipboard?.writeText(caption); toast.success("کپشن کپی شد"); }}
                  >
                    کپی
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-300" onClick={() => setCaption("")}>
                    <Trash2 size={12} className="ml-0.5" /> پاک
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* results */}
      {results.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">ساخته‌شده‌های اخیر</h3>
            <button className="text-[11px] text-muted-foreground" onClick={() => setResults([])}>پاک کردن همه</button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {results.map((r) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl overflow-hidden border border-border bg-card"
              >
                              <img src={r.url} alt={r.prompt.slice(0, 40)} className="w-full aspect-square object-cover" />
                <div className="p-2 space-y-1.5">
                  <div className="text-[9px] text-muted-foreground truncate">🎨 {r.engine}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-[10px] px-1 gap-1" onClick={() => download(r)}>
                      <Download size={11} /> ذخیره
                    </Button>
                    <Button variant="secondary" size="sm" className="h-7 text-[10px] px-1 gap-1" onClick={() => sendToEditor(r)}>
                      <Film size={11} /> در ادیتور
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {results.length === 0 && (
        <p className="text-center text-[11px] text-muted-foreground leading-6">
          ایده بنویس و بساز — بعد «در ادیتور» بزن تا تصویر، کلیپ تایم‌لاین شود؛ یا در استودیو استوری ازش استفاده کن.
        </p>
      )}
    </div>
  );
}
