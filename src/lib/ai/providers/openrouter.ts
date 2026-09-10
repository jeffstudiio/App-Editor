// ─────────────────────────────────────────────────────────────
// OpenRouter Provider — BYO key، مدل‌های :free
// (§10 مشابه — نقش «متن عمومی رایگان» را دارد)
// ─────────────────────────────────────────────────────────────

import { AIError } from "../core/ai-errors";
import { OPENROUTER_KEY_URL, OPENROUTER_MODELS_URL, OPENROUTER_URL } from "../model-defaults";
import { OpenAIChatBase } from "./openai-chat";
import type {
  AICapability,
  AIOutput,
  AIProvider,
  AIRequest,
  ProviderHealth,
  ProviderId,
  PricingTier,
} from "../core/provider-types";

const CAPABILITIES: AICapability[] = ["text_generation", "fast_text", "translation"];

export class OpenRouterProvider implements AIProvider {
  readonly id: ProviderId = "openrouter";
  readonly name = "OpenRouter (رایگان BYO)";
  readonly capabilities = CAPABILITIES;
  readonly pricingTier: PricingTier = "free_tier";
  readonly requiresApiKey = true;
  readonly envKey = "OPENROUTER_API_KEY";
  readonly docsUrl = "https://openrouter.ai/docs";

  private base = new OpenAIChatBase({
    chatUrl: OPENROUTER_URL,
    defaultModel: "", // کاربر باید مدل انتخاب کند
    extraHeaders: { "HTTP-Referer": "https://creative-studio.app", "X-Title": "JEFF Creative Studio" },
  });

  constructor(private resolveKey: (byo?: string) => string = (b) => b ?? "") {}

  supports(cap: AICapability, req?: AIRequest): boolean {
    if (!CAPABILITIES.includes(cap)) return false;
    // مدل اجباری است (مسیر موجود هم همین را می‌خواهد)
    if (req && "model" in req && !req.model) return false;
    return true;
  }

  isAvailable(byoKey?: string): boolean {
    return Boolean(this.resolveKey(byoKey));
  }

  healthCheck(byoKey?: string): ProviderHealth {
    return this.isAvailable(byoKey)
      ? { state: "unknown", checkedAt: Date.now() }
      : { state: "not_configured", detail: "کلید و مدل OpenRouter لازم است", checkedAt: Date.now() };
  }

  async verify(byoKey?: string): Promise<ProviderHealth> {
    const key = this.resolveKey(byoKey);
    if (!key) return { state: "not_configured", detail: "کلید لازم است", checkedAt: Date.now() };
    try {
      const res = await fetch(OPENROUTER_KEY_URL, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return { state: "available", checkedAt: Date.now() };
      if (res.status === 401 || res.status === 403) return { state: "auth_error", detail: "کلید نامعتبر", checkedAt: Date.now() };
      return { state: "unavailable", detail: `HTTP ${res.status}`, checkedAt: Date.now() };
    } catch {
      return { state: "unavailable", detail: "network", checkedAt: Date.now() };
    }
  }

  async execute(req: AIRequest): Promise<AIOutput> {
    if (!this.supports(req.capability, req) || !("messages" in req)) {
      throw new AIError("invalid_input", { detail: "مدل OpenRouter انتخاب نشده یا قابلیت پشتیبانی نمی‌شود" });
    }
    const key = this.resolveKey(req.apiKey);
    if (!key) throw new AIError("missing_key", { fatal: true });
    const text = await this.base.chat(req.messages, {
      model: req.model,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      jsonMode: req.jsonMode,
      apiKey: key,
    });
    return this.base.output(text);
  }
}
