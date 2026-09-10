// Shared Gemini (Nano Banana) image generation/editing helper.
// Uses generativelanguage REST: models/{model}:generateContent with IMAGE modalities.
// All calls go through the relay-aware geminiFetch (direct + public relays).
import { geminiFetch, suggestedModel } from "@/lib/video/gemini-client";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiImageResult {
  ok: boolean;
  image_base64?: string;
  message?: string;
  via?: string;
}

function explain(status: number, detail: string): string {
  if (/api key not valid|API_KEY_INVALID/i.test(detail)) {
    return "کلید Gemini نامعتبره — از تنظیمات دستیار درستش کن.";
  }
  if (status === 429 && /limit: 0/.test(detail)) {
    return "نانو‌بنانا در پلن رایگان گوگل سهمیه‌ش صفره — برای استفاده باید روی پروژهٔ گوگلت Billing فعال باشه. تا اون موقع موتور داخلی رو انتخاب کن.";
  }
  if (status === 429) {
    return "سهمیهٔ نانو‌بنانا موقتاً پر شده؛ کمی بعد دوباره امتحان کن یا موتور داخلی رو انتخاب کن.";
  }
  if (status === 403) {
    return "دسترسی به Gemini داده نشد — کلیدت این قابلیت رو نداره.";
  }
  return detail || `خطای Gemini (کد ${status})`;
}

async function generatePart(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  retried = false
): Promise<GeminiImageResult> {
  const r = await geminiFetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 120_000,
      maxAttempts: 5,
    }
  );

  if (!r.reachedGoogle) {
    return { ok: false, message: "اتصال به Google AI برقرار نشد (محدودیت منطقه‌ای یا شبکه)." };
  }

  let json: {
    error?: { message?: string };
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string } }[] } };
    promptFeedback?: { blockReason?: string };
  } = {};
  try {
    json = JSON.parse(r.bodyText);
  } catch {
    return { ok: false, message: "پاسخ نامعتبر از Google AI." };
  }

  if (r.status !== 200) {
    const detail = String(json?.error?.message ?? "");
    // Google renames models over time — auto-follow its suggestion once
    if (r.status === 404 && !retried) {
      const next = suggestedModel(detail);
      if (next && next !== model) {
        return generatePart(apiKey, next, body, true);
      }
    }
    return { ok: false, message: explain(r.status, detail), via: r.via };
  }

  const parts = json?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      const b64 = p?.inlineData?.data ?? p?.inline_data?.data;
      if (b64) return { ok: true, image_base64: String(b64), via: r.via };
    }
  }
  const blocked = json?.promptFeedback?.blockReason ?? json?.candidates?.[0]?.finishReason;
  return {
    ok: false,
    message: blocked
      ? `نانو‌بنانا این درخواست رو تولید نکرد (${blocked}). پرامپت رو عوض کن.`
      : "تصویری از نانو‌بنانا برنگشت؛ دوباره تلاش کن.",
    via: r.via,
  };
}

/** Text → image (Nano Banana). */
export async function geminiTextToImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspect?: string // "1:1" | "9:16" | "16:9" | "3:4" | "4:3"
): Promise<GeminiImageResult> {
  const generationConfig: Record<string, unknown> = { responseModalities: ["IMAGE"] };
  if (aspect) generationConfig.imageConfig = { aspectRatio: aspect };

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig,
  };
  let r = await generatePart(apiKey, model, body);
  // Older model revisions reject imageConfig — retry without it
  if (!r.ok && aspect && /imageConfig|aspect|Unknown name/i.test(r.message ?? "")) {
    delete generationConfig.imageConfig;
    r = await generatePart(apiKey, model, body);
  }
  return r;
}

/** Image + text → image (Nano Banana editing). */
export async function geminiEditImage(
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64: string,
  mime = "image/jpeg"
): Promise<GeminiImageResult> {
  const data = imageBase64.startsWith("data:")
    ? imageBase64.slice(imageBase64.indexOf(",") + 1)
    : imageBase64;

  const withImage: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType: mime, data } }],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  let r = await generatePart(apiKey, model, withImage);
  if (!r.ok && /responseModalities|modalit/i.test(r.message ?? "")) {
    withImage.generationConfig = { responseModalities: ["TEXT", "IMAGE"] };
    r = await generatePart(apiKey, model, withImage);
  }
  return r;
}

/** Map legacy WxH sizes to Gemini aspect ratios. */
export function sizeToAspect(size: string): string {
  const map: Record<string, string> = {
    "768x1344": "9:16",
    "720x1440": "9:16",
    "1344x768": "16:9",
    "1440x720": "16:9",
    "864x1152": "3:4",
    "1152x864": "4:3",
  };
  return map[size] ?? "1:1";
}
