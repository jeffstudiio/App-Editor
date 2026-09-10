// ─────────────────────────────────────────────────────────────
// Provider Registry — ثبت و جست‌وجوی ارائه‌دهنده‌ها (§5)
// ─────────────────────────────────────────────────────────────

import type { AICapability, AIProvider, ProviderId } from "./provider-types";

export class ProviderRegistry {
  private providers = new Map<ProviderId, AIProvider>();

  register(p: AIProvider): void {
    if (this.providers.has(p.id)) {
      throw new Error(`Provider already registered: ${p.id}`);
    }
    this.providers.set(p.id, p);
  }

  get(id: ProviderId): AIProvider | null {
    return this.providers.get(id) ?? null;
  }

  require(id: ProviderId): AIProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Unknown provider: ${id}`);
    return p;
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }

  ids(): ProviderId[] {
    return [...this.providers.keys()];
  }

  /** همهٔ providerهایی که واقعاً می‌توانند این قابلیت را اجرا کنند */
  withCapability(cap: AICapability): AIProvider[] {
    return this.list().filter((p) => p.capabilities.includes(cap));
  }
}
