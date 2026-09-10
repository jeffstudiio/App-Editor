// ─────────────────────────────────────────────────────────────
// Groq Provider — §10: عملیات هوش مصنوعیِ «سریع»
// تفسیر فرمان عامل / متن ساخت‌یافتهٔ کم‌تأخیر
// free-tier واقعی (کلید لازم، BYO). هرگز رندر ویدیو نیست!
// ─────────────────────────────────────────────────────────────

import { AIError } from "../core/ai-errors";
import { GROQ_CHAT_URL, GROQ_MODELS_URL, MODELS } from "../model-defaults";
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

export class GroqProvider implements AIProvider {
  readonly id: ProviderId = "groq";
  readonly name = "Groq (سریع)";
  readonly capabilities = CAPABILITIES;
  readonly pricingTier: PricingTier = "free_tier";
  readonly requiresApiKey = true;
  readonly envKey = "GROQ_API_KEY";
  readonly docsUrl = "https://console.groq.com/docs";

  private base = new OpenAIChatBase({
    chatUrl: GROQ_CHAT_URL,
    defaultModel: MODELS.groqText,
    timeoutMs: 45_000, // تأکید بر سرعت
  });

  constructor(private resolveKey: (byo?: string) => string = (b) => b ?? "") {}

  supports(cap: AICapability): boolean {
    return CAPABILITIES.includes(cap);
  }

  isAvailable(byoKey?: string): boolean {
    return Boolean(this.resolveKey(byoKey));
  }

  healthCheck(byoKey?: string): ProviderHealth {
    return this.isAvailable(byoKey)
      ? { state: "unknown", checkedAt: Date.now() }
      : { state: "not_configured", detail: "کلید Groq لازم است", checkedAt: Date.now() };
  }

  async verify(byoKey?: string): Promise<ProviderHealth> {
    const key = this.resolveKey(byoKey);
    if (!key) return { state: "not_configured", detail: "کلید لازم است", checkedAt: Date.now() };
    return this.base.pingModels(key, GROQ_MODELS_URL);
  }

  async execute(req: AIRequest): Promise<AIOutput> {
    if (!("messages" in req)) throw new AIError("invalid_input");
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
