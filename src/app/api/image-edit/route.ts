// ─────────────────────────────────────────────────────────────
// POST /api/image-edit — ویرایش تصویر از طریق Capability Router
// قرارداد قبلی حفظ شده + سقف حجم ورودی (§36)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/core/ai-errors";
import { base64Bytes, readJsonWithLimit, sanitizeKeys } from "@/lib/ai/server/route-helpers";
import { aiServer } from "@/lib/ai/server/registry";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";

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

const MAX_BODY_BYTES = 12 * 1024 * 1024; // تصویر base64 — سقف ~۸MB رسانه

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`img-edit:${clientIp(req)}`, RATE_PRESETS.heavy);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های ویرایش تصویر زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await readJsonWithLimit(req, MAX_BODY_BYTES);
    if (!body.ok) return body.resp;
    const prompt = String(body.body?.prompt ?? "").trim();
    const imageBase64 = String(body.body?.image_base64 ?? "");
    const size = SIZES.has(String(body.body?.size)) ? String(body.body.size) : "1024x1024";

    if (!prompt || !imageBase64) {
      return NextResponse.json({ error: "prompt و image_base64 الزامی هستند." }, { status: 400 });
    }
    if (base64Bytes(imageBase64) > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "تصویر ورودی بزرگ‌تر از ۸ مگابایت است." }, { status: 413 });
    }

    const apiKey = String(body.body?.apiKey ?? "").trim() || undefined;
    const model = String(body.body?.model ?? "").trim() || undefined;
    const keys = sanitizeKeys(body.body?.keys);
    const prefer = body.body?.engine === "gemini" ? ("gemini" as const) : undefined;

    const { router } = aiServer();
    const result = await router.route(
      "image_editing",
      { capability: "image_editing", prompt: prompt.slice(0, 1500), imageBase64, size, apiKey, model, keys },
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
    console.error("[image-edit] error:", err);
    return NextResponse.json({ error: "ویرایش هوشمند تصویر ناموفق بود؛ دوباره تلاش کن." }, { status: 500 });
  }
}
