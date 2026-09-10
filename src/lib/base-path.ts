// ─────────────────────────────────────────────────────────────
// basePath — نسخهٔ میزبانی‌شده زیر مسیر (مثل GitHub Pages زیر /App-Editor)
// در بیلد گوشی PHONE_BUILD=1 و NEXT_PUBLIC_BASE_PATH=/App-Editor ست می‌شود
// و در بیلد عادی رشتهٔ خالی است، پس همهٔ مسیرها مثل قبل ریشه‌ای می‌مانند.
// ─────────────────────────────────────────────────────────────

export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** پیشوند مسیرهای ریشه‌ای با basePath (فقط برای مسیرهای public مثل /bank-media) */
export function withBase(p: string): string {
  return BASE_PATH ? `${BASE_PATH}${p}` : p;
}
