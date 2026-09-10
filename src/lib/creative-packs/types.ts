// ─────────────────────────────────────────────────────────────
// Creative Packs — §25: پک‌های دامنه به‌عنوان داده/پیکربندی
// هرگز در هستهٔ موتور هاردکد نمی‌شوند؛ پک جدید = فایل جدید
// ─────────────────────────────────────────────────────────────

export interface PackMusicMood {
  id: string;
  labelFa: string;
  /** فایل واقعی در public/bank-media/music — بدون پسوند */
  file: string;
  /** کلیدواژه‌های فارسی/انگلیسی برای انتخاب خودکار */
  keywords: string[];
}

export interface PackWorkflow {
  id: string;
  /** چیپ آمادهٔ رابط کاربری — دستور کامل فارسی برای planner */
  labelFa: string;
  instructionFa: string;
}

export interface CreativePack {
  id: string;
  name: string;
  nameFa: string;
  descFa: string;
  /** سبک‌نوشته‌های انگلیسی برای system prompt planner */
  styleHints: string[];
  /** نکته‌های فارسی که planner می‌تواند در خروجی بگوید */
  promptHintsFa: string[];
  /** فقط idهای واقعی FILTER_PRESETS */
  filterPresets: string[];
  /** فقط idهای واقعی SUBTITLE_PRESETS */
  captionPresets: string[];
  /** فقط idهای واقعی SFX_LIST */
  sfxIds: string[];
  musicMoods: PackMusicMood[];
  /** پیشنهادهای آمادهٔ ریلز/استوری برای پنل ایجنت */
  workflows: PackWorkflow[];
  /** دسته‌های بانک تمپلیت که به این پک مربوط‌اند */
  templateCategories: string[];
  /** مترادف‌های جست‌وجوی معنایی (تقویت جست‌وجوی محلی) */
  searchSynonyms: Record<string, string[]>;
}
