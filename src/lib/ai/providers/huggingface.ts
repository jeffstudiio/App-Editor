// ─────────────────────────────────────────────────────────────
// HuggingFace Provider — §9: مدل‌های متن‌باز از طریق Router API
// معماری Model Registry: مدل قابل تعویض بدون تغییر کد اپ
// free-tier واقعی (کلید لازم، BYO)
// ─────────────────────────────────────────────────────────────

import { AIError, isAbortError } from "../core/ai-errors";
import { HF_CHAT_URL, HF_WHOAMI_URL, MODELS } from "../model-defaults";
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

const CAPABILITIES: AICapability[] = ["text_generation", "translation", "embeddings"];

export class HuggingFaceProvider implements AIProvider {
  readonly id: ProviderId = "huggingface";
  readonly name = "Hugging Face";
  readonly capabilities = CAPABILITIES;
  readonly pricingTier: PricingTier = "free_tier";
  readonly requiresApiKey = true;
  readonly envKey = "HUGGINGFACE_API_KEY";
  readonly docsUrl = "https://huggingface.co/docs/api-inference";

  private base = new OpenAIChatBase({
    chatUrl: HF_CHAT_URL,
    defaultModel: MODELS.hfChat,
    timeoutMs: 90_000,
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
      : { state: "not_configured", detail: "کلید Hugging Face لازم است", checkedAt: Date.now() };
  }

  async verify(byoKey?: string): Promise<ProviderHealth> {
    const key = this.resolveKey(byoKey);
    if (!key) return { state: "not_configured", detail: "کلید لازم است", checkedAt: Date.now() };
    try {
      const res = await fetch(HF_WHOAMI_URL, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return { state: "available", checkedAt: Date.now() };
      if (res.status === 401 || res.status === 403) return { state: "auth_error", detail: "کلید نامعتبر", checkedAt: Date.now() };
      return { state: "unavailable", detail: `HTTP ${res.status}`, checkedAt: Date.now() };
    } catch (err) {
      return { state: "unavailable", detail: isAbortError(err) ? "timeout" : "network", checkedAt: Date.now() };
    }
  }

  async execute(req: AIRequest): Promise<AIOutput> {
    const key = this.resolveKey(req.apiKey);
    if (!key) throw new AIError("missing_key", { fatal: true });

    switch (req.capability) {
      case "text_generation":
      case "translation": {
        if (!("messages" in req)) throw new AIError("invalid_input");
        const text = await this.base.chat(req.messages, {
          model: req.model,
          temperature: req.temperature,
          maxTokens: req.maxTokens,
          apiKey: key,
        });
        return this.base.output(text);
      }
      case "embeddings":
        return this.embeddings(key, req.texts, req.model);
      default:
        throw new AIError("invalid_input", { detail: `HF نمی‌تواند ${req.capability}` });
    }
  }

  /**
   * Feature Extraction — مدل قابل تعویض (پیش‌فرض multilingual-e5-large
   * که فارسی را هم پوشش می‌دهد). خروجی بردار نرمال‌شده.
   */
  async embeddings(apiKey: string, texts: string[], model?: string): Promise<AIOutput> {
    const m = model || MODELS.hfEmbed;
    let res: Response;
    try {
      res = await fetch(`https://router.huggingface.co/hf-inference/models/${m}/pipeline/feature-extraction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: texts, options: { truncate: true } }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      if (isAbortError(err)) throw new AIError("timeout");
      throw new AIError("network");
    }
    if (!res.ok) throw AIError.fromHttpStatus(res.status);

    const json = (await res.json()) as unknown;
    const vectors = normalizeHfEmbeddings(json, texts.length);
    if (!vectors) throw new AIError("bad_response", { detail: "شکل خروجی امبدینگ نامعتبر" });
    return { kind: "embeddings", vectors };
  }
}

/** خروجی feature-extraction می‌تواند [n][d] یا [n][1][d] باشد */
function normalizeHfEmbeddings(json: unknown, count: number): number[][] | null {
  const rows = Array.isArray(json) ? json : null;
  if (!rows || rows.length !== count) return null;
  const out: number[][] = [];
  for (const row of rows) {
    let v: unknown = row;
    if (Array.isArray(v) && v.length === 1 && Array.isArray(v[0])) v = v[0];
    if (!Array.isArray(v) || typeof v[0] !== "number") return null;
    out.push(v as number[]);
  }
  return out;
}
