"use client";

// Bottom-sheet panels for clip-level editing
import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  ASPECTS, DEFAULT_CROP, DEFAULT_FILTER, DEFAULT_TRANSFORM, FILTER_PRESETS,
  isCropped, sanitizeCrop,
  type Clip, type CropState, type FilterState, type OverlayItem, type TransformState,
} from "@/lib/video/types";
import { cssFilter } from "@/lib/video/filters";
import { replaceSource } from "@/lib/video/edit-ops";
import type { EditorCtx } from "./ctx";

// ── small building blocks ──

export function SliderRow({
  label, value, min, max, step = 1, onChange, fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{fmt ? fmt(value) : value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="py-1"
      />
    </div>
  );
}

export function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-1.5 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between py-1.5 text-sm">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-8 rounded-lg bg-transparent border border-border cursor-pointer"
      />
    </label>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-bold text-accent mt-4 mb-2 first:mt-0">{children}</h4>;
}

function useSelected(ctx: EditorCtx): { clip: Clip | null; overlay: OverlayItem | null } {
  return useMemo(() => {
    if (ctx.selection?.type === "clip") {
      return { clip: ctx.project.clips.find((c) => c.id === ctx.selection!.id) ?? null, overlay: null };
    }
    if (ctx.selection?.type === "overlay") {
      return { clip: null, overlay: ctx.project.overlays.find((o) => o.id === ctx.selection!.id) ?? null };
    }
    return { clip: null, overlay: null };
  }, [ctx]);
}

// ── clip basic: trim / speed / volume / fades (overlay: timing) ──

