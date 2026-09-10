// ─────────────────────────────────────────────────────────────
// POST /api/ai/embeddings — امبدینگ برای جست‌وجوی معنایی (§11/§26)
// زنجیره: Jina (BYO/free-tier) → محلی (hashing، همیشه در دسترس)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/core/ai-errors";
import { aiServer } from "@/lib/ai/server/registry";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit } from "@/lib/ai/server/route-helpers";

export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`embed:${clientIp(req)}`, RATE_PRESETS.light);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های جست‌وجو زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await readJsonWithLimit(req, MAX_BODY_BYTES);
    if (!body.ok) return body.resp;
    const texts = Array.isArray(body.body?.texts) ? (body.body.texts as unknown[]).map(String).slice(0, 64) : [];
    const query = String(body.body?.query ?? "").trim();
    if (!query && texts.length === 0) {
      return NextResponse.json({ error: "query یا texts لازم است." }, { status: 400 });
    }
    const apiKey = String(body.body?.apiKey ?? "").trim() || undefined;

    const inputs = query ? [query, ...texts] : texts;
    const { router } = aiServer();
    const result = await router.route("embeddings", { capability: "embeddings", texts: inputs, apiKey });

    if (result.output.kind !== "embeddings") {
      return NextResponse.json({ error: "خروجی امبدینگ نامعتبر بود." }, { status: 502 });
    }
    const vectors = result.output.vectors;
    return NextResponse.json({
      ok: true,
      provider: result.provider.id, // "jina" | "local" — صادقانه
      vectors: query ? vectors.slice(1) : vectors,
      queryVector: query ? vectors[0] : null,
    });
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.userMessage, code: err.code }, { status: err.httpStatus });
    }
    console.error("[ai-embeddings] error:", err);
    return NextResponse.json({ error: "امبدینگ ناموفق بود؛ جست‌وجوی محلی را امتحان کن." }, { status: 500 });
  }
}
