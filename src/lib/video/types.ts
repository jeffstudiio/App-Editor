// ─────────────────────────────────────────────────────────────
// Types for the in-app video editor engine (استودیو ویدئو)
// ─────────────────────────────────────────────────────────────

import type { KeyframeMap } from "./keyframes";

export type AspectId = "9:16" | "1:1" | "16:9" | "4:5" | "3:4";

export const ASPECTS: { id: AspectId; w: number; h: number; name: string; hint: string }[] = [
  { id: "9:16", w: 9, h: 16, name: "۹:۱۶", hint: "ریلز / استوری / تیک‌تاک" },
  { id: "1:1", w: 1, h: 1, name: "۱:۱", hint: "پست مربع" },
  { id: "16:9", w: 16, h: 9, name: "۱۶:۹", hint: "یوتیوب" },
  { id: "4:5", w: 4, h: 5, name: "۴:۵", hint: "پست اینستاگرام" },
  { id: "3:4", w: 3, h: 4, name: "۳:۴", hint: "پرتره کلاسیک" },
];

export function aspectDims(id: AspectId): { w: number; h: number } {
  const a = ASPECTS.find((x) => x.id === id) ?? ASPECTS[0];
  return { w: a.w, h: a.h };
}

export interface FilterState {
  presetId: string; // "none" | preset id | "custom"
  brightness: number; // 100 = normal (50..160)
  contrast: number; // 100 = normal
  saturate: number; // 100 = normal
  hue: number; // -180..180 deg
  blur: number; // 0..12 px (at 1080 scale)
  sepia: number; // 0..100
  temp: number; // -100 (cold) .. 100 (warm)
  vignette: number; // 0..1
}

export const DEFAULT_FILTER: FilterState = {
  presetId: "none",
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  blur: 0,
  sepia: 0,
  temp: 0,
  vignette: 0,
};

export interface FilterPreset {
  id: string;
  name: string;
  emoji: string;
  state: Partial<FilterState>;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "none", name: "بدون فیلتر", emoji: "🚫", state: {} },
  {
    id: "cinema",
    name: "سینمایی",
    emoji: "🎞️",
    state: { contrast: 112, saturate: 88, temp: -18, vignette: 0.35 },
  },
  {
    id: "warmglow",
    name: "غروب گرم",
    emoji: "🌇",
    state: { brightness: 106, saturate: 112, temp: 45, vignette: 0.2 },
  },
  {
    id: "noir",
    name: "نوآر",
    emoji: "🖤",
    state: { saturate: 0, contrast: 122, brightness: 96, vignette: 0.45 },
  },
  {
    id: "faded",
    name: "محو قدیمی",
    emoji: "📻",
    state: { saturate: 72, contrast: 92, sepia: 30, brightness: 104, vignette: 0.25 },
  },
  {
    id: "neon",
    name: "نئون شب",
    emoji: "💜",
    state: { saturate: 135, contrast: 115, hue: -12, temp: -25, vignette: 0.4 },
  },
  {
    id: "clean",
    name: "شفاف و تمیز",
    emoji: "✨",
    state: { brightness: 108, contrast: 106, saturate: 108 },
  },
  {
    id: "mint",
    name: "نعنایی",
    emoji: "🌿",
    state: { saturate: 92, hue: 12, temp: -30, brightness: 104 },
  },
];

export interface TransformState {
  scale: number; // 0.2..3
  x: number; // -1..1 relative
  y: number;
  rotate: number; // deg
  flipH: boolean;
  flipV: boolean;
  opacity: number; // 0..1
}

export const DEFAULT_TRANSFORM: TransformState = {
  scale: 1,
  x: 0,
  y: 0,
  rotate: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
};

export interface ChromaState {
  enabled: boolean;
  color: string; // hex
  similarity: number; // 0..1
  smoothness: number; // 0..1
}

export const DEFAULT_CHROMA: ChromaState = {
  enabled: false,
  color: "#00b140",
  similarity: 0.4,
  smoothness: 0.1,
};

// ── ترنزیشن (P0 — مدل Edit-Point) ──
// ترنزیشن دیگر پراپرتی «کل تایم‌لاین» یا «ورودی کلیپ» نیست؛
// ویژگیِ «نقطهٔ تدوین» بین دو کلیپ مجاور است: Clip A | TRANSITION | Clip B
// مرجع حقیقت: Project.transitions — هر ترنزیشن با leftClipId/rightClipId به مرز می‌چسبد.

