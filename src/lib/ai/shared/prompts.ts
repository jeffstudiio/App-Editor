// ─────────────────────────────────────────────────────────────
// Shared AI prompts + parsers — تک‌منبع بین مسیرهای سرور و گیت‌وی کلاینت
// (قبلاً این پرامپت‌ها داخل routeها تکرار شده بود — §1 duplicate ban)
// ─────────────────────────────────────────────────────────────

// ── edit-plan (دستیار ادیت) ──
export const EDIT_PLAN_SYSTEM = `تو «دستیار ادیت» هستی و برای یک ویرایشگر ویدئوی موبایلی (مشابه کپ‌کات) برنامه ادیت پیشنهاد می‌دهی.
ویدئوی کاربر را بر اساس توضیحش تحلیل کن و یک JSON دقیق با این ساختار برگردان (فقط JSON، بدون توضیح اضافه):
{
  "title": "یک متن تیتر کوتاه و جذاب فارسی (حداکثر ۴۰ کاراکتر) برای اوّل ویدئو یا null",
  "titleStart": 0.2,
  "titleDur": 3,
  "filterPresetId": "یکی از: none | cinema | warmglow | noir | faded | neon | clean | mint",
  "captionPresetId": "یکی از: impact | neon | minimal | classic | lalezar",
  "musicMood": "یک توصیف یک‌خطی فارسی از حس موزیک مناسب",
  "tips": ["نکته اجرایی کوتاه ۱", "نکته ۲", "نکته ۳"],
  "hookIdea": "ایده هوک ۳ ثانیه اول در یک جمله فارسی"
}
قواعد: لحن فارسی صمیمی-حرفه‌ای؛ مقادیر خارج از لیست مجاز نده؛ title اگر واقعاً مفید نبود null بده.`;

// ── script-scenes (ویدئوساز خودکار) ──
export const SCRIPT_SCENES_SYSTEM = `تو «ویدئوساز خودکار» هستی: سناریوی کاربر را به صحنه‌های تصویری تبدیل می‌کنی تا از آن‌ها ویدئوی ریلز/استوری ساخته شود.
فقط JSON برگردان با این ساختار:
{
  "title": "عنوان کوتاه ویدئو",
  "scenes": [
    { "text": "متن زیرنویس/گوینده این صحنه به فارسی (حداکثر ۲۰ کلمه)", "imagePrompt": "English text-to-image prompt, cinematic vertical composition, describing the scene visually (no text in image)", "dur": 4 }
  ]
}
قواعد:
- تعداد صحنه‌ها بین ۳ تا ۶ (همان که کاربر خواسته).
- dur عددی بین ۳ تا ۶ ثانیه.
- imagePrompt حتماً انگلیسی، بسیار بصری و سینمایی، بدون متن داخل تصویر.
- داستان صحنه‌ها یک قوس منسجم داشته باشد (شروع قوی، اوج، جمع‌بندی).`;

/** استخراج اولین بلوک JSON شیءای از متن خام مدل */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** اعتبارسنجی صحنه‌های script-scenes — همان قواعد route */
export function sanitizeScenes(parsed: { title?: unknown; scenes?: unknown }): {
  title: string;
  scenes: { text: string; imagePrompt: string; dur: number }[];
} | null {
  if (!parsed || typeof parsed !== "object") return null;
  const rawScenes = parsed.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) return null;
  const scenes = (rawScenes as { text?: unknown; imagePrompt?: unknown; dur?: unknown }[])
    .slice(0, 6)
    .map((s) => ({
      text: String(s?.text ?? "").slice(0, 160),
      imagePrompt: String(s?.imagePrompt ?? "").slice(0, 600),
      dur: Math.max(3, Math.min(6, Number(s?.dur) || 4)),
    }));
  return { title: String(parsed.title ?? "").slice(0, 80), scenes };
}

// ── translate / fix ──
const LANG_NAMES: Record<string, string> = {
  fa: "فارسی (Persian)",
  en: "انگلیسی (English)",
  ar: "عربی (Arabic)",
  tr: "ترکی استانبولی (Turkish)",
  zh: "چینی (Chinese)",
  es: "اسپانیایی (Spanish)",
};

export function isKnownLang(t: string): boolean {
  return Boolean(LANG_NAMES[t]);
}

export function translateSystemPrompt(mode: "translate" | "fix", target: string): string {
  const langName = LANG_NAMES[target] ?? LANG_NAMES.fa;
  if (mode === "translate") {
    return `تو مترجم حرفه‌ای زیرنویس و دوبله هستی. جمله‌های کاربر را به ${langName} ترجمه کن. قواعد:
1) اگر جمله از قبل به همان زبان مقصد بود، فقط غلط‌های تایپی واضح را درست کن و کلمات را عوض نکن (بازنویسی و خلاصه ممنوع).
2) معنا و طول جمله را نزدیک اصل نگه دار (مناسب تایمینگ زیرنویس).
3) برای زبان مقصد از واژه‌های طبیعی گفتاری استفاده کن.
فقط خروجی JSON را بده؛ توضیح نده.`;
  }
  return `تو ویراستار حرفه‌ای متن فارسی هستی. متن‌های خام تشخیص گفتار (ASR) را اصلاح کن: نیم‌فاصله‌ها را درست کن، علائم سجاوندی را اضافه کن و غلط‌های تایپی واضح را درست کن. کلمات را عوض نکن، خلاصه نکن و زبان را تغییر نده. فقط متن اصلاح‌شده را بده؛ توضیح نده.`;
}

const isFa = (s: string) => /[\u0600-\u06FF]/.test(s);

/**
 * اعمال خروجی مدل روی segments + گارد انحراف (بخش فارسی نباید بازنویسی شود).
 * برمی‌گرداند null اگر مدل هیچ آیتم معتبری نداشت.
 */
export function applyTranslateBatch(segments: string[], raw: string, mode: "translate" | "fix", target: string): string[] | null {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return null;
  let arr: { i?: unknown; text?: unknown }[];
  try {
    arr = JSON.parse(m[0]) as { i?: unknown; text?: unknown }[];
  } catch {
    return null;
  }
  const out = [...segments];
  let hits = 0;
  for (const item of arr) {
    if (typeof item?.i === "number" && item.i >= 0 && item.i < out.length && typeof item.text === "string" && item.text.trim()) {
      out[item.i] = item.text.trim();
      hits++;
    }
  }
  if (hits === 0) return null;
  // گارد A: برای مقصد fa، منبع فارسی باید تقریباً دست‌نخورده بماند (فقط اصلاح سبک ≤۴۰٪)
  if ((mode === "translate" && target === "fa") || mode === "fix") {
    for (let i = 0; i < out.length; i++) {
      const src = segments[i] ?? "";
      if (!isFa(src)) continue;
      const srcWords = new Set(src.split(/\s+/).filter(Boolean));
      const outWords = out[i].split(/\s+/).filter(Boolean);
      if (!outWords.length || !srcWords.size || !isFa(out[i])) {
        out[i] = src;
        continue;
      }
      const changed = outWords.filter((w) => !srcWords.has(w)).length;
      if (changed / outWords.length > 0.4) out[i] = src;
    }
  }
  return out;
}
