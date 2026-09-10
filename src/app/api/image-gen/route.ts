// ─────────────────────────────────────────────────────────────
// POST /api/image-gen — تولید تصویر از طریق Capability Router
// قرارداد قبلی حفظ شده: {prompt, size, engine?, apiKey?, model?}
// زنجیره: انتخاب صریح (gemini) → وگرنه zai → gemini(کلید سرور)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/core/ai-errors";
import { aiServer } from "@/lib/ai/server/registry";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit, sanitizeKeys } from "@/lib/ai/server/route-helpers";

export const maxDuration = 180;

const SIZES = new Set([
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
]);

const MAX_BODY_BYTES = 2 * 1024 * 1024; // فقط متن — ۲MB کافی است

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`img-gen:${clientIp(req)}`, RATE_PRESETS.heavy);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های تولید تصویر زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await readJsonWithLimit(req, MAX_BODY_BYTES);
    if (!body.ok) return body.resp;
    const prompt = String(body.body?.prompt ?? "").trim();
    const size = SIZES.has(String(body.body?.size)) ? String(body.body.size) : "768x1344";
    if (!prompt) {
      return NextResponse.json({ error: "prompt الزامی است." }, { status: 400 });
    }

    const apiKey = String(body.body?.apiKey ?? "").trim() || undefined;
    const model = String(body.body?.model ?? "").trim() || undefined;
    const keys = sanitizeKeys(body.body?.keys);
    const prefer = body.body?.engine === "gemini" ? ("gemini" as const) : undefined;

    const { router } = aiServer();
    const result = await router.route(
      "image_generation",
      { capability: "image_generation", prompt: prompt.slice(0, 1500), size, apiKey, model, keys },
      { prefer },
    );
    if (result.output.kind !== "image") {
      return NextResponse.json({ error: "خروجی تصویر نامعتبر بود." }, { status: 502 });
    }
    return NextResponse.json({
      image_base64: result.output.imageBase64,
      engine: result.provider.id === "zai" ? undefined : result.provider.id,
      via: result.via,
    });
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    console.error("[image-gen] error:", err);
    return NextResponse.json({ error: "تولید تصویر ناموفق بود؛ چند لحظه بعد دوباره تلاش کن." }, { status: 500 });
  }
}