export type TransitionType =
  | "fade" // دیسالو متقاطع (Cross Dissolve)
  | "dipBlack" // رفتن از سیاهی
  | "dipWhite" // رفتن از سفیدی
  | "slide" // سواید (ورود از کنار)
  | "push" // پوش (کلیپ قبلی را بیرون می‌راند)
  | "zoom" // زوم
  | "blur" // از تاری
  | "wipe" // مهر و پاک‌کن (لبهٔ خطی)
  | "flash" // فلاش سفید
  | "spin" // چرخش ورود
  | "glitch" // گلیچ اسلایسی
  | "lightLeak"; // نشت نور گرم

export type TransitionDirection = "left" | "right" | "up" | "down";
export type TransitionEasing = "linear" | "smooth" | "snap";

/** ترنزیشن واقعی چسبیده به یک مرز بین دو کلیپ مجاور */
export interface TimelineTransition {
  id: string;
  leftClipId: string;
  rightClipId: string;
  type: TransitionType;
  /** ثانیه — با طول کلیپ‌های همسایه محدود می‌شود (maxBoundaryDur) */
  dur: number;
  /** برای slide/push/wipe/zoom/spin */
  direction?: TransitionDirection;
  easing?: TransitionEasing;
  /** شدت افکت ۰..۱ (blur/flash/lightLeak/glitch/zoom) */
  intensity?: number;
  /** رنگ نور برای lightLeak */
  tint?: "warm" | "gold" | "cool";
  /** id کارتِ مرورگر (برای هایلایت انتخاب؛ خانواده‌های بیوتی presetِ پارامتری هستند) */
  preset?: string;
}

export interface TransitionCard {
  /** id کارت در مرورگر — برای خانواده‌های بیوتی با type یکی نیست */
  id: string;
  name: string;
  cat: "basic" | "motion" | "stylish" | "beauty";
  type: TransitionType;
  dur: number;
  dir: boolean;
  desc: string;
  patch?: Partial<Pick<TimelineTransition, "intensity" | "tint" | "easing">>;
}

/** ۱۷ کارت واقعی روی ۱۲ موتور مستقل — هر کارت نتیجهٔ بصری متمایز دارد (§11) */
export const TRANSITION_CARDS: TransitionCard[] = [
  { id: "fade", name: "دیسالو", cat: "basic", type: "fade", dur: 0.5, dir: false, desc: "محو متقاطع روی نمای قبلی" },
  { id: "dipBlack", name: "از سیاهی", cat: "basic", type: "dipBlack", dur: 0.6, dir: false, desc: "عبور از مشکی" },
  { id: "dipWhite", name: "از سفیدی", cat: "basic", type: "dipWhite", dur: 0.6, dir: false, desc: "عبور از سفید" },
  { id: "slide", name: "سواید", cat: "motion", type: "slide", dur: 0.45, dir: true, desc: "ورود کشویی از کنار" },
  { id: "push", name: "پوش", cat: "motion", type: "push", dur: 0.45, dir: true, desc: "قبلی را بیرون می‌راند" },
  { id: "zoom", name: "زوم", cat: "motion", type: "zoom", dur: 0.45, dir: false, desc: "بزرگ‌نمایی ورود" },
  { id: "blur", name: "از تاری", cat: "motion", type: "blur", dur: 0.5, dir: false, desc: "فوکوس شدن از بلور" },
  { id: "wipe", name: "وایپ", cat: "motion", type: "wipe", dur: 0.45, dir: true, desc: "پاک‌شدن لبه‌ای" },
  { id: "flash", name: "فلاش", cat: "stylish", type: "flash", dur: 0.35, dir: false, desc: "برق سفید کوتاه" },
  { id: "spin", name: "اسپین", cat: "stylish", type: "spin", dur: 0.45, dir: true, desc: "چرخش ورود" },
  { id: "glitch", name: "گلیچ", cat: "stylish", type: "glitch", dur: 0.4, dir: false, desc: "بریدگی دیجیتال" },
  { id: "lightLeak", name: "نشت نور", cat: "stylish", type: "lightLeak", dur: 0.7, dir: false, desc: "موج نور گرم" },
  { id: "softReveal", name: "شیک و نرم", cat: "beauty", type: "blur", dur: 0.8, dir: false, desc: "آشکارسازی آرام و بلوری", patch: { intensity: 0.6, easing: "smooth" } },
  { id: "elegantFade", name: "محو مجلل", cat: "beauty", type: "dipWhite", dur: 0.8, dir: false, desc: "عبور نرم از روشنایی", patch: { easing: "smooth" } },
  { id: "glow", name: "درخشش", cat: "beauty", type: "lightLeak", dur: 0.9, dir: false, desc: "هالهٔ نور ملایم", patch: { intensity: 0.55, tint: "gold", easing: "smooth" } },
  { id: "luxuryLight", name: "نور لوکس", cat: "beauty", type: "lightLeak", dur: 1, dir: false, desc: "طلایی لوکس پرقدرت", patch: { intensity: 1, tint: "gold" } },
  { id: "warmGlow", name: "گرمای پوست", cat: "beauty", type: "lightLeak", dur: 0.7, dir: false, desc: "نور گرم لطیف", patch: { intensity: 0.7, tint: "warm" } },
];

