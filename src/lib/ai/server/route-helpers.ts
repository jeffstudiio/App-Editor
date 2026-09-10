// ─────────────────────────────────────────────────────────────
// Route helpers — محافظ حجم بدنه + نگاشت خطای یکپارچه (§35/§36)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { AIError } from "../core/ai-errors";

/** خواندن JSON با سقف حجم — جلوی انفجار حافظه را می‌گیرد */
export async function readJsonWithLimit(req: Request, maxBytes: number): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; resp: NextResponse }> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) {
    return {
      ok: false,
      resp: NextResponse.json(
        { error: `حجم درخواست بیش از حد مجاز است (سقف ${Math.round(maxBytes / 1024 / 1024)}MB).` },
        { status: 413 },
      ),
    };
  }
  const text = await req.text();
  if (text.length > maxBytes) {
    return {
      ok: false,
      resp: NextResponse.json(
        { error: `حجم درخواست بیش از حد مجاز است (سقف ${Math.round(maxBytes / 1024 / 1024)}MB).` },
        { status: 413 },
      ),
    };
  }
  try {
    return { ok: true, body: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { ok: false, resp: NextResponse.json({ error: "بدنهٔ JSON نامعتبر است." }, { status: 400 }) };
  }
}

/** نگاشت AIError → پاسخ HTTP با پیام فارسیِ قابل‌فهم */
export function aiErrorResponse(err: unknown, fallbackMessage: string): NextResponse {
  if (err instanceof AIError) {
    return NextResponse.json(
      { error: err.userMessage, code: err.code },
      { status: err.httpStatus, headers: err.code === "rate_limit" ? { "Retry-After": "20" } : undefined },
    );
  }
  console.error("[ai-route]", err);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

/** تخمین بایت از رشتهٔ base64 (برای سقف‌گذاری رسانه) */
export function base64Bytes(b64: string): number {
  const cleaned = b64.startsWith("data:") ? b64.slice(b64.indexOf(",") + 1) : b64;
  return Math.ceil((cleaned.length * 3) / 4);
}

/**
 * R1: نقشهٔ کلید per-provider را از بدنهٔ درخواست تمیز می‌کند.
 * فقط providerهای شناخته‌شدهٔ کلیددار؛ بقیهٔ فیلدها دور ریخته می‌شوند.
 */
const KEYED_PROVIDERS = ["gemini", "openrouter", "groq", "huggingface", "jina"] as const;

export function sanitizeKeys(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const pid of KEYED_PROVIDERS) {
    const v = String(r[pid] ?? "").trim();
    if (v) out[pid] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
