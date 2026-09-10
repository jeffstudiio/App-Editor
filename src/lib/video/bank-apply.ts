// ─────────────────────────────────────────────────────────────
// تبدیل تمپلیت بانک → پروژهٔ تدوین واقعی
// اسلات‌های رسانه‌دار کاربر کلیپ می‌شوند؛ اسلات‌های خالی با
// پلاک‌هولدر گرادیانی ساخته می‌شوند تا ریتم تایم‌لاین حفظ شود.
// ─────────────────────────────────────────────────────────────

import type { BankTemplate, Scene } from "@/lib/template-bank/schema";
import {
  DEFAULT_FILTER, DEFAULT_TRANSFORM, FILTER_PRESETS, uid,
  type AudioItem, type Clip, type FilterState, type MediaAsset, type Project,
  type TextItem, type TransformState, type TransitionType,
} from "./types";
import type { Keyframe, KeyframeMap } from "./keyframes";
import type { PendingBankPayload } from "./transfer";

const ASPECT_DIMS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1440, h: 1440 },
  "16:9": { w: 1920, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

const TRANS_MAP: Record<string, { type: TransitionType; dur: number }> = {
  cut: { type: "none", dur: 0 },
  fade: { type: "fade", dur: 0.5 },
  dipBlack: { type: "black", dur: 0.6 },
  dropBlack: { type: "black", dur: 0.5 },
  dipWhite: { type: "fade", dur: 0.5 },
  slideL: { type: "slide", dur: 0.5 },
  slideR: { type: "slide", dur: 0.5 },
  whipL: { type: "slide", dur: 0.4 },
  whipR: { type: "slide", dur: 0.4 },
  wipeUpTr: { type: "slide", dur: 0.5 },
  zoomBlur: { type: "zoom", dur: 0.5 },
  zoomPunch: { type: "zoom", dur: 0.35 },
  spinTr: { type: "zoom", dur: 0.55 },
  flashTr: { type: "fade", dur: 0.3 },
  glitchTr: { type: "fade", dur: 0.4 },
  filmBurnTr: { type: "black", dur: 0.6 },
};

const TEXT_SIZE_PX: Record<string, number> = { sm: 46, md: 72, lg: 104, xl: 140 };
const TEXT_ANIM_MAP: Record<string, TextItem["animIn"]> = {
  fadeUp: "slideUp",
  popIn: "pop",
  bounceIn: "pop",
  zoomText: "pop",
  stampIn: "pop",
  typewriter: "typewriter",
  slideSide: "slideUp",
  wipeUp: "slideUp",
};

// ─────────────────────────────────────────────────────────────
// C2 (P1): موشن قالب ← کی‌فریم واقعی ادیتور
// قبلاً scene.motion در تحویل به ادیتور ساکت دور ریخته می‌شد (MOCK).
// حالا هر موشن بانک به وضعیت شروع + KeyframeMap واقعی ترجمه می‌شود تا
// پیش‌نمایش ادیتور و خروجی MP4 دقیقاً همان حرکتی را ببینند که پخش‌کنندهٔ بانک نشان می‌داد.
// (ارقام عین فرمول‌های motions.ts هستند — CSS % ≈ کسر عرض فریم)
// ─────────────────────────────────────────────────────────────
const kf = (t: number, v: number, ease: Keyframe["ease"] = "out"): Keyframe => ({ t, v, ease });

export function motionTransform(motion: string, dur: number): { transform: TransformState; kf?: KeyframeMap } {
  const D = Math.max(0.2, dur);
  const base = (): TransformState => ({ ...DEFAULT_TRANSFORM });
  switch (motion) {
    case "kenburnsIn":
      return { transform: { ...base(), scale: 1.02 }, kf: { scale: [kf(0, 1.02), kf(D, 1.16)] } };
    case "kenburnsOut":
      return { transform: { ...base(), scale: 1.18 }, kf: { scale: [kf(0, 1.18), kf(D, 1.04)] } };
    case "panL":
      return { transform: { ...base(), scale: 1.16 }, kf: { x: [kf(0, 0), kf(D, 0.06)] } };
    case "panR":
      return { transform: { ...base(), scale: 1.16 }, kf: { x: [kf(0, 0), kf(D, -0.06)] } };
    case "panU":
      return { transform: { ...base(), scale: 1.16 }, kf: { y: [kf(0, 0), kf(D, 0.06)] } };
    case "panD":
      return { transform: { ...base(), scale: 1.16 }, kf: { y: [kf(0, 0), kf(D, -0.06)] } };
    case "driftLU":
      return { transform: { ...base(), scale: 1.2 }, kf: { x: [kf(0, 0), kf(D, 0.04)], y: [kf(0, 0), kf(D, 0.04)] } };
    case "driftRU":
      return { transform: { ...base(), scale: 1.2 }, kf: { x: [kf(0, 0), kf(D, -0.04)], y: [kf(0, 0), kf(D, -0.04)] } };
    case "dollyIn":
      return { transform: { ...base(), scale: 1 }, kf: { scale: [kf(0, 1, "in"), kf(D, 1.22, "in")] } };
    case "dollyOut":
      return { transform: { ...base(), scale: 1.24 }, kf: { scale: [kf(0, 1.24, "in"), kf(D, 1.02, "in")] } };
    case "zoomPulse": {
      // |sin(p·π·4)| — ۴ ضرب؛ نمونه‌برداری روی قله/دره
      const scale: Keyframe[] = [];
      for (let i = 0; i <= 8; i++) {
        const p = i / 8;
        scale.push(kf(p * D, 1.04 + Math.abs(Math.sin(p * Math.PI * 4)) * 0.05, "linear"));
      }
      return { transform: { ...base(), scale: 1.04 }, kf: { scale } };
    }
    case "handheld": {
      // لرزش آهستهٔ دست‌دار — نمونه‌برداری ۹ نقطه‌ای از فرمول CSS
      const xs: Keyframe[] = [];
      const ys: Keyframe[] = [];
      const rs: Keyframe[] = [];
      for (let i = 0; i <= 8; i++) {
        const p = i / 8;
        const x = Math.sin(p * Math.PI * 6) * 0.007;
        const y = Math.cos(p * Math.PI * 4.3) * 0.006;
        xs.push(kf(p * D, x, "linear"));
        ys.push(kf(p * D, y, "linear"));
        rs.push(kf(p * D, x * 0.3, "linear"));
      }
      return { transform: { ...base(), scale: 1.1 }, kf: { x: xs, y: ys, rotate: rs } };
    }
    case "breathe": {
      const scale = [0, 0.25, 0.5, 0.75, 1].map((p) =>
        kf(p * D, 1.03 + Math.sin(p * Math.PI * 2) * 0.025, "linear")
      );
      return { transform: { ...base(), scale: 1.03 }, kf: { scale } };
    }
    case "floatY": {
      const ys = [0, 1 / 6, 1 / 3, 1 / 2, 2 / 3, 5 / 6, 1].map((p) =>
        kf(p * D, Math.sin(p * Math.PI * 3) * -0.015, "linear")
      );
      return { transform: { ...base(), scale: 1.08 }, kf: { y: ys } };
    }
    case "tiltL":
      return { transform: { ...base(), scale: 1.22 }, kf: { rotate: [kf(0, 0), kf(D, 1.6)] } };
    case "tiltR":
      return { transform: { ...base(), scale: 1.22 }, kf: { rotate: [kf(0, 0), kf(D, -1.6)] } };
    case "sweepFocus":
      // جزء فیلتر موشن در ادیتور قابل‌انیمیشن نیست (فقط transform) — مقیاس ثابت، صادقانه
      return { transform: { ...base(), scale: 1.06 } };
    case "warmGlowIn":
      return { transform: { ...base(), scale: 1.05 }, kf: { scale: [kf(0, 1.05), kf(D, 1.1)] } };
    case "coldReveal":
      return { transform: { ...base(), scale: 1.1 }, kf: { scale: [kf(0, 1.1), kf(D, 1.04)] } };
    case "hold":
    default:
      return { transform: { ...base(), scale: 1.02 } };
  }
}

function probeDuration(url: string, kind: "video" | "audio"): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => resolve(0);
    el.src = url;
    setTimeout(() => resolve(0), 4000);
  });
}

