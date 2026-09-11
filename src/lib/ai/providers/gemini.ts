// ─────────────────────────────────────────────────────────────
// Gemini Provider — بازآراییِ پیاده‌سازی موجود به معماری provider (§8A)
// از لایهٔ انتقال geminiFetch موجود استفاده می‌کند (تکرار ممنوع)
// قابلیت‌ها فقط آن‌هایی که واقعاً پیاده شده‌اند — ادعای اضافه ممنوع
// ─────────────────────────────────────────────────────────────

import { geminiFetch } from "@/lib/video/gemini-client";
import { geminiEditImage, geminiTextToImage } from "@/lib/video/gemini-image";
import { AIError } from "../core/ai-errors";
import { GEMINI_BASE, MODELS } from "../model-defaults";
import type {
  AICapability,
  AIOutput,
  AIProvider,
  AIRequest,
  ProviderHealth,
  ProviderId,
  PricingTier,
} from "../core/provider-types";

const CAPABILITIES: AICapability[] = [
  "text_generation",
  "fast_text",
  "translation",
  "image_generation",
  "image_editing",
  "speech_to_text",
];

export class GeminiProvider implements AIProvider {
  readonly id: ProviderId = "gemini";
  readonly name = "Google Gemini";
  readonly capabilities = CAPABILITIES;
  readonly pricingTier: PricingTier = "free_tier";
  readonly requiresApiKey = true;
  readonly envKey = "GEMINI_API_KEY";
  readonly docsUrl = "https://ai.google.dev/docs";

  constructor(private resolveKey: (byo?: string) => string = (b) => b ?? "") {}

  supports(cap: AICapability): boolean {
    return CAPABILITIES.includes(cap);
  }

  isAvailable(byoKey?: string): boolean {
    return Boolean(this.resolveKey(byoKey));
  }

  healthCheck(byoKey?: string): ProviderHealth {
    return this.isAvailable(byoKey)
      ? { state: "unknown", detail: "تنظیم شده — هنوز در این اجرا آزموده نشده", checkedAt: Date.now() }
      : { state: "not_configured", detail: "کلید Gemini لازم است", checkedAt: Date.now() };
  }

  async verify(byoKey?: string): Promise<ProviderHealth> {
    const key = this.resolveKey(byoKey);
    if (!key) return { state: "not_configured", detail: "کلید Gemini لازم است", checkedAt: Date.now() };
    try {
      const r = await geminiFetch(`${GEMINI_BASE}/models?pageSize=1&key=${encodeURIComponent(key)}`, {
        method: "GET",
        timeoutMs: 25_000,
        maxAttempts: 3,
      });
      if (r.reachedGoogle && r.status === 200) return { state: "available", checkedAt: Date.now() };
      if (r.status === 401 || r.status === 400) return { state: "auth_error", detail: "کلید نامعتبر", checkedAt: Date.now() };
      if (r.status === 429) return { state: "rate_limited", checkedAt: Date.now() };
      return { state: "unavailable", detail: `HTTP ${r.status}`, checkedAt: Date.now() };
    } catch (err) {
      return { state: "unavailable", detail: err instanceof Error ? err.message : "خطا", checkedAt: Date.now() };
    }
  }

  async execute(req: AIRequest): Promise<AIOutput> {
    const key = this.resolveKey(req.apiKey);
    if (!key) throw new AIError("missing_key", { fatal: true });

    switch (req.capability) {
      case "text_generation":
      case "fast_text":
      case "translation":
        return this.chat(key, req);
      case "image_generation": {
        const g = await geminiTextToImage(
          key,
          req.model || MODELS.geminiImage,
          req.prompt.slice(0, 1500),
          aspectOf(req.size),
        );
        if (!g.ok || !g.image_base64) throw new AIError("bad_response", { detail: g.message });
        return { kind: "image", imageBase64: g.image_base64, via: g.via } as AIOutput;
      }
      case "image_editing": {
        const g = await geminiEditImage(key, req.model || MODELS.geminiImage, req.prompt.slice(0, 1500), req.imageBase64);
        if (!g.ok || !g.image_base64) throw new AIError("bad_response", { detail: g.message });
        return { kind: "image", imageBase64: g.image_base64, via: g.via } as AIOutput;
      }
      case "speech_to_text":
        return this.transcribe(key, req);
      default:
        throw new AIError("invalid_input", { detail: `gemini نمی‌تواند ${req.capability}` });
    }
  }

