// ─────────────────────────────────────────────────────────────
// کلاس پایهٔ ارائه‌دهنده‌های سازگار با OpenAI Chat API
// (OpenRouter / Groq / HuggingFace-Router همه همین شکل را دارند)
// ─────────────────────────────────────────────────────────────

import { AIError, isAbortError } from "../core/ai-errors";
import type {
  AICapability,
  AIOutput,
  AIRequest,
  ChatMessage,
  ProviderHealth,
} from "../core/provider-types";

export interface OpenAIChatConfig {
  chatUrl: string;
  defaultModel: string;
  /** هدرهای اضافه (مثل HTTP-Referer برای OpenRouter) */
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export class OpenAIChatBase {
  constructor(protected cfg: OpenAIChatConfig) {}

  async chat(messages: ChatMessage[], opts: { model?: string; temperature?: number; maxTokens?: number; jsonMode?: boolean; apiKey: string }): Promise<string> {
    let res: Response;
    try {
      res = await fetch(this.cfg.chatUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          ...this.cfg.extraHeaders,
        },
        body: JSON.stringify({
          model: opts.model || this.cfg.defaultModel,
          messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 4096,
          ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 90_000),
      });
    } catch (err) {
      if (isAbortError(err)) throw new AIError("timeout");
      throw new AIError("network", { detail: this.cfg.chatUrl });
    }

    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = String(j?.error?.message ?? "");
      } catch {
        // body غیر JSON
      }
      throw AIError.fromHttpStatus(res.status, detail || undefined);
    }

    const json = await res.json().catch(() => null);
    const msg = json?.choices?.[0]?.message;
    const raw = String(msg?.content ?? msg?.reasoning ?? "");
    // مدل‌های reasoning ممکن است پاسخ را داخل <think> بگذارند
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!text) throw new AIError("bad_response", { detail: "پاسخ خالی از مدل" });
    return text;
  }

  /** پینگ واقعی: GET models یا معادل سبک */
  async pingModels(apiKey: string, modelsUrl: string): Promise<ProviderHealth> {
    try {
      const res = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return { state: "available", checkedAt: Date.now() };
      if (res.status === 401 || res.status === 403) return { state: "auth_error", detail: "کلید نامعتبر", checkedAt: Date.now() };
      if (res.status === 429) return { state: "rate_limited", checkedAt: Date.now() };
      return { state: "unavailable", detail: `HTTP ${res.status}`, checkedAt: Date.now() };
    } catch (err) {
      return { state: "unavailable", detail: isAbortError(err) ? "timeout" : "network", checkedAt: Date.now() };
    }
  }

  supportsChatOf(req: AIRequest, cap: AICapability): boolean {
    return (
      (cap === "text_generation" || cap === "fast_text" || cap === "translation") &&
      (req.capability === "text_generation" || req.capability === "fast_text" || req.capability === "translation")
    );
  }

  output(text: string): AIOutput {
    return { kind: "text", text };
  }
}
