// ─────────────────────────────────────────────────────────────
// Agent Command Catalog — §17: دستورها، پارامتر، توضیح فارسی
// هر دستور به یک قابلیت واقعیِ موتور ویرایشگر نقشه می‌خورد.
// دستوری که اجرای واقعی ندارد در کاتالوگ نمی‌آید (NO FAKE §31).
// ─────────────────────────────────────────────────────────────

import { z } from "zod";

const CLIP_ID = z.string().min(1).describe("شناسهٔ کلیپ مثل clip_01");
const TIME = z.number().min(0).max(3600);

export const TRANSITION_TYPES = ["fade", "dipBlack", "dipWhite", "slide", "push", "zoom", "blur", "wipe", "flash", "spin", "glitch", "lightLeak"] as const;
export const TRANSITION_DIRECTIONS = ["left", "right", "up", "down"] as const;
export const FILTER_IDS = ["none", "cinema", "warmglow", "noir", "faded", "neon", "clean", "mint"] as const;
export const CAPTION_PRESETS = ["impact", "neon", "minimal", "classic", "lalezar"] as const;
export const KF_PROPS = ["scale", "x", "y", "rotate", "opacity"] as const;
export const EASES = ["linear", "in", "out", "inout", "back", "elastic", "bounce"] as const;
export const ASPECTS = ["9:16", "1:1", "16:9", "4:5", "3:4"] as const;
export const SFX_IDS = ["whoosh", "pop", "riser", "impact", "ding", "heartbeat", "click", "gleam"] as const;
export const CROP_PRESETS = ["free", "1:1", "4:5", "9:16", "16:9"] as const;

