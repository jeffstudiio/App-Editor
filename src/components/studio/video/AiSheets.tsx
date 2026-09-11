"use client";

// AI-powered sheets: auto captions, edit assistant, auto video maker,
// plus export & markers panels
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Trash2, Download, MapPin, Wand2, Scissors } from "lucide-react";
import {
  DEFAULT_CHROMA, DEFAULT_FILTER, DEFAULT_TRANSFORM, FILTER_PRESETS, clipDur, clipStart, uid,
  type Clip, type MediaAsset, type TextItem,
} from "@/lib/video/types";
import { SUBTITLE_PRESETS } from "@/lib/studio-data";
import { buildSrt, buildVtt } from "@/lib/subtitle-render";
import { transcribeMedia } from "@/lib/video/asr-client";
import { EditorEngine, exportDims, pickRecorderMime } from "@/lib/video/engine";
import { exportProjectAdvanced, supportsAdvancedExport } from "@/lib/video/export-advanced";
import type { EditorCtx } from "./ctx";
import { presetToCaptionPatch, captionTextItem } from "./caption-utils";
import { SectionTitle, SliderRow } from "./ClipSheets";
import { aiTranslate, aiEditPlan, aiScriptScenes, aiImageGen, aiZaiTtsBlob, aiErrorMessage } from "@/lib/ai/client/gateway";
import { byoCreds } from "@/lib/ai/client/settings";

// ── helpers ──

const presetToTextPatch = presetToCaptionPatch;
const captionPatch = captionTextItem;

function makeImageClip(asset: MediaAsset, dur: number, name: string, index: number): Clip {
  return {
    id: uid("cl"),
    kind: "image",
    assetId: asset.id,
    name: `${name} ${index + 1}`,
    in: 0,
    out: dur,
    speed: 1,
    transform: { ...DEFAULT_TRANSFORM },
    filter: { ...DEFAULT_FILTER },
    chroma: { ...DEFAULT_CHROMA },
    volume: 0,
    muted: true,
    fadeIn: 0,
    fadeOut: 0,
    srcDur: dur,
    srcW: asset.width || 768,
    srcH: asset.height || 1344,
  };
}

