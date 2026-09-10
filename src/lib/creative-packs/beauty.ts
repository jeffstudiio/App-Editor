// ─────────────────────────────────────────────────────────────
// پک اول: زیبایی / مو / اینستاگرام — اولین کاربر واقعی (§25)
// همهٔ idها به دارایی‌های واقعی اپ وصل‌اند (فیلتر/زیرنویس/SFX/موسیقی)
// ─────────────────────────────────────────────────────────────

import type { CreativePack } from "./types";

export const BEAUTY_PACK: CreativePack = {
  id: "beauty",
  name: "Beauty / Hair / Instagram",
  nameFa: "زیبایی، مو و اینستاگرام",
  descFa: "قالب‌ها، فیلترها و سبک‌های آماده برای تولیدکنندهٔ محتوای زیبایی و مو",
  styleHints: [
    "Luxury, minimal, clean premium beauty aesthetic",
    "Hair transformation narrative: before → process → reveal → result",
    "Vertical 9:16 Instagram Reels, 15-30s, fast-paced cuts synced to music",
    "Elegant typography, soft glow, warm skin tones, high-end salon feel",
    "Captions short and punchy in Persian, premium look",
  ],
  promptHintsFa: [
    "روی مو و صورت تمرکز کن؛ کارادا از قاب نزدیک استفاده شود",
    "قبل/بعد باید حس تحول لوکس بدهد",
  ],
  filterPresets: ["warmglow", "clean", "cinema", "mint"],
  captionPresets: ["minimal", "lalezar", "impact"],
  sfxIds: ["gleam", "whoosh", "ding", "pop", "heartbeat"],
  musicMoods: [
    { id: "luxury", labelFa: "لوکس و شیک", file: "ambient-dark", keywords: ["luxury", "لوکس", "لاکچری", "premium", "elegant", "شیک"] },
    { id: "warm", labelFa: "گرم و صمیمی", file: "persian-warm", keywords: ["warm", "گرم", "صمیمی", "warmth"] },
    { id: "emotional", labelFa: "احساسی", file: "romantic-pads", keywords: ["emotional", "احساسی", "romantic", "عاشقانه"] },
    { id: "energetic", labelFa: "پرانرژی و کات‌دار", file: "trap-drive", keywords: ["energetic", "انرژی", "beat", "ضرب", "fast", "کات"] },
    { id: "cinematic", labelFa: "سینمایی", file: "epic-cine", keywords: ["cinematic", "سینمایی", "epic", "film"] },
    { id: "calm", labelFa: "آرام و مینیمال", file: "soft-piano", keywords: ["calm", "آرام", "minimal", "مینیمال", "soft"] },
    { id: "clean", labelFa: "تمیز و مدرن", file: "corporate-pluck", keywords: ["clean", "تمیز", "modern", "مدرن", "fresh"] },
  ],
  workflows: [
    {
      id: "before-after-reel",
      labelFa: "ریلز قبل/بعدِ لوکس",
      instructionFa:
        "یک ریلز لوکسِ ۱۵ ثانیه‌ای از همین پروژه بساز: کلیپ‌ها را بهترین ترتیب کن، فیلتر گرم و لوکس بزن، ترنزیشن محو نرم بگذار، موسیقی لوکس اضافه کن و صدا را برای ریتم کم کن، یک عنوان شیک اول وینداز قبل/بعد درست کن، نسبت ۹:۱۶",
    },
    {
      id: "transformation-sync",
      labelFa: "کات هم‌ضرب تحول مو",
      instructionFa:
        "کلیپ‌ها را کوتاه و پرکدس کن، فیلتر سینمایی بزن، ترنزیشن زوم به همه بده، موسیقی پرانرژی بگذار و صدای کلیپ‌ها را کم کن، نشانگر روی لحظهٔ رونمایی رنگ بگذار",
    },
    {
      id: "premium-captions",
      labelFa: "زیرنویس و تیتر پرمیوم",
      instructionFa:
        "قالب زیرنویس را مینیمال پرمیوم کن، یک عنوان لوکس بالای ویدیو اضافه کن و عنوان‌ها را با فونت لاله‌زار استایل بده",
    },
    {
      id: "salon-story",
      labelFa: "استوری آرایشگاهی",
      instructionFa:
        "پروژه را استوری اینستاگرام کن، فیلتر تمیز و روشن بزن، فید نرم به کلیپ‌ها بده، موسیقی آرام اضافه کن و صدای کلیپ‌ها را کم کن",
    },
  ],
  templateCategories: ["reels", "story", "cinematic", "typo"],
  searchSynonyms: {
    مو: ["hair", "haircut", "haircolor"],
    رنگ: ["color", "haircolor", "dye"],
    زیبایی: ["beauty", "makeup"],
    لوکس: ["luxury", "premium", "golden"],
    سالن: ["salon", "studio"],
    ترمیم: ["retouch", "glowup"],
    قبل: ["before", "then"],
    بعد: ["after", "reveal", "result"],
    تحول: ["transformation", "reveal"],
  },
};
