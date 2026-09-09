"use client";

// Extra editor sheets: stickers, sound FX, mask, AI clipper, extend video,
// and project save — the "desktop CapCut" tool set.

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Loader2, Play, Scissors, Sparkles, Wand2, Save } from "lucide-react";
import {
  DEFAULT_MASK,
  MASK_SHAPES,
  clipStart,
  uid,
  type Clip,
  type MaskState,
} from "@/lib/video/types";
import { SFX_LIST, renderSfx } from "@/lib/video/sfx";
import { analyzeClipScenes, fmtMoment, type ClipAnalysis } from "@/lib/video/ai-clipper";
import { buildAutoVideo } from "@/lib/video/autovid";
import type { EditorCtx } from "./ctx";
import { SectionTitle, SliderRow } from "./ClipSheets";

// ── stickers (emoji + Persian word stickers) ──

const EMOJI_STICKERS = ["🔥", "😂", "❤️", "💀", "👀", "✨", "🎬", "🤯", "😭", "🥺", "💜", "⭐️", "🎉", "🤙", "💣", "🏆", "🦋", "🌸", "🌙", "⚡️"];
const WORD_STICKERS: { text: string; color: string; bg: string }[] = [
  { text: "وای!", color: "#ffffff", bg: "#e11d48" },
  { text: "عالی", color: "#111111", bg: "#facc15" },
  { text: "ف ی", color: "#ffffff", bg: "#7c3aed" },
  { text: "دمت گرم", color: "#ffffff", bg: "#059669" },
  { text: "واو", color: "#111111", bg: "#38bdf8" },
  { text: "صبر کن!", color: "#ffffff", bg: "#f97316" },
  { text: "آخرشو ببین", color: "#ffffff", bg: "#111111" },
  { text: "نایس", color: "#111111", bg: "#a3e635" },
];

