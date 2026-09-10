// ─────────────────────────────────────────────────────────────
// Capability Router — قلب مسیریابی (§7, §19)
// درخواست → زنجیرهٔ قابلیت‌محور → بهترین ارائه‌دهندهٔ آزاد → fallback
// اولویت‌ها free-first: موتور میزبانی‌شدهٔ پلتفرم (بی‌کلید) همیشه
// گزینهٔ اولِ پیش‌فرض است؛ BYOها طبق زنجیرهٔ هر قابلیت می‌آیند.
// ─────────────────────────────────────────────────────────────

import { AIError } from "./ai-errors";
import { AiCache, cacheKey } from "./ai-cache";
import { AiUsage } from "./ai-usage";
import type { AIOutput, AIProvider, AIRequest, AIResult, AICapability, ProviderId, RouteAttempt } from "./provider-types";
import type { ProviderRegistry } from "./provider-registry";

/** زنجیرهٔ پیش‌فرض هر قابلیت — free-first (§3) */
export const CAPABILITY_CHAIN: Record<AICapability, ProviderId[]> = {
  text_generation: ["zai", "groq", "gemini", "openrouter", "huggingface"],
  fast_text: ["zai", "groq", "gemini", "openrouter"],
  translation: ["zai", "gemini", "groq", "openrouter"],
  image_generation: ["zai", "gemini"],
  image_editing: ["zai", "gemini"],
  speech_to_text: ["zai"],
  text_to_speech: ["edge-tts", "zai"],
  embeddings: ["jina", "local"],
};

/** قابلیت‌های قابل‌کش (§23) */
const CACHEABLE: Set<AICapability> = new Set(["text_generation", "fast_text", "translation", "embeddings"]);

export interface RouteOptions {
  /** انتخاب صریح کاربر — خطای پیکربندیِ آن بی‌سروصدا fallback نمی‌شود */
  prefer?: ProviderId;
  /** غیرفعال‌سازی کش برای این درخواست */
  bypassCache?: boolean;
}

/**
 * R1: کلید per-provider — اگر نقشهٔ keys در درخواست بود، کلید همان provider
 * جایگزین apiKey مشترک می‌شود تا کلید Gemini/OpenRouter به Jina/HF نشت نکند.
 */
function withOwnKey(req: AIRequest, id: ProviderId): AIRequest {
  const keys = (req as { keys?: Partial<Record<ProviderId, string>> }).keys;
  const own = keys?.[id];
  const trimmed = own ? String(own).trim() : "";
  if (!trimmed) return req;
  return { ...req, apiKey: trimmed } as AIRequest;
}

export class CapabilityRouter {
  constructor(
    private registry: ProviderRegistry,
    private cache: AiCache,
    private usage: AiUsage,
  ) {}

  /** زنجیرهٔ نهایی برای این درخواست (prefer اول) */
  chainFor(cap: AICapability, prefer?: ProviderId): ProviderId[] {
    const base = CAPABILITY_CHAIN[cap] ?? [];
    const chain = prefer ? [prefer, ...base.filter((p) => p !== prefer)] : base;
    return chain;
  }

  async route(cap: AICapability, req: AIRequest, opts: RouteOptions = {}): Promise<AIResult> {
    if (req.capability !== cap) {
      throw new AIError("invalid_input", { detail: `capability mismatch: ${req.capability} vs ${cap}` });
    }
    const chain = this.chainFor(cap, opts.prefer);
    const attempts: RouteAttempt[] = [];
    const model = "model" in req ? (req.model as string | undefined) : undefined;

    // ── کش (فقط قابلیت‌های امن) ──
    // ممیزی M-4: کلید هرگز وارد کلید کش نمی‌شود؛ ممیزی R3: provider واقعی
    // سازندهٔ خروجی کنار خروجی ذخیره می‌شود تا cache-hit صادقانه گزارش شود.
    let cacheK: string | null = null;
    if (CACHEABLE.has(cap) && !opts.bypassCache) {
      const { apiKey: _omit, ...reqNoKey } = req as Record<string, unknown>;
      cacheK = cacheKey([cap, opts.prefer ?? "auto", model ?? "", reqNoKey]);
      const hit = this.cache.get<{ output: AIOutput; providerId: ProviderId }>(cacheK);
      if (hit) {
        const p = this.registry.get(hit.providerId);
        return {
          output: hit.output,
          provider: p
            ? { id: p.id, name: p.name, pricingTier: p.pricingTier }
            : { id: hit.providerId, name: hit.providerId, pricingTier: "local" },
          model,
          cached: true,
          attempts: [{ provider: hit.providerId, ok: true }],
        };
      }
    }

    for (const id of chain) {
      const provider = this.registry.get(id);
      if (!provider) {
        attempts.push({ provider: id, ok: false, error: "ثبت نشده", code: "unavailable", skipped: true });
        continue;
      }
      // کلید مؤثر این provider: اختصاصیِ خودش از keys، وگرنه apiKey مشترک
      const eff = withOwnKey(req, id);
      if (!provider.capabilities.includes(cap) || !provider.supports(cap, eff)) {
        continue; // این provider این شکل از درخواست را اجرا نمی‌کند (مثلاً صدا پشتیبانی‌نشده)
      }
      if (provider.requiresApiKey && !provider.isAvailable(eff.apiKey)) {
        attempts.push({
          provider: id,
          ok: false,
          error: "کلید تنظیم نشده",
          code: "missing_key",
          skipped: true,
        });
        continue;
      }

      const startedAt = this.usage.start(id, cap);
      try {
        const output = await provider.execute(eff);
        this.usage.success(id, cap, startedAt);
        attempts.push({ provider: id, ok: true });
        if (cacheK) this.cache.set(cacheK, { output, providerId: id as ProviderId });
        return {
          output,
          provider: { id, name: provider.name, pricingTier: provider.pricingTier },
          model: model ?? undefined,
          via: (output as { via?: string }).via,
          attempts,
        };
      } catch (err) {
        const aiErr = err instanceof AIError ? err : toAIError(err);
        this.usage.failure(id, cap, aiErr.code);
        attempts.push({ provider: id, ok: false, error: aiErr.userMessage, code: aiErr.code });
        // انتخاب صریح کاربر + خطای پیکربندی → شفاف گزارش بده، سوییچ بی‌صدا ممنوع
        if (opts.prefer === id && aiErr.fatal) throw aiErr;
        // بقیهٔ موارد → ارائه‌دهندهٔ بعدی
      }
    }

    // هیچ‌کس جواب نداد — جمع‌بندی صادقانه
    const summary = attempts
      .filter((a) => !a.ok)
      .map((a) => `${a.provider}: ${a.error}`)
      .join(" | ");
    throw new AIError("unavailable", { detail: summary || "هیچ ارائه‌دهنده‌ای برای این قابلیت ثبت نشده" });
  }
}

function toAIError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort|timeout/i.test(msg)) return new AIError("timeout", { detail: msg });
  return new AIError("unavailable", { detail: msg });
}

export type { AIProvider };
