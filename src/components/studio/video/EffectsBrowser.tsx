"use client";

// ─────────────────────────────────────────────────────────────
// Effects Browser (P1 §25-§26) — فقط ماژول‌های واقعی موجود:
// فیلترها، وینیت، بلور، ارتقای کیفیت، کروما، ماسک، لرزش‌گیر.
// هر کارت کنترل واقعی دارد و نتیجه بلافاصله در پیش‌نمایش دیده می‌شود.
// افکتی که پیاده‌سازی واقعی ندارد در این مرورگر نیست (NO FAKE).
// ─────────────────────────────────────────────────────────────

import { Crop, Droplets, Frame, Palette, Sparkles, Sun, Vibrate } from "lucide-react";
import { DEFAULT_FILTER, isCropped, type Clip, type OverlayItem } from "@/lib/video/types";
import { cssFilter } from "@/lib/video/filters";
import type { EditorCtx } from "./ctx";
import { SliderRow } from "./ClipSheets";

export function EffectsBrowser({ ctx, onOpenSheet }: { ctx: EditorCtx; onOpenSheet: (id: string) => void }) {
  const sel = ctx.selection;
  const clip = sel?.type === "clip" ? ctx.project.clips.find((c) => c.id === sel.id) ?? null : null;
  const overlay = sel?.type === "overlay" ? ctx.project.overlays.find((o) => o.id === sel.id) ?? null : null;
  const target = clip ?? overlay;
  const isClip = !!clip;

  if (!target) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        اول از تایم‌لاین یک کلیپ یا لایه را انتخاب کن تا افکت‌ها روی همان اعمال شوند.
      </p>
    );
  }

  const f = target.filter;
  const setF = (patch: Partial<typeof DEFAULT_FILTER>) => {
    ctx.mutate((p) => {
      if (isClip) {
        const c = p.clips.find((x) => x.id === (clip as Clip).id);
        if (c) c.filter = { ...c.filter, ...patch };
      } else {
        const o = p.overlays.find((x) => x.id === (overlay as OverlayItem).id);
        if (o) o.filter = { ...o.filter, ...patch };
      }
    });
  };

  const toggleEnhance = () => {
    if (!isClip) return ctx.toast("ارتقای کیفیت برای لایهٔ رویی فعلاً فعال نیست", "info");
    ctx.mutate((p) => {
      const c = p.clips.find((x) => x.id === (clip as Clip).id);
      if (c) c.enhance = !c.enhance;
    });
    ctx.toast((clip as Clip).enhance ? "ارتقای کیفیت خاموش شد" : "ارتقای کیفیت روشن شد ✨", "success");
  };

  const toggleStab = () => {
    if (!isClip) return ctx.toast("لرزش‌گیر فقط برای کلیپ اصلی است", "info");
    onOpenSheet("stab");
  };

  const cropped = isCropped((target as Clip & { crop?: unknown }).crop);

  return (
    <div className="space-y-4">
      {/* نور و رنگ سریع */}
      <section className="space-y-2">
        <SectionHead icon={<Sun size={12} />}>نور و رنگ</SectionHead>
        <SliderRow label="روشنایی" value={f.brightness} min={50} max={160} onChange={(v) => setF({ brightness: v, presetId: "custom" })} fmt={(v) => `${v}%`} />
        <SliderRow label="کنتراست" value={f.contrast} min={50} max={170} onChange={(v) => setF({ contrast: v, presetId: "custom" })} fmt={(v) => `${v}%`} />
        <SliderRow label="گرمی ↔ سردی" value={f.temp} min={-100} max={100} onChange={(v) => setF({ temp: v, presetId: "custom" })} />
        <div className="flex gap-1.5">
          <button onClick={() => onOpenSheet("clip-look")} className="flex-1 text-[11px] py-2 rounded-lg border border-border bg-secondary/60 flex items-center justify-center gap-1.5">
            <Palette size={12} /> فیلترهای کامل
          </button>
          <button onClick={() => setF({ ...DEFAULT_FILTER })} className="flex-1 text-[11px] py-2 rounded-lg border border-border bg-secondary/60">
            بازنشانی
          </button>
        </div>
      </section>

      {/* بافت و حال */}
      <section className="space-y-2">
        <SectionHead icon={<Droplets size={12} />}>بافت و حال</SectionHead>
        <SliderRow label="وینیت (تاریکی گوشه‌ها)" value={f.vignette} min={0} max={1} step={0.05} onChange={(v) => setF({ vignette: v, presetId: "custom" })} fmt={(v) => `${Math.round(v * 100)}%`} />
        <SliderRow label="بلور" value={f.blur} min={0} max={12} step={0.5} onChange={(v) => setF({ blur: v, presetId: "custom" })} fmt={(v) => `${v}px`} />
        <SliderRow label="سپیا" value={f.sepia} min={0} max={100} onChange={(v) => setF({ sepia: v, presetId: "custom" })} fmt={(v) => `${v}%`} />
      </section>

      {/* کیفیت و پایداری */}
      <section className="space-y-2">
        <SectionHead icon={<Sparkles size={12} />}>کیفیت و پایداری</SectionHead>
        <div className="grid grid-cols-2 gap-1.5">
          {isClip && (
            <button
              onClick={toggleEnhance}
              className={`text-[11px] py-2 rounded-lg border flex items-center justify-center gap-1.5 ${(clip as Clip).enhance ? "border-accent/50 text-accent bg-accent/10" : "border-border bg-secondary/60"}`}
            >
              <Sparkles size={12} /> {(clip as Clip).enhance ? "کیفیت+ ✓" : "ارتقای کیفیت"}
            </button>
          )}
          <button onClick={toggleStab} className="text-[11px] py-2 rounded-lg border border-border bg-secondary/60 flex items-center justify-center gap-1.5">
            <Vibrate size={12} /> لرزش‌گیر
          </button>
        </div>
      </section>

      {/* فرم و کادر */}
      <section className="space-y-2">
        <SectionHead icon={<Frame size={12} />}>فرم و کادر</SectionHead>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onOpenSheet("crop")}
            className="text-[11px] py-2 rounded-lg border border-border bg-secondary/60 flex items-center justify-center gap-1.5"
          >
            <Crop size={12} /> کراپ {cropped ? "✓" : ""}
          </button>
          <button
            onClick={() => onOpenSheet("mask")}
            className="text-[11px] py-2 rounded-lg border border-border bg-secondary/60 flex items-center justify-center gap-1.5"
          >
            <Frame size={12} /> ماسک {target.mask && target.mask.shape !== "none" ? "✓" : ""}
          </button>
          <button
            onClick={() => onOpenSheet("chroma")}
            className="col-span-2 text-[11px] py-2 rounded-lg border border-border bg-secondary/60 flex items-center justify-center gap-1.5"
          >
            <Droplets size={12} /> حذف پس‌زمینه (پرده سبز) {target.chroma.enabled ? "✓" : ""}
          </button>
        </div>
      </section>

      <p className="text-[10px] text-muted-foreground leading-4">
        همهٔ افکت‌ها فقط روی همان کلیپ/لایهٔ انتخاب‌شده اعمال می‌شوند و در پیش‌نمایش و خروجی نهایی هر دو واقعی‌اند.
      </p>
      <span className="hidden">{cssFilter(f, 0.2)}</span>
    </div>
  );
}

function SectionHead({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h4 className="text-xs font-bold text-accent flex items-center gap-1.5">
      {icon}
      {children}
    </h4>
  );
}
