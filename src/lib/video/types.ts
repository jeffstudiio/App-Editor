// ─────────────────────────────────────────────────────────────
// Types for the in-app video editor engine (استودیو ویدئو)
// ─────────────────────────────────────────────────────────────

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

export type TransitionType = "none" | "fade" | "black" | "slide" | "zoom";

export const TRANSITIONS: { id: TransitionType; name: string; emoji: string }[] = [
  { id: "none", name: "بدون", emoji: "—" },
  { id: "fade", name: "محو", emoji: "🌗" },
  { id: "black", name: "از سیاهی", emoji: "⚫️" },
  { id: "slide", name: "سواید", emoji: "➡️" },
  { id: "zoom", name: "زوم", emoji: "🔍" },
];

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
  transitionIn: { type: TransitionType; dur: number };
  srcDur: number;
  srcW: number;
  srcH: number;
  reverse?: { frames: string[]; fps: number };
  stab?: StabData;
  mask?: MaskState;
  enhance?: boolean; // «ارتقای کیفیت» — contrast/saturation clarity boost
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
  aspect: AspectId;
  clips: Clip[];
  overlays: OverlayItem[];
  texts: TextItem[];
  audios: AudioItem[];
  markers: Marker[];
}

export function emptyProject(aspect: AspectId = "9:16"): Project {
  return { aspect, clips: [], overlays: [], texts: [], audios: [], markers: [] };
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
