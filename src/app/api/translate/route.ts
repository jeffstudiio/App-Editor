import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit } from "@/lib/ai/server/route-helpers";

export const maxDuration = 120;

const LANG_NAMES: Record<string, string> = {
  fa: "فارسی (Persian)",
  en: "انگلیسی (English)",
  ar: "عربی (Arabic)",
  tr: "ترکی استانبولی (Turkish)",
  zh: "چینی (Chinese)",
  es: "اسپانیایی (Spanish)",
};

function sysPrompt(mode: "translate" | "fix", target: string): string {
  if (mode === "translate") {
    return `تو مترجم حرفه‌ای زیرنویس و دوبله هستی. جمله‌های کاربر را به ${LANG_NAMES[target]} ترجمه کن. قواعد:
1) اگر جمله از قبل به همان زبان مقصد بود، فقط غلط‌های تایپی واضح را درست کن و کلمات را عوض نکن (بازنویسی و خلاصه ممنوع).
2) معنا و طول جمله را نزدیک اصل نگه دار (مناسب تایمینگ زیرنویس).
3) برای زبان مقصد از واژه‌های طبیعی گفتاری استفاده کن.
فقط خروجی JSON را بده؛ توضیح نده.`;
  }
  return `تو ویراستار حرفه‌ای متن فارسی هستی. متن‌های خام تشخیص گفتار (ASR) را اصلاح کن: نیم‌فاصله‌ها را درست کن، علائم سجاوندی را اضافه کن و غلط‌های تایپی واضح را درست کن. کلمات را عوض نکن، خلاصه نکن و زبان را تغییر نده. فقط متن اصلاح‌شده را بده؛ توضیح نده.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runBatch(zai: Awaited<ReturnType<typeof ZAI.create>>, mode: "translate" | "fix", target: string, segments: string[]): Promise<string[]> {
  const userPayload = JSON.stringify(segments.map((text, i) => ({ i, text })));

  // retry with backoff — the LLM API occasionally rate-limits (429)
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: sysPrompt(mode, target) },
          {
            role: "user",
            content: `${userPayload}\n\nخروجی را دقیقاً به شکل JSON آرایه بده بدون هیچ متن اضافه: [{"i":0,"text":"..."},...]`,
          },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      });

      const raw = completion?.choices?.[0]?.message?.content ?? "";
      const m = raw.match(/\[[\s\S]*\]/);
      if (!m) throw new Error("bad-llm-output");
      const arr = JSON.parse(m[0]) as { i: number; text: string }[];
      const out = [...segments];
      let hits = 0;
      for (const item of arr) {
        if (typeof item?.i === "number" && item.i >= 0 && item.i < out.length && typeof item.text === "string" && item.text.trim()) {
          out[item.i] = item.text.trim();
          hits++;
        }
      }
      if (hits === 0) throw new Error("empty-llm-output");
      // guard A: for fa targets, a Persian source must stay essentially intact.
      // allows light fixes (≤40% word change: نیم‌فاصله، علائم، غلط ASR) and
      // rejects creative rewrites; non-Persian ASR garbage is translated normally.
      const isFa = (s: string) => /[\u0600-\u06FF]/.test(s);
      if (mode === "translate" && target === "fa" || mode === "fix") {
        for (let i = 0; i < out.length; i++) {
          const src = segments[i] ?? "";
          if (!isFa(src)) continue; // non-Persian input → LLM output accepted as-is
          const srcWords = new Set(src.split(/\s+/).filter(Boolean));
          const outWords = out[i].split(/\s+/).filter(Boolean);
          if (!outWords.length || !srcWords.size || !isFa(out[i])) {
            out[i] = src; // empty or drifted to another script → keep original
            continue;
          }
          const changed = outWords.filter((w) => !srcWords.has(w)).length;
          if (changed / outWords.length > 0.4) out[i] = src;
        }
      }
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
    const target: string = LANG_NAMES[targetKey] ? targetKey : "fa";
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
