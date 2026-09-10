// ─────────────────────────────────────────────────────────────
// Local Provider — اجرای سرورِ امبدینگ آفلاین
// fallback تضمین‌شدهٔ زنجیرهٔ embeddings (همیشه واقعاً کار می‌کند)
// ─────────────────────────────────────────────────────────────

import { localEmbed } from "../core/local-embedding";
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

export class LocalProvider implements AIProvider {
  readonly id: ProviderId = "local";
  readonly name = "محلی (آفلاین)";
  readonly capabilities = CAPABILITIES;
  readonly pricingTier: PricingTier = "local";
  readonly requiresApiKey = false;
  readonly docsUrl = "https://github.com/jeffstudiio/App-Editor";

  supports(cap: AICapability): boolean {
    return CAPABILITIES.includes(cap);
  }

  isAvailable(): boolean {
    return true;
  }

  healthCheck(): ProviderHealth {
    return { state: "available", detail: "بدون شبکه", checkedAt: Date.now() };
  }

  async verify(): Promise<ProviderHealth> {
    return { state: "available", checkedAt: Date.now() };
  }

  async execute(req: AIRequest): Promise<AIOutput> {
    if (req.capability !== "embeddings") throw new Error("local: فقط embeddings");
    return { kind: "embeddings", vectors: req.texts.map((t) => localEmbed(t)) };
  }
}
