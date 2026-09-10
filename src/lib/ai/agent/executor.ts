// ─────────────────────────────────────────────────────────────
// Agent Executor — اجرای plan روی Project
// sync: خالص و تست‌پذیر (بدون DOM) | async: با سرویس‌های واقعی UI
// هر عملیات نتیجهٔ صادقانه برمی‌گرداند — عملیات ناموفق گزارش می‌شود
// ─────────────────────────────────────────────────────────────

import { removeKeyAt, upsertKey, type KfProp } from "@/lib/video/keyframes";
import { clipToOverlayPayload, overlayToMainInsert, replaceSource } from "@/lib/video/edit-ops";
import {
  clipDur, clipStart, uid,
  DEFAULT_CHROMA, sanitizeCrop,
  type AudioItem, type Clip, type FilterState, type MediaAsset,
  type Project, type TextItem, type TransitionType,
} from "@/lib/video/types";
import { FILTER_PRESETS } from "@/lib/video/types";
import { SUBTITLE_PRESETS } from "@/lib/studio-data";
import type { PlanContextSnapshot } from "./plan-schema";

export interface CommandResult {
  tool: string;
  ok: boolean;
  message: string; // فارسی — برای گزارش UI
}

export interface SnapshotClip {
  id: string;
  name: string;
  kind: string;
  timelineStart: number;
  dur: number;
}