export function ClipBasicSheet({ ctx }: { ctx: EditorCtx }) {
  const { clip, overlay } = useSelected(ctx);
  if (overlay) {
    return (
      <div className="space-y-4">
        <SectionTitle>زمان‌بندی لایه رویی</SectionTitle>
        <SliderRow label="شروع روی تایم‌لاین" value={overlay.start} min={0} max={Math.max(1, ctx.project.clips.reduce((a, c) => a + (c.out - c.in) / c.speed, 0))} step={0.1} onChange={(v) => ctx.mutate((p) => { const o = p.overlays.find((x) => x.id === overlay.id); if (o) o.start = v; })} fmt={(v) => `${v.toFixed(1)}s`} />
        <SliderRow label="مدت نمایش" value={overlay.dur} min={0.5} max={30} step={0.1} onChange={(v) => ctx.mutate((p) => { const o = p.overlays.find((x) => x.id === overlay.id); if (o) o.dur = v; })} fmt={(v) => `${v.toFixed(1)}s`} />
        {overlay.kind === "video" && (
          <SliderRow label="نقطه شروع از ویدئوی منبع" value={overlay.srcIn} min={0} max={Math.max(0.1, overlay.srcDur - 0.2)} step={0.1} onChange={(v) => ctx.mutate((p) => { const o = p.overlays.find((x) => x.id === overlay.id); if (o) o.srcIn = v; })} fmt={(v) => `${v.toFixed(1)}s`} />
        )}
      </div>
    );
  }
  if (!clip) return <EmptyHint />;
  const dur = clip.out - clip.in;
  return (
    <div className="space-y-4">
      <SectionTitle>تریم (برش ابتدا و انتها)</SectionTitle>
      <SliderRow
        label="شروع کلیپ از ویدئوی منبع"
        value={clip.in}
        min={0}
        max={Math.max(0.2, clip.srcDur - 0.2)}
        step={0.05}
        onChange={(v) => ctx.mutate((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) c.in = Math.min(v, c.out - 0.2); })}
        fmt={(v) => `${v.toFixed(2)}s`}
      />
      <SliderRow
        label="پایان کلیپ از ویدئوی منبع"
        value={clip.out}
        min={0.2}
        max={Math.max(0.3, clip.srcDur)}
        step={0.05}
        onChange={(v) => ctx.mutate((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) c.out = Math.max(v, c.in + 0.2); })}
        fmt={(v) => `${v.toFixed(2)}s`}
      />
      <p className="text-[11px] text-muted-foreground">مدت روی تایم‌لاین: {(dur / (clip.kind === "image" ? 1 : clip.speed)).toFixed(2)}s</p>

      <SectionTitle>تعویض منبع (Replace)</SectionTitle>
      <ReplaceSourceRow ctx={ctx} />

      {clip.kind === "video" && (
        <>
          <SectionTitle>سرعت</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {[0.25, 0.5, 1, 1.5, 2, 3, 4].map((s) => (
              <button
                key={s}
                onClick={() => ctx.mutate((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) c.speed = s; })}
                className={`text-xs px-3 py-1.5 rounded-lg border ${clip.speed === s ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}
              >
                {s}x
              </button>
            ))}
          </div>
          <SliderRow
            label="سرعت دلخواه"
            value={clip.speed}
            min={0.25}
            max={4}
            step={0.05}
            onChange={(v) => ctx.mutate((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) c.speed = v; })}
            fmt={(v) => `${v.toFixed(2)}x`}
          />

          <SectionTitle>صدا</SectionTitle>
          <SwitchRow label="بی‌صدا کردن کلیپ" checked={clip.muted} onChange={(v) => ctx.mutate((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) c.muted = v; })} />
          <SliderRow label="بلندی صدا" value={clip.volume} min={0} max={2} step={0.05} onChange={(v) => ctx.mutate((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) c.volume = v; })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Fade In صدا" value={clip.fadeIn} min={0} max={3} step={0.1} onChange={(v) => ctx.mutate((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) c.fadeIn = v; })} fmt={(v) => `${v.toFixed(1)}s`} />
          <SliderRow label="Fade Out صدا" value={clip.fadeOut} min={0} max={3} step={0.1} onChange={(v) => ctx.mutate((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) c.fadeOut = v; })} fmt={(v) => `${v.toFixed(1)}s`} />
        </>
      )}
    </div>
  );
}

// ── look: filter presets + manual grading ──

export function ClipLookSheet({ ctx }: { ctx: EditorCtx }) {
  const { clip, overlay } = useSelected(ctx);
  const target = clip ?? overlay;
  if (!target) return <EmptyHint />;
  const f = target.filter;
  const isClip = !!clip;

  const setF = (patch: Partial<FilterState>) => {
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

  const previewStyle = { filter: cssFilter({ ...DEFAULT_FILTER, ...f, blur: 0 }, 0.2) };

  return (
    <div className="space-y-4">
      <SectionTitle>فیلترهای آماده</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {FILTER_PRESETS.map((pr) => (
          <button
            key={pr.id}
            onClick={() => setF({ ...DEFAULT_FILTER, ...pr.state, presetId: pr.id })}
            className={`rounded-xl border p-2 text-center text-[10px] space-y-1 ${
              f.presetId === pr.id ? "border-primary bg-primary/10" : "border-border bg-secondary/50"
            }`}
          >
            <div
              className="h-10 rounded-lg bg-gradient-to-br from-orange-400 via-rose-400 to-violet-500"
              style={{ filter: cssFilter({ ...DEFAULT_FILTER, ...pr.state, blur: 0 }, 0.2) }}
            />
            <span>{pr.emoji} {pr.name}</span>
          </button>
        ))}
      </div>

      <SectionTitle>تنظیم دستی رنگ (Color Wheel پرو)</SectionTitle>
      <SliderRow label="روشنایی (Exposure)" value={f.brightness} min={50} max={160} onChange={(v) => setF({ brightness: v, presetId: "custom" })} fmt={(v) => `${v}%`} />
      <SliderRow label="کنتراست" value={f.contrast} min={50} max={170} onChange={(v) => setF({ contrast: v, presetId: "custom" })} fmt={(v) => `${v}%`} />
      <SliderRow label="اشباع رنگ" value={f.saturate} min={0} max={200} onChange={(v) => setF({ saturate: v, presetId: "custom" })} fmt={(v) => `${v}%`} />
      <SliderRow label="دما (گرم ↔ سرد)" value={f.temp} min={-100} max={100} onChange={(v) => setF({ temp: v, presetId: "custom" })} />
      <SliderRow label="تینت (Hue)" value={f.hue} min={-180} max={180} onChange={(v) => setF({ hue: v, presetId: "custom" })} fmt={(v) => `${v}°`} />
      <SliderRow label="سپیا" value={f.sepia} min={0} max={100} onChange={(v) => setF({ sepia: v, presetId: "custom" })} fmt={(v) => `${v}%`} />
      <SliderRow label="بلور" value={f.blur} min={0} max={12} step={0.5} onChange={(v) => setF({ blur: v, presetId: "custom" })} fmt={(v) => `${v}px`} />
      <SliderRow label="وینیت (تاریکی گوشه‌ها)" value={f.vignette} min={0} max={1} step={0.05} onChange={(v) => setF({ vignette: v, presetId: "custom" })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <Button variant="outline" size="sm" className="w-full" onClick={() => setF({ ...DEFAULT_FILTER })}>
        بازنشانی رنگ
      </Button>
      <span className="hidden" style={previewStyle} />
    </div>
  );
}

// ── motion: transform ──

export function ClipMotionSheet({ ctx }: { ctx: EditorCtx }) {
  const { clip, overlay } = useSelected(ctx);
  const target = clip ?? overlay;
  if (!target) return <EmptyHint />;
  const t = target.transform;
  const isClip = !!clip;

  const setT = (patch: Partial<TransformState>) => {
    ctx.mutate((p) => {
      if (isClip) {
        const c = p.clips.find((x) => x.id === (clip as Clip).id);
        if (c) c.transform = { ...c.transform, ...patch };
      } else {
        const o = p.overlays.find((x) => x.id === (overlay as OverlayItem).id);
        if (o) o.transform = { ...o.transform, ...patch };
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => setT({ flipH: !t.flipH })} className={t.flipH ? "border-primary text-primary" : ""}>
          ↔ قرینه افقی
        </Button>
        <Button variant="outline" size="sm" onClick={() => setT({ flipV: !t.flipV })} className={t.flipV ? "border-primary text-primary" : ""}>
          ↕ قرینه عمودی
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => setT({ rotate: (t.rotate + 90) % 360 })}>
          ↻ چرخش ۹۰°
        </Button>
        <Button variant="outline" size="sm" onClick={() => setT({ rotate: (t.rotate + 270) % 360 })}>
          ↺ چرخش ۲۷۰°
        </Button>
      </div>
      <SliderRow label="بزرگ‌نمایی (زوم)" value={t.scale} min={0.2} max={3} step={0.02} onChange={(v) => setT({ scale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="چرخش دلخواه" value={t.rotate} min={-180} max={180} onChange={(v) => setT({ rotate: v })} fmt={(v) => `${v}°`} />
      <SliderRow label="جابه‌جایی افقی" value={t.x} min={-1} max={1} step={0.01} onChange={(v) => setT({ x: v })} fmt={(v) => v.toFixed(2)} />
      <SliderRow label="جابه‌جایی عمودی" value={t.y} min={-1} max={1} step={0.01} onChange={(v) => setT({ y: v })} fmt={(v) => v.toFixed(2)} />
      <SliderRow label="شفافیت" value={t.opacity} min={0.05} max={1} step={0.01} onChange={(v) => setT({ opacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <Button variant="outline" size="sm" className="w-full" onClick={() => setT({ ...DEFAULT_TRANSFORM })}>
        بازنشانی کادر
      </Button>
    </div>
  );
}

// ── crop واقعی (P0-M1): برش منبع که در پیش‌نمایش و خروجی هر دو اعمال می‌شود ──

export function CropSheet({ ctx }: { ctx: EditorCtx }) {
  const { clip, overlay } = useSelected(ctx);
  const target = clip ?? overlay;
  const isClip = !!clip;
  if (!target) return <EmptyHint />;
  const crop: CropState = target.crop ?? DEFAULT_CROP;
  const active = isCropped(crop);

  const setC = (patch: Partial<CropState>) => {
    ctx.mutate((p) => {
      if (isClip) {
        const c = p.clips.find((x) => x.id === (clip as Clip).id);
        if (c) c.crop = sanitizeCrop({ ...(c.crop ?? DEFAULT_CROP), ...patch });
      } else {
        const o = p.overlays.find((x) => x.id === (overlay as OverlayItem).id);
        if (o) o.crop = sanitizeCrop({ ...(o.crop ?? DEFAULT_CROP), ...patch });
      }
    });
  };

  // پرست نسبت‌دار: کراپ وسط‌چین با نسبتِ فریم خروجی (برای کلیپ با ابعاد واقعی منبع)
  const presetAspect = (aw: number, ah: number) => {
    const srcW = clip?.srcW || 1080;
    const srcH = clip?.srcH || 1920;
    const srcAspect = srcW / srcH;
    const want = aw / ah;
    // کراپ = بزرگ‌ترین مستطیل وسط‌چین با نسبت want داخل منبع
    let w = 1;
    let h = 1;
    if (srcAspect > want) {
      w = want / srcAspect;
    } else {
      h = srcAspect / want;
    }
    const x = (1 - w) / 2;
    const y = (1 - h) / 2;
    setC({ x, y, w, h });
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground leading-5">
        کراپ واقعی: لبه‌ها از منبع حذف می‌شوند و در فایل خروجی هم نمی‌آیند (برخلاف زوم). پیش‌نمایش همان لحظه به‌روز می‌شود.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[ASPECTS.map((a) => ({ id: a.id, w: a.w, h: a.h, name: a.name }))].flat().map((a) => (
          <button
            key={a.id}
            onClick={() => presetAspect(a.w, a.h)}
            className={`text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary/60 hover:border-primary`}
          >
            {a.name}
          </button>
        ))}
        <button onClick={() => setC({ ...DEFAULT_CROP })} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary/60">
          حذف کراپ
        </button>
      </div>
      <SliderRow label="کراپ از چپ" value={crop.x} min={0} max={0.9} step={0.01} onChange={(v) => setC({ x: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="کراپ از بالا" value={crop.y} min={0} max={0.9} step={0.01} onChange={(v) => setC({ y: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="عرض کراپ" value={crop.w} min={0.1} max={1} step={0.01} onChange={(v) => setC({ w: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <SliderRow label="ارتفاع کراپ" value={crop.h} min={0.1} max={1} step={0.01} onChange={(v) => setC({ h: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <div className={`text-center text-xs rounded-lg py-2 ${active ? "bg-primary/10 text-primary" : "bg-secondary/40 text-muted-foreground"}`}>
        {active ? `کراپ فعال: ${Math.round(crop.w * crop.h * 100)}٪ از فریم منبع` : "کراپی فعال نیست"}
      </div>
    </div>
  );
}

// ── chroma key ──

const CHROMA_SWATCHES = ["#00b140", "#0047bb", "#ff00ff", "#ffffff", "#000000"];

export function ChromaSheet({ ctx }: { ctx: EditorCtx }) {
  const { clip, overlay } = useSelected(ctx);
  const target = clip ?? overlay;
  if (!target) return <EmptyHint />;
  const ch = target.chroma;
  const isClip = !!clip;
  const setCh = (patch: Partial<typeof ch>) => {
    ctx.mutate((p) => {
      if (isClip) {
        const c = p.clips.find((x) => x.id === (clip as Clip).id);
        if (c) c.chroma = { ...c.chroma, ...patch };
      } else {
        const o = p.overlays.find((x) => x.id === (overlay as OverlayItem).id);
        if (o) o.chroma = { ...o.chroma, ...patch };
      }
    });
  };
  return (
    <div className="space-y-4">
      <SwitchRow label="حذف پس‌زمینه با رنگ (پرده سبز)" checked={ch.enabled} onChange={(v) => setCh({ enabled: v })} />
      {ch.enabled && (
        <>
          <SectionTitle>رنگ حذف‌شونده</SectionTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {CHROMA_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setCh({ color: c })}
                className={`w-9 h-9 rounded-lg border-2 ${ch.color === c ? "border-primary" : "border-white/20"}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
            <input type="color" value={ch.color} onChange={(e) => setCh({ color: e.target.value })} className="w-10 h-9 rounded-lg bg-transparent border border-border" />
          </div>
          <SliderRow label="حساسیت حذف" value={ch.similarity} min={0.05} max={0.9} step={0.01} onChange={(v) => setCh({ similarity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="نرمی لبه" value={ch.smoothness} min={0} max={0.5} step={0.01} onChange={(v) => setCh({ smoothness: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <p className="text-[11px] text-muted-foreground leading-5">💡 برای نتیجه بهتر، حساسیت را کم‌کم زیاد کن تا فقط پس‌زمینه حذف شود و سوژه سالم بماند.</p>
        </>
      )}
    </div>
  );
}

// ── aspect ──

export function AspectSheet({ ctx }: { ctx: EditorCtx }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {ASPECTS.map((a) => (
        <button
          key={a.id}
          onClick={() => { ctx.mutate((p) => { p.aspect = a.id; }); ctx.closeSheet(); }}
          className={`rounded-2xl border p-3 text-center ${ctx.project.aspect === a.id ? "border-primary bg-primary/10" : "border-border bg-secondary/50"}`}
        >
          <div
            className="mx-auto mb-2 rounded-md border border-white/25 bg-white/5"
            style={{ width: a.w >= a.h ? 44 : (44 * a.w) / a.h, height: a.h > a.w ? 44 : (44 * a.h) / a.w }}
          />
          <div className="text-sm font-bold">{a.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{a.hint}</div>
        </button>
      ))}
    </div>
  );
}

function EmptyHint() {
  return (
    <p className="text-sm text-muted-foreground text-center py-6">
      اول از تایم‌لاین یک کلیپ یا لایه را انتخاب کن.
    </p>
  );
}

// ── تعویض منبع کلیپ/لایه با رسانهٔ هم‌نوع از کتابخانه (P1-M2) ──
function ReplaceSourceRow({ ctx }: { ctx: EditorCtx }) {
  const { clip, overlay } = useSelected(ctx);
  const target = clip ?? overlay;
  if (!target) return null;
  const candidates = [...ctx.assets.values()].filter((a) =>
    target.kind === "video" ? a.type === "video" : a.type === "image"
  );
  const apply = (assetId: string) => {
    const asset = ctx.assets.get(assetId);
    if (!asset) return;
    ctx.mutate((p) => {
      const c = clip ? p.clips.find((x) => x.id === clip.id) : null;
      const o = overlay ? p.overlays.find((x) => x.id === overlay.id) : null;
      if (c) {
        const res = replaceSource(
          { assetId: c.assetId, kind: c.kind, in: c.in, out: c.out, srcDur: c.srcDur, speed: c.speed },
          asset.id,
          asset.type === "image" ? "image" : "video",
          asset.duration || 10
        );
        if (!res.ok) return;
        c.assetId = asset.id;
        c.name = asset.name;
        c.srcDur = asset.duration || 10;
      } else if (o) {
        if (asset.type === "image" ? o.kind !== "image" : o.kind !== "video") {
          ctx.toast("نوع رسانه باید همان نوع قبلی باشد", "error");
          return;
        }
        o.assetId = asset.id;
        o.name = asset.name;
        if (o.kind === "video") o.srcDur = asset.duration || o.srcDur;
      }
    });
    ctx.toast(`منبع تعویض شد: ${asset.name}`, "success");
  };
  return (
    <div className="space-y-2">
      {candidates.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">رسانهٔ هم‌نوعی در کتابخانه نیست — اول از «رسانه» وارد کن.</p>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1.5">
          {candidates.map((a) => (
            <button
              key={a.id}
              onClick={() => apply(a.id)}
              className={`w-full text-right text-xs px-3 py-2 rounded-lg border ${target.assetId === a.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/50"} ${a.id === target.assetId ? "opacity-60 pointer-events-none" : ""}`}
            >
              {a.type === "video" ? "🎬" : "🖼️"} {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