export const TRANSITION_TYPES = TRANSITION_CARDS.filter((c) => c.cat !== "beauty").map((c) => c.type);

export const TRANSITION_EASINGS: { id: TransitionEasing; name: string }[] = [
  { id: "linear", name: "خطی" },
  { id: "smooth", name: "نرم" },
  { id: "snap", name: "ضربه‌ای" },
];

export const TRANSITION_DUR_PRESETS = [0.1, 0.2, 0.3, 0.5, 0.7, 1];

/** سقف مجاز مدت ترنزیشن بین دو کلیپ — تا نصفِ هر کلیپ همسایه و حداکثر ۱.۵s */
export function maxBoundaryDur(durLeft: number, durRight: number): number {
  return Math.max(0.1, Math.min(1.5, durLeft * 0.5, durRight * 0.5));
}

/** ترنزیشن امن و clamp شده (ورودی UI/agent/JSON) */
export function sanitizeTransition(
  raw: unknown,
  durLeft: number,
  durRight: number,
  idOf: () => string
): TimelineTransition | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const type = TRANSITION_TYPES.includes(r.type as TransitionType) ? (r.type as TransitionType) : null;
  if (!type) return null;
  const card = TRANSITION_CARDS.find((c) => c.type === type);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const dir = ["left", "right", "up", "down"].includes(r.direction as string)
    ? (r.direction as TransitionDirection)
    : card?.dir
      ? "left"
      : undefined;
  const easing = ["linear", "smooth", "snap"].includes(r.easing as string)
    ? (r.easing as TransitionEasing)
    : "smooth";
  const tint = ["warm", "gold", "cool"].includes(r.tint as string) ? (r.tint as "warm" | "gold" | "cool") : undefined;
  return {
    id: typeof r.id === "string" && r.id ? r.id : idOf(),
    leftClipId: String(r.leftClipId ?? ""),
    rightClipId: String(r.rightClipId ?? ""),
    type,
    dur: Math.min(maxBoundaryDur(durLeft, durRight), Math.max(0.1, num(r.dur, card?.dur ?? 0.5))),
    direction: dir,
    easing,
    intensity: Math.min(1, Math.max(0.1, num(r.intensity, 1))),
    tint,
    preset: typeof r.preset === "string" ? r.preset : undefined,
  };
}

// ── mask (like desktop CapCut's Mask tab) ──
export type MaskShape = "none" | "circle" | "rounded" | "star" | "heart";

export interface MaskState {
  shape: MaskShape;
  size: number; // 0.2..1.4 (relative to min(W,H))
  feather: number; // 0..0.5 edge softness
}

export const DEFAULT_MASK: MaskState = { shape: "none", size: 0.9, feather: 0.12 };

export const MASK_SHAPES: { id: MaskShape; name: string; emoji: string }[] = [
  { id: "none", name: "بدون", emoji: "⬛" },
  { id: "circle", name: "دایره", emoji: "⚪️" },
  { id: "rounded", name: "مستطیل نرم", emoji: "▢" },
  { id: "star", name: "ستاره", emoji: "⭐️" },
  { id: "heart", name: "قلب", emoji: "💗" },
];

