// ─────────────────────────────────────────────────────────────
// POST /api/transcribe — ASR از طریق Capability Router (§54)
// زنجیره: zai (پلتفرم) → gemini (BYO/سرور) — سقف حجم حفظ شده
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/core/ai-errors";
import { base64Bytes, readJsonWithLimit } from "@/lib/ai/server/route-helpers";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { aiServer, credsOf } from "@/lib/ai/server/registry";

export const maxDuration = 120;

const MAX_BODY_BYTES = 16 * 1024 * 1024; // سقف رسانهٔ صوتی ~۱۰MB

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`asr:${clientIp(req)}`, RATE_PRESETS.heavy);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های تبدیل گفتار زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await readJsonWithLimit(req, MAX_BODY_BYTES);
    if (!body.ok) return body.resp;
    const audioBase64 = body.body?.audio_base64 as string;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return NextResponse.json({ error: "audio_base64 الزامی است." }, { status: 400 });
    }
    if (base64Bytes(audioBase64) > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "فایل صوتی بزرگ‌تر از ۱۰ مگابایت است — بخش کوتاه‌تری بفرست." }, { status: 413 });
    }

    const creds = credsOf(body.body ?? {});
    const { router } = aiServer();
    const result = await router.route(
      "speech_to_text",
      { capability: "speech_to_text", audioBase64, audioMime: "audio/wav", ...creds },
      { prefer: body.body?.provider === "gemini" ? "gemini" : undefined },
    );
    if (result.output.kind !== "text" || !result.output.text.trim()) {
      return NextResponse.json({ error: "تبدیل گفتار به متن ناموفق بود؛ بخش صوتی معتبر نیست." }, { status: 502 });
    }
    return NextResponse.json({ text: result.output.text.trim(), engine: result.provider.id });
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    console.error("[transcribe] error:", err);
    return NextResponse.json(
      { error: "تبدیل گفتار به متن ناموفق بود؛ بخش صوتی معتبر نیست یا خیلی بزرگ است." },
      { status: 500 },
    );
  }
}
