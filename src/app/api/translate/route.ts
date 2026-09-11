import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit } from "@/lib/ai/server/route-helpers";
import { translateSystemPrompt, applyTranslateBatch, isKnownLang } from "@/lib/ai/shared/prompts";

export const maxDuration = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runBatch(zai: Awaited<ReturnType<typeof ZAI.create>>, mode: "translate" | "fix", target: string, segments: string[]): Promise<string[]> {
  const userPayload = JSON.stringify(segments.map((text, i) => ({ i, text })));

  // retry with backoff — the LLM API occasionally rate-limits (429)
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: translateSystemPrompt(mode, target) },
          {
            role: "user",
            content: `${userPayload}\n\nخروجی را دقیقاً به شکل JSON آرایه بده بدون هیچ متن اضافه: [{"i":0,"text":"..."},...]`,
          },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      });

      const raw = completion?.choices?.[0]?.message?.content ?? "";
      const out = applyTranslateBatch(segments, raw, mode, target);
      if (!out) throw new Error("empty-llm-output");
      return out;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") || msg.includes("rate")) {
        await sleep(1600 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("llm-failed");
}

/**
 * Two modes:
 *  - "translate": translate subtitle segments into the target language
 *  - "fix": repair ASR output (punctuation, half-spaces, obvious typos) WITHOUT translating
 * Input:  { mode, target?, segments: string[] }
 * Output: { segments: string[] }  (same order/length)
 */
export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`translate:${clientIp(req)}`, RATE_PRESETS.light);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های ترجمه زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
    const parsed = await readJsonWithLimit(req, 256 * 1024);
    if (!parsed.ok) return parsed.resp;
    const body = parsed.body;
    const mode: "translate" | "fix" = body?.mode === "fix" ? "fix" : "translate";
    const targetKey = String(body?.target ?? "");
    const target: string = isKnownLang(targetKey) ? targetKey : "fa";
    const segments: string[] = Array.isArray(body?.segments)
      ? body.segments.slice(0, 120).map((s: unknown) => String(s ?? "").slice(0, 4000))
      : [];

    if (!segments.length || segments.every((s) => !s.trim())) {
      return NextResponse.json({ error: "متنی برای پردازش ارسال نشده." }, { status: 400 });
    }

    const zai = await ZAI.create();

    let result: string[];
    if (segments.length <= 24) {
      result = await runBatch(zai, mode, target, segments);
    } else {
      // split into chunks of ≤24 and run in parallel waves
      const chunks: string[][] = [];
      for (let i = 0; i < segments.length; i += 24) chunks.push(segments.slice(i, i + 24));
      const results = await Promise.all(chunks.map((c) => runBatch(zai, mode, target, c)));
      result = results.flat();
    }
    return NextResponse.json({ segments: result });
  } catch (err) {
    console.error("[translate] error:", err);
    return NextResponse.json(
      { error: "پردازش متن با AI ناموفق بود؛ دوباره تلاش کن." },
      { status: 500 }
    );
  }
}