/**
 * Crop واقعی — مستطیل نرمال‌شدهٔ منبع (0..1 نسبت به عرض/ارتفاع فریم منبع).
 * در پیش‌نمایش و خروجی هر دو با drawImage(sx,sy,sw,sh) اعمال می‌شود؛
 * پس برخلاف «زوم»، لبه‌ها واقعاً حذف می‌شوند و در فایل نهایی هم نمی‌آیند.
 */
export interface CropState {
  x: number; // 0..0.9 — آفست چپ
  y: number; // 0..0.9 — آفست بالا
  w: number; // 0.1..1 — عرض
  h: number; // 0.1..1 — ارتفاع
}

export const DEFAULT_CROP: CropState = { x: 0, y: 0, w: 1, h: 1 };

/** آیا کراپ فعال است؟ (غیرِ پیش‌فرض) */
export function isCropped(c: CropState | undefined): boolean {
  return !!c && (c.x > 0.001 || c.y > 0.001 || c.w < 0.999 || c.h < 0.999);
}

/** کراپ امن و clamp شده (برای ورودی UI/agent/JSON) */
export function sanitizeCrop(c: unknown): CropState {
  const r = (c ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const x = Math.min(0.9, Math.max(0, num(r.x, 0)));
  const y = Math.min(0.9, Math.max(0, num(r.y, 0)));
  const w = Math.min(1 - x, Math.max(0.1, num(r.w, 1)));
  const h = Math.min(1 - y, Math.max(0.1, num(r.h, 1)));
  return { x, y, w, h };
}

/** Digital stabilization analysis result (per-frame counter-offsets). */
export interface StabData {
  fps: number; // sampled analysis fps
  srcIn: number; // source-time range covered
  srcOut: number;
  speed: number; // clip speed when analyzed (to detect staleness)
  zoom: number; // extra zoom to hide edges (1.0..1.4)
  /** flat pairs [dx, dy, ...] normalized: dx by source width, dy by source height */
  offsets: number[];
}

export interface Clip {
  id: string;
  kind: "video" | "image";
  assetId: string;
  name: string;
  /** source range in seconds (image: virtual range) */
  in: number;
  out: number;
  speed: number; // 0.25..4 (image: ignored)
  transform: TransformState;
  filter: FilterState;
  chroma: ChromaState;
  volume: number; // 0..2
  muted: boolean;
  fadeIn: number; // seconds
  fadeOut: number;
  srcDur: number;
  srcW: number;
  srcH: number;
  reverse?: { frames: string[]; fps: number };
  stab?: StabData;
  mask?: MaskState;
  crop?: CropState; // کراپ واقعی منبع (P0)
  enhance?: boolean; // «ارتقای کیفیت» — contrast/saturation clarity boost
  /** keyframeهای ترنسفورم — زمان‌ها نسبت به شروع کلیپ */
  kf?: KeyframeMap;
}

export type TextAnim = "none" | "fade" | "pop" | "slideUp" | "typewriter";

export interface TextItem {
  id: string;
  text: string;
  start: number; // timeline seconds
  end: number;
  x: number; // 0..1
  y: number; // 0..1
  font: "Vazirmatn" | "Lalezar";
  weight: number;
  size: number; // px at 1080-width scale
  color: string;
  accent: string; // karaoke highlight color
  strokeColor: string;
  strokeW: number; // at 1080 scale
  bgColor: string;
  bgOpacity: number; // 0..1
  shadow: boolean;
  gradient: boolean;
  animIn: TextAnim;
  animOut: TextAnim;
  rotate: number;
  opacity: number;
  karaoke: boolean; // word-by-word highlight
  isCaption?: boolean;
  /**
   * تایمینگ واقعی کلمه‌ها (ثانیهٔ تایم‌لاین) — از forced-alignment انرژی‌محور
   * روی صدای ASR ساخته می‌شود. وقتی موجود است کارائوکه واقعی است؛
   * وقتی نیست، هایلایت نسبتی (تقریبی) استفاده می‌شود.
   */
  words?: WordTiming[];
  /** keyframeهای opacity/pos/scale — زمان‌ها نسبت به start */
  kf?: KeyframeMap;
}

export interface WordTiming {
  w: string;
  start: number; // ثانیهٔ تایم‌لاین
  end: number;
}

export type VoiceEffect = "none" | "echo" | "deep" | "chipmunk";

export interface AudioItem {
  id: string;
  assetId: string;
  name: string;
  start: number; // timeline seconds
  in: number; // source in
  out: number; // source out
  srcDur: number;
  volume: number; // 0..2
  fadeIn: number;
  fadeOut: number;
  effect: VoiceEffect;
  duckCaptions: boolean; // auto-duck while captions show
  fromTts?: boolean;
}

/** Picture-in-picture layer above the main track (video or image). */
export interface OverlayItem {
  id: string;
  kind: "video" | "image";
  assetId: string;
  name: string;
  start: number; // timeline seconds
  dur: number;
  srcIn: number; // source offset for videos
  srcDur: number;
  transform: TransformState;
  filter: FilterState;
  chroma: ChromaState;
  mask?: MaskState;
  crop?: CropState; // کراپ واقعی برای لایهٔ رویی
  /** keyframeهای ترنسفورم — زمان‌ها نسبت به start */
  kf?: KeyframeMap;
}

export interface Marker {
  id: string;
  t: number;
  label: string;
}

export interface MediaAsset {
  id: string;
  type: "video" | "image" | "audio";
  url: string; // object URL
  name: string;
  duration: number;
  width: number;
  height: number;
}

export interface Project {
  /** نسخهٔ اسکیما — مایگریشن با normalizeProject (PROJECT_SCHEMA_VERSION در projects-db) */
  schemaVersion?: number;
  aspect: AspectId;
  clips: Clip[];
  /** ترنزیشن‌های چسبیده به نقاط تدوین بین کلیپ‌های مجاور (مدل Edit-Point — مرجع حقیقت) */
  transitions: TimelineTransition[];
  overlays: OverlayItem[];
  texts: TextItem[];
  audios: AudioItem[];
  markers: Marker[];
}

export function emptyProject(aspect: AspectId = "9:16"): Project {
  return { schemaVersion: 3, aspect, clips: [], transitions: [], overlays: [], texts: [], audios: [], markers: [] };
}

/** مایگریشن/نرمال‌سازی هر Project خام (نسخه‌های قدیمی، JSON ناقص) به مدل فعلی */
export function normalizeProject(raw: unknown): Project {
  const r = (raw ?? {}) as Record<string, unknown>;
  const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
  const tr = (x: unknown): TransformState => ({ ...DEFAULT_TRANSFORM, ...((x ?? {}) as Partial<TransformState>) });
  const fl = (x: unknown): FilterState => ({ ...DEFAULT_FILTER, ...((x ?? {}) as Partial<FilterState>) });
  const ch = (x: unknown): ChromaState => ({ ...DEFAULT_CHROMA, ...((x ?? {}) as Partial<ChromaState>) });
  const mk = (x: unknown): MaskState | undefined =>
    x && typeof x === "object" ? { ...DEFAULT_MASK, ...(x as Partial<MaskState>) } : undefined;

  const clips = arr(r.clips).map((c0) => {
    const c = (c0 ?? {}) as Record<string, unknown>;
    return {
      id: String(c.id ?? uid("cl")),
      kind: c.kind === "image" ? ("image" as const) : ("video" as const),
      assetId: String(c.assetId ?? ""),
      name: String(c.name ?? "کلیپ"),
      in: num(c.in, 0),
      out: num(c.out, 4),
      speed: Math.min(4, Math.max(0.25, num(c.speed, 1))),
      transform: tr(c.transform),
      filter: fl(c.filter),
      chroma: ch(c.chroma),
      volume: num(c.volume, 1),
      muted: Boolean(c.muted),
      fadeIn: num(c.fadeIn, 0),
      fadeOut: num(c.fadeOut, 0),
      srcDur: num(c.srcDur, 10),
      srcW: num(c.srcW, 1080),
      srcH: num(c.srcH, 1920),
      reverse: c.reverse && typeof c.reverse === "object" ? (c.reverse as Clip["reverse"]) : undefined,
      stab: c.stab && typeof c.stab === "object" ? (c.stab as StabData) : undefined,
      mask: mk(c.mask),
      crop: c.crop && typeof c.crop === "object" ? sanitizeCrop(c.crop) : undefined,
      enhance: Boolean(c.enhance),
      kf: c.kf && typeof c.kf === "object" ? (c.kf as Clip["kf"]) : undefined,
    } satisfies Clip;
  });

  const overlays = arr(r.overlays).map((o0) => {
    const o = (o0 ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? uid("ov")),
      kind: o.kind === "video" ? ("video" as const) : ("image" as const),
      assetId: String(o.assetId ?? ""),
      name: String(o.name ?? "لایه"),
      start: Math.max(0, num(o.start, 0)),
      dur: Math.max(0.2, num(o.dur, 4)),
      srcIn: num(o.srcIn, 0),
      srcDur: num(o.srcDur, 4),
      transform: tr(o.transform),
      filter: fl(o.filter),
      chroma: ch(o.chroma),
      mask: mk(o.mask),
      crop: o.crop && typeof o.crop === "object" ? sanitizeCrop(o.crop) : undefined,
      kf: o.kf && typeof o.kf === "object" ? (o.kf as OverlayItem["kf"]) : undefined,
    } satisfies OverlayItem;
  });

  const texts = arr(r.texts).map((t0) => {
    const t = (t0 ?? {}) as Record<string, unknown>;
    const start = Math.max(0, num(t.start, 0));
    return {
      id: String(t.id ?? uid("tx")),
      text: String(t.text ?? ""),
      start,
      end: Math.max(start + 0.3, num(t.end, start + 3)),
      x: num(t.x, 0.5),
      y: num(t.y, 0.5),
      font: t.font === "Lalezar" ? ("Lalezar" as const) : ("Vazirmatn" as const),
      weight: num(t.weight, 800),
      size: num(t.size, 64),
      color: String(t.color ?? "#f1e9e4"),
      accent: String(t.accent ?? "#e0a78f"),
      strokeColor: String(t.strokeColor ?? "#000000"),
      strokeW: num(t.strokeW, 0),
      bgColor: String(t.bgColor ?? "#000000"),
      bgOpacity: num(t.bgOpacity, 0),
      shadow: t.shadow !== false,
      gradient: Boolean(t.gradient),
      animIn: (["none", "fade", "pop", "slideUp", "typewriter"].includes(t.animIn as string)
        ? t.animIn
        : "fade") as TextAnim,
      animOut: (["none", "fade", "pop", "slideUp", "typewriter"].includes(t.animOut as string)
        ? t.animOut
        : "none") as TextAnim,
      rotate: num(t.rotate, 0),
      opacity: num(t.opacity, 1),
      karaoke: Boolean(t.karaoke),
      isCaption: Boolean(t.isCaption),
      words: Array.isArray(t.words)
        ? (t.words as unknown[])
            .map((w0) => {
              const w = (w0 ?? {}) as Record<string, unknown>;
              return { w: String(w.w ?? ""), start: num(w.start, 0), end: num(w.end, 0) };
            })
            .filter((w) => w.w && w.end > w.start)
        : undefined,
      kf: t.kf && typeof t.kf === "object" ? (t.kf as TextItem["kf"]) : undefined,
    } satisfies TextItem;
  });

  const audios = arr(r.audios).map((a0) => {
    const a = (a0 ?? {}) as Record<string, unknown>;
    const start = Math.max(0, num(a.start, 0));
    return {
      id: String(a.id ?? uid("au")),
      assetId: String(a.assetId ?? ""),
      name: String(a.name ?? "صدا"),
      start,
      in: num(a.in, 0),
      out: Math.max(a.in as number ?? 0 + 1, num(a.out, num(a.in, 0) + 10)),
      srcDur: num(a.srcDur, 10),
      volume: num(a.volume, 1),
      fadeIn: num(a.fadeIn, 0),
      fadeOut: num(a.fadeOut, 0),
      effect: (["none", "echo", "deep", "chipmunk"].includes(a.effect as string) ? a.effect : "none") as AudioItem["effect"],
      duckCaptions: Boolean(a.duckCaptions),
      fromTts: Boolean(a.fromTts),
    } satisfies AudioItem;
  });

  const markers = arr(r.markers).map((m0) => {
    const m = (m0 ?? {}) as Record<string, unknown>;
    return { id: String(m.id ?? uid("mk")), t: Math.max(0, num(m.t, 0)), label: String(m.label ?? "") };
  });

  // ── ترنزیشن‌ها: مدل جدید (آرایهٔ مرزها) یا مایگریشن از transitionIn قدیمی کلیپ‌ها ──
  const clipDurOf = (c: Clip): number =>
    c.reverse ? c.reverse.frames.length / c.reverse.fps : Math.max(0.1, (c.out - c.in) / (c.kind === "image" ? 1 : c.speed));
  let transitions: TimelineTransition[] = [];
  if (Array.isArray(r.transitions)) {
    transitions = arr(r.transitions)
      .map((t0) => {
        const t = t0 as Record<string, unknown>;
        const li = clips.findIndex((c) => c.id === t.leftClipId);
        const ri = clips.findIndex((c) => c.id === t.rightClipId);
        if (li < 0 || ri !== li + 1) return null; // فقط مرزهای معتبرِ مجاور
        return sanitizeTransition(t, clipDurOf(clips[li]), clipDurOf(clips[ri]), () => uid("tr"));
      })
      .filter((x): x is TimelineTransition => !!x);
  } else {
    // مایگریشن نسخهٔ ≤2: transitionIn هر کلیپ = ترنزیشن مرزِ (کلیپ قبلی | این کلیپ)
    const LEGACY_TYPE_MAP: Record<string, string> = { black: "dipBlack", white: "dipWhite", none: "none" };
    for (let i = 1; i < clips.length; i++) {
      const legacy = (arr(r.clips)[i] as Record<string, unknown> | undefined)?.transitionIn as
        | { type?: unknown; dur?: unknown }
        | undefined;
      const rawType = legacy && typeof legacy.type === "string" ? legacy.type : "none";
      const type = (LEGACY_TYPE_MAP[rawType] ?? rawType) as string;
      if (type === "none" || !TRANSITION_TYPES.includes(type as TransitionType)) continue;
      const t = sanitizeTransition(
        { type, dur: (legacy as { dur?: unknown })?.dur, leftClipId: clips[i - 1].id, rightClipId: clips[i].id },
        clipDurOf(clips[i - 1]),
        clipDurOf(clips[i]),
        () => uid("tr")
      );
      if (t) transitions.push(t);
    }
  }

  const aspect = (ASPECTS.some((a) => a.id === r.aspect) ? r.aspect : "9:16") as AspectId;
  return { schemaVersion: 3, aspect, clips, transitions, overlays, texts, audios, markers };
}

