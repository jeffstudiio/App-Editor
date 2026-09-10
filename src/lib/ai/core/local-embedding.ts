// ─────────────────────────────────────────────────────────────
// Local Embedding — امبدینگ آفلاینِ واقعی برای جست‌وجوی معنایی بانک
// §26 · هر دو سمت (مرورگر و سرور) همین تابع خلوص را اجرا می‌کنند
//     → بردارِ محلی همیشه قطعی (deterministic) و یکسان است.
//
// تکنیک واقعی و شناخته‌شده (نه شبیه‌سازی):
//   1) نرمال‌سازی یونیکد فارسی/انگلیسی  (normalizeFaEn)
//   2) توکن‌سازی + حذف ایست‌کلمه + ریشه‌سبک  (tokenize)
//   3) کانونی‌سازی دوزبانه fa↔en با واژه‌نامه (مترادف‌های پک زیبایی)
//   4) Feature Hashing امضادار (signed hashing trick، همان خانوادهٔ
//      HashingVectorizer) + دوجمله‌ها + TF زیرخطی + نرمال‌سازی L2
// ─────────────────────────────────────────────────────────────

/** بُعد بردار محلی — با آزمون‌ها هم‌خوان است (256) */
export const EMBED_DIM = 256;

// ── ۱) نرمال‌سازی متن فارسی/انگلیسی ────────────────────────────
/** یکسان‌سازی نویسه‌های عربی/فارسی، ارقام، اعراب و نیم‌فاصله */
export function normalizeFaEn(s: string): string {
  return s
    .normalize("NFKC")
    // اعراب و کشیده
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    // ک/ی عربی → فارسی
    .replace(/ك/g, "ک")
    .replace(/ي/g, "ی")
    // همزه‌ها و تاء مربوطه
    .replace(/[أإٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/ة/g, "ه")
    // ارقام فارسی/عربی → ASCII
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    // نیم‌فاصله → چسباندن (تا «رنگ‌ها» و «رنگها» یکی شوند)
    .replace(/\u200c/g, "")
    // نویسه‌های کنترلی جهت/فاصلهٔ شکسته
    .replace(/[\u00a0\u200e\u200f]/g, " ");
}

// ── ۲) ایست‌کلمه‌ها (فقط واژه‌های نقشی؛ before/after معنادارند!) ─
const STOP = new Set([
  // فارسی
  "و", "در", "به", "از", "که", "را", "با", "این", "برای", "است", "بر", "تا",
  "هم", "آن", "یا", "اگر", "ولی", "بود", "شد", "شود", "می", "هر", "یک", "یکی",
  "من", "تو", "ما", "شما", "خود", "نیز", "اما", "پس", "چون", "روی", "بین",
  "بدون", "درباره", "وقتی", "همه", "هیچ", "چه", "باید",
  // انگلیسی
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "is",
  "are", "was", "were", "be", "been", "this", "that", "it", "its", "as", "by",
  "at", "from", "your", "you", "i", "we", "they", "he", "she", "not", "but",
  "can", "will", "do", "does", "how", "what", "which", "who", "when", "where",
  "up", "out", "if", "into", "about", "over",
]);

/** ریشه‌گیری سبکِ قطعی: جمع فارسی (هایی/های/ها)، صفت تفضیلی/عالی، جمع انگلیسی */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith("هایی")) return w.slice(0, -4);
  if (w.length > 4 && w.endsWith("های")) return w.slice(0, -3);
  if (w.length > 3 && w.endsWith("ها")) return w.slice(0, -2);
  if (w.length > 6 && w.endsWith("ترین")) return w.slice(0, -5);
  if (w.length > 4 && w.endsWith("تر")) return w.slice(0, -2);
  // جمع انگلیسی ساده (بدون دست‌زدن به ss/us/is و واژه‌های کوتاه)
  if (
    w.length > 3 &&
    w.endsWith("s") &&
    !w.endsWith("ss") &&
    !w.endsWith("us") &&
    !w.endsWith("is")
  ) {
    return w.slice(0, -1);
  }
  return w;
}

/**
 * توکن‌سازی بومی (بدون ترجمه) — برای پوشش تحت‌اللفظی در جست‌وجو.
 * خروجی: توکن‌های نرمال، بدون ایست‌کلمه، ریشه‌شدهٔ سبک.
 */
export function tokenize(text: string): string[] {
  const norm = normalizeFaEn(text).toLowerCase();
  const raw = norm.match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of raw) {
    if (STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // عدد تنها برای جست‌وجو بی‌معناست
    const st = stem(w);
    if (!st || st.length < 2 || STOP.has(st)) continue;
    out.push(st);
  }
  return out;
}

