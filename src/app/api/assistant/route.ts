import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { PERSONAS, type PersonaId } from "@/lib/studio-data";
import { geminiFetch, type GeminiVia } from "@/lib/video/gemini-client";

export const maxDuration = 120;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

type OrResult =
  | { ok: true; content: string; via?: undefined }
  | { ok: false; status: number; message: string };

async function callOpenRouter(
  systemPrompt: string,
  msgs: IncomingMessage[],
  apiKey: string,
  model: string
): Promise<OrResult> {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://creative-studio.app",
        "X-Title": "Creative Studio",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...msgs],
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = String(j?.error?.message ?? "");
      } catch {
        // ignore body parse errors
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: 401, message: "کلید OpenRouter نامعتبره — از تنظیمات دستیار درستش کن." };
      }
      if (res.status === 402) {
        return { ok: false, status: 402, message: "این مدل روی OpenRouter رایگان نیست یا اعتبار لازم داره — یه مدل با پسوند :free انتخاب کن." };
      }
      if (res.status === 429) {
        return { ok: false, status: 429, message: "محدودیت درخواست رایگان OpenRouter (۴۲۹)." };
      }
      return { ok: false, status: res.status, message: detail || `خطای OpenRouter (کد ${res.status})` };
    }

    const json = await res.json();
    const msg = json?.choices?.[0]?.message;
    // some reasoning models put the answer in `reasoning` or wrap it in <think>
    const raw = String(msg?.content ?? msg?.reasoning ?? "");
    const content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!content) {
      return { ok: false, status: 502, message: "پاسخی از مدل OpenRouter دریافت نشد." };
    }
    return { ok: true, content };
  } catch {
    return { ok: false, status: 0, message: "اتصال به openrouter.ai برقرار نشد (اینترنت یا دسترسی شبکه)." };
  }
}

async function callDefault(systemPrompt: string, msgs: IncomingMessage[]): Promise<string> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: systemPrompt },
      ...msgs,
    ],
    thinking: { type: "disabled" },
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

type GeminiResult =
  | { ok: true; content: string; via: GeminiVia }
  | { ok: false; status: number; message: string; region?: boolean };

