// ─────────────────────────────────────────────────────────────
// رسانه‌های پیش‌فرض بانک — هر قالب بدون رسانه، همین‌جا زنده می‌شود
// موزیک و پس‌زمینه ۱۰۰٪ سینتی‌شده/تولیدی و بدون کپی‌رایت خارجی‌اند
// (اسکریپت‌ها: scripts/gen-music.py و scripts/gen-bg.py)
// کاربر هر لحظه می‌تواند رسانهٔ خودش را جای پیش‌فرض بگذارد.
// ─────────────────────────────────────────────────────────────

import type { BankTemplate } from "./schema";
import { withBase } from "@/lib/base-path";

const BG = (name: string) => withBase(`/bank-media/bg/${name}.mp4`);
const MUS = (name: string) => withBase(`/bank-media/music/${name}.m4a`);

export const BG_LOOP = {
  warmBokeh: BG("warm-bokeh"),
  creamPaper: BG("cream-paper"),
  darkSmoke: BG("dark-smoke"),
  neonGrid: BG("neon-grid"),
  goldLux: BG("gold-lux"),
  softNature: BG("soft-nature"),
  warmKitchen: BG("warm-kitchen"),
  steelMotion: BG("steel-motion"),
  pastelDrift: BG("pastel-drift"),
  confetti: BG("confetti"),
} as const;

export const MUSIC_LOOP = {
  lofi: MUS("lofi-chill"),
  epic: MUS("epic-cine"),
  electro: MUS("electro-pulse"),
  trap: MUS("trap-drive"),
  piano: MUS("soft-piano"),
  corporate: MUS("corporate-pluck"),
  persian: MUS("persian-warm"),
  romantic: MUS("romantic-pads"),
  dark: MUS("ambient-dark"),
} as const;

type Pack = { bg: string; music: string };

const BY_TAG: [RegExp, Pack][] = [
  [/املاک|ویلا|معماری|سفر|طبیعت/, { bg: BG_LOOP.softNature, music: MUSIC_LOOP.lofi }],
  [/کافه|رستوران|غذا|قهوه|آشپز/, { bg: BG_LOOP.warmKitchen, music: MUSIC_LOOP.corporate }],
  [/فیتنس|باشگاه|ورزش|انرژی|تمرین/, { bg: BG_LOOP.steelMotion, music: MUSIC_LOOP.trap }],
  [/زیبایی|پوست|فشن|مد|پارچه/, { bg: BG_LOOP.pastelDrift, music: MUSIC_LOOP.romantic }],
  [/نوروز|یلدا|رمضان|مذهبی|ایرانی|عید/, { bg: BG_LOOP.warmBokeh, music: MUSIC_LOOP.persian }],
  [/تولد|جشن|افتتاح|کانفتی|حراج|تخفیف/, { bg: BG_LOOP.confetti, music: MUSIC_LOOP.electro }],
  [/تسلیت|ترحیم|سوگ|ختم/, { bg: BG_LOOP.darkSmoke, music: MUSIC_LOOP.piano }],
  [/عروسی|دعوت‌نامه|عاشقانه|رمانتیک/, { bg: BG_LOOP.pastelDrift, music: MUSIC_LOOP.piano }],
  [/کریپتو|ترید|تکنولوژی|گیمینگ|گلیچ|آی‌تی/, { bg: BG_LOOP.neonGrid, music: MUSIC_LOOP.electro }],
  [/لوکس|لاکچری|طلایی|جواهر/, { bg: BG_LOOP.goldLux, music: MUSIC_LOOP.epic }],
  [/مدرسه|آموزشگاه|معلم|دانشگاه/, { bg: BG_LOOP.creamPaper, music: MUSIC_LOOP.corporate }],
  [/نئون|شب/, { bg: BG_LOOP.neonGrid, music: MUSIC_LOOP.dark }],
];

const BY_CAT: Record<string, Pack> = {
  intro: { bg: BG_LOOP.goldLux, music: MUSIC_LOOP.epic },
  logo: { bg: BG_LOOP.goldLux, music: MUSIC_LOOP.epic },
  reels: { bg: BG_LOOP.neonGrid, music: MUSIC_LOOP.electro },
  story: { bg: BG_LOOP.warmBokeh, music: MUSIC_LOOP.lofi },
  cinematic: { bg: BG_LOOP.darkSmoke, music: MUSIC_LOOP.epic },
  typo: { bg: BG_LOOP.creamPaper, music: MUSIC_LOOP.lofi },
  product: { bg: BG_LOOP.warmBokeh, music: MUSIC_LOOP.corporate },
  occasion: { bg: BG_LOOP.confetti, music: MUSIC_LOOP.persian },
  music: { bg: BG_LOOP.warmBokeh, music: MUSIC_LOOP.electro },
  slideshow: { bg: BG_LOOP.warmBokeh, music: MUSIC_LOOP.lofi },
};

function pickPack(tpl: BankTemplate): Pack {
  const hay = tpl.tags.join(" ") + " " + tpl.name + " " + tpl.desc;
  for (const [re, pack] of BY_TAG) if (re.test(hay)) return pack;
  // موزیک‌های با BPM مشخص
  if (tpl.bpm) {
    if (tpl.bpm >= 135) return { bg: BY_CAT[tpl.cat]?.bg ?? BG_LOOP.steelMotion, music: MUSIC_LOOP.trap };
    if (tpl.bpm >= 110) return { bg: BY_CAT[tpl.cat]?.bg ?? BG_LOOP.neonGrid, music: MUSIC_LOOP.electro };
  }
  return BY_CAT[tpl.cat] ?? { bg: BG_LOOP.warmBokeh, music: MUSIC_LOOP.lofi };
}

/**
 * نسخهٔ زندهٔ تمپلیت: اسلات‌های خالی رسانه، موزیک و پس‌زمینهٔ پیش‌فرض می‌گیرند
 * تا هر قالب از همان لحظه یک ویدئوی کامل قابل‌پخش باشد (تجربهٔ کپ‌کات).
 * انتخاب رسانهٔ خود کاربر همیشه اولویت دارد.
 */
export function withDefaults(tpl: BankTemplate): BankTemplate {
  const pack = pickPack(tpl);
  let changed = false;
  const slots = tpl.slots.map((slot) => {
    if (slot.url) return slot;
    if (slot.kind === "audio") {
      changed = true;
      return { ...slot, url: pack.music };
    }
    if (slot.kind === "video") {
      changed = true;
      return { ...slot, url: pack.bg };
    }
    // اسلات تصویرِ بدون رسانه: پس‌زمینهٔ پیش‌فرض نمی‌گیرد تا جای عکس کاربر خالی بماند،
    // اما اگر صحنه‌ای از آن استفاده می‌کند و قالب «اجرا‌شدهٔ کامل» لازم است، ویدئو می‌آید.
    changed = true;
    return { ...slot, url: pack.bg };
  });
  return changed ? { ...tpl, slots } : tpl;
}