/** ترنزیشن چسبیده به مرز بین دو کلیپ (اگر مجاور باشند) */
export function getBoundaryTransition(p: Project, leftId: string, rightId: string): TimelineTransition | undefined {
  return p.transitions.find((t) => t.leftClipId === leftId && t.rightClipId === rightId);
}

/**
 * انطباق اجباریِ ثابت‌ها: هر ترنزیشن باید به مرزِ دو کلیپِ «مجاور» بچسبد و
 * مدتش داخل سقف همسایه‌ها باشد. بعد از هر عملیاتِ تغییردهندهٔ ترتیب/حذف صدا زده می‌شود
 * تا هیچ‌وقت ترنزیشن یتیم یا وابسته به کل تایم‌لاین نداشته باشیم (§35).
 */
export function cleanupTransitions(p: Project): void {
  if (!p.transitions.length) return;
  const kept: TimelineTransition[] = [];
  for (const t of p.transitions) {
    const li = p.clips.findIndex((c) => c.id === t.leftClipId);
    const ri = p.clips.findIndex((c) => c.id === t.rightClipId);
    if (li < 0 || ri !== li + 1) continue; // دیگر مجاور نیستند → مرز وجود ندارد
    const max = maxBoundaryDur(clipDur(p.clips[li]), clipDur(p.clips[ri]));
    kept.push({ ...t, dur: Math.min(t.dur, max) });
  }
  p.transitions = kept;
}

