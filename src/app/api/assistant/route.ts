// ─────────────────────────────────────────────────────────────
// POST /api/assistant — مکالمهٔ پرسونا از طریق Capability Router
// بازآرایی بر پایهٔ معماری provider (§5-§7) با حفظ قرارداد پاسخ
// {content, engine, via?, notice?} برای AssistantView موجود
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/core/ai-errors";
import type { AIResult, ChatMessage } from "@/lib/ai/core/provider-types";
import { aiServer, credsOf } from "@/lib/ai/server/registry";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { PERSONAS, type PersonaId } from "@/lib/studio-data";

export const maxDuration = 120;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`assistant:${clientIp(req)}`, RATE_PRESETS.chat);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های چت زیاد بوده — چند لحظه صبر کن و دوباره بفرست." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const personaId = body?.personaId as PersonaId;
    const messages = Array.isArray(body?.messages) ? (body.messages as IncomingMessage[]) : null;

    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) {
      return NextResponse.json({ error: "پرسونای نامعتبر است." }, { status: 400 });
    }
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "پیامی برای ارسال وجود ندارد." }, { status: 400 });
    }

    // کانتکست لاغر: ۱۶ پیام آخر، هر کدام حداکثر ۶۰۰۰ حرف
    const trimmed: IncomingMessage[] = (
      messages.slice(-16).map((m: IncomingMessage) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content ?? "").slice(0, 6000),
      })) as IncomingMessage[]
    ).filter((m: IncomingMessage) => m.content.trim().length > 0);

    if (trimmed.length === 0) {
      return NextResponse.json({ error: "پیام خالی است." }, { status: 400 });
    }

    const { apiKey, model } = credsOf(body);
    const prefer =
      body?.provider === "openrouter" || body?.provider === "gemini" ? (body.provider as "openrouter" | "gemini") : undefined;

    const chatMessages: ChatMessage[] = [
      { role: "system", content: persona.systemPrompt },
      ...trimmed.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    ];

    const { router } = aiServer();
    let result: AIResult;
    try {
      result = await router.route(
        "text_generation",
        { capability: "text_generation", messages: chatMessages, model, apiKey },
        { prefer },
      );
    } catch (err) {
      if (err instanceof AIError) {
        // خطای پیکربندیِ انتخاب صریح کاربر → شفاف (۴۰۰)؛ بقیه → ۵xx با پیام فارسی
        const status = prefer && err.fatal ? 400 : err.httpStatus;
        return NextResponse.json(
          { error: err.userMessage, engine: prefer ?? undefined },
          { status },
        );
      }
      throw err;
    }

    const engine = engineName(result.provider.id);
    const failed = result.attempts.filter((a) => !a.ok && !a.skipped);
    const notice = failed.length ? `${failed.map((a) => a.error).join("؛ ")} — با ${engineLabel(engine)} پاسخ دادم.` : undefined;

    return NextResponse.json({
      content: result.output.kind === "text" ? result.output.text : "",
      engine,
      via: result.via,
      ...(notice ? { notice } : {}),
    });
  } catch (err) {
    console.error("[assistant] error:", err);
    return NextResponse.json(
      { error: "ارتباط با دستیار هنری برقرار نشد. چند لحظه بعد دوباره امتحان کن." },
      { status: 500 },
    );
  }
}

/** نگاشت id داخلی → نام موتورِ قرارداد قبلی */
function engineName(providerId: string): string {
  if (providerId === "zai") return "default";
  return providerId; // "gemini" | "openrouter" | "groq" | "huggingface"
}

function engineLabel(engine: string): string {
  switch (engine) {
    case "default":
      return "دستیار داخلی";
    case "gemini":
      return "Gemini";
    case "openrouter":
      return "مدل رایگان OpenRouter";
    case "groq":
      return "Groq";
    default:
      return engine;
  }
}
