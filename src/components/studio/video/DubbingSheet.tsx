"use client";

// Dubbing & voice-translation pipeline:
// ASR (cloud, Persian-capable) → LLM translate → neural TTS per segment → timeline audio
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AudioWaveform, Loader2 } from "lucide-react";
import { clipStart, DUB_LANGS, EDGE_LANGS, EDGE_VOICES, type TextItem } from "@/lib/video/types";
import { transcribeMedia } from "@/lib/video/asr-client";
import { presetToCaptionPatch, captionTextItem } from "./caption-utils";
import type { EditorCtx } from "./ctx";
import { SectionTitle, SliderRow, SwitchRow } from "./ClipSheets";

export function DubbingSheet({ ctx }: { ctx: EditorCtx }) {
  const [lang, setLang] = useState("fa");
  const [voice, setVoice] = useState("fa-IR-DilaraNeural");
  const [translate, setTranslate] = useState(true);
  const [keepOriginal, setKeepOriginal] = useState(0.12);
  const [autoRate, setAutoRate] = useState(true);
  const [addSubs, setAddSubs] = useState(true);
  const [sens, setSens] = useState(1);
  const [running, setRunning] = useState(false);

  const voices = EDGE_VOICES.filter((v) => v.lang === lang);
  const videoClips = ctx.project.clips.filter((c) => c.kind === "video" && !c.reverse);
  const sourceClip =
    (ctx.selection?.type === "clip" ? videoClips.find((c) => c.id === ctx.selection!.id) : null) ??
    videoClips.sort((a, b) => (b.out - b.in) - (a.out - a.in))[0] ??
    null;

  const synthSegment = async (text: string, rate: number): Promise<Blob> => {
    // neural TTS occasionally flakes — retry up to 3 attempts
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/edge-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice, rate }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "تولید صدای دوبله ناموفق بود");
        }
        return await res.blob();
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("tts-failed");
  };

  const run = async () => {
    if (!sourceClip) {
      ctx.toast("اول یک کلیپ ویدئویی به تایم‌لاین اضافه کن", "error");
      return;
    }
    const asset = ctx.assets.get(sourceClip.assetId);
    if (!asset) {
      ctx.toast("فایل ویدئو پیدا نشد", "error");
      return;
    }
    setRunning(true);
    const st = clipStart(ctx.project, sourceClip.id);
    const speed = sourceClip.speed || 1;
    try {
      // ── 1) speech recognition ──
      ctx.setBusy({ label: "درک صدا و تقسیم جمله‌ها…", progress: 0.02 });
      const blob = await (await fetch(asset.url)).blob();
      const segs = await transcribeMedia(
        blob,
        (p) => {
          const pct = p.phase === "transcribe" ? (0.05 + 0.35 * (p.done / Math.max(1, p.total))) : 0.03;
          ctx.setBusy({
            label: p.phase === "transcribe" ? `تشخیص گفتار (${p.done}/${p.total})…` : p.phase === "detect" ? "تشخیص جمله‌ها…" : "خواندن صدا…",
            progress: pct,
          });
        },
        { sensitivity: sens, maxSegments: 60 }
      );
      if (!segs.length) throw new Error("جمله‌ای پیدا نشد؛ حساسیت را کمتر کن");

      // map source-time → timeline
      const mapped = segs
        .filter((s) => s.end > sourceClip.in && s.start < sourceClip.out)
        .map((s) => ({
          text: s.text,
          tlStart: st + Math.max(0, s.start - sourceClip.in) / speed,
          tlEnd: st + (Math.min(sourceClip.out, s.end) - sourceClip.in) / speed,
        }));
      if (!mapped.length) throw new Error("متنی استخراج نشد");

      // ── 2) AI text pass — failure is non-fatal ──
      // translate: converts any ASR language → target. For fa the API guards keep
      // already-Persian segments intact and convert stray Latin/Chinese ASR output.
      let texts = mapped.map((m) => m.text);
      const mode = translate ? "translate" : "fix";
      try {
        if (translate) {
          ctx.setBusy({ label: `آماده‌سازی متن (${DUB_LANGS.find((l) => l.code === lang)?.label ?? lang}) با AI…`, progress: 0.45 });
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, target: lang, segments: texts }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "پردازش متن ناموفق بود");
          texts = (j.segments as string[]).map((t, i) => t || texts[i]);
        } else {
          ctx.setBusy({ label: "اصلاح و روان‌سازی متن با AI…", progress: 0.45 });
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "fix", target: "fa", segments: texts }),
          });
          const j = await res.json();
          if (res.ok && Array.isArray(j.segments)) {
            texts = (j.segments as string[]).map((t, i) => t || texts[i]);
          }
        }
      } catch {
        ctx.toast("پردازش متن با AI موقتاً در دسترس نبود؛ با متن خام ادامه می‌دهم", "info");
      }

      // ── 3) neural TTS per segment ──
      const nextStarts = mapped.map((m, i) => (i + 1 < mapped.length ? mapped[i + 1].tlStart : m.tlStart + (m.tlEnd - m.tlStart) * 2));
      const items: { assetId: string; start: number; name: string }[] = [];
      let skipped = 0;
      for (let i = 0; i < mapped.length; i++) {
        ctx.setBusy({ label: `تولید صدای دوبله (${i + 1}/${mapped.length})…`, progress: 0.5 + 0.45 * (i / mapped.length) });
        const gap = Math.max(0.4, nextStarts[i] - mapped[i].tlStart);
        try {
          let rate = 1;
          let b = await synthSegment(texts[i], rate);
          let file = new File([b], `dub-${i}.mp3`, { type: "audio/mpeg" });
          let a = await ctx.importFile(file);
          // too long for its slot? speed it up (once)
          if (a && autoRate && gap > 0.5 && a.duration > gap * 1.12) {
            rate = Math.min(2, (a.duration / gap) * 0.95);
            b = await synthSegment(texts[i], rate);
            file = new File([b], `dub-${i}.mp3`, { type: "audio/mpeg" });
            a = await ctx.importFile(file);
          }
          if (!a) throw new Error("asset failed");
          items.push({ assetId: a.id, start: mapped[i].tlStart, name: `دوبله ${i + 1}` });
        } catch {
          skipped++; // keep going — one failed segment shouldn't kill the whole dub
        }
      }
      if (!items.length) throw new Error("هیچ صدایی تولید نشد؛ چند لحظه بعد دوباره تلاش کن");

      // ── 4) place on timeline ──
      ctx.mutate((p) => {
        // remove previous dubbing items
        p.audios = p.audios.filter((x) => !x.name.startsWith("دوبله "));
        for (const it of items) {
          const src = p.audios.length; // not used, keep TS happy
          void src;
          const dur = ctx.assets.get(it.assetId)?.duration || 2;
          p.audios.push({
            id: `au_dub_${Math.random().toString(36).slice(2, 9)}`,
            assetId: it.assetId,
            name: it.name,
            start: it.start,
            in: 0,
            out: dur,
            srcDur: dur,
            volume: 1,
            fadeIn: 0.02,
            fadeOut: 0.05,
            effect: "none",
            duckCaptions: false,
            fromTts: true,
          });
        }
        // original voice level
        const c = p.clips.find((x) => x.id === sourceClip.id);
        if (c) {
          c.volume = keepOriginal;
          c.muted = keepOriginal <= 0.001;
        }
        // translated captions
        if (addSubs) {
          p.texts = p.texts.filter((t) => !t.isCaption);
          mapped.forEach((m, i) => {
            const item: TextItem = captionTextItem(texts[i], m.tlStart, Math.max(m.tlEnd, m.tlStart + 0.8));
            p.texts.push(item);
          });
        }
      });

      ctx.toast(
        skipped > 0
          ? `دوبله ${items.length} جمله ساخته شد 🎙️ (${skipped} جمله به‌خاطر قطعی موقت شبکه رد شد)`
          : `دوبله ${items.length} جمله ساخته شد 🎙️ — صدا و زمان‌بندی را از تایم‌لاین تنظیم کن`,
        skipped > 0 ? "info" : "success"
      );
      ctx.closeSheet();
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "ساخت دوبله ناموفق بود", "error");
    } finally {
      setRunning(false);
      ctx.setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs leading-6">
        🎙️ <b>دوبله و ترجمه صدا:</b> صدای کلیپ را می‌گیرم، جمله‌ها را با AI می‌فهمم، به زبان مقصد ترجمه می‌کنم و با
        <b> صدای عصبی واقعی</b> (دلا/فرید برای فارسی) جایگزین می‌کنم. زیرنویس ترجمه‌شده هم روی ویدئو می‌نشیند.
      </div>

      {sourceClip ? (
        <p className="text-xs text-muted-foreground">منبع: <b className="text-foreground">{sourceClip.name}</b></p>
      ) : (
        <p className="text-xs text-red-300">هنوز کلیپ ویدئویی در تایم‌لاین نداری.</p>
      )}

      <SectionTitle>زبان مقصد دوبله</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {DUB_LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => {
              setLang(l.code);
              const first = EDGE_VOICES.find((v) => v.lang === l.code);
              if (first) setVoice(first.id);
            }}
            className={`text-xs py-2 rounded-lg border ${lang === l.code ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <SectionTitle>صدای گوینده</SectionTitle>
      <Select value={voice} onValueChange={setVoice}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {voices.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name} ({EDGE_LANGS.find((l) => l.code === v.lang)?.label})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <SwitchRow label="پردازش متن با AI (ترجمه/اصلاح مطابق زبان مقصد)" checked={translate} onChange={setTranslate} />
      <SwitchRow label="زیرنویس ترجمه‌شده روی ویدئو" checked={addSubs} onChange={setAddSubs} />
      <SwitchRow label="تندکردن خودکار جمله‌های بلند (حفظ زمان‌بندی)" checked={autoRate} onChange={setAutoRate} />

      <SectionTitle>صدای اصلی پس‌زمینه</SectionTitle>
      <SliderRow
        label="بلندی صدای اصلی بعد از دوبله"
        value={keepOriginal}
        min={0}
        max={1}
        step={0.02}
        onChange={setKeepOriginal}
        fmt={(v) => `${Math.round(v * 100)}%`}
      />

      <SectionTitle>حساسیت تشخیص گفتار</SectionTitle>
      <div className="flex gap-1.5">
        {[
          { v: 1.3, l: "فقط صدای بلند" },
          { v: 1, l: "معمولی" },
          { v: 0.75, l: "صداهای آروم هم" },
        ].map((o) => (
          <button key={o.v} onClick={() => setSens(o.v)} className={`flex-1 text-xs py-2 rounded-lg border ${sens === o.v ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}>
            {o.l}
          </button>
        ))}
      </div>

      <Button className="w-full" onClick={run} disabled={running || !sourceClip}>
        {running ? <Loader2 size={16} className="animate-spin ml-1" /> : <AudioWaveform size={16} className="ml-1" />}
        ساخت دوبله کامل
      </Button>

      <p className="text-[11px] text-muted-foreground leading-5">
        💡 هر جمله یک تراک جدا روی تایم‌لاین صدا می‌شود؛ با ابزار «صدا» می‌توانی زمان و بلندی هر جمله را جدا تنظیم کنی.
        دوبله روی ویدئوهای زیر ۵ دقیقه و صدای واضح بهترین نتیجه را می‌دهد.
      </p>
    </div>
  );
}