async function callGemini(
  systemPrompt: string,
  msgs: IncomingMessage[],
  apiKey: string,
  model: string
): Promise<GeminiResult> {
  const modelId = model || "gemini-3.6-flash";
  const r = await geminiFetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: msgs.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      }),
      timeoutMs: 90_000,
      maxAttempts: 6,
      quotaWait: true,
    }
  );

  // Every path (direct + relays) hit the region gate / dead relays
  if (!r.reachedGoogle) {
    return {
      ok: false,
      status: 503,
      region: true,
      message: "جمنای از سرور در دسترس نبود (محدودیت منطقه‌ای گوگل).",
    };
  }

  let j: {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } };
  } = {};
  try {
    j = JSON.parse(r.bodyText);
  } catch {
    return { ok: false, status: 502, message: "پاسخ نامعتبر از Gemini." };
  }

  const detail = String(j?.error?.message ?? "");
  if (r.status !== 200) {
    if (/api key not valid|API_KEY_INVALID/i.test(detail)) {
      return { ok: false, status: 401, message: "کلید Gemini نامعتبره — از تنظیمات دستیار درستش کن." };
    }
    if (r.status === 403) {
      return { ok: false, status: 403, message: "دسترسی به Gemini داده نشد — کلیدت این قابلیت رو نداره." };
    }
    if (r.status === 429) {
      return { ok: false, status: 429, message: "سهمیهٔ رایگان Gemini موقتاً پر شده (۲۰ درخواست در دقیقه یا سقف روزانه) — کمی بعد دوباره امتحان کن." };
    }
    return { ok: false, status: r.status, message: detail || `خطای Gemini (کد ${r.status})` };
  }

  const parts = j?.candidates?.[0]?.content?.parts;
  const content = Array.isArray(parts)
    ? parts.map((p) => String(p?.text ?? "")).join("").trim()
    : "";
  if (!content) {
    return { ok: false, status: 502, message: "پاسخی از Gemini دریافت نشد." };
  }
  return { ok: true, content, via: r.via };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const personaId = body?.personaId as PersonaId;
    const messages = Array.isArray(body?.messages) ? body.messages : null;

    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) {
      return NextResponse.json(
        { error: "پرسونای نامعتبر است." },
        { status: 400 }
      );
    }
    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "پیامی برای ارسال وجود ندارد." },
        { status: 400 }
      );
    }

    // Keep context lean: last 16 turns, each capped in size
    const trimmed: IncomingMessage[] = messages
      .slice(-16)
      .map((m: IncomingMessage) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 6000),
      }))
      .filter((m: IncomingMessage) => m.content.trim().length > 0);

    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "پیام خالی است." },
        { status: 400 }
      );
    }

    // Optional user-owned providers (BYO keys): OpenRouter free models or Google Gemini.
    // Gemini can also run on the server-installed key (GEMINI_API_KEY) with zero config.
    const provider =
      body?.provider === "openrouter" || body?.provider === "gemini" ? (body.provider as "openrouter" | "gemini") : "default";
    if (provider !== "default") {
      const apiKey =
        String(body?.apiKey ?? "").trim() ||
        (provider === "gemini" ? String(process.env.GEMINI_API_KEY ?? "").trim() : "");
      const model = String(body?.model ?? "").trim();
      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              provider === "gemini"
                ? "کلید گوگل در دسترس نیست — کلید Gemini رو توی تنظیمات دستیار وارد کن."
                : "تنظیمات OpenRouter ناقصه؛ کلید و مدل رو در تنظیمات دستیار وارد کن.",
          },
          { status: 400 }
        );
      }
      if (provider === "openrouter" && !model) {
        return NextResponse.json(
          { error: "مدل OpenRouter انتخاب نشده؛ از تنظیمات دستیار یک مدل رایگان انتخاب کن." },
          { status: 400 }
        );
      }

      const r =
        provider === "gemini"
          ? await callGemini(persona.systemPrompt, trimmed, apiKey, model)
          : await callOpenRouter(persona.systemPrompt, trimmed, apiKey, model);
      if (r.ok) {
        return NextResponse.json({ content: r.content, engine: provider, via: r.via });
      }

      // Fatal config problems: surface clearly, do not silently switch engines
      if (r.status === 401 || r.status === 402 || r.status === 403) {
        return NextResponse.json({ error: r.message, engine: provider }, { status: 400 });
      }

      // Rate limit / region / network / transient: graceful fallback to the built-in engine
      try {
        const content = await callDefault(persona.systemPrompt, trimmed);
        if (content) {
          return NextResponse.json({
            content,
            engine: "default",
            notice: `${provider === "gemini" ? "Gemini" : "مدل رایگان OpenRouter"} جواب نداد (${r.message}) — با دستیار داخلی پاسخ دادم.`,
          });
        }
      } catch {
        // fall through to generic error
      }
      return NextResponse.json(
        { error: `${r.message} — و موتور داخلی هم پاسخ نداد؛ کمی بعد دوباره امتحان کن.` },
        { status: 502 }
      );
    }

    const content = await callDefault(persona.systemPrompt, trimmed);
    if (!content) {
      return NextResponse.json(
        { error: "پاسخی از دستیار دریافت نشد؛ دوباره تلاش کن." },
        { status: 502 }
      );
    }

    return NextResponse.json({ content, engine: "default" });
  } catch (err) {
    console.error("[assistant] error:", err);
    return NextResponse.json(
      { error: "ارتباط با دستیار هنری برقرار نشد. چند لحظه بعد دوباره امتحان کن." },
      { status: 500 }
    );
  }
}