/** اسکیمای پارامتر هر دستور — منبع حقیقت برای validator و planner */
export const CommandParams: Record<string, z.ZodTypeAny> = {
  set_aspect: z.object({ tool: z.literal("set_aspect"), aspect: z.enum(ASPECTS) }),

  apply_filter: z.object({
    tool: z.literal("apply_filter"),
    preset: z.enum(FILTER_IDS),
    target: z.enum(["all", "clip"]).default("all"),
    clipId: CLIP_ID.optional(),
  }),

  adjust_color: z.object({
    tool: z.literal("adjust_color"),
    brightness: z.number().min(-100).max(100).optional(),
    contrast: z.number().min(-100).max(100).optional(),
    saturate: z.number().min(-100).max(100).optional(),
    temp: z.number().min(-100).max(100).optional(),
    vignette: z.number().min(0).max(100).optional(),
    target: z.enum(["all", "clip"]).default("all"),
    clipId: CLIP_ID.optional(),
  }),

  add_title: z.object({
    tool: z.literal("add_title"),
    text: z.string().min(1).max(120),
    start: TIME.default(0),
    dur: z.number().min(0.5).max(15).default(3),
    size: z.number().min(24).max(160).optional(),
    color: z.string().max(20).optional(),
    animIn: z.enum(["fade", "pop", "slideUp", "typewriter"]).default("pop"),
  }),

  style_titles: z.object({
    tool: z.literal("style_titles"),
    size: z.number().min(24).max(160).optional(),
    color: z.string().max(20).optional(),
    font: z.enum(["Vazirmatn", "Lalezar"]).optional(),
    animIn: z.enum(["none", "fade", "pop", "slideUp", "typewriter"]).optional(),
  }),

  set_caption_style: z.object({ tool: z.literal("set_caption_style"), preset: z.enum(CAPTION_PRESETS) }),

  clear_captions: z.object({ tool: z.literal("clear_captions") }),

  trim_clip: z.object({
    tool: z.literal("trim_clip"),
    clipId: CLIP_ID,
    /** ثانیهٔ تایم‌لاین — start خالی یعنی از ابتدای فعلی */
    start: TIME.optional(),
    end: TIME.optional(),
  }),

  split_clip: z.object({ tool: z.literal("split_clip"), at: TIME }),

  remove_clip: z.object({ tool: z.literal("remove_clip"), clipId: CLIP_ID }),

  move_clip: z.object({ tool: z.literal("move_clip"), clipId: CLIP_ID, index: z.number().int().min(0).max(200) }),

  duplicate_clip: z.object({ tool: z.literal("duplicate_clip"), clipId: CLIP_ID }),

  change_speed: z.object({ tool: z.literal("change_speed"), clipId: CLIP_ID, speed: z.number().min(0.25).max(4) }),

  crop_clip: z.object({
    tool: z.literal("crop_clip"),
    clipId: CLIP_ID,
    /** مستطیل نرمال‌شدهٔ منبع ۰..۱ — لبه‌ها واقعاً حذف می‌شوند (در خروجی هم) */
    x: z.number().min(0).max(0.9),
    y: z.number().min(0).max(0.9),
    w: z.number().min(0.1).max(1),
    h: z.number().min(0.1).max(1),
  }),

  reset_crop: z.object({ tool: z.literal("reset_crop"), clipId: CLIP_ID }),

  replace_clip: z.object({
    tool: z.literal("replace_clip"),
    clipId: CLIP_ID,
    /** باید یکی از assetهای snapshot.assets باشد — همان نوع کلیپ */
    assetId: z.string().min(1),
  }),

  to_overlay: z.object({ tool: z.literal("to_overlay"), clipId: CLIP_ID }),

  to_main_track: z.object({ tool: z.literal("to_main_track"), /** id لایهٔ رویی */ id: z.string().min(1) }),

  add_transition: z.object({
    tool: z.literal("add_transition"),
    type: z.enum(TRANSITION_TYPES),
    /** ثانیه — با طول دو کلیپ همسایه محدود می‌شود */
    dur: z.number().min(0.1).max(1.5).default(0.5),
    /** برای slide/push/wipe/zoom/spin — سمتِ ورود */
    direction: z.enum(TRANSITION_DIRECTIONS).optional(),
    target: z.enum(["all", "clip"]).default("all"),
    /**
     * با target="clip": ترنزیشن به «مرزِ ورودیِ این کلیپ» می‌چسبد
     * (مرز بین کلیپ قبلی و این کلیپ) — نه به کل تایم‌لاین.
     */
    clipId: CLIP_ID.optional(),
  }),

  set_transition_duration: z.object({
    tool: z.literal("set_transition_duration"),
    /** مرزِ ورودیِ این کلیپ */
    clipId: CLIP_ID,
    dur: z.number().min(0.1).max(1.5),
  }),

  remove_transition: z.object({
    tool: z.literal("remove_transition"),
    /** مرزِ ورودیِ این کلیپ حذف می‌شود — بقیهٔ مرزها دست‌نخورده */
    clipId: CLIP_ID,
  }),

  set_fades: z.object({
    tool: z.literal("set_fades"),
    fadeIn: z.number().min(0).max(5).optional(),
    fadeOut: z.number().min(0).max(5).optional(),
    target: z.enum(["all", "clip"]).default("all"),
    clipId: CLIP_ID.optional(),
  }),

  set_volume: z.object({
    tool: z.literal("set_volume"),
    target: z.enum(["clips", "audios"]),
    volume: z.number().min(0).max(2),
  }),

  duck_music: z.object({
    tool: z.literal("duck_music"),
    volume: z.number().min(0).max(1).default(0.25),
  }),

  add_marker: z.object({ tool: z.literal("add_marker"), t: TIME, label: z.string().max(60).default("") }),

  add_keyframe: z.object({
    tool: z.literal("add_keyframe"),
    id: z.string().min(1),
    prop: z.enum(KF_PROPS),
    t: TIME,
    value: z.number(),
    ease: z.enum(EASES).default("inout"),
  }),

  remove_keyframe: z.object({
    tool: z.literal("remove_keyframe"),
    id: z.string().min(1),
    prop: z.enum(KF_PROPS),
    t: TIME,
  }),

  // ── دستورهای ناهمگام (به سرویس واقعی مرورگر/سرور نیاز دارند) ──

  add_music: z.object({
    tool: z.literal("add_music"),
    mood: z.enum(["luxury", "warm", "emotional", "energetic", "cinematic", "calm", "clean"]),
    volume: z.number().min(0).max(1).default(0.6),
  }),

  add_sfx: z.object({ tool: z.literal("add_sfx"), id: z.enum(SFX_IDS), t: TIME }),

  generate_image: z.object({
    tool: z.literal("generate_image"),
    prompt: z.string().min(3).max(600),
    at: TIME.default(0),
    dur: z.number().min(0.5).max(15).default(2.5),
  }),

  generate_voice: z.object({
    tool: z.literal("generate_voice"),
    text: z.string().min(1).max(1000),
    voice: z.string().max(40).optional(),
    at: TIME.optional(),
  }),
};

export type CommandType = keyof typeof CommandParams;

export interface CommandDescriptor {
  id: CommandType;
  fa: string;
  /** توضیح انگلیسی کوتاه برای پرامپت planner */
  en: string;
  async?: boolean;
}

