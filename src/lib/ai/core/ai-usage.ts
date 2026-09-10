// ─────────────────────────────────────────────────────────────
// AI Usage — §22: ردیابی مصرف هر provider/capability
// سقف‌های APIها را حدس نمی‌زنیم؛ جایی که سهمیه نامشخص است
// «unknown» می‌گوییم. فقط شمارندهٔ واقعی.
// ─────────────────────────────────────────────────────────────

import type { AICapability, ProviderHealth, ProviderId } from "./provider-types";

export interface UsageEntry {
  provider: ProviderId;
  capability: AICapability;
  requests: number;
  success: number;
  failed: number;
  rateLimited: number;
  lastUsed: number | null;
  lastLatencyMs: number | null;
  /** متوسط تأخیر موفق‌ها */
  avgLatencyMs: number | null;
}

export interface ProviderRuntimeState {
  /** آخرین وضعیت واقعی اجرا — پایهٔ healthCheck بدون پینگ اضافی */
  health: ProviderHealth;
}

export class AiUsage {
  private entries = new Map<string, UsageEntry>();
  private healths = new Map<ProviderId, ProviderHealth>();

  private key(provider: ProviderId, cap: AICapability): string {
    return `${provider}¦${cap}`;
  }

  start(provider: ProviderId, cap: AICapability): number {
    const k = this.key(provider, cap);
    const e = this.ensure(k, provider, cap);
    e.requests += 1;
    return Date.now();
  }

  success(provider: ProviderId, cap: AICapability, startedAt: number): void {
    const e = this.ensure(this.key(provider, cap), provider, cap);
    e.success += 1;
    e.lastLatencyMs = Date.now() - startedAt;
    e.avgLatencyMs = e.success > 1 ? Math.round(((e.avgLatencyMs ?? 0) * (e.success - 1) + e.lastLatencyMs) / e.success) : e.lastLatencyMs;
    e.lastUsed = Date.now();
    this.healths.set(provider, { state: "available", checkedAt: Date.now() });
  }

  failure(provider: ProviderId, cap: AICapability, code: string): void {
    const e = this.ensure(this.key(provider, cap), provider, cap);
    e.failed += 1;
    if (code === "rate_limit") e.rateLimited += 1;
    e.lastUsed = Date.now();
    const state: ProviderHealth["state"] =
      code === "rate_limit"
        ? "rate_limited"
        : code === "auth"
          ? "auth_error"
          : code === "timeout"
            ? "timeout"
            : code === "region" || code === "network" || code === "unavailable"
              ? "unavailable"
              : "unknown";
    this.healths.set(provider, { state, detail: code, checkedAt: Date.now() });
  }

  setHealth(provider: ProviderId, health: ProviderHealth): void {
    this.healths.set(provider, health);
  }

  getHealth(provider: ProviderId): ProviderHealth | null {
    return this.healths.get(provider) ?? null;
  }

  snapshot(): UsageEntry[] {
    return [...this.entries.values()].map((e) => ({ ...e }));
  }

  private ensure(k: string, provider: ProviderId, cap: AICapability): UsageEntry {
    let e = this.entries.get(k);
    if (!e) {
      e = {
        provider,
        capability: cap,
        requests: 0,
        success: 0,
        failed: 0,
        rateLimited: 0,
        lastUsed: null,
        lastLatencyMs: null,
        avgLatencyMs: null,
      };
      this.entries.set(k, e);
    }
    return e;
  }
}
