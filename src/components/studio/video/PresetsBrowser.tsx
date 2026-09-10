"use client";

// ─────────────────────────────────────────────────────────────
// Presets Browser (P1 §23-§24) — پریست‌ها فقط روی «آبجکت انتخاب‌شده»
// اعمال می‌شوند؛ هرگز کل پروژه را تغییر نمی‌دهند.
// تب متن (TextItem) / رنگ (FilterState کلیپ/لایه) / حرکت (TextAnim یا کی‌فریم موشن واقعی)
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  ANIM_PRESETS, COLOR_PRESETS, TEXT_PRESETS,
  clipAnimToMotion, colorPresetToFilter,
} from "@/lib/video/presets";
import { cssFilter, } from "@/lib/video/filters";
import { DEFAULT_FILTER, type Clip, type OverlayItem, type TextItem } from "@/lib/video/types";
import type { EditorCtx } from "./ctx";

type Tab = "text" | "color" | "anim";

export function PresetsBrowser({ ctx }: { ctx: EditorCtx }) {
  const [tab, setTab] = useState<Tab>("text");

  const sel = ctx.selection;
  const selectedText = sel?.type === "text" ? ctx.project.texts.find((t) => t.id === sel.id) ?? null : null;
  const selectedClip = sel?.type === "clip" ? ctx.project.clips.find((c) => c.id === sel.id) ?? null : null;
  const selectedOverlay = sel?.type === "overlay" ? ctx.project.overlays.find((o) => o.id === sel.id) ?? null : null;
  const colorTarget: Clip | OverlayItem | null = selectedClip ?? selectedOverlay;
  const durOfClip = colorTarget
    ? "kf" in (colorTarget as Clip) && (colorTarget as Clip).kind !== undefined
      ? Math.max(0.3, (colorTarget as Clip).out - (colorTarget as Clip).in) / ((colorTarget as Clip).kind === "image" ? 1 : (colorTarget as Clip).speed)
      : (colorTarget as OverlayItem).dur
    : 3;

  const applyText = (patch: Partial<TextItem>, name: string) => {
    if (!selectedText) return ctx.toast("اول یک متن را از تایم‌لاین انتخاب کن", "error");
    ctx.mutate((p) => {
      const t = p.texts.find((x) => x.id === selectedText.id);
      if (t) Object.assign(t, patch);
    });
    ctx.toast(`پریست «${name}» روی متن انتخاب‌شده اعمال شد`, "success");
  };

  const applyColor = (id: string, state: Partial<typeof DEFAULT_FILTER>, name: string) => {
    if (!colorTarget) return ctx.toast("اول یک کلیپ یا لایه را انتخاب کن", "error");
    ctx.mutate((p) => {
      if (selectedClip) {
        const c = p.clips.find((x) => x.id === selectedClip.id);
        if (c) c.filter = { ...colorPresetToFilterBase(state), presetId: id === "none" ? "none" : id };
      } else if (selectedOverlay) {
        const o = p.overlays.find((x) => x.id === selectedOverlay.id);
        if (o) o.filter = { ...colorPresetToFilterBase(state), presetId: id === "none" ? "none" : id };
      }
    });
    ctx.toast(`پریست رنگ «${name}» فقط روی همان کلیپ اعمال شد`, "success");
  };

  const applyAnim = (id: string, name: string) => {
    const pr = ANIM_PRESETS.find((x) => x.id === id);
    if (!pr) return;
    if (pr.target === "text") {
      if (!selectedText) return ctx.toast("برای پریست متنی، اول یک متن انتخاب کن", "error");
      ctx.mutate((p) => {
        const t = p.texts.find((x) => x.id === selectedText.id);
        if (t) {
          if (pr.animIn) t.animIn = pr.animIn;
          if (pr.animOut) t.animOut = pr.animOut;
        }
      });
    } else {
      if (!colorTarget) return ctx.toast("برای موشن، اول یک کلیپ یا لایه انتخاب کن", "error");
      const { transform, kf } = clipAnimToMotion(pr.motionId ?? "hold", durOfClip);
      ctx.mutate((p) => {
        if (selectedClip) {
          const c = p.clips.find((x) => x.id === selectedClip.id);
          if (c) {
            c.transform = transform;
            c.kf = kf;
          }
        } else if (selectedOverlay) {
          const o = p.overlays.find((x) => x.id === selectedOverlay.id);
          if (o) {
            o.transform = transform;
            o.kf = kf;
          }
        }
      });
    }
    ctx.toast(`انیمیشن «${name}» اعمال شد`, "success");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {([["text", "متن"], ["color", "رنگ"], ["anim", "انیمیشن"]] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`text-xs py-2 rounded-xl border ${tab === id ? "border-primary bg-primary/15 text-primary font-bold" : "border-border bg-secondary/60"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {!selectedText && !colorTarget && (
        <p className="text-[11px] text-muted-foreground leading-5 rounded-xl bg-secondary/40 border border-border p-2.5">
          پریست‌ها به «آبجکت انتخاب‌شده» اعمال می‌شوند — از تایم‌لاین یک کلیپ، لایه یا متن انتخاب کن. هیچ پریستی کل پروژه را تغییر نمی‌دهد.
        </p>
      )}

      {tab === "text" && (
        <div className="grid grid-cols-2 gap-2">
          {TEXT_PRESETS.map((pr) => (
            <button
              key={pr.id}
              onClick={() => applyText(pr.patch, pr.name)}
              className="rounded-xl border border-border bg-secondary/50 p-2.5 text-center space-y-1.5 hover:border-primary/50 transition-colors"
            >
              <div
                className="text-lg leading-7 truncate px-1"
                style={{
                  fontFamily: pr.patch.font === "Lalezar" ? "Lalezar, Vazirmatn, sans-serif" : "Vazirmatn, sans-serif",
                  fontWeight: pr.patch.weight,
                  color: pr.patch.color,
                  background: pr.patch.bgOpacity ? pr.patch.bgColor : undefined,
                  WebkitTextStroke: pr.patch.strokeW ? `0.6px ${pr.patch.strokeColor}` : undefined,
                  textShadow: pr.patch.shadow ? "0 1px 3px rgba(0,0,0,.8)" : undefined,
                  borderRadius: 6,
                }}
              >
                زیبایی تو
              </div>
              <div className="text-[11px] font-bold">{pr.emoji} {pr.name}</div>
              <div className="text-[9px] text-muted-foreground leading-3">{pr.desc}</div>
            </button>
          ))}
        </div>
      )}

      {tab === "color" && (
        <div className="space-y-3">
          {(["beauty", "main"] as const).map((family) => (
            <section key={family} className="space-y-1.5">
              <h4 className="text-xs font-bold text-accent">{family === "beauty" ? "خانوادهٔ بیوتی" : "پایه"}</h4>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_PRESETS.filter((c) => c.family === family).map((pr) => (
                  <button
                    key={pr.id}
                    onClick={() => applyColor(pr.id, pr.state, pr.name)}
                    className={`rounded-xl border p-1.5 text-center text-[10px] space-y-1 ${colorTarget?.filter.presetId === pr.id ? "border-primary bg-primary/10" : "border-border bg-secondary/50"}`}
                  >
                    <div
                      className="h-10 rounded-lg bg-gradient-to-br from-orange-300 via-rose-300 to-violet-400"
                      style={{ filter: cssFilter({ ...colorPresetToFilterBase(pr.state), blur: 0 }, 0.2) }}
                    />
                    <span>{pr.emoji} {pr.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "anim" && (
        <div className="space-y-3">
          <section className="space-y-1.5">
            <h4 className="text-xs font-bold text-accent">برای متن {selectedText ? "" : "(متن انتخاب کن)"}</h4>
            <div className="grid grid-cols-5 gap-2">
              {ANIM_PRESETS.filter((a) => a.target === "text").map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => applyAnim(pr.id, pr.name)}
                  className="rounded-xl border border-border bg-secondary/50 p-2 text-center text-[10px] space-y-1"
                >
                  <div className="text-base">{pr.emoji}</div>
                  {pr.name}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-1.5">
            <h4 className="text-xs font-bold text-accent">موشن کلیپ/لایه {colorTarget ? "" : "(کلیپ انتخاب کن)"}</h4>
            <div className="grid grid-cols-4 gap-2">
              {ANIM_PRESETS.filter((a) => a.target === "clip").map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => applyAnim(pr.id, pr.name)}
                  className="rounded-xl border border-border bg-secondary/50 p-2 text-center text-[10px] space-y-1"
                >
                  <div className="text-base">{pr.emoji}</div>
                  {pr.name}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function colorPresetToFilterBase(state: Partial<typeof DEFAULT_FILTER>) {
  return { ...DEFAULT_FILTER, ...state };
}