async function makePlaceholder(
  template: BankTemplate,
  scene: Scene,
  label: string,
): Promise<{ url: string; blob: Blob }> {
  const dims = ASPECT_DIMS[template.aspect] ?? ASPECT_DIMS["9:16"];
  const canvas = document.createElement("canvas");
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext("2d")!;
  const [from, to] = scene.art ?? [template.art.from, template.art.to];
  const grad = ctx.createLinearGradient(0, 0, dims.w, dims.h);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, dims.w, dims.h);

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, 0, dims.w, dims.h);

  ctx.font = `${Math.round(dims.w * 0.34)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.85;
  ctx.fillText(scene.emoji ?? template.art.emoji, dims.w / 2, dims.h * 0.46);
  ctx.globalAlpha = 1;

  ctx.font = `600 ${Math.round(dims.w * 0.045)}px Vazirmatn, sans-serif`;
  ctx.fillStyle = "rgba(250,247,245,0.8)";
  ctx.fillText(label, dims.w / 2, dims.h * 0.62);

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? new Blob()), "image/jpeg", 0.9),
  );
  return { url: URL.createObjectURL(blob), blob };
}

export async function buildProjectFromBank(payload: PendingBankPayload): Promise<{
  project: Project;
  assets: MediaAsset[];
  name: string;
}> {
  const { template, media, texts } = payload;
  const assets: MediaAsset[] = [];
  const assetBySlot = new Map<string, MediaAsset>();

  // ۱) اسلات‌های رسانهٔ کاربر + پروب مدت — بدون رسانهٔ کاربر، پیش‌فرض بانک (url) مصرف می‌شود
  for (const slot of template.slots) {
    const m = media[slot.id];
    const src = m ?? (slot.url ? { url: slot.url, name: `${slot.label} (پیش‌فرض بانک)` } : undefined);
    if (!src) continue;
    const urlIsVideo = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src.url);
    const kind: "image" | "video" | "audio" = slot.kind === "audio" ? "audio" : slot.kind === "video" || urlIsVideo ? "video" : "image";
    if (kind === "image") {
      assets.push({
        id: slot.id, type: "image", url: src.url, name: src.name,
        duration: 10, width: 1080, height: 1920,
      });
      assetBySlot.set(slot.id, assets[assets.length - 1]);
    } else {
      const dur = await probeDuration(src.url, kind === "video" ? "video" : "audio");
      assets.push({
        id: slot.id, type: kind, url: src.url, name: src.name,
        duration: dur, width: kind === "video" ? 1080 : 0, height: kind === "video" ? 1920 : 0,
      });
      assetBySlot.set(slot.id, assets[assets.length - 1]);
    }
  }

  // ۲) اسلات‌های خالی → پلاک‌هولدر (ریتم حفظ می‌شود)
  for (const slot of template.slots) {
    if (slot.kind === "audio" || assetBySlot.has(slot.id)) continue;
    const sceneUsing = template.scenes.find((s) => s.slot === slot.id);
    const ph = await makePlaceholder(template, sceneUsing ?? { d: 1, motion: "hold" }, slot.label);
    assets.push({
      id: `ph_${slot.id}`, type: "image", url: ph.url, name: `جایگرین-${slot.label}`,
      duration: 10, width: 1080, height: 1920,
    });
    assetBySlot.set(slot.id, assets[assets.length - 1]);
  }

  // ۳) کلیپ‌ها از صحنه‌ها
  const filterState: FilterState = { ...DEFAULT_FILTER };
  const preset = FILTER_PRESETS.find((p) => p.id === template.look);
  if (preset) Object.assign(filterState, preset.state, { presetId: preset.id });

  const clips: Clip[] = [];
  for (const scene of template.scenes) {
    const asset = scene.slot ? assetBySlot.get(scene.slot) : undefined;
    if (!asset) continue;
    const isVideo = asset.type === "video";
    const srcDur = asset.duration || (isVideo ? 10 : 10);
    const dur = isVideo ? Math.min(scene.d, Math.max(0.5, srcDur)) : scene.d;
    const tr = TRANS_MAP[scene.out ?? "cut"] ?? { type: "fade" as TransitionType, dur: 0.5 };
    // C2: موشن صحنه حالا واقعاً به کی‌فریم تبدیل می‌شود
    const mt = motionTransform(scene.motion ?? "hold", dur);
    const fxVignette = scene.fx?.includes("vignette") ? 0.35 : 0;
    clips.push({
      id: uid("clip"),
      kind: isVideo ? "video" : "image",
      assetId: asset.id,
      name: asset.name,
      in: 0,
      out: dur,
      speed: 1,
      transform: mt.transform,
      filter: { ...filterState, vignette: Math.max(filterState.vignette, fxVignette) },
      chroma: { enabled: false, color: "#00b140", similarity: 0.4, smoothness: 0.1 },
      volume: isVideo ? 1 : 1,
      muted: isVideo ? false : true,
      fadeIn: 0,
      fadeOut: 0,
      transitionIn: { type: tr.type, dur: tr.dur },
      srcDur: isVideo ? srcDur : 10,
      srcW: asset.width || 1080,
      srcH: asset.height || 1920,
      ...(mt.kf ? { kf: mt.kf } : {}),
    });
  }

  // ۴) متن‌ها
  const totalDur = clips.reduce((a, c) => a + Math.max(0.1, (c.out - c.in) / 1), 0);
  const textsOut: TextItem[] = [];
  let acc = 0;
  for (const scene of template.scenes) {
    const asset = scene.slot ? assetBySlot.get(scene.slot) : undefined;
    if (asset) acc += scene.d;
    for (const st of scene.texts ?? []) {
      const slot = template.texts.find((x) => x.id === st.ref);
      if (!slot) continue;
      const value = (texts[slot.id] ?? slot.sample) || "";
      if (!value.trim()) continue;
      const start = acc + (st.at ?? 0.2);
      const end = acc + scene.d - 0.05;
      if (end <= start) continue;
      textsOut.push({
        id: uid("txt"),
        text: value,
        start,
        end,
        x: 0.5,
        y: st.y ?? slot.y ?? 0.5,
        font: slot.size === "xl" || slot.size === "lg" ? "Lalezar" : "Vazirmatn",
        weight: slot.size === "xl" || slot.size === "lg" ? 400 : 800,
        size: TEXT_SIZE_PX[slot.size] ?? 72,
        color: slot.accent ?? "#f1e9e4",
        accent: "#e0a78f",
        strokeColor: "#000000",
        strokeW: 4,
        bgColor: "",
        bgOpacity: 0,
        shadow: true,
        gradient: false,
        animIn: TEXT_ANIM_MAP[st.anim] ?? "fade",
        animOut: "none",
        rotate: 0,
        opacity: 1,
        karaoke: false,
      });
    }
  }

  // ۵) موزیک
  const audios: AudioItem[] = [];
  const audioSlot = template.slots.find((s) => s.kind === "audio");
  if (audioSlot) {
    const asset = assetBySlot.get(audioSlot.id);
    if (asset) {
      const srcDur = asset.duration || totalDur;
      audios.push({
        id: uid("aud"),
        assetId: asset.id,
        name: asset.name,
        start: 0,
        in: 0,
        out: Math.min(totalDur, srcDur),
        srcDur,
        volume: 0.9,
        fadeIn: 0.5,
        fadeOut: 0.8,
        effect: "none",
        duckCaptions: false,
      });
    }
  }

  const project: Project = {
    aspect: (template.aspect as Project["aspect"]) ?? "9:16",
    clips,
    overlays: [],
    texts: textsOut,
    audios,
    markers: [],
  };
  return { project, assets, name: template.name };
}