// ── auto captions ──

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export function CaptionSheet({ ctx }: { ctx: EditorCtx }) {
  const [sens, setSens] = useState(1);
  const [presetId, setPresetId] = useState(SUBTITLE_PRESETS[0].id);
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState(false);

  const captions = ctx.project.texts.filter((t) => t.isCaption);
  const videoClips = ctx.project.clips.filter((c) => c.kind === "video" && !c.reverse);
  const sourceClip =
    (ctx.selection?.type === "clip" ? videoClips.find((c) => c.id === ctx.selection!.id) : null) ??
    videoClips.sort((a, b) => (b.out - b.in) - (a.out - a.in))[0] ??
    null;

  const run = async () => {
    if (!sourceClip) return ctx.toast("اول یک کلیپ ویدئویی به تایم‌لاین اضافه کن", "error");
    const asset = ctx.assets.get(sourceClip.assetId);
    if (!asset) return ctx.toast("فایل ویدئو پیدا نشد", "error");
    setRunning(true);
    ctx.setBusy({ label: "درک صدا و تقسیم جمله‌ها…", progress: 0 });
    try {
      const blob = await (await fetch(asset.url)).blob();
      const segs = await transcribeMedia(blob, (p) => {
        const pct = p.phase === "transcribe" ? p.done / Math.max(1, p.total) : 0.02;
        ctx.setBusy({
          label: p.phase === "transcribe" ? `تبدیل گفتار به متن (${p.done}/${p.total})…` : p.phase === "detect" ? "تشخیص جمله‌ها…" : "خواندن صدا…",
          progress: pct,
        });
      }, { sensitivity: sens });

      // map source-time segments onto timeline (+ word-level timing برای کارائوکهٔ واقعی)
      const st = clipStart(ctx.project, sourceClip.id);
      const speed = sourceClip.speed || 1;
      const tlOf = (srcT: number) => st + Math.max(0, srcT - sourceClip.in) / speed;
      const items = segs
        .filter((s) => s.end > sourceClip.in && s.start < sourceClip.out)
        .map((s) => {
          const tlStart = tlOf(s.start);
          const tlEnd = tlOf(Math.min(sourceClip.out, s.end));
          const words = s.words
            ?.map((w) => ({ w: w.w, start: tlOf(w.start), end: tlOf(Math.min(sourceClip.out, w.end)) }))
            .filter((w) => w.end > w.start);
          return captionPatch(s.text, tlStart, tlEnd, words);
        });
      if (!items.length) throw new Error("متنی استخراج نشد");
      ctx.mutate((p) => {
        p.texts = p.texts.filter((t) => !t.isCaption);
        p.texts.push(...items);
      });
      ctx.toast(`${items.length} زیرنویس ساخته شد ✨ — با دکمه «اصلاح هوشمند» متن را تمیز کن`);
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "تشخیص گفتار ناموفق بود", "error");
    } finally {
      setRunning(false);
      ctx.setBusy(null);
    }
  };

  const fixWithAi = async () => {
    if (!captions.length) return;
    setFixing(true);
    ctx.setBusy({ label: "اصلاح هوشمند متن‌ها با AI…" });
    try {
      const sorted = [...captions].sort((a, b) => a.start - b.start);
      const j = await aiTranslate({ mode: "fix", target: "fa", segments: sorted.map((c) => c.text), ...byoCreds() });
      if (j.error || !j.segments) throw new Error(j.error || "خطا");
      const fixed = j.segments;
      ctx.mutate((p) => {
        for (let i = 0; i < sorted.length; i++) {
          const t = p.texts.find((x) => x.id === sorted[i].id);
          if (t && fixed[i]) t.text = fixed[i];
        }
      });
      ctx.toast("متن‌ها با AI اصلاح شد ✍️ (نیم‌فاصله و علائم)");
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "اصلاح ناموفق بود", "error");
    } finally {
      setFixing(false);
      ctx.setBusy(null);
    }
  };

  const applyPreset = (id: string) => {
    setPresetId(id);
    const pr = SUBTITLE_PRESETS.find((x) => x.id === id);
    if (!pr) return;
    ctx.mutate((p) => {
      for (const t of p.texts) {
        if (t.isCaption) Object.assign(t, presetToTextPatch(pr));
      }
    });
  };

  const exportSrt = () => {
    const lines = [...captions].sort((a, b) => a.start - b.start).map((c) => ({ text: c.text, start: c.start, end: c.end }));
    const blob = new Blob([buildSrt(lines)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "captions.srt";
    a.click();
  };

  const exportVtt = () => {
    const lines = [...captions].sort((a, b) => a.start - b.start).map((c) => ({ text: c.text, start: c.start, end: c.end }));
    const blob = new Blob([buildVtt(lines)], { type: "text/vtt;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "captions.vtt";
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-6">
        {sourceClip ? (
          <>منبع: <b>{sourceClip.name}</b> — تشخیص گفتار با AI روی صدای این کلیپ اجرا می‌شود و جمله‌ها با تایمینگ دقیق به‌صورت کارائوکه اضافه می‌شوند.</>
        ) : (
          "هنوز کلیپ ویدئویی در تایم‌لاین نداری."
        )}
      </div>

      <SectionTitle>حساسیت تشخیص صدا</SectionTitle>
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
        {running ? <Loader2 size={16} className="animate-spin ml-1" /> : <Sparkles size={16} className="ml-1" />}
        شروع تشخیص خودکار گفتار
      </Button>

      <SectionTitle>استایل زیرنویس (تمپلیت)</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {SUBTITLE_PRESETS.map((pr) => (
          <button key={pr.id} onClick={() => applyPreset(pr.id)} className={`text-xs px-3 py-1.5 rounded-lg border ${presetId === pr.id ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}>
            {pr.emoji} {pr.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Button variant="outline" size="sm" onClick={exportSrt} disabled={!captions.length} className="px-1">
          <Download size={13} className="ml-1" /> SRT
        </Button>
        <Button variant="outline" size="sm" onClick={exportVtt} disabled={!captions.length} className="px-1">
          <Download size={13} className="ml-1" /> VTT
        </Button>
        <Button variant="outline" size="sm" onClick={fixWithAi} disabled={!captions.length || fixing} className="px-1">
          {fixing ? <Loader2 size={13} className="animate-spin ml-1" /> : <Sparkles size={13} className="ml-1" />}
          اصلاح متن AI
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-red-300 px-1"
          disabled={!captions.length}
          onClick={() => ctx.mutate((p) => (p.texts = p.texts.filter((t) => !t.isCaption)))}
        >
          <Trash2 size={13} className="ml-1" /> پاک کردن
        </Button>
      </div>

      {captions.length > 0 && (
        <>
          <SectionTitle>ویرایش جمله‌ها ({captions.length})</SectionTitle>
          <div className="space-y-2 max-h-64 overflow-y-auto pl-1">
            {[...captions].sort((a, b) => a.start - b.start).map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-secondary/30 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0" dir="ltr">
                    {c.start.toFixed(1)}→{c.end.toFixed(1)}
                  </span>
                  <input
                    value={c.text}
                    onChange={(e) => ctx.mutate((p) => { const t = p.texts.find((x) => x.id === c.id); if (t) t.text = e.target.value; })}
                    className="flex-1 bg-transparent text-xs border-b border-white/10 focus:border-primary outline-none py-0.5"
                  />
                  <button
                    className="text-red-300 shrink-0"
                    onClick={() => ctx.mutate((p) => (p.texts = p.texts.filter((x) => x.id !== c.id)))}
                    aria-label="حذف"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <Slider value={[c.end - c.start]} min={0.5} max={10} step={0.1} onValueChange={(v) => ctx.mutate((p) => { const t = p.texts.find((x) => x.id === c.id); if (t) t.end = t.start + v[0]; })} />
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground leading-5">
        ✅ فارسی پشتیبانی می‌شود (موتور تشخیص گفتار روی صدای واضح فارسی تست شده). اگر کلمه‌ای غلط شنیده شد، همین‌جا ویرایشش کن یا از دکمه «اصلاح متن AI» استفاده کن. زیرنویس‌ها مستقیم روی ویدئو رندر و در خروجی «سوخته» می‌شوند.
      </p>
    </div>
  );
}

// ── AI edit assistant ──

interface EditPlan {
  title: string | null;
  titleStart?: number;
  titleDur?: number;
  filterPresetId: string;
  captionPresetId: string;
  musicMood: string;
  tips: string[];
  hookIdea: string;
}

export function AiEditSheet({ ctx }: { ctx: EditorCtx }) {
  const [brief, setBrief] = useState("");
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!brief.trim()) return ctx.toast("توضیح ویدئو را بنویس", "error");
    setLoading(true);
    ctx.setBusy({ label: "دستیار ادیت در حال تحلیل…" });
    try {
      const total = ctx.project.clips.reduce((a, c) => a + clipDur(c), 0);
      const j = await aiEditPlan({
        brief,
        context: `ابعاد ${ctx.project.aspect}، ${ctx.project.clips.length} کلیپ، مجموعاً ${Math.round(total)} ثانیه`,
        ...byoCreds(),
      });
      if (j.error || !j.plan) throw new Error(j.error || "خطا");
      setPlan(j.plan as unknown as EditPlan);
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "تحلیل ناموفق بود", "error");
    } finally {
      setLoading(false);
      ctx.setBusy(null);
    }
  };

  const apply = () => {
    if (!plan) return;
    ctx.mutate((p) => {
      const fp = FILTER_PRESETS.find((x) => x.id === plan.filterPresetId);
      if (fp) {
        for (const c of p.clips) c.filter = { ...DEFAULT_FILTER, ...fp.state, presetId: fp.id };
      }
      if (plan.title) {
        const ts = plan.titleStart ?? 0.2;
        p.texts.push({
          ...captionPatch(plan.title, ts, ts + (plan.titleDur ?? 3)),
          isCaption: false,
          karaoke: false,
          font: "Lalezar",
          weight: 400,
          size: 86,
          strokeW: 10,
          animIn: "pop",
          y: 0.3,
        } as TextItem);
      }
      const capPr = SUBTITLE_PRESETS.find((x) => x.id === plan.captionPresetId);
      if (capPr) {
        const patch = {
          font: capPr.style.fontFamily === "Lalezar" ? ("Lalezar" as const) : ("Vazirmatn" as const),
          weight: capPr.style.fontWeight,
          size: capPr.style.fontSize,
          color: capPr.style.color,
          strokeColor: capPr.style.strokeColor,
          strokeW: capPr.style.strokeWidth,
          bgColor: capPr.style.bgColor,
          bgOpacity: capPr.style.bgOpacity,
          shadow: capPr.style.shadow,
          gradient: capPr.style.gradient,
          y: capPr.style.yPercent / 100,
        };
        for (const t of p.texts) if (t.isCaption) Object.assign(t, patch);
      }
    });
    ctx.toast("پیشنهادها اعمال شد ✅ نکات را ببین:");
    ctx.closeSheet();
  };

  return (
    <div className="space-y-4">
      <Textarea
        rows={3}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="ویدئوت را توصیف کن… مثلاً: ریلز معرفی کافه‌ی دنج با موزیک آرام، حس صمیمی و گرم"
      />
      <Button className="w-full" onClick={analyze} disabled={loading}>
        {loading ? <Loader2 size={16} className="animate-spin ml-1" /> : <Sparkles size={16} className="ml-1" />}
        تحلیل و پیشنهاد ادیت
      </Button>

      {plan && (
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-3.5 text-sm">
          {plan.hookIdea && (
            <div>
              <b className="text-accent text-xs">🪝 هوک ۳ ثانیه اول:</b>
              <p className="text-xs mt-1 leading-6">{plan.hookIdea}</p>
            </div>
          )}
          {plan.title && (
            <div>
              <b className="text-accent text-xs">🏷️ تیتر پیشنهادی:</b>
              <p className="text-xs mt-1">{plan.title}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-secondary/50 p-2">فیلتر: <b>{plan.filterPresetId}</b></div>
            <div className="rounded-lg bg-secondary/50 p-2">تمپلیت زیرنویس: <b>{plan.captionPresetId}</b></div>
          </div>
          {plan.musicMood && (
            <p className="text-xs leading-6">🎵 حس موزیک: {plan.musicMood}</p>
          )}
          {plan.tips?.length > 0 && (
            <ul className="text-xs leading-6 list-disc ps-4 space-y-1">
              {plan.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          <Button size="sm" className="w-full" onClick={apply}>
            اعمال خودکار (فیلتر + تیتر + تمپلیت زیرنویس)
          </Button>
        </div>
      )}
    </div>
  );
}

// ── auto video maker (script → scenes → images → captions → TTS) ──

export function AutoVideoSheet({ ctx }: { ctx: EditorCtx }) {
  const [script, setScript] = useState("");
  const [sceneCount, setSceneCount] = useState(4);
  const [tone, setTone] = useState("صمیمی و پرانرژی");
  const [withTts, setWithTts] = useState(true);
  const [loading, setLoading] = useState(false);

  const gen = async () => {
    if (!script.trim()) return ctx.toast("سناریو یا موضوع را بنویس", "error");
    setLoading(true);
    try {
      ctx.setBusy({ label: "AI در حال دکوپاژ سناریو…", progress: 0.02 });
      const j = await aiScriptScenes({ script, sceneCount, tone, ...byoCreds() });
      if (j.error || !j.scenes) throw new Error(j.error || "خطا در ساخت صحنه‌ها");
      const scenes: { text: string; imagePrompt: string; dur: number }[] = j.scenes;

      // clear old content
      ctx.mutate((p) => {
        p.clips = [];
        p.overlays = [];
        p.texts = [];
        p.audios = [];
        p.markers = [];
      });

      const imgSize =
        ctx.project.aspect === "16:9" ? "1344x768" : ctx.project.aspect === "1:1" ? "1024x1024" : "768x1344";
      let t0 = 0;

      if (j.title) {
        ctx.mutate((p) =>
          p.texts.push({
            ...(captionPatch(j.title ?? "", 0, 2.5)),
            isCaption: false,
            karaoke: false,
            font: "Lalezar",
            weight: 400,
            size: 86,
            strokeW: 10,
            animIn: "pop",
            y: 0.3,
          } as TextItem)
        );
      }

      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        ctx.setBusy({ label: `ساخت تصویر صحنه ${i + 1} از ${scenes.length}…`, progress: 0.1 + (i / scenes.length) * 0.8 });

        let asset: MediaAsset | null = null;
        try {
          const ij = await aiImageGen({ prompt: sc.imagePrompt, size: imgSize, ...byoCreds() });
          if (ij.image_base64) {
            const blob = b64ToBlob(ij.image_base64, "image/png");
            asset = await ctx.importFile(new File([blob], `scene-${i + 1}.png`, { type: "image/png" }));
          }
        } catch {
          // image optional — text/audio still added
        }

        if (asset) {
          const a = asset;
          ctx.mutate((p) => p.clips.push(makeImageClip(a, sc.dur, "صحنه", i)));
        }

        ctx.mutate((p) => p.texts.push(captionPatch(sc.text, t0, t0 + sc.dur)));

        if (withTts && sc.text.trim()) {
          try {
            const blob = await aiZaiTtsBlob(sc.text, "tongtong", 1);
              const a = await ctx.importFile(new File([blob], `tts-${i + 1}.wav`, { type: "audio/wav" }));
              if (a) {
                ctx.mutate((p) =>
                  p.audios.push({
                    id: uid("au"),
                    assetId: a.id,
                    name: `گوینده ${i + 1}`,
                    start: t0,
                    in: 0,
                    out: a.duration || sc.dur,
                    srcDur: a.duration || sc.dur,
                    volume: 1,
                    fadeIn: 0.1,
                    fadeOut: 0.2,
                    effect: "none",
                    duckCaptions: false,
                    fromTts: true,
                  })
                );
              }
          } catch {
            // TTS optional — گویندهٔ پلتفرم فقط روی میزبانی سروری است
          }
        }
        t0 += sc.dur;
      }
      ctx.toast("ویدئوی خودکار ساخته شد 🎬 می‌توانی هر صحنه را ویرایش کنی");
      ctx.closeSheet();
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "ساخت ویدئو ناموفق بود", "error");
    } finally {
      setLoading(false);
      ctx.setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs leading-6">
        🪄 سناریو یا موضوعت را بنویس؛ AI آن را به <b>۳ تا ۶ صحنه تصویری</b> تقسیم می‌کند، برای هر صحنه <b>تصویر سینمایی</b> می‌سازد، <b>زیرنویس کارائوکه</b> می‌گذارد و اگر بخواهی <b>صدای گوینده</b> هم می‌سازد.
      </div>
      <Textarea rows={4} value={script} onChange={(e) => setScript(e.target.value)} placeholder="موضوع یا سناریو… مثلاً: معرفی یه کافه دنج در تهران که قهوه‌های ویژه‌اش معروفه" />
      <SliderRow label="تعداد صحنه" value={sceneCount} min={3} max={6} onChange={setSceneCount} />
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">لحن روایت</span>
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="صمیمی و پرانرژی">صمیمی و پرانرژی</SelectItem>
            <SelectItem value="آرام و شاعرانه">آرام و شاعرانه</SelectItem>
            <SelectItem value="طنز و بامزه">طنز و بامزه</SelectItem>
            <SelectItem value="حرفه‌ای و جدی">حرفه‌ای و جدی</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">ساخت صدای گوینده (TTS)</span>
        <Switch checked={withTts} onCheckedChange={setWithTts} />
      </div>
      <Button className="w-full" onClick={gen} disabled={loading}>
        {loading ? <Loader2 size={16} className="animate-spin ml-1" /> : <Wand2 size={16} className="ml-1" />}
        ساخت ویدئو (۲-۴ دقیقه طول می‌کشد)
      </Button>
      <p className="text-[11px] text-muted-foreground leading-5">⚠️ تایم‌لاین فعلی پاک می‌شود. تصویرها با AI ساخته می‌شوند و ممکن است کمی معطل داشته باشد؛ صفحه را باز نگه دار.</p>
    </div>
  );
}

// ── export ──

export function ExportSheet({ ctx, engine }: { ctx: EditorCtx; engine: EditorEngine | null }) {
  const [quality, setQuality] = useState(1080);
  const [fps, setFps] = useState(30);
  const [bitrate, setBitrate] = useState<"low" | "rec" | "high">("rec");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; ext: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signalRef] = useState<{ current: { cancelled: boolean } | null }>(() => ({ current: null }));
  const advanced = supportsAdvancedExport();

  const dims = exportDims(ctx.project.aspect, quality);
  const total = ctx.project.clips.reduce((a, c) => a + clipDur(c), 0);
  const scale = Math.max(0.3, Math.min(1.6, (dims.w * dims.h) / (1080 * 1920)));
  const mbps = Math.max(2, Math.round((bitrate === "low" ? 3.5 : bitrate === "rec" ? 7 : 14) * scale));
  const estMb = ((mbps * total) / 8).toFixed(1);

  const run = async () => {
    if (!engine) return;
    setError(null);
    setResult(null);
    setProgress(0);
    const signal = { cancelled: false };
    signalRef.current = signal;
    try {
      let blob: Blob;
      let usedMime: string;
      try {
        // مسیر ۱ — WebCodecs فریم‌به‌فریم (دقیق، صدا مستقل از gesture)
        const res = await exportProjectAdvanced(engine, ctx.project, ctx.assets, {
          longSide: quality,
          fps,
          bitrateMbps: mbps,
          onProgress: (p) => setProgress(p),
          signal,
        });
        blob = res.blob;
        usedMime = res.mime;
      } catch (advErr) {
        if (signal.cancelled) return;
        // مسیر ۲ — fallback به MediaRecorder زنده
        const r = await engine.exportVideo({
          longSide: quality,
          fps,
          preferMp4: true,
          bitrateMbps: mbps,
          onProgress: (p) => setProgress(p),
          signal,
        });
        blob = r.blob;
        usedMime = r.mime;
        void advErr;
      }
      const url = URL.createObjectURL(blob);
      const ext = usedMime.includes("mp4") ? "mp4" : "webm";
      setResult({ url, ext, size: blob.size });
      const a = document.createElement("a");
      a.href = url;
      a.download = `studio-export-${Date.now()}.${ext}`;
      a.click();
    } catch (e) {
      if (signal.cancelled) {
        setError(null);
        return;
      }
      setError(e instanceof Error ? e.message : "خروجی ناموفق بود");
    } finally {
      setProgress(null);
      signalRef.current = null;
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle>رزولوشن (سمت بلند)</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {[720, 1080, 1440].map((q) => (
          <button key={q} onClick={() => setQuality(q)} className={`py-2.5 rounded-xl border text-sm ${quality === q ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}>
            {q}p
          </button>
        ))}
      </div>
      <SectionTitle>فریم‌ریت</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {[24, 30, 60].map((f) => (
          <button key={f} onClick={() => setFps(f)} className={`py-2.5 rounded-xl border text-sm ${fps === f ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}>
            {f} fps
          </button>
        ))}
      </div>
      {fps === 60 && advanced && (
        <p className="text-[11px] text-amber-300">۶۰fps سنگین‌تر رندر می‌شود؛ اگر انکودر دستگاه پشتیبانی نکرد، خروجی خطا می‌دهد — به ۳۰ برگرد.</p>
      )}
      <SectionTitle>کیفیت فشرده‌سازی (Bitrate)</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {[
          { id: "low", l: "کم (حجم کم)" },
          { id: "rec", l: "توصیه‌شده" },
          { id: "high", l: "بالا" },
        ].map((b) => (
          <button key={b.id} onClick={() => setBitrate(b.id as typeof bitrate)} className={`py-2.5 rounded-xl border text-xs ${bitrate === b.id ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}>
            {b.l}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-secondary/40 border border-border p-3 text-xs space-y-1 leading-6" dir="ltr">
        <div>{dims.w}×{dims.h} • {fps}fps • ~{mbps}Mbps • ≈{estMb} MB</div>
        <div className="text-muted-foreground">container: MP4 (H.264) via WebCodecs — frame-accurate</div>
        {!advanced && <div className="text-amber-300">WebCodecs در دسترس نیست → fallback به MediaRecorder (رندر زنده)</div>}
      </div>

      {progress !== null && (
        <div className="space-y-2">
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-gradient-to-l from-primary to-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-xs text-center text-muted-foreground">در حال رندر… ({Math.round(progress * 100)}٪)</p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => { if (signalRef.current) signalRef.current.cancelled = true; }}>
            لغو خروجی
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-300 text-center">{error}</p>}

      {result ? (
        <div className="space-y-2">
          <p className="text-xs text-center text-emerald-300">✅ خروجی آماده شد ({(result.size / 1048576).toFixed(1)} MB) — دانلود خودکار شروع شد</p>
          <Button variant="outline" className="w-full" onClick={() => {
            const a = document.createElement("a");
            a.href = result.url;
            a.download = `studio-export-${Date.now()}.${result.ext}`;
            a.click();
          }}>
            <Download size={15} className="ml-1" /> دانلود دوباره
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={run} disabled={progress !== null || (!advanced && !pickRecorderMime(true))}>
          <Download size={16} className="ml-1" />
          شروع خروجی بدون واترمارک
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground leading-5">💡 خروجی فریم‌به‌فریم رندر می‌شود (به طول ویدئو زمان می‌برد) و دقیقاً همان پیش‌نمایش را می‌گیرید؛ می‌توانید لغو کنید.</p>
    </div>
  );
}

// ── markers ──

export function MarkersSheet({ ctx }: { ctx: EditorCtx }) {
  const markers = [...ctx.project.markers].sort((a, b) => a.t - b.t);

  // C8 (P2): برش واقعی کلیپ اصلی روی همهٔ نشانگرها — هر نشانگر داخل یک کلیپ، یک برش
  const splitAtMarkers = () => {
    let n = 0;
    ctx.mutate((p) => {
      const sorted = [...p.markers].sort((a, b) => a.t - b.t);
      for (const m of sorted) {
        const at = m.t;
        let acc = 0;
        for (let i = 0; i < p.clips.length; i++) {
          const c = p.clips[i];
          const d = (c.out - c.in) / (c.kind === "image" ? 1 : c.speed);
          if (at > acc + 0.25 && at < acc + d - 0.25) {
            const srcSplit = c.in + (at - acc) * c.speed;
            const right = { ...structuredClone(c), id: uid("cl"), in: srcSplit, out: c.out, reverse: undefined };
            c.out = srcSplit;
            p.clips.splice(i + 1, 0, right);
            n++;
            break; // جمع مدت‌ها بعد از برش عوض می‌شود — نشانگر بعدی با تایم‌لاین تازه بررسی می‌شود
          }
          acc += d;
        }
      }
    });
    ctx.toast(n ? `${n} برش روی نشانگرها انجام شد ✂️` : "هیچ نشانگری داخل کلیپی نمی‌افتد", n ? "success" : "info");
  };

  return (
    <div className="space-y-3">
      <Button variant="outline" className="w-full" onClick={() => {
        ctx.mutate((p) => p.markers.push({ id: uid("mk"), t: ctx.time, label: "" }));
      }}>
        <MapPin size={15} className="ml-1" /> افزودن نشانگر روی {ctx.time.toFixed(1)}s
      </Button>
      {markers.length > 0 && (
        <Button className="w-full" onClick={splitAtMarkers}>
          <Scissors size={15} className="ml-1" /> برش کلیپ‌ها روی نشانگرها ({markers.length})
        </Button>
      )}
      {markers.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">نشانگری نیست. با نشانگرها ریتم ادیت را با ضرب موزیک هماهنگ کن.</p>}
      {markers.map((m) => (
        <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 p-2.5">
          <span className="text-accent">📍</span>
          <input
            value={m.label}
            placeholder="برچسب (مثلاً درام ضربه)"
            onChange={(e) => ctx.mutate((p) => { const x = p.markers.find((y) => y.id === m.id); if (x) x.label = e.target.value; })}
            className="flex-1 bg-transparent text-xs border-b border-white/10 focus:border-primary outline-none py-0.5"
          />
          <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">{m.t.toFixed(1)}s</span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => ctx.seek(m.t)}>پرش</Button>
          <button className="text-red-300" onClick={() => ctx.mutate((p) => (p.markers = p.markers.filter((x) => x.id !== m.id)))} aria-label="حذف">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