export function clipDur(c: Clip): number {
  if (c.reverse) return c.reverse.frames.length / c.reverse.fps;
  return Math.max(0.1, (c.out - c.in) / (c.kind === "image" ? 1 : c.speed));
}

export function totalDur(p: Project): number {
  const clipsEnd = p.clips.reduce((acc, c) => acc + clipDur(c), 0);
  const audioEnd = p.audios.reduce((m, a) => Math.max(m, a.start + (a.out - a.in)), 0);
  const textEnd = p.texts.reduce((m, t) => Math.max(m, t.end), 0);
  // فیکس: لایه‌های PiP قبلاً از totalDur جا می‌افتادند و در پخش/خروجی بریده می‌شدند
  const overlayEnd = p.overlays.reduce((m, o) => Math.max(m, o.start + o.dur), 0);
  return Math.max(clipsEnd, audioEnd, textEnd, overlayEnd);
}

export function clipStart(p: Project, clipId: string): number {
  let t = 0;
  for (const c of p.clips) {
    if (c.id === clipId) return t;
    t += clipDur(c);
  }
  return t;
}

export function activeClipAt(p: Project, t: number): { clip: Clip; index: number; local: number } | null {
  let acc = 0;
  for (let i = 0; i < p.clips.length; i++) {
    const d = clipDur(p.clips[i]);
    if (t >= acc && t < acc + d) return { clip: p.clips[i], index: i, local: t - acc };
    acc += d;
  }
  return null;
}

