// ─────────────────────────────────────────────────────────────
// بانک تمپلیت — Schema
// هر تمپلیت یک تایم‌لاین ساختاریافته است با «اسلات» برای رسانهٔ
// کاربر (تصویر/ویدئو/موزیک)، فیلدهای متنی و صحنه‌های موشن‌دار.
// دادهٔ خام همین ساختار در public/template-bank/*.json منتشر می‌شود
// تا روی GitHub یا فضای ابری هم قابل میزبانی باشد.
// ─────────────────────────────────────────────────────────────

export type SlotKind = "image" | "video" | "audio";

export interface MediaSlot {
  id: string; // "m1"…
  kind: SlotKind;
  label: string; // برچسب فارسی اسلات («کاور محصول»)
  /** آدرس اختیاری رسانهٔ پیش‌فرض (مثلاً raw.githubusercontent) — برای بسته‌های کامل روی فضای ابری */
  url?: string;
}

export interface TextSlot {
  id: string; // "t1"…
  sample: string; // متن پیش‌فرض
  size: "sm" | "md" | "lg" | "xl";
  y?: number; // 0..1 جای عمودی پیش‌فرض
  accent?: string; // رنگ اختصاصی متن
}

export interface SceneText {
  ref: string; // TextSlot id
  anim: string; // انیمیشن ورود از MOTION_TEXTS
  at?: number; // ثانیه از شروع صحنه (پیش‌فرض 0.2)
  dur?: number; // مدت انیمیشن (پیش‌فرض از موشن)
  y?: number; // override جای عمودی
}

export type FxId = "grain" | "vignette" | "leak" | "scan" | "letterbox";

export interface Scene {
  d: number; // مدت صحنه (ثانیه)
  slot?: string; // اسلات رسانهٔ پس‌زمینه
  motion: string; // موشن رسانه از MOTION_MEDIA
  out?: string; // ترنزیشن خروج از MOTION_TRANS
  fx?: FxId[];
  texts?: SceneText[];
  art?: [string, string]; // گرادیان جایگزین برای این صحنه
  emoji?: string; // ایموجی پس‌زمینهٔ جایگزین
}

export type CategoryId =
  | "intro"
  | "logo"
  | "reels"
  | "story"
  | "cinematic"
  | "typo"
  | "product"
  | "occasion"
  | "music"
  | "slideshow";

export type BankAspect = "9:16" | "1:1" | "16:9" | "4:5";

export interface BankTemplate {
  id: string;
  name: string; // نام فارسی
  en: string; // نام لاتین (برچسب معماری)
  cat: CategoryId;
  tags: string[];
  aspect: BankAspect;
  desc: string; // توضیح یک‌خطی
  bpm?: number; // ضرب پیشنهادی موزیک
  look?: string; // پریست فیلتر برای هندآف به ادیتور
  slots: MediaSlot[];
  texts: TextSlot[];
  scenes: Scene[];
  art: { from: string; to: string; emoji: string }; // کاور کارت + جایگاه خالی
  featured?: boolean;
  /** تمپلیت ساخت خود کاربر (بانک من) */
  custom?: boolean;
}

export interface BankCategory {
  id: CategoryId;
  label: string;
  emoji: string;
}

export const BANK_CATEGORIES: BankCategory[] = [
  { id: "intro", label: "اینترو", emoji: "🚀" },
  { id: "logo", label: "لوگوموشن", emoji: "🪄" },
  { id: "reels", label: "ریلز و هوک", emoji: "⚡️" },
  { id: "story", label: "استوری موشن", emoji: "📱" },
  { id: "cinematic", label: "سینمایی", emoji: "🎞️" },
  { id: "typo", label: "تایپوگرافی", emoji: "🔤" },
  { id: "product", label: "محصول و برند", emoji: "🛍️" },
  { id: "occasion", label: "مناسبت‌ها", emoji: "🎉" },
  { id: "music", label: "موزیک و بیت", emoji: "🎵" },
  { id: "slideshow", label: "اسلایدشو", emoji: "🖼️" },
];

