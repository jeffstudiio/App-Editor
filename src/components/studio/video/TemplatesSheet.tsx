"use client";

// Ready-made edit templates gallery — applies an original editorial recipe
// (aspect + filter + caption preset + transitions + title + tips) in one tap.
import { Button } from "@/components/ui/button";
import { LayoutTemplate, Check } from "lucide-react";
import {
  DEFAULT_FILTER,
  FILTER_PRESETS,
  uid,
  type TextItem,
} from "@/lib/video/types";
import { setBoundaryTransition } from "@/lib/video/edit-ops";
import { SUBTITLE_PRESETS } from "@/lib/studio-data";
import { EDIT_TEMPLATES, type EditTemplate } from "@/lib/video/templates";
import type { EditorCtx } from "./ctx";
import { captionTextItem } from "./caption-utils";

export function TemplatesSheet({ ctx }: { ctx: EditorCtx }) {
  const hasClips = ctx.project.clips.length > 0;

  const apply = (tpl: EditTemplate) => {
    if (!hasClips) {
      ctx.toast("اول حداقل یک کلیپ به تایم‌لاین اضافه کن، بعد تمپلیت بزن", "error");
      return;
    }
    ctx.mutate((p) => {
      // 1) aspect
      p.aspect = tpl.aspect;
      // 2) filter on every clip + ترنزیشن قالب روی مرزها (مدل Edit-Point)
      const fp = FILTER_PRESETS.find((x) => x.id === tpl.filterPresetId);
      for (const c of p.clips) {
        if (fp) c.filter = { ...DEFAULT_FILTER, ...fp.state, presetId: fp.id };
      }
      if (tpl.transition) {
        for (let i = 1; i < p.clips.length; i++) {
          setBoundaryTransition(p, p.clips[i - 1].id, p.clips[i].id, { ...tpl.transition }, () => uid("tr"));
        }
      } else {
        p.transitions = [];
      }
      // 3) title
      if (tpl.title) {
        p.texts.push({
          ...captionTextItem(tpl.title, 0.2, 0.2 + tpl.titleDur),
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
      // 4) caption preset patch
      const capPr = SUBTITLE_PRESETS.find((x) => x.id === tpl.captionPresetId);
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
    ctx.toast(`تمپلیت «${tpl.name}» اعمال شد ✅`, "success");
    ctx.closeSheet();
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground leading-5">
        یک دستور تدوین آماده انتخاب کن؛ ابعاد، فیلتر، ترنزیشن، تمپلیت زیرنویس و تیتر همه با هم اعمال می‌شوند. بعدش می‌توانی هر جزئیات را دستی عوض کنی.
      </p>

      {!hasClips && (
        <p className="text-[11px] text-amber-300/90 bg-amber-400/10 border border-amber-400/25 rounded-xl p-2.5">
          هنوز کلیپی روی تایم‌لاین نیست — اول از دکمه «رسانه» ویدئو/عکس اضافه کن.
        </p>
      )}

      <div className="grid gap-2">
        {EDIT_TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className="rounded-2xl border border-border bg-secondary/40 p-3.5 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-bold flex items-center gap-1.5">
                  <span>{tpl.emoji}</span> {tpl.name}
                  <span className="text-[10px] font-normal text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
                    {tpl.aspect}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-5">{tpl.desc}</p>
              </div>
              <Button
                size="sm"
                onClick={() => apply(tpl)}
                className="shrink-0 h-8 rounded-xl text-[11px] gap-1"
                variant={hasClips ? "default" : "secondary"}
              >
                {hasClips ? <Check size={13} /> : <LayoutTemplate size={13} />}
                اعمال
              </Button>
            </div>
            <ul className="text-[10px] text-muted-foreground leading-5 list-disc ps-4 space-y-0.5">
              {tpl.tips.slice(0, 2).map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