/** ساخت snapshot سبک از پروژه برای planner/validator (assets برای replace_clip) */
export function buildSnapshot(p: Project, assets?: MediaAsset[]): PlanContextSnapshot {
  let acc = 0;
  const clips: SnapshotClip[] = p.clips.map((c) => {
    const d = clipDur(c);
    const s = { id: c.id, name: c.name, kind: c.kind, timelineStart: acc, dur: d };
    acc += d;
    return s;
  });
  return {
    aspect: p.aspect,
    duration: acc,
    clipIds: p.clips.map((c) => c.id),
    clips,
    textItems: p.texts.map((t) => ({ id: t.id, role: t.isCaption ? ("caption" as const) : ("title" as const), start: t.start })),
    audioItems: p.audios.map((a) => ({ id: a.id, name: a.name, start: a.start })),
    hasCaptions: p.texts.some((t) => t.isCaption),
    hasMusic: p.audios.some((a) => !a.fromTts),
    allItemIds: [...p.clips, ...p.overlays, ...p.texts, ...p.audios].map((i) => i.id),
    overlayIds: p.overlays.map((o) => o.id),
    assets: (assets ?? []).map((a) => ({ id: a.id, name: a.name, type: a.type, duration: a.duration })),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ─────────────────────────────────────────────────────────────
// SYNC executor — روی Project خالص کار می‌کند (داخل mutate صدا زده می‌شود)
// ─────────────────────────────────────────────────────────────

export function applySyncCommand(
  p: Project,
  op: Record<string, unknown>,
  ctx?: { assets?: MediaAsset[] }
): CommandResult {
  const assets = ctx?.assets;
  try {
    switch (op.tool) {
      case "set_aspect": {
        p.aspect = op.aspect as Project["aspect"];
        return { tool: "set_aspect", ok: true, message: `نسبت تصویر شد ${op.aspect}` };
      }

      case "apply_filter": {
        const presetId = op.preset as string;
        const preset = FILTER_PRESETS.find((f) => f.id === presetId);
        if (!preset) return { tool: "apply_filter", ok: false, message: `فیلتر ${presetId} پیدا نشد` };
        const applyTo = (c: Clip) => {
          c.filter = { ...c.filter, ...preset.state, presetId } as FilterState;
        };
        if (op.target === "clip" && typeof op.clipId === "string") {
          const c = p.clips.find((x) => x.id === op.clipId);
          if (!c) return { tool: "apply_filter", ok: false, message: "کلیپ پیدا نشد" };
          applyTo(c);
        } else {
          p.clips.forEach(applyTo);
          p.overlays.forEach((o) => {
            o.filter = { ...o.filter, ...preset.state, presetId } as FilterState;
          });
        }
        return { tool: "apply_filter", ok: true, message: `فیلتر ${presetId} اعمال شد` };
      }

      case "adjust_color": {
        const num = (k: string) => (typeof op[k] === "number" ? (op[k] as number) : null);
        // FilterState مقادیر مطلق ۱۰۰-نرمال دارد: brightness/contrast 50..160،
        // saturate 0..200، temp -100..100، vignette 0..1 (دلتاها روش اعمال می‌شوند)
        const applyTo = (f: FilterState): FilterState => ({
          ...f,
          presetId: "custom",
          brightness: clamp(f.brightness + (num("brightness") ?? 0), 50, 160),
          contrast: clamp(f.contrast + (num("contrast") ?? 0), 50, 160),
          saturate: clamp(f.saturate + (num("saturate") ?? 0), 0, 200),
          temp: clamp(f.temp + (num("temp") ?? 0), -100, 100),
          vignette: clamp(f.vignette + (num("vignette") ?? 0) / 100, 0, 1),
        });
        if (op.target === "clip" && typeof op.clipId === "string") {
          const c = p.clips.find((x) => x.id === op.clipId);
          if (!c) return { tool: "adjust_color", ok: false, message: "کلیپ پیدا نشد" };
          c.filter = applyTo(c.filter);
        } else {
          p.clips.forEach((c) => (c.filter = applyTo(c.filter)));
        }
        return { tool: "adjust_color", ok: true, message: "تنظیم رنگ اعمال شد" };
      }

      case "add_title": {
        const text = String(op.text);
        const start = Math.max(0, Number(op.start ?? 0));
        const dur = clamp(Number(op.dur ?? 3), 0.5, 15);
        const t: TextItem = {
          id: uid("tx"),
          text,
          start,
          end: start + dur,
          x: 0.5,
          y: 0.24,
          font: "Lalezar",
          weight: 900,
          size: clamp(Number(op.size ?? 86), 24, 160),
          color: String(op.color ?? "#ffffff"),
          accent: "#facc15",
          strokeColor: "#000000",
          strokeW: 10,
          bgColor: "#000000",
          bgOpacity: 0,
          shadow: true,
          gradient: false,
          animIn: (op.animIn as TextItem["animIn"]) ?? "pop",
          animOut: "none",
          rotate: 0,
          opacity: 1,
          karaoke: false,
          isCaption: false,
        };
        p.texts.push(t);
        return { tool: "add_title", ok: true, message: `عنوان «${text.slice(0, 20)}» اضافه شد` };
      }

      case "style_titles": {
        let n = 0;
        for (const t of p.texts) {
          if (t.isCaption) continue;
          n++;
          if (typeof op.size === "number") t.size = clamp(op.size, 24, 160);
          if (typeof op.color === "string") t.color = op.color;
          if (op.font === "Vazirmatn" || op.font === "Lalezar") t.font = op.font;
          if (typeof op.animIn === "string") t.animIn = op.animIn as TextItem["animIn"];
        }
        return n
          ? { tool: "style_titles", ok: true, message: `${n} عنوان استایل گرفت` }
          : { tool: "style_titles", ok: false, message: "عنوانی در پروژه نیست" };
      }

      case "set_caption_style": {
        const preset = SUBTITLE_PRESETS.find((s) => s.id === op.preset);
        if (!preset) return { tool: "set_caption_style", ok: false, message: "قالب زیرنویس پیدا نشد" };
        let n = 0;
        for (const t of p.texts) {
          if (!t.isCaption) continue;
          n++;
          const pr = preset.style;
          t.font = pr.fontFamily === "Lalezar" ? "Lalezar" : "Vazirmatn";
          t.weight = pr.fontWeight;
          t.size = pr.fontSize;
          t.color = pr.color;
          t.strokeColor = pr.strokeColor;
          t.strokeW = pr.strokeWidth;
          t.bgColor = pr.bgColor;
          t.bgOpacity = pr.bgOpacity;
          t.shadow = pr.shadow;
          t.gradient = pr.gradient;
          t.y = pr.yPercent / 100;
        }
        return n
          ? { tool: "set_caption_style", ok: true, message: `قالب زیرنویس شد ${preset.id}` }
          : { tool: "set_caption_style", ok: false, message: "زیرنویسی در پروژه نیست — اول زیرنویس بساز" };
      }

      case "clear_captions": {
        const before = p.texts.length;
        p.texts = p.texts.filter((t) => !t.isCaption);
        const removed = before - p.texts.length;
        return { tool: "clear_captions", ok: removed > 0, message: removed ? `${removed} زیرنویس حذف شد` : "زیرنویسی نبود" };
      }

      case "trim_clip": {
        const c = p.clips.find((x) => x.id === op.clipId);
        if (!c) return { tool: "trim_clip", ok: false, message: "کلیپ پیدا نشد" };
        const startAbs = clipStart(p, c.id);
        const dur = clipDur(c);
        const wantStart = typeof op.start === "number" ? Math.max(0, op.start) : startAbs;
        const wantEnd = typeof op.end === "number" ? op.end : startAbs + dur;
        if (wantEnd - wantStart < 0.25) {
          return { tool: "trim_clip", ok: false, message: "بازهٔ تریم خیلی کوتاه است (حداقل ۰.۲۵ ثانیه)" };
        }
        const dtLeft = wantStart - startAbs; // ثانیهٔ تایم‌لاین
        const srcShift = dtLeft * c.speed;
        const inN = clamp(c.in + srcShift, 0, c.out - 0.2);
        const outN = c.kind === "image" ? c.in + (wantEnd - wantStart) * c.speed : clamp(inN + (wantEnd - wantStart) * c.speed, inN + 0.2, c.srcDur);
        if (c.kind !== "image" && inN + 0.2 > c.srcDur) {
          return { tool: "trim_clip", ok: false, message: "بازهٔ درخواستی از طول کلیپ بیرون است" };
        }
        c.in = inN;
        c.out = outN;
        return { tool: "trim_clip", ok: true, message: `کلیپ تریم شد (${wantStart.toFixed(1)}–${wantEnd.toFixed(1)}s)` };
      }

      case "split_clip": {
        const at = Number(op.at);
        let acc = 0;
        for (let i = 0; i < p.clips.length; i++) {
          const c = p.clips[i];
          const d = clipDur(c);
          if (at > acc + 0.25 && at < acc + d - 0.25) {
            const leftTimeline = at - acc;
            const splitSrc = c.in + leftTimeline * c.speed;
            const right: Clip = {
              ...structuredClone(c),
              id: uid("clip"),
              in: splitSrc,
              out: c.out,
              transitionIn: { type: "none", dur: 0 },
              reverse: undefined,
            };
            c.out = splitSrc;
            p.clips.splice(i + 1, 0, right);
            return { tool: "split_clip", ok: true, message: `کلیپ در ${at.toFixed(1)}s بریده شد` };
          }
          acc += d;
        }
        return { tool: "split_clip", ok: false, message: "نقطهٔ برش روی هیچ کلیپی نمی‌افتد" };
      }

      case "remove_clip": {
        const i = p.clips.findIndex((x) => x.id === op.clipId);
        if (i < 0) return { tool: "remove_clip", ok: false, message: "کلیپ پیدا نشد" };
        p.clips.splice(i, 1);
        return { tool: "remove_clip", ok: true, message: "کلیپ حذف شد" };
      }

      case "move_clip": {
        const i = p.clips.findIndex((x) => x.id === op.clipId);
        if (i < 0) return { tool: "move_clip", ok: false, message: "کلیپ پیدا نشد" };
        const idx = clamp(Number(op.index), 0, p.clips.length - 1);
        const [c] = p.clips.splice(i, 1);
        p.clips.splice(idx, 0, c);
        return { tool: "move_clip", ok: true, message: `کلیپ به جایگاه ${idx + 1} رفت` };
      }

      case "duplicate_clip": {
        const i = p.clips.findIndex((x) => x.id === op.clipId);
        if (i < 0) return { tool: "duplicate_clip", ok: false, message: "کلیپ پیدا نشد" };
        const copy: Clip = { ...structuredClone(p.clips[i]), id: uid("clip") };
        p.clips.splice(i + 1, 0, copy);
        return { tool: "duplicate_clip", ok: true, message: "کلیپ تکثیر شد" };
      }

      case "change_speed": {
        const c = p.clips.find((x) => x.id === op.clipId);
        if (!c) return { tool: "change_speed", ok: false, message: "کلیپ پیدا نشد" };
        c.speed = clamp(Number(op.speed), 0.25, 4);
        return { tool: "change_speed", ok: true, message: `سرعت ×${c.speed}` };
      }

      case "crop_clip": {
        const c = p.clips.find((x) => x.id === op.clipId);
        if (!c) return { tool: "crop_clip", ok: false, message: "کلیپ پیدا نشد" };
        c.crop = sanitizeCrop({ x: op.x, y: op.y, w: op.w, h: op.h });
        return { tool: "crop_clip", ok: true, message: `کراپ شد (${Math.round(c.crop.w * 100)}×${Math.round(c.crop.h * 100)}٪ منبع)` };
      }

      case "reset_crop": {
        const c = p.clips.find((x) => x.id === op.clipId);
        if (!c) return { tool: "reset_crop", ok: false, message: "کلیپ پیدا نشد" };
        if (!c.crop) return { tool: "reset_crop", ok: false, message: "این کلیپ کراپ نداشت" };
        c.crop = undefined;
        return { tool: "reset_crop", ok: true, message: "کراپ حذف شد" };
      }

      case "replace_clip": {
        const c = p.clips.find((x) => x.id === op.clipId);
        if (!c) return { tool: "replace_clip", ok: false, message: "کلیپ پیدا نشد" };
        const asset = (assets ?? []).find((a) => a.id === op.assetId);
        if (!asset) return { tool: "replace_clip", ok: false, message: "رسانهٔ جایگزین در کتابخانه نیست" };
        const res = replaceSource(
          { assetId: c.assetId, kind: c.kind, in: c.in, out: c.out, srcDur: c.srcDur, speed: c.speed },
          asset.id,
          asset.type === "image" ? "image" : "video",
          asset.duration || 10
        );
        if (!res.ok) return { tool: "replace_clip", ok: false, message: res.message };
        c.assetId = asset.id;
        c.name = asset.name;
        c.srcDur = asset.duration || 10;
        return { tool: "replace_clip", ok: true, message: `منبع کلیپ شد «${asset.name}»` };
      }

      case "to_overlay": {
        const i = p.clips.findIndex((x) => x.id === op.clipId);
        if (i < 0) return { tool: "to_overlay", ok: false, message: "کلیپ پیدا نشد" };
        const c = p.clips[i];
        let tlStart = 0;
        for (let k = 0; k < i; k++) tlStart += clipDur(p.clips[k]);
        const payload = clipToOverlayPayload(
          {
            id: c.id, kind: c.kind, assetId: c.assetId, name: c.name, in: c.in, out: c.out,
            speed: c.speed, srcDur: c.srcDur, transform: c.transform, filter: c.filter, chroma: c.chroma,
            mask: c.mask, crop: c.crop, kf: c.kf,
          },
          tlStart
        );
        p.clips.splice(i, 1);
        p.overlays.push({
          id: uid("ov"),
          kind: payload.kind,
          assetId: payload.assetId,
          name: payload.name,
          start: payload.start,
          dur: payload.dur,
          srcIn: payload.srcIn,
          srcDur: payload.srcDur,
          transform: payload.transform as Clip["transform"],
          filter: payload.filter as Clip["filter"],
          chroma: payload.chroma as Clip["chroma"],
          mask: payload.mask as Clip["mask"],
          crop: payload.crop as Clip["crop"],
          kf: payload.kf as Clip["kf"],
        });
        return { tool: "to_overlay", ok: true, message: `کلیپ به لایهٔ رویی در ${tlStart.toFixed(1)}s رفت` };
      }

      case "to_main_track": {
        const oi = p.overlays.findIndex((x) => x.id === op.id);
        if (oi < 0) return { tool: "to_main_track", ok: false, message: "لایهٔ رویی پیدا نشد" };
        const ov = p.overlays[oi];
        const outSrc = ov.kind === "video" ? Math.min(ov.srcDur, ov.srcIn + ov.dur) : ov.srcIn + ov.dur;
        const newClip: Clip = {
          id: uid("clip"),
          kind: ov.kind,
          assetId: ov.assetId,
          name: ov.name,
          in: ov.srcIn,
          out: outSrc,
          speed: 1,
          transform: { ...ov.transform },
          filter: { ...ov.filter },
          chroma: { ...ov.chroma },
          mask: ov.mask ? { ...ov.mask } : undefined,
          crop: ov.crop ? { ...ov.crop } : undefined,
          volume: 1,
          muted: ov.kind !== "video",
          fadeIn: 0,
          fadeOut: 0,
          transitionIn: { type: "none", dur: 0 },
          srcDur: ov.kind === "video" ? ov.srcDur : ov.dur,
          srcW: 1080,
          srcH: 1920,
          kf: ov.kf ? structuredClone(ov.kf) : undefined,
        };
        const res = overlayToMainInsert(
          p.clips as unknown as Array<Record<string, unknown> & { id: string }>,
          newClip as unknown as Record<string, unknown> & { id: string },
          ov.start,
          (c) => clipDur(c as unknown as Clip),
          () => uid("clip"),
          ({ clips }, index, srcSplit) => {
            const c = clips[index] as unknown as Clip;
            const right: Clip = { ...structuredClone(c), id: uid("clip"), in: srcSplit, out: c.out, transitionIn: { type: "none", dur: 0 }, reverse: undefined };
            c.out = srcSplit;
            clips.splice(index + 1, 0, right as unknown as Record<string, unknown> & { id: string });
          }
        );
        if (!res.ok) return { tool: "to_main_track", ok: false, message: res.message };
        p.overlays.splice(oi, 1);
        return { tool: "to_main_track", ok: true, message: res.message };
      }

      case "add_transition": {
        const type = op.type as TransitionType;
        const dur = clamp(Number(op.dur ?? 0.5), 0.1, 2);
        const set = (c: Clip) => {
          c.transitionIn = { type, dur };
        };
        if (op.target === "clip" && typeof op.clipId === "string") {
          const c = p.clips.find((x) => x.id === op.clipId);
          if (!c) return { tool: "add_transition", ok: false, message: "کلیپ پیدا نشد" };
          set(c);
        } else {
          p.clips.forEach(set);
        }
        return { tool: "add_transition", ok: true, message: `ترنزیشن ${type === "none" ? "حذف" : type} شد` };
      }

      case "set_fades": {
        const applyTo = (c: Clip) => {
          if (typeof op.fadeIn === "number") c.fadeIn = clamp(op.fadeIn, 0, 5);
          if (typeof op.fadeOut === "number") c.fadeOut = clamp(op.fadeOut, 0, 5);
        };
        if (op.target === "clip" && typeof op.clipId === "string") {
          const c = p.clips.find((x) => x.id === op.clipId);
          if (!c) return { tool: "set_fades", ok: false, message: "کلیپ پیدا نشد" };
          applyTo(c);
        } else {
          p.clips.forEach(applyTo);
        }
        return { tool: "set_fades", ok: true, message: "فیدها تنظیم شد" };
      }

      case "set_volume": {
        const v = clamp(Number(op.volume), 0, 2);
        if (op.target === "audios") {
          p.audios.forEach((a: AudioItem) => (a.volume = v));
          return { tool: "set_volume", ok: true, message: `صدای موسیقی/صداها شد ${v}` };
        }
        p.clips.forEach((c) => (c.volume = v));
        return { tool: "set_volume", ok: true, message: `صدای کلیپ‌ها شد ${v}` };
      }

      case "duck_music": {
        const v = clamp(Number(op.volume ?? 0.25), 0, 1);
        let n = 0;
        for (const a of p.audios) {
          if (a.fromTts) continue; // گویندگی را کم نکن — موسیقی را کم کن
          a.volume = v;
          a.duckCaptions = true;
          n++;
        }
        return n
          ? { tool: "duck_music", ok: true, message: `موسیقی زیر گفتار کم شد (صدا ${v})` }
          : { tool: "duck_music", ok: false, message: "موسیقی/صدایی در پروژه نیست" };
      }

      case "add_marker": {
        p.markers.push({ id: uid("mk"), t: Math.max(0, Number(op.t)), label: String(op.label ?? "") });
        return { tool: "add_marker", ok: true, message: `نشانگر در ${Number(op.t).toFixed(1)}s` };
      }

      case "add_keyframe": {
        const target = [...p.clips, ...p.overlays, ...p.texts].find((i) => i.id === op.id);
        if (!target) return { tool: "add_keyframe", ok: false, message: "آیتم هدف پیدا نشد" };
        const itemStart = "start" in target ? Number((target as TextItem).start) : clipStart(p, target.id);
        const tAbs = Number(op.t);
        const tItem = Math.max(0, tAbs - itemStart);
        const prop = op.prop as KfProp;
        const map = target.kf ?? {};
        map[prop] = upsertKey(map[prop] ?? [], tItem, Number(op.value), (op.ease as never) ?? "inout");
        target.kf = map;
        return { tool: "add_keyframe", ok: true, message: `کی‌فریم ${prop} در ${tAbs.toFixed(1)}s` };
      }

      case "remove_keyframe": {
        const target = [...p.clips, ...p.overlays, ...p.texts].find((i) => i.id === op.id);
        if (!target?.kf?.[op.prop as KfProp]) return { tool: "remove_keyframe", ok: false, message: "کی‌فریمی پیدا نشد" };
        const itemStart = "start" in target ? Number((target as TextItem).start) : clipStart(p, target.id);
        const tItem = Math.max(0, Number(op.t) - itemStart);
        target.kf[op.prop as KfProp] = removeKeyAt(target.kf[op.prop as KfProp]!, tItem);
        return { tool: "remove_keyframe", ok: true, message: "کی‌فریم حذف شد" };
      }

      default:
        return { tool: String(op.tool), ok: false, message: "دستور شناخته‌شده نیست" };
    }
  } catch (err) {
    return { tool: String(op.tool), ok: false, message: `خطای اجرا: ${err instanceof Error ? err.message : "نامشخص"}` };
  }
}

/** اجرای تمام عملیات sync یک plan — یکجا داخل یک mutate (یک undo واحد) */
export function applySyncPlan(
  p: Project,
  operations: Record<string, unknown>[],
  ctx?: { assets?: MediaAsset[] }
): CommandResult[] {
  return operations.map((op) => applySyncCommand(p, op, ctx));
}

// ─────────────────────────────────────────────────────────────
// ASYNC helpers — نتیجهٔ سرویس واقعی را در پروژه می‌نشانند
// UI: سرویس را صدا می‌زند (fetch/importFile واقعی)، بعد این‌ها
// ─────────────────────────────────────────────────────────────

/** موسیقی/صدای واقعیِ import شده را در t مشخص درج می‌کند */
export function insertAudioAsset(p: Project, asset: MediaAsset, start: number, volume = 0.6, fromTts = false): void {
  p.audios.push({
    id: uid("au"),
    assetId: asset.id,
    name: asset.name,
    start: Math.max(0, start),
    in: 0,
    out: asset.duration || 30,
    srcDur: asset.duration || 30,
    volume,
    fadeIn: 0.5,
    fadeOut: 1,
    effect: "none",
    duckCaptions: false,
    fromTts,
  } as AudioItem);
}

/** تصویر تولیدشدهٔ واقعی را کلیپ می‌کند */
export function insertImageAsset(p: Project, asset: MediaAsset, index: number, dur: number): void {
  const clip: Clip = {
    id: uid("clip"),
    kind: "image",
    assetId: asset.id,
    name: asset.name,
    in: 0,
    out: clamp(dur, 0.5, 15),
    speed: 1,
    transform: { scale: 1, x: 0, y: 0, rotate: 0, flipH: false, flipV: false, opacity: 1 },
    chroma: { ...DEFAULT_CHROMA },
    filter: { presetId: "none", brightness: 0, contrast: 0, saturate: 0, hue: 0, blur: 0, sepia: 0, temp: 0, vignette: 0 },
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transitionIn: { type: "fade", dur: 0.4 },
    srcDur: dur,
    srcW: asset.width || 1080,
    srcH: asset.height || 1920,
  };
  p.clips.splice(clamp(index, 0, p.clips.length), 0, clip);
}