export function StickersSheet({ ctx }: { ctx: EditorCtx }) {
  const addEmoji = (e: string) => {
    const id = ctx.addTextItem({ text: e, font: "Vazirmatn", weight: 400, size: 170, strokeW: 0, shadow: false, gradient: false, y: 0.35 });
    ctx.select({ type: "text", id });
    ctx.closeSheet();
  };
  const addWord = (w: { text: string; color: string; bg: string }) => {
    const id = ctx.addTextItem({
      text: w.text, font: "Lalezar", weight: 400, size: 72, color: w.color,
      bgColor: w.bg, bgOpacity: 1, strokeW: 0, shadow: false, gradient: false, y: 0.42,
    });
    ctx.select({ type: "text", id });
    ctx.closeSheet();
  };
  return (
    <div className="space-y-4">
      <SectionTitle>استیکرهای کلمه‌ای فارسی</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {WORD_STICKERS.map((w) => (
          <button
            key={w.text}
            onClick={() => addWord(w)}
            className="rounded-xl px-2 py-3 text-sm font-bold text-center truncate"
            style={{ background: w.bg, color: w.color }}
          >
            {w.text}
          </button>
        ))}
      </div>
      <SectionTitle>ایموجی‌های درشت</SectionTitle>
      <div className="grid grid-cols-5 gap-2">
        {EMOJI_STICKERS.map((e) => (
          <button
            key={e}
            onClick={() => addEmoji(e)}
            className="aspect-square rounded-xl border border-border bg-secondary/60 text-3xl flex items-center justify-center active:scale-95 transition-transform"
          >
            {e}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground leading-5">💡 بعد از افزودن، با ابزار «متن» جای استیکر را عوض کن و زمانش را تنظیم کن.</p>
    </div>
  );
}

// ── sound FX library (synthesized — original) ──

export function SfxSheet({ ctx }: { ctx: EditorCtx }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const preview = async (id: string) => {
    setBusyId(id);
    try {
      const blob = await renderSfx(id);
      previewRef.current?.pause();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      previewRef.current = a;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch {
      ctx.toast("پخش ناموفق بود", "error");
    } finally {
      setBusyId(null);
    }
  };

  const addToTimeline = async (id: string) => {
    const def = SFX_LIST.find((s) => s.id === id)!;
    setBusyId(id);
    ctx.setBusy({ label: `ساخت «${def.name}»…` });
    try {
      const blob = await renderSfx(id);
      const asset = await ctx.importFile(new File([blob], `sfx-${id}.wav`, { type: "audio/wav" }));
      if (asset) {
        ctx.addAudioFromAsset(asset, ctx.time);
        ctx.closeSheet();
      }
    } catch {
      ctx.toast("ساخت جلوه صوتی ناموفق بود", "error");
    } finally {
      setBusyId(null);
      ctx.setBusy(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-muted-foreground leading-5">
        جلوه‌های صوتی اورجینال — همان‌لحظه ساخته و روی نشانگر تایم‌لاین اضافه می‌شوند. اول با ▶ بشنو، بعد با + بگذار.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {SFX_LIST.map((s) => (
          <div key={s.id} className="rounded-xl border border-border bg-secondary/40 p-2.5 flex items-center gap-2">
            <span className="text-xl shrink-0">{s.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold truncate">{s.name}</div>
              <div className="text-[10px] text-muted-foreground">{s.dur}s</div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={busyId === s.id} onClick={() => preview(s.id)} aria-label={`پخش ${s.name}`}>
              {busyId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            </Button>
            <Button variant="secondary" size="icon" className="h-8 w-8 shrink-0" disabled={busyId === s.id} onClick={() => addToTimeline(s.id)} aria-label={`افزودن ${s.name}`}>
              +
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── mask (circle / rounded / star / heart + feather) ──

export function MaskSheet({ ctx }: { ctx: EditorCtx }) {
  const isClip = ctx.selection?.type === "clip";
  const isOverlay = ctx.selection?.type === "overlay";
  const clip = isClip ? ctx.project.clips.find((c) => c.id === ctx.selection!.id) ?? null : null;
  const overlay = isOverlay ? ctx.project.overlays.find((o) => o.id === ctx.selection!.id) ?? null : null;
  if (!clip && !overlay) {
    return <p className="text-sm text-muted-foreground text-center py-6">اول یک کلیپ یا لایه رویی را از تایم‌لاین انتخاب کن.</p>;
  }
  const mask: MaskState = clip?.mask ?? overlay?.mask ?? DEFAULT_MASK;
  const set = (patch: Partial<MaskState>) =>
    ctx.mutate((p) => {
      if (clip) {
        const c = p.clips.find((x) => x.id === clip.id);
        if (c) c.mask = { ...mask, ...patch };
      } else if (overlay) {
        const o = p.overlays.find((x) => x.id === overlay.id);
        if (o) o.mask = { ...mask, ...patch };
      }
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {MASK_SHAPES.map((s) => (
          <button
            key={s.id}
            onClick={() => set({ shape: s.id })}
            className={`rounded-xl border p-2 text-center text-[10px] ${mask.shape === s.id ? "border-primary bg-primary/10" : "border-border bg-secondary/50"}`}
          >
            <div className="text-xl">{s.emoji}</div>
            {s.name}
          </button>
        ))}
      </div>
      {mask.shape !== "none" && (
        <>
          <SliderRow label="اندازه ماسک" value={mask.size} min={0.2} max={1.4} step={0.02} onChange={(v) => set({ size: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="نرمی لبه (فیدر)" value={mask.feather} min={0} max={0.5} step={0.01} onChange={(v) => set({ feather: v })} fmt={(v) => `${Math.round(v * 200)}%`} />
          <Button variant="outline" size="sm" className="w-full" onClick={() => set({ ...DEFAULT_MASK })}>
            بازنشانی ماسک
          </Button>
          <p className="text-[11px] text-muted-foreground leading-5">💡 برای PiP دایره‌ای، بعد از ماسک از «چرخش و کادر» جای لایه را تنظیم کن. برای برش دقیق لبه، نرمی را صفر کن.</p>
        </>
      )}
    </div>
  );
}

// ── AI clipper: scene split + golden moments ──

export function AiClipperSheet({ ctx }: { ctx: EditorCtx }) {
  const clip: Clip | null =
    ctx.selection?.type === "clip"
      ? ctx.project.clips.find((c) => c.id === ctx.selection!.id) ?? null
      : null;
  const [analysis, setAnalysis] = useState<ClipAnalysis | null>(null);
  const [running, setRunning] = useState(false);

  const asset = clip ? ctx.assets.get(clip.assetId) : null;
  const canRun = clip && asset && asset.type === "video" && !clip.reverse;

  const run = async () => {
    if (!canRun || !asset) return ctx.toast("برش هوشمند برای کلیپ ویدئویی عادی است", "error");
    setRunning(true);
    ctx.setBusy({ label: "تحلیل صحنه‌ها و لحظه‌های طلایی…", progress: 0 });
    try {
      const blob = await (await fetch(asset.url)).blob();
      const res = await analyzeClipScenes(blob, { in: clip.in, out: clip.out }, {
        maxSplits: 5,
        topMoments: 3,
        onProgress: (p) => ctx.setBusy({ label: "تحلیل صحنه‌ها و لحظه‌های طلایی…", progress: p }),
      });
      setAnalysis(res);
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "تحلیل ناموفق بود", "error");
    } finally {
      setRunning(false);
      ctx.setBusy(null);
    }
  };

  const applySplit = () => {
    if (!analysis || !clip) return;
    const points = analysis.splits
      .map((s) => s.t)
      .filter((t) => t > clip.in + 0.5 && t < clip.out - 0.5)
      .sort((a, b) => a - b);
    if (!points.length) return ctx.toast("نقطه‌ی برش مناسبی پیدا نشد — حساسیت صحنه کم است", "error");
    ctx.mutate((p) => {
      const idx = p.clips.findIndex((c) => c.id === clip.id);
      if (idx < 0) return;
      const orig = p.clips[idx];
      const bounds = [orig.in, ...points, orig.out];
      const parts: Clip[] = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        parts.push({
          ...orig,
          id: uid("cl"),
          in: bounds[i],
          out: bounds[i + 1],
          transitionIn: i === 0 ? orig.transitionIn : { type: "none", dur: 0.2 },
          name: `${orig.name} ${i + 1}`,
        });
      }
      p.clips.splice(idx, 1, ...parts);
    });
    ctx.toast(`${points.length + 1} سکانس ساخته شد ✂️ حالا بخش‌های بی‌استفاده را حذف کن`, "success");
    ctx.closeSheet();
  };

  const applyGolden = () => {
    if (!analysis || !clip) return;
    const st = clipStart(ctx.project, clip.id);
    const speed = clip.speed || 1;
    ctx.mutate((p) => {
      for (const g of analysis.golden) {
        p.markers.push({
          id: uid("mk"),
          t: Math.max(0, st + (g.start - clip.in) / speed),
          label: `لحظه طلایی ${Math.round(g.score * 100)}٪`,
        });
      }
    });
    ctx.toast("لحظه‌های طلایی روی تایم‌لاین علامت خورد 📍", "success");
    ctx.closeSheet();
  };

  if (!clip) {
    return <p className="text-sm text-muted-foreground text-center py-6">اول یک کلیپ ویدئویی از تایم‌لاین انتخاب کن.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs leading-6">
        ✂️ «برش هوشمند» صدای کلیپ <b>{clip.name}</b> را تحلیل می‌کند: جاهای ساکت را نقطه‌ی برش پیشنهاد می‌دهد و پویاترین بخش‌ها (لحظه‌های طلایی) را علامت می‌زند.
      </div>
      {!analysis ? (
        <Button className="w-full" onClick={run} disabled={!canRun || running}>
          {running ? <Loader2 size={16} className="animate-spin ml-1" /> : <Sparkles size={16} className="ml-1" />}
          شروع تحلیل صحنه‌ها
        </Button>
      ) : (
        <>
          <SectionTitle>نقاط برش پیشنهادی ({analysis.splits.length})</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {analysis.splits.map((s, i) => (
              <span key={i} className="text-[11px] font-mono px-2 py-1 rounded-lg bg-secondary border border-border" dir="ltr">
                {fmtMoment(s.t)}
              </span>
            ))}
          </div>
          <Button size="sm" className="w-full gap-1.5" onClick={applySplit}>
            <Scissors size={14} /> برش کلیپ روی این نقاط
          </Button>
          <SectionTitle>لحظه‌های طلایی ({analysis.golden.length})</SectionTitle>
          <div className="space-y-1.5">
            {analysis.golden.map((g, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/50 border border-border px-2.5 py-1.5 text-xs">
                <span>🥇 پویاترین بخش {i + 1}</span>
                <span className="font-mono text-muted-foreground" dir="ltr">{fmtMoment(g.start)} → {fmtMoment(g.end)}</span>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={applyGolden}>
            📍 علامت‌گذاری روی تایم‌لاین
          </Button>
        </>
      )}
      {!canRun && <p className="text-[11px] text-amber-300/90">این کلیپ قابل تحلیل نیست (ویدئوی معکوس یا بدون صدا).</p>}
    </div>
  );
}

// ── extend video: loop / ping-pong / AI continuation ──

export function ExtendSheet({ ctx }: { ctx: EditorCtx }) {
  const lastClip = ctx.project.clips[ctx.project.clips.length - 1] ?? null;
  const isLast = lastClip && ctx.selection?.type === "clip" && ctx.selection.id === lastClip.id;
  const [idea, setIdea] = useState("");
  const [withTts, setWithTts] = useState(false);
  const [running, setRunning] = useState<"" | "loop" | "pingpong" | "ai">("");

  if (!lastClip) {
    return <p className="text-sm text-muted-foreground text-center py-6">اول حداقل یک کلیپ به تایم‌لاین اضافه کن.</p>;
  }

  const loop = (times: number) => {
    if (!lastClip) return;
    ctx.mutate((p) => {
      const idx = p.clips.findIndex((c) => c.id === lastClip.id);
      if (idx < 0) return;
      const orig = p.clips[idx];
      for (let i = 0; i < times - 1; i++) {
        p.clips.splice(idx + 1 + i, 0, { ...orig, id: uid("cl"), name: `${orig.name} تکرار` });
      }
    });
    ctx.toast(`کلیپ ${times} بار تکرار شد 🔁`, "success");
    ctx.closeSheet();
  };

  const pingpong = async () => {
    if (!lastClip) return;
    if (lastClip.kind !== "video" || lastClip.reverse) {
      ctx.toast("پینگ‌پنگ فقط برای کلیپ ویدئویی عادی است", "error");
      return;
    }
    const asset = ctx.assets.get(lastClip.assetId);
    if (!asset) return ctx.toast("فایل ویدئو پیدا نشد", "error");
    setRunning("pingpong");
    ctx.setBusy({ label: "ساخت برگشت معکوس…", progress: 0 });
    try {
      const { frames, fps } = await (await import("@/lib/video/engine")).buildReverse(
        asset.url, lastClip.in, lastClip.out, 12,
        (pr) => ctx.setBusy({ label: "ساخت برگشت معکوس…", progress: pr })
      );
      ctx.mutate((p) => {
        const idx = p.clips.findIndex((c) => c.id === lastClip.id);
        p.clips.splice(idx + 1, 0, {
          ...lastClip,
          id: uid("cl"),
          name: `${lastClip.name} برگشت`,
          reverse: { frames, fps },
          transitionIn: { type: "fade", dur: 0.3 },
        });
      });
      ctx.toast("ادامه‌ی پینگ‌پنگ اضافه شد ↔️", "success");
      ctx.closeSheet();
    } catch {
      ctx.toast("ساخت پینگ‌پنگ ناموفق بود", "error");
    } finally {
      setRunning("");
      ctx.setBusy(null);
    }
  };

  const aiContinue = async () => {
    if (!idea.trim()) return ctx.toast("ادامه‌ی داستان را در یک خط بنویس", "error");
    setRunning("ai");
    try {
      ctx.setBusy({ label: "AI در حال نوشتن ادامه…", progress: 0.05 });
      const res = await buildAutoVideo({
        script: idea.trim(),
        sceneCount: 2,
        tone: "صمیمی و پرانرژی",
        aspect: ctx.project.aspect,
        withTts,
        onProgress: (s) => ctx.setBusy({ label: s.label, progress: 0.05 + s.done / Math.max(1, s.total) * 0.85 }),
      });
      // append generated content to existing timeline (offset by current length)
      const prevSum = ctx.project.clips.reduce(
        (acc, c) => acc + (c.out - c.in) / (c.kind === "image" ? 1 : c.speed), 0
      );
      ctx.mutate((p) => {
        p.clips.push(...res.project.clips);
        for (const t of res.project.texts) {
          t.start += prevSum;
          t.end += prevSum;
          p.texts.push(t);
        }
        for (const a of res.project.audios) {
          a.start += prevSum;
          p.audios.push(a);
        }
      });
      // register assets into editor
      for (const a of res.assets) ctx.addAsset(a);
      ctx.toast("ادامه‌ی صحنه‌ها به تایم‌لاین اضافه شد 🪄", "success");
      ctx.closeSheet();
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "ادامه‌سازی ناموفق بود", "error");
    } finally {
      setRunning("");
      ctx.setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-6">
        ⏭️ «ادامه ویدئو» طول کلیپ پایانی را بیشتر می‌کند — مثل تابع Extend کپ‌کات، با سه روش.
      </div>

      <SectionTitle>۱) تکرار (Loop)</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" disabled={!!running} onClick={() => loop(2)}>×۲ تکرار</Button>
        <Button variant="outline" size="sm" disabled={!!running} onClick={() => loop(3)}>×۳ تکرار</Button>
      </div>

      <SectionTitle>۲) پینگ‌پنگ (رفت‌وبرگشت)</SectionTitle>
      <Button variant="outline" size="sm" className="w-full" disabled={!!running || !isLast} onClick={pingpong}>
        {running === "pingpong" ? <Loader2 size={14} className="animate-spin ml-1" /> : "↔️ "} ساخت برگشت معکوس
      </Button>
      {!isLast && <p className="text-[11px] text-amber-300/90">اول آخرین کلیپ تایم‌لاین را انتخاب کن.</p>}

      <SectionTitle>۳) ادامه با AI (تصویرسازی صحنه‌ی بعد)</SectionTitle>
      <Input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="مثلاً: نمای دنج‌تر کافه با بارون و چراغ‌های گرم…" />
      <label className="flex items-center justify-between py-1 text-xs">
        <span>با صدای گوینده فارسی</span>
        <input type="checkbox" checked={withTts} onChange={(e) => setWithTts(e.target.checked)} className="accent-violet-500" />
      </label>
      <Button size="sm" className="w-full gap-1.5" disabled={!!running} onClick={aiContinue}>
        {running === "ai" ? <Loader2 size={14} className="animate-spin ml-1" /> : <Wand2 size={14} />} ادامه‌ی صحنه را بساز
      </Button>
      <p className="text-[11px] text-muted-foreground leading-5">💡 دو صحنه‌ی جدید با AI تصویرسازی می‌شود و بعد از کلیپ فعلی می‌نشیند (۱-۲ دقیقه زمان می‌برد).</p>
    </div>
  );
}

// ── project save ──

export function ProjectSaveSheet({
  ctx,
  projectId,
  projectName,
  saving,
  onSave,
}: {
  ctx: EditorCtx;
  projectId: string | null;
  projectName: string;
  saving: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(projectName);
  const total = ctx.project.clips.reduce((a, c) => a + (c.out - c.in) / (c.kind === "image" ? 1 : c.speed), 0);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-6 space-y-1">
        <div>📊 {ctx.project.clips.length} کلیپ • {ctx.project.texts.length} متن • {ctx.project.audios.length} صدا • ~{Math.round(total)} ثانیه</div>
        <div className="text-muted-foreground">پروژه با تمام فایل‌های رسانه‌ای روی همین دستگاه ذخیره می‌شود و بعداً از «پروژه‌های من» در خانه باز می‌شود.</div>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم پروژه… مثلاً ریلز کافه" />
      <Button className="w-full gap-1.5" disabled={saving || !name.trim()} onClick={() => onSave(name.trim())}>
        {saving ? <Loader2 size={15} className="animate-spin ml-1" /> : <Save size={15} className="ml-1" />}
        {projectId ? "به‌روزرسانی پروژه" : "ذخیره پروژه"}
      </Button>
      <p className="text-[11px] text-muted-foreground leading-5">💡 ویدئو/عکس/صداهای روی تایم‌لاین داخل پروژه کپی می‌شوند — حذف فایل اصلی از گالری گوشی مشکلی ایجاد نمی‌کند.</p>
    </div>
  );
}
