// ─────────────────────────────────────────────────────────────
// Preset registries (§23/§24 مشخصات) — پریست‌ها «پیکربندی پارامتر»اند،
// نه موتور جدا. هر پریست فقط روی «آبجکت انتخاب‌شده» اعمال می‌شود (نه کل پروژه)
// و به ماژول‌های واقعی موتور نقشه می‌خورد. خانوادهٔ بیوتی از Creative Packs جداست
// و در هستهٔ ادیتور هاردکد نمی‌شود — فقط رجیستری پارامتر.
// ─────────────────────────────────────────────────────────────

import type { FilterState, TextItem, TransformState } from "./types";
import type { KeyframeMap } from "./keyframes";
import { motionTransform } from "./bank-apply";

// ── متن (§23 Text) ──

export interface TextPreset {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  patch: Partial<TextItem>;
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: "luxury",
    name: "لوکس",
    emoji: "👑",
    desc: "طلایی با استروک تیره — برند و سالن",
    patch: { font: "Lalezar", weight: 400, size: 76, color: "#e8c87a", accent: "#f5e2b0", strokeColor: "#241a08", strokeW: 7, shadow: true, bgColor: "#000000", bgOpacity: 0, animIn: "pop", animOut: "fade" },
  },
  {
    id: "minimal",
    name: "مینیمال",
    emoji: "⬜️",
    desc: "سفید تمیز بدون حاشیه",
    patch: { font: "Vazirmatn", weight: 600, size: 56, color: "#ffffff", strokeColor: "#000000", strokeW: 0, shadow: false, bgColor: "#000000", bgOpacity: 0, animIn: "fade", animOut: "fade" },
  },
  {
    id: "bold",
    name: "بولد",
    emoji: "🅱️",
    desc: "سیاه پررنگ با استروک ضخیم — امپکت",
    patch: { font: "Vazirmatn", weight: 900, size: 84, color: "#ffffff", strokeColor: "#000000", strokeW: 12, shadow: true, animIn: "pop", animOut: "none" },
  },
  {
    id: "editorial",
    name: "ادیتوریال",
    emoji: "📰",
    desc: "مجلل روی نوار مشکی نیمه‌شفاف",
    patch: { font: "Vazirmatn", weight: 500, size: 48, color: "#f5f1ea", strokeColor: "#000000", strokeW: 0, shadow: false, bgColor: "#0a0a0a", bgOpacity: 0.55, animIn: "slideUp", animOut: "fade" },
  },
  {
    id: "beauty",
    name: "بیوتی",
    emoji: "💗",
    desc: "رز ملایم با سایهٔ نرم",
    patch: { font: "Vazirmatn", weight: 700, size: 62, color: "#ffd9e8", accent: "#ff8fb8", strokeColor: "#3d1226", strokeW: 6, shadow: true, animIn: "fade", animOut: "fade" },
  },
  {
    id: "cinematic",
    name: "سینمایی",
    emoji: "🎬",
    desc: "زرد سینما با استروک و سایه",
    patch: { font: "Vazirmatn", weight: 800, size: 66, color: "#facc15", strokeColor: "#000000", strokeW: 9, shadow: true, animIn: "typewriter", animOut: "fade" },
  },
];

// ── رنگ (§23 Color + §24 Beauty) — پارامترهای واقعی FilterState ──

