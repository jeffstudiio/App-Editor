"use client";

// ─────────────────────────────────────────────────────────────
// شیت انیمیشن کلیدی (Keyframe) — برای کلیپ و لایهٔ PiP
// پنج پراپرتی: مقیاس/افقی/عمودی/چرخش/شفافیت
// هر پراپرتی: افزودن کلید روی پلی‌هد، فهرست کلیدها با پرش،
// حذف کلید، چرخش easing روی هر کلید — همهٔ مقادیر واقعی رندر می‌شوند.
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Diamond, Plus, X, RotateCw } from "lucide-react";
import type { EditorCtx } from "./ctx";
import { fmtTime } from "./ctx";
import {
  EASES, KF_PROPS, evalKf, removeKeyAt, upsertKey,
  type KeyframeMap, type KfProp,
} from "@/lib/video/keyframes";
import { clipStart } from "@/lib/video/types";

export function KeyframeSheet({ ctx }: { ctx: EditorCtx }) {
  const { project, selection, time, mutate, seek, closeSheet } = ctx;

  const target = useMemo(() => {
    if (!selection) return null;
    if (selection.type === "clip") {
      const clip = project.clips.find((c) => c.id === selection.id);
      if (!clip) return null;
      return {
        kind: "clip" as const,
        name: clip.name,
        kf: clip.kf,
        localT: time - clipStart(project, clip.id),
        base: clipStart(project, clip.id),
        current: clip.transform,
        itemDur: (() => { let t = 0; for (const c of project.clips) { if (c.id === clip.id) return t + (c.out - c.in) / (c.kind === "image" ? 1 : c.speed); t += (c.out - c.in) / (c.kind === "image" ? 1 : c.speed); } return t; })(),
      };
    }
    if (selection.type === "overlay") {
      const ov = project.overlays.find((o) => o.id === selection.id);
      if (!ov) return null;
      return { kind: "overlay" as const, name: ov.name, kf: ov.kf, localT: time - ov.start, base: ov.start, current: ov.transform, itemDur: ov.dur };
    }
    return null;
  }, [project, selection, time]);

  if (!target) {
    return (
      <div className="p-5 text-center text-xs text-muted-foreground">
        اول یک کلیپ یا لایهٔ PiP انتخاب کن
      </div>
    );
  }

  const updateMap = (prop: KfProp, keys: KeyframeMap[KfProp]) => {
    mutate((p) => {
      if (target.kind === "clip") {
        const c = p.clips.find((x) => x.id === selection?.id);
        if (!c) return;
        const map: KeyframeMap = { ...(c.kf ?? {}) };
        if (keys && keys.length) map[prop] = keys;
        else delete map[prop];
        c.kf = Object.keys(map).length ? map : undefined;
      } else if (target.kind === "overlay") {
        const o = p.overlays.find((x) => x.id === selection?.id);
        if (!o) return;
        const map: KeyframeMap = { ...(o.kf ?? {}) };
        if (keys && keys.length) map[prop] = keys;
        else delete map[prop];
        o.kf = Object.keys(map).length ? map : undefined;
      }
    });
  };

  const total = target.itemDur;

  return (
    <div className="px-4 pb-6 space-y-3" dir="rtl">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        پلی‌هد را جایی ببر، مقدار پراپرتی را با اسلایدر تنظیم کن و «کلید» را بزن — بین کلیدها با ایزینگ انتخابی حرکت می‌کند.
        {target.localT < 0 && <span className="text-amber-300"> ⚠️ پلی‌هد قبل از شروع این آیتم است.</span>}
      </p>
      {KF_PROPS.map((prop) => {
        const keys = target.kf?.[prop.id] ?? [];
        const staticVal = (target.current as unknown as Record<string, number>)[prop.id] ?? prop.def;
        const cur = evalKf(keys, Math.max(0, target.localT), staticVal);
        const active = keys.length > 0;
        return (
          <div key={prop.id} className={`rounded-2xl border p-3 space-y-2 ${active ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-secondary/40"}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <Diamond size={11} className={active ? "text-primary fill-primary" : "text-muted-foreground"} />
                {prop.name}
                {active && <span className="text-[9px] text-primary">{keys.length.toLocaleString("fa-IR")} کلید</span>}
              </span>
              <button
                onClick={() => {
                  const lt = Math.max(0, target.localT);
                  updateMap(prop.id, upsertKey(keys, lt, Math.round(cur * 100) / 100));
                }}
                className="flex items-center gap-1 rounded-full bg-primary/15 border border-primary/40 text-primary px-2.5 py-1 text-[10px]"
              >
                <Plus size={11} /> کلید اینجا
              </button>
            </div>
            <input
              type="range"
              min={prop.min}
              max={prop.max}
              step={(prop.max - prop.min) / 100}
              value={Math.min(prop.max, Math.max(prop.min, cur))}
              onChange={(e) => {
                const v = Number(e.target.value);
                // تغییر زنده: اگر بین دو کلیدیم، نزدیک‌ترین کلید قبل را جابه‌جا می‌کنیم؛ وگرنه مقدار استاتیک
                mutate((p) => {
                  const get = () => (target.kind === "clip" ? p.clips.find((x) => x.id === selection?.id) : p.overlays.find((x) => x.id === selection?.id));
                  const it = get() as { transform: Record<string, number>; kf?: KeyframeMap } | undefined;
                  if (!it) return;
                  const ks = it.kf?.[prop.id];
                  if (ks && ks.length) {
                    const lt = Math.max(0, target.localT);
                    let idx = -1;
                    for (let k = 0; k < ks.length; k++) if (Math.abs(ks[k].t - lt) < 0.09) idx = k;
                    if (idx >= 0) {
                      const next = [...ks];
                      next[idx] = { ...next[idx], v };
                      const map: KeyframeMap = { ...(it.kf ?? {}), [prop.id]: next };
                      it.kf = map;
                      return;
                    }
                  }
                  it.transform[prop.id as keyof typeof it.transform] = v as never;
                });
              }}
              className="w-full accent-[var(--primary)]"
              dir="ltr"
            />
            <div className="text-[9px] text-muted-foreground font-mono" dir="ltr">
              {cur.toFixed(2)}
              {prop.unit}
            </div>
            {active && (
              <div className="flex flex-wrap gap-1">
                {keys.map((k, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-black/40 border border-white/10 pl-1 pr-2 py-0.5 text-[9px]">
                    <button
                      onClick={() => seek(target.base + k.t)}
                      className="font-mono text-white/90"
                      title="پرش به این کلید"
                      dir="ltr"
                    >
                      ◆{k.t.toFixed(2)}s · {k.v.toFixed(2)}
                    </button>
                    <button
                      onClick={() => {
                        const nextEase = EASES[(EASES.findIndex((x) => x.id === k.ease) + 1) % EASES.length];
                        const next = keys.map((x, j) => (j === i ? { ...x, ease: nextEase.id } : x));
                        updateMap(prop.id, next);
                      }}
                      className="text-accent px-0.5"
                      title={`ایزینگ: ${EASES.find((x) => x.id === k.ease)?.name} — کلیک برای عوض کردن`}
                    >
                      <RotateCw size={9} />
                    </button>
                    <button
                      onClick={() => {
                        const next = removeKeyAt(keys, k.t);
                        updateMap(prop.id, next.length ? next : undefined);
                      }}
                      className="text-red-300 p-0.5"
                      title="حذف کلید"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="text-[9px] text-muted-foreground text-center pt-1">
        بازهٔ آیتم: {fmtTime(0)} تا {fmtTime(total)} — کلیدها با گام ۰.۰۵ ثانیه
      </div>
      <button onClick={closeSheet} className="w-full py-2 rounded-xl bg-secondary border border-border text-xs font-bold">
        تمام شد
      </button>
    </div>
  );
}