export function activeCaptionsAt(texts: TextItem[], t: number): TextItem[] {
  return texts.filter((x) => x.isCaption && t >= x.start && t < x.end);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

// Neural TTS voices (Microsoft Edge engine) — real Persian voices supported
export interface EdgeVoice {
  id: string;
  name: string;
  lang: string;
  gender: "f" | "m";
}

export const EDGE_LANGS: { code: string; label: string }[] = [
  { code: "fa", label: "فارسی 🇮🇷" },
  { code: "en", label: "انگلیسی 🇬🇧" },
  { code: "ar", label: "عربی 🇸🇦" },
  { code: "tr", label: "ترکی 🇹🇷" },
  { code: "zh", label: "چینی 🇨🇳" },
  { code: "es", label: "اسپانیایی 🇪🇸" },
];

export const EDGE_VOICES: EdgeVoice[] = [
  { id: "fa-IR-DilaraNeural", name: "دلا — زن", lang: "fa", gender: "f" },
  { id: "fa-IR-FaridNeural", name: "فرید — مرد", lang: "fa", gender: "m" },
  { id: "en-US-AriaNeural", name: "آریا — زن (آمریکایی)", lang: "en", gender: "f" },
  { id: "en-US-GuyNeural", name: "گای — مرد (آمریکایی)", lang: "en", gender: "m" },
  { id: "en-GB-SoniaNeural", name: "سونیا — زن (بریتانیایی)", lang: "en", gender: "f" },
  { id: "ar-SA-ZariyahNeural", name: "زاریه — زن", lang: "ar", gender: "f" },
  { id: "ar-SA-HamedNeural", name: "حامد — مرد", lang: "ar", gender: "m" },
  { id: "tr-TR-EmelNeural", name: "امل — زن", lang: "tr", gender: "f" },
  { id: "tr-TR-AhmetNeural", name: "احمد — مرد", lang: "tr", gender: "m" },
  { id: "zh-CN-XiaoxiaoNeural", name: "شیائوشیاو — زن", lang: "zh", gender: "f" },
  { id: "zh-CN-YunxiNeural", name: "یونشی — مرد", lang: "zh", gender: "m" },
  { id: "es-ES-ElviraNeural", name: "الویرا — زن", lang: "es", gender: "f" },
  { id: "es-ES-AlvaroNeural", name: "آلوارو — مرد", lang: "es", gender: "m" },
];

/** Dubbing target languages (ASR source is auto-detected by the cloud engine). */
export const DUB_LANGS: { code: string; label: string }[] = [
  { code: "fa", label: "فارسی" },
  { code: "en", label: "انگلیسی" },
  { code: "ar", label: "عربی" },
  { code: "tr", label: "ترکی" },
  { code: "zh", label: "چینی" },
  { code: "es", label: "اسپانیایی" },
];

export const VOICE_EFFECTS: { id: VoiceEffect; name: string; emoji: string }[] = [
  { id: "none", name: "عادی", emoji: "🎙️" },
  { id: "echo", name: "اکو", emoji: "🏛️" },
  { id: "deep", name: "عمیق", emoji: "🐻" },
  { id: "chipmunk", name: "سنجابی", emoji: "🐿️" },
];