/** کاتالوگ برای planner — §17 (نسخهٔ v1: هر آیتم واقعاً اجرا می‌شود) */
export const COMMAND_CATALOG: CommandDescriptor[] = [
  { id: "set_aspect", fa: "تغییر نسبت تصویر", en: "change project aspect ratio" },
  { id: "apply_filter", fa: "اعمال فیلتر رنگی", en: "apply a color filter preset" },
  { id: "adjust_color", fa: "تنظیم رنگ دستی", en: "manual color adjustment deltas" },
  { id: "add_title", fa: "افزودن عنوان متنی", en: "add a styled title text" },
  { id: "style_titles", fa: "استایل‌دهی عنوان‌ها", en: "restyle existing title texts" },
  { id: "set_caption_style", fa: "تغییر قالب زیرنویس", en: "apply caption preset to existing captions" },
  { id: "clear_captions", fa: "حذف زیرنویس‌ها", en: "remove all captions" },
  { id: "trim_clip", fa: "تریم کلیپ", en: "trim a clip to a timeline range" },
  { id: "split_clip", fa: "برش کلیپ در نقطه", en: "split main clip at a timeline time" },
  { id: "remove_clip", fa: "حذف کلیپ", en: "remove a clip" },
  { id: "move_clip", fa: "جابه‌جایی ترتیب کلیپ", en: "reorder a clip" },
  { id: "duplicate_clip", fa: "تکثیر کلیپ", en: "duplicate a clip" },
  { id: "change_speed", fa: "تغییر سرعت", en: "change clip playback speed" },
  { id: "crop_clip", fa: "کراپ واقعی کلیپ", en: "crop a clip's source rect (x/y/w/h normalized 0..1) — real crop in preview and export" },
  { id: "reset_crop", fa: "حذف کراپ", en: "remove crop from a clip" },
  { id: "replace_clip", fa: "تعویض منبع کلیپ", en: "replace a clip's media source with another asset of the same kind (needs snapshot.assets)" },
  { id: "to_overlay", fa: "بردن کلیپ به لایهٔ رویی", en: "move a main-track clip to the overlay track (PiP) at its current time" },
  { id: "to_main_track", fa: "آوردن لایه به ترک اصلی", en: "move an overlay layer back to the main track at its start time" },
  { id: "add_transition", fa: "افزودن ترنزیشن روی مرز", en: "attach a transition to the edit point (boundary) between two adjacent clips — with target=clip it attaches to that clip's incoming boundary only" },
  { id: "set_transition_duration", fa: "تغییر مدت ترنزیشن مرز", en: "change duration of the transition attached to a clip's incoming boundary" },
  { id: "remove_transition", fa: "حذف ترنزیشن مرز", en: "remove the transition attached to a clip's incoming boundary (other boundaries untouched)" },
  { id: "set_fades", fa: "فید ویدئویی", en: "video fade in/out" },
  { id: "set_volume", fa: "تغییر صدا", en: "set volume of clips or audio items" },
  { id: "duck_music", fa: "کم‌کردن موسیقی زیر گفتار", en: "lower music under speech (ducking)" },
  { id: "add_marker", fa: "افزودن نشانگر", en: "add timeline marker" },
  { id: "add_keyframe", fa: "افزودن کی‌فریم", en: "add transform/opacity keyframe (scale/x/y/rotate/opacity)" },
  { id: "remove_keyframe", fa: "حذف کی‌فریم", en: "remove a keyframe" },
  { id: "add_music", fa: "افزودن موسیقی بانک", en: "add bank music by mood", async: true },
  { id: "add_sfx", fa: "افزودن افکت صوتی", en: "add a synthesized SFX", async: true },
  { id: "generate_image", fa: "تولید تصویر با AI", en: "AI-generate an image and insert as clip", async: true },
  { id: "generate_voice", fa: "تولید گویندگی با AI", en: "AI text-to-speech voice-over", async: true },
];

export const COMMAND_CATALOG_FA = new Map(COMMAND_CATALOG.map((c) => [c.id, c.fa]));

/** توضیح فارسیِ یک عملیات برای پیش‌نمایش UI */
export function describeOperationFa(op: Record<string, unknown>): string {
  const fa = COMMAND_CATALOG_FA.get(op.tool as CommandType);
  if (!fa) return String(op.tool);
  const details: string[] = [];
  if (typeof op.preset === "string") details.push(op.preset);
  if (typeof op.aspect === "string") details.push(op.aspect);
  if (typeof op.clipId === "string") details.push(op.clipId);
  if (typeof op.speed === "number") details.push(`سرعت ×${op.speed}`);
  if (typeof op.text === "string") details.push(`«${op.text.slice(0, 24)}»`);
  if (typeof op.mood === "string") details.push(op.mood);
  if (typeof op.id === "string" && op.tool === "add_sfx") details.push(op.id);
  if (typeof op.at === "number" && op.tool !== "generate_image") details.push(`@${op.at}s`);
  if (typeof op.start === "number") details.push(`از ${op.start}s`);
  if (typeof op.end === "number") details.push(`تا ${op.end}s`);
  return details.length ? `${fa} (${details.join("، ")})` : fa;
}