export interface BankManifest {
  version: string;
  updatedAt: string;
  count: number;
  templates: BankTemplate[];
}

/** محدودکنندهٔ امن برای JSON ریموت — فیلدهای ناشناخته دور ریخته می‌شوند */
export function sanitizeTemplate(raw: unknown): BankTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  if (!Array.isArray(r.scenes) || !Array.isArray(r.slots) || !Array.isArray(r.texts)) return null;
  const art = (r.art ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    name: r.name,
    en: typeof r.en === "string" ? r.en : r.id,
    cat: (BANK_CATEGORIES.some((c) => c.id === r.cat) ? r.cat : "reels") as CategoryId,
    tags: Array.isArray(r.tags) ? (r.tags as string[]).filter((x) => typeof x === "string").slice(0, 8) : [],
    aspect: (["9:16", "1:1", "16:9", "4:5"].includes(r.aspect as string) ? r.aspect : "9:16") as BankAspect,
    desc: typeof r.desc === "string" ? r.desc : "",
    bpm: typeof r.bpm === "number" ? r.bpm : undefined,
    look: typeof r.look === "string" ? r.look : undefined,
    slots: (r.slots as unknown[]).slice(0, 12).map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        id: String(o.id ?? ""),
        kind: (["image", "video", "audio"].includes(o.kind as string) ? o.kind : "image") as SlotKind,
        label: String(o.label ?? "رسانه"),
        url: typeof o.url === "string" && /^https?:\/\//.test(o.url) ? o.url : undefined,
      };
    }).filter((s) => s.id),
    texts: (r.texts as unknown[]).slice(0, 12).map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        id: String(o.id ?? ""),
        sample: String(o.sample ?? ""),
        size: (["sm", "md", "lg", "xl"].includes(o.size as string) ? o.size : "md") as TextSlot["size"],
        y: typeof o.y === "number" ? o.y : undefined,
        accent: typeof o.accent === "string" ? o.accent : undefined,
      };
    }).filter((s) => s.id),
    scenes: (r.scenes as unknown[]).slice(0, 40).map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        d: typeof o.d === "number" ? Math.min(12, Math.max(0.4, o.d)) : 2,
        slot: typeof o.slot === "string" ? o.slot : undefined,
        motion: typeof o.motion === "string" ? o.motion : "kenburnsIn",
        out: typeof o.out === "string" ? o.out : undefined,
        fx: Array.isArray(o.fx) ? (o.fx as FxId[]).filter((f) => typeof f === "string") : undefined,
        texts: Array.isArray(o.texts)
          ? (o.texts as unknown[]).slice(0, 4).map((x) => {
              const t = (x ?? {}) as Record<string, unknown>;
              return {
                ref: String(t.ref ?? ""),
                anim: typeof t.anim === "string" ? t.anim : "fadeUp",
                at: typeof t.at === "number" ? t.at : undefined,
                dur: typeof t.dur === "number" ? t.dur : undefined,
                y: typeof t.y === "number" ? t.y : undefined,
              };
            }).filter((x) => x.ref)
          : undefined,
        art: Array.isArray(o.art) && o.art.length === 2 ? ([String(o.art[0]), String(o.art[1])] as [string, string]) : undefined,
        emoji: typeof o.emoji === "string" ? o.emoji : undefined,
      };
    }),
    art: {
      from: typeof art.from === "string" ? art.from : "#c16a52",
      to: typeof art.to === "string" ? art.to : "#9c453d",
      emoji: typeof art.emoji === "string" ? art.emoji : "🎬",
    },
    featured: Boolean(r.featured),
  };
}

export function templateDuration(tpl: BankTemplate): number {
  return tpl.scenes.reduce((a, s) => a + s.d, 0);
}

export function templateSlotCount(tpl: BankTemplate, kind?: SlotKind): number {
  return tpl.slots.filter((s) => !kind || s.kind === kind).length;
}
