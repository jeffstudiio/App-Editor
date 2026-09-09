import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const OR_BASE = "https://openrouter.ai/api/v1";

/**
 * Validates an OpenRouter key (if provided) and returns the live list of
 * currently-free models (`:free` ids). The free lineup rotates often, so the
 * client must always fetch this dynamically instead of a hardcoded list.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const apiKey = String(body?.apiKey ?? "").trim();

    // 1) Optional key validation via /key endpoint (never logged)
    if (apiKey) {
      const keyRes = await fetch(`${OR_BASE}/key`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);

      if (!keyRes) {
        return NextResponse.json(
          { ok: false, error: "اتصال به openrouter.ai برقرار نشد (اینترنت یا دسترسی شبکه)." },
          { status: 200 }
        );
      }
      if (keyRes.status === 401 || keyRes.status === 403) {
        return NextResponse.json(
          { ok: false, error: "کلید OpenRouter نامعتبره — دوباره چکش کن." },
          { status: 200 }
        );
      }
      if (!keyRes.ok) {
        return NextResponse.json(
          { ok: false, error: `بررسی کلید ناموفق بود (کد ${keyRes.status}).` },
          { status: 200 }
        );
      }
    }

    // 2) Public model catalog — free models first, then paid Google Gemini chat models
    const mRes = await fetch(`${OR_BASE}/models`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!mRes.ok) {
      return NextResponse.json(
        { ok: false, error: `دریافت لیست مدل‌ها ناموفق بود (کد ${mRes.status}).` },
        { status: 200 }
      );
    }
    const j = await mRes.json();
    const all = Array.isArray(j?.data) ? j.data : [];
    const free = all
      .filter((m: { id?: unknown }) => typeof m?.id === "string" && (m.id as string).endsWith(":free"))
      .filter((m: { id?: unknown }) => !/safety|moderation|guard|embed|whisper/i.test(String(m.id)))
      .map((m: { id: string; name?: string; context_length?: number }) => ({
        id: m.id,
        name: String(m?.name ?? m.id).replace(/\s*\(free\)\s*$/i, ""),
        context: Number(m?.context_length ?? 0),
        paid: false,
      }))
      .sort((a: { context: number }, b: { context: number }) => b.context - a.context);

    // Real Google Gemini models on OpenRouter (paid — need a small top-up, but
    // they run server-side with zero region restrictions)
    const paidGemini = all
      .filter((m: { id?: unknown }) => typeof m?.id === "string" && (m.id as string).startsWith("google/gemini"))
      .filter((m: { id?: unknown }) => !/:free|:batch|image|imagen|aqa/i.test(String(m.id)))
      .map((m: { id: string; name?: string; context_length?: number }) => ({
        id: m.id,
        name: String(m?.name ?? m.id).replace(/^Google:\s*/i, ""),
        context: Number(m?.context_length ?? 0),
        paid: true,
      }))
      .sort((a: { context: number }, b: { context: number }) => b.context - a.context)
      .slice(0, 6);

    const models = [...free, ...paidGemini];

    return NextResponse.json({ ok: true, models, keyValid: Boolean(apiKey) });
  } catch (e) {
    console.error("[openrouter-models] error:", e);
    return NextResponse.json(
      { ok: false, error: "اتصال به openrouter.ai برقرار نشد." },
      { status: 200 }
    );
  }
}