  /** speech_to_text — inline audio در generateContent (BYOK؛ روی استاتیک هم کار می‌کند) */
  private async transcribe(key: string, req: Extract<AIRequest, { capability: "speech_to_text" }>): Promise<AIOutput> {
    const model = req.model || MODELS.geminiText;
    const mime = req.audioMime && /^audio\/[a-z0-9.+-]+$/i.test(req.audioMime) ? req.audioMime : "audio/wav";
    const body: Record<string, unknown> = {
      contents: [
        {
          parts: [
            { text: "Transcribe the spoken words in this audio exactly as spoken. Reply with the transcript text only — no commentary, no timestamps. The audio may be Persian (fa) or any language." },
            { inline_data: { mime_type: mime, data: req.audioBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    };
    const r = await geminiFetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", body: JSON.stringify(body), timeoutMs: 90_000, maxAttempts: 4, quotaWait: true },
    );
    if (!r.reachedGoogle) throw new AIError("region", { detail: "محدودیت منطقه‌ای گوگل" });
    let j: { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string }[] } } } = {};
    try {
      j = JSON.parse(r.bodyText);
    } catch {
      throw new AIError("bad_response", { detail: "پاسخ نامعتبر از Gemini" });
    }
    if (r.status !== 200) throw AIError.fromHttpStatus(r.status, String(j?.error?.message ?? "") || undefined);
    const parts = j?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => String(p?.text ?? "")).join("").trim() : "";
    if (!text) throw new AIError("bad_response", { detail: "بازنویسی خالی از Gemini" });
    return { kind: "text", text, via: r.via } as AIOutput;
  }

  private async chat(key: string, req: Extract<AIRequest, { capability: "text_generation" | "fast_text" | "translation" }>): Promise<AIOutput> {
    const model = req.model || MODELS.geminiText;
    const system = req.messages.find((m) => m.role === "system");
    const turns = req.messages.filter((m) => m.role !== "system");
    const body: Record<string, unknown> = {
      contents: turns.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 4096,
        ...(req.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    };
    if (system) body.systemInstruction = { parts: [{ text: system.content }] };

    const r = await geminiFetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", body: JSON.stringify(body), timeoutMs: 90_000, maxAttempts: 6, quotaWait: true },
    );

    if (!r.reachedGoogle) {
      throw new AIError("region", { detail: "محدودیت منطقه‌ای گوگل از سرور" });
    }
    let j: { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string }[] } } } = {};
    try {
      j = JSON.parse(r.bodyText);
    } catch {
      throw new AIError("bad_response", { detail: "پاسخ نامعتبر از Gemini" });
    }
    if (r.status !== 200) {
      const detail = String(j?.error?.message ?? "");
      throw AIError.fromHttpStatus(r.status, detail || undefined);
    }
    const parts = j?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => String(p?.text ?? "")).join("").trim() : "";
    if (!text) throw new AIError("bad_response", { detail: "پاسخ خالی از Gemini" });
    return { kind: "text", text, via: r.via } as AIOutput;
  }
}

function aspectOf(size?: string): "1:1" | "9:16" | "16:9" | "3:4" | "4:3" {
  // همان نگاشت sizeToAspect از gemini-image.ts — اینجا فقط برای امضای provider
  switch (size) {
    case "1024x1024":
      return "1:1";
    case "1344x768":
    case "1440x720":
    case "1152x864":
      return "16:9";
    case "864x1152":
      return "3:4";
    case "768x1344":
    case "720x1440":
      return "9:16";
    default:
      return "9:16";
  }
}
