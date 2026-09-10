// ─────────────────────────────────────────────────────────────
// Jina AI Provider — §11: امبدینگ / جست‌وجوی معنایی
// بانک تمپلیت + کتابخانه دارایی. free-tier واقعی (BYO)
// ─────────────────────────────────────────────────────────────

import { AIError, isAbortError } from "../core/ai-errors";
import { JINA_EMBED_URL, MODELS } from "../model-defaults";
import type {
  AICapability,
  AIOutput,
  AIProvider,
  AIRequest,
  ProviderHealth,
  ProviderId,
  PricingTier,
} from "../core/provider-types";

const CAPABILITIES: AICapability[] = ["embeddings"];

export class JinaProvider implements AIProvider {
  readonly id: ProviderId = "jina";
  readonly name = "Jina AI";
  readonly capabilities = CAPABILITIES;
  readonly pricingTier: PricingTier = "free_tier";
  readonly requiresApiKey = true;
  readonly envKey = "JINA_API_KEY";
  readonly docsUrl = "https://jina.ai/embeddings";

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
      : { state: "not_configured", detail: "کلید Jina لازم است", checkedAt: Date.now() };
  }

  async verify(byoKey?: string): Promise<ProviderHealth> {
    try {
      const r = await this.embeddings(
        this.resolveKey(byoKey) || (() => { throw new AIError("missing_key", { fatal: true }); })(),
        ["تست"],
      );
      return r.kind === "embeddings" ? { state: "available", checkedAt: Date.now() } : { state: "unavailable", checkedAt: Date.now() };
    } catch (err) {
      const e = err instanceof AIError ? err : null;
      return { state: e?.code === "auth" ? "auth_error" : "unavailable", detail: e?.code, checkedAt: Date.now() };
    }
  }

  async execute(req: AIRequest): Promise<AIOutput> {
    if (req.capability !== "embeddings") throw new AIError("invalid_input");
    return this.embeddings(this.resolveKey(req.apiKey), req.texts, req.model);
  }

  private async embeddings(apiKey: string, texts: string[], model?: string): Promise<AIOutput> {
    if (!apiKey) throw new AIError("missing_key", { fatal: true });
    if (!texts.length || texts.length > 64) throw new AIError("invalid_input", { detail: "۱ تا ۶۴ متن" });
    let res: Response;
    try {
      res = await fetch(JINA_EMBED_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || MODELS.jinaEmbed,
          input: texts.map((t) => t.slice(0, 2000)),
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (isAbortError(err)) throw new AIError("timeout");
      throw new AIError("network");
    }
    if (!res.ok) throw AIError.fromHttpStatus(res.status);

    const json = (await res.json().catch(() => null)) as { data?: { embedding?: unknown }[] } | null;
    const rows = json?.data;
    if (!Array.isArray(rows) || rows.length !== texts.length) {
      throw new AIError("bad_response", { detail: "پاسخ امبدینگ نامعتبر" });
    }
    const vectors: number[][] = [];
    for (const row of rows) {
      const v = row?.embedding;
      if (!Array.isArray(v) || typeof v[0] !== "number") {
        throw new AIError("bad_response", { detail: "بردار نامعتبر" });
      }
      vectors.push(v as number[]);
    }
    return { kind: "embeddings", vectors };
  }
}