export interface ColorPreset {
  id: string;
  name: string;
  emoji: string;
  family: "main" | "beauty";
  state: Partial<FilterState>;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: "none", name: "بدون", emoji: "🚫", family: "main", state: {} },
  { id: "clean", name: "شفاف", emoji: "✨", family: "main", state: { brightness: 108, contrast: 106, saturate: 108 } },
  { id: "cinema", name: "سینمایی", emoji: "🎞️", family: "main", state: { contrast: 112, saturate: 88, temp: -18, vignette: 0.35 } },
  { id: "warmglow", name: "غروب گرم", emoji: "🌇", family: "main", state: { brightness: 106, saturate: 112, temp: 45, vignette: 0.2 } },
  { id: "noir", name: "نوآر", emoji: "🖤", family: "main", state: { saturate: 0, contrast: 122, brightness: 96, vignette: 0.45 } },
  { id: "cool", name: "خنک", emoji: "❄️", family: "main", state: { saturate: 92, hue: 12, temp: -30, brightness: 104 } },
  // خانوادهٔ بیوتی (§24) — پارامتر واقعی، نه نام فیک
  { id: "softbeauty", name: "بیوتی نرم", emoji: "🪞", family: "beauty", state: { brightness: 108, contrast: 98, saturate: 104, temp: 12, vignette: 0.12 } },
  { id: "luxurygold", name: "طلای لوکس", emoji: "🏅", family: "beauty", state: { brightness: 104, contrast: 112, saturate: 118, temp: 38, sepia: 8, vignette: 0.28 } },
  { id: "cleansalon", name: "سالن تمیز", emoji: "💠", family: "beauty", state: { brightness: 112, contrast: 104, saturate: 100, temp: -6, vignette: 0.08 } },
  { id: "warmskin", name: "پوست گرم", emoji: "🤎", family: "beauty", state: { brightness: 105, contrast: 102, saturate: 110, temp: 30, hue: -4 } },
  { id: "hairdetail", name: "جزئیات مو", emoji: "💇‍♀️", family: "beauty", state: { brightness: 102, contrast: 118, saturate: 108, temp: 8, vignette: 0.2 } },
  { id: "premiumproduct", name: "محصول پرمیوم", emoji: "🧴", family: "beauty", state: { brightness: 106, contrast: 116, saturate: 112, temp: 14, vignette: 0.3 } },
  { id: "mineditorial", name: "ادیتوریال مین", emoji: "🕊️", family: "beauty", state: { brightness: 110, contrast: 96, saturate: 88, temp: -10, sepia: 4 } },
];

// ── انیمیشن (§23 Animation) — به TextAnim و موشن کی‌فریمیِ واقعی bank-apply نقشه می‌خورد ──

export interface AnimPreset {
  id: string;
  name: string;
  emoji: string;
  /** متن: animIn/animOut | کلیپ/لایه: موشن کی‌فریمی */
  target: "text" | "clip";
  animIn?: TextItem["animIn"];
  animOut?: TextItem["animOut"];
  /** id موشن از motionTransform (bank-apply) برای کلیپ */
  motionId?: string;
}

export const ANIM_PRESETS: AnimPreset[] = [
  { id: "a-fade", name: "محو", emoji: "🌫️", target: "text", animIn: "fade", animOut: "fade" },
  { id: "a-pop", name: "پاپ", emoji: "💥", target: "text", animIn: "pop", animOut: "fade" },
  { id: "a-slide", name: "سواید", emoji: "⬆️", target: "text", animIn: "slideUp", animOut: "none" },
  { id: "a-typewriter", name: "تایپ‌رایتر", emoji: "⌨️", target: "text", animIn: "typewriter", animOut: "none" },
  { id: "a-zoom", name: "زوم", emoji: "🔍", target: "text", animIn: "pop", animOut: "fade" },
  { id: "m-hold", name: "ثابت", emoji: "⏹️", target: "clip", motionId: "hold" },
  { id: "m-kenburnsIn", name: "کن‌برنز جلو", emoji: "🔭", target: "clip", motionId: "kenburnsIn" },
  { id: "m-kenburnsOut", name: "کن‌برنز عقب", emoji: "🗺️", target: "clip", motionId: "kenburnsOut" },
  { id: "m-dollyIn", name: "دالی جلو", emoji: "🎯", target: "clip", motionId: "dollyIn" },
  { id: "m-panL", name: "پن چپ", emoji: "↔️", target: "clip", motionId: "panL" },
  { id: "m-floatY", name: "شناوری", emoji: "🎈", target: "clip", motionId: "floatY" },
  { id: "m-breathe", name: "نفس", emoji: "🫧", target: "clip", motionId: "breathe" },
];

/** پریست رنگ → FilterState کامل (پایه + پریست) */
export function colorPresetToFilter(p: ColorPreset): FilterState {
  return {
    presetId: p.id === "none" ? "none" : p.id,
    brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, sepia: 0, temp: 0, vignette: 0,
    ...p.state,
  };
}

/** پریست انیمیشن کلیپ → ترنسفورم + کی‌فریم واقعی (از همان موتور بانک — منبع واحد) */
export function clipAnimToMotion(motionId: string, dur: number): { transform: TransformState; kf?: KeyframeMap } {
  return motionTransform(motionId, dur);
}