// ── ۳) واژه‌نامهٔ کانونی دوزبانه fa→en ─────────────────────────
// نگاشت واقعیِ واژه‌نامه‌ای (نه ترجمهٔ ماشینی): هر دو زبان به
// نمای کانونی انگلیسی می‌رسند → جست‌وجوی فارسی، تمپلیت انگلیسی‌زبان
// را هم پیدا می‌کند و برعکس. کلیدها باید شکل ریشه‌شده باشند.
const CANON: Record<string, string> = {
  // زیبایی و مو — هم‌راستا با searchSynonyms پک
  موی: "hair", مو: "hair", موها: "hair",
  رنگ: "color", رنگمو: "haircolor", رنگها: "color",
  زیبایی: "beauty", زیبا: "beauty",
  لوکس: "luxury", سالن: "salon",
  ترمیم: "retouch", تحول: "transformation",
  قبل: "before", بعد: "after",
  آرایش: "makeup", آرایشگاه: "salon",
  پوست: "skin", صورت: "face", چهره: "face",
  لب: "lip", لبخند: "smile", ناخن: "nail",
  مانیکور: "manicure", ابرو: "eyebrow", مژه: "lash",
  اکستنشن: "extension", کوتاه: "short", بلند: "long",
  فر: "curl", صاف: "smooth", شامپو: "shampoo",
  ماسک: "mask", سرم: "serum", روغن: "oil", کرم: "cream",
  ضدافتاب: "sunscreen", اسکراب: "scrub", عطر: "perfume",
  طلایی: "golden", نقرهای: "silver", صورتی: "pink",
  قرمز: "red", ابی: "blue", سبز: "green",
  مشکی: "black", سفید: "white", بنفش: "purple",
  قهوهای: "brown", بلوند: "blonde",
  // ویدیو و شبکهٔ اجتماعی
  ویدیو: "video", ریلز: "reels", استوری: "story",
  اینستاگرام: "instagram", تیکتاک: "tiktok", یوتیوب: "youtube",
  شورت: "short", تیزر: "teaser", تریلر: "trailer",
  موسیقی: "music", صدا: "audio", زیرنویس: "caption",
  فونت: "font", متن: "text", عنوان: "title", لوگو: "logo",
  انتقال: "transition", حرکت: "motion", انیمیشن: "animation",
  کیفریم: "keyframe", افکت: "effect", فیلتر: "filter",
  // عمومی / تجاری
  جدید: "new", مدرن: "modern", مینیمال: "minimal",
  شیک: "chic", جذاب: "attractive", حرفهای: "professional",
  ترند: "trend", وایرال: "viral", فروش: "sale",
  تخفیف: "discount", پیشنهاد: "offer", ویژه: "special",
  بوتیک: "boutique", ست: "set", قاب: "frame",
  // غذا / رستوران / نوشیدنی
  غذای: "food", غذا: "food", دریایی: "seafood",
  رستوران: "restaurant", کافه: "cafe", نوشیدنی: "drink",
  قهوه: "coffee", دسر: "dessert", شیرینی: "sweets",
  اشپزی: "cooking", دستور: "recipe", میوه: "fruit",
  // مد / فضا
  مد: "fashion", لباس: "dress", معماری: "architecture",
  خانه: "house", دکور: "decor", دفتر: "office",
};

/** نمای کانونی دوزبانهٔ یک توکن ریشه‌شده */
function canonical(t: string): string {
  return CANON[t] ?? t;
}

// ── ۴) Feature Hashing امضادار ────────────────────────────────
/** FNV-1a ۳۲ بیتی — قطعی و بدون وابستگی (مرورگر و سرور یکسان) */
function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * بردار امبدینگ محلی — همیشه 256 بُعد، نرمال L2، قطعی، آفلاین.
 * ویژگی‌ها: یونیگرم (وزن ۱ + TF زیرخطی) و دوجمله‌ها (وزن 0.5)
 * روی جریانِ کانونی‌شدهٔ دوزبانه.
 */
export function localEmbed(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  const toks = tokenize(text).map(canonical);
  if (toks.length === 0) return v;

  const bump = (feat: string, w: number): void => {
    const h1 = fnv1a(feat, 0x811c9dc5);
    const h2 = fnv1a(feat, 0x9e3779b9);
    const idx = h1 % EMBED_DIM;
    const sign = (h2 >>> 15) & 1 ? 1 : -1;
    v[idx] += sign * w;
  };

  // یونیگرم با TF زیرخطی (1 + ln tf)
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const [t, c] of tf) bump(t, 1 + Math.log(c));
  // دوجمله‌ها برای حس عبارتی
  for (let i = 1; i < toks.length; i++) {
    bump(toks[i - 1] + "\u0001" + toks[i], 0.5);
  }

  // نرمال‌سازی L2
  let sq = 0;
  for (const x of v) sq += x * x;
  if (sq > 0) {
    const n = Math.sqrt(sq);
    for (let i = 0; i < v.length; i++) v[i] /= n;
  }
  return v;
}

// ── ۵) شباهت کسینوسی ──────────────────────────────────────────
/** کسینوس دو بردار؛ بردار صفر یا طول متفاوت → 0 (هرگز NaN) */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
