import { NextRequest, NextResponse } from "next/server";
import { geminiFetch } from "@/lib/video/gemini-client";

export const maxDuration = 60;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
}

/** Curated fallback list (Google rotates model names; the 404 hint auto-follows). */
const STATIC_CHAT_MODELS = [
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash (پیش‌فرض)", context: 1000000 },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", context: 1000000 },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", context: 1000000 },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (پیش‌نمایش)", context: 2000000 },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", context: 1000000 },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", context: 1000000 },
];

/**
 * Validates a Google AI Studio key (or the server-installed GEMINI_API_KEY when
 * the caller has no key yet) and returns chat-capable Gemini models.
 * Free keys are created at https://aistudio.google.com/apikey
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bodyKey = String(body?.apiKey ?? "").trim();
    const envKey = String(process.env.GEMINI_API_KEY ?? "").trim();
    const apiKey = bodyKey || envKey;
    const serverKey = !bodyKey && Boolean(envKey);

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "اول کلید Gemini رو وارد کن.", serverKey: false },
        { status: 200 }
      );
    }

    const r = await geminiFetch(`${GEMINI_BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`, {
      method: "GET",
      timeoutMs: 30_000,
      maxAttempts: 5,
    });

    if (!r.reachedGoogle) {
      // Region gate blocked every path — serve a curated static list so the UI
      // still has selectable models (the chat route uses its own default anyway)
      return NextResponse.json({
        ok: true,
        serverKey,
        fallback: true,
        via: "none",
        models: STATIC_CHAT_MODELS,
      });
    }

    let j: { models?: GModel[]; error?: { message?: string } } = {};
    try {
      j = JSON.parse(r.bodyText);
    } catch {
      return NextResponse.json({ ok: false, error: "پاسخ نامعتبر از Google AI.", serverKey }, { status: 200 });
    }

    if (r.status !== 200) {
      const detail = String(j?.error?.message ?? "");
      const invalidKey = /api key not valid|API_KEY_INVALID/i.test(detail);
      return NextResponse.json(
        {
          ok: false,
          serverKey,
          error: invalidKey
            ? "کلید Gemini نامعتبره — از aistudio.google.com/apikey دوباره بگیر."
            : `دریافت مدل‌ها ناموفق بود (کد ${r.status}). ${detail.slice(0, 120)}`,
        },
        { status: 200 }
      );
    }

    const all: GModel[] = Array.isArray(j?.models) ? j.models : [];
    const models = all
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .filter((m) => typeof m.name === "string" && /gemini/i.test(m.name))
      .filter((m) => !/thinking|lite|image|tts|live|embed/i.test(m.name ?? ""))
      .map((m) => ({
        id: String(m.name ?? "").replace(/^models\//, ""),
        name: String(m.displayName ?? m.name ?? ""),
        context: Number(m.inputTokenLimit ?? 0),
      }))
      .sort((a, b) => b.context - a.context);

    return NextResponse.json({ ok: true, models, keyValid: true, serverKey, via: r.via });
  } catch (e) {
    console.error("[gemini-models] error:", e);
    return NextResponse.json({ ok: false, error: "اتصال به Google AI برقرار نشد." }, { status: 200 });
  }
}
