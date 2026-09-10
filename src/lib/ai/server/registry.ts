// ─────────────────────────────────────────────────────────────
// Server singleton — رجیستری providerها + روتر + کش + مصرف
// کلیدها فقط سمت سرور حل می‌شوند (§20): BYO از body می‌آید و
// هرگز در باندل کلاینت نمی‌نشیند.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { AiCache } from "../core/ai-cache";
import { AiUsage } from "../core/ai-usage";
import { CapabilityRouter } from "../core/capability-router";
import { ProviderRegistry } from "../core/provider-registry";
import type { AIProvider, ProviderId } from "../core/provider-types";
import { EdgeTtsProvider } from "../providers/edge-tts";
import { GeminiProvider } from "../providers/gemini";
import { GroqProvider } from "../providers/groq";
import { HuggingFaceProvider } from "../providers/huggingface";
import { JinaProvider } from "../providers/jina";
import { LocalProvider } from "../providers/local";
import { OpenRouterProvider } from "../providers/openrouter";
import { ZaiProvider } from "../providers/zai";

interface AiServerState {
  registry: ProviderRegistry;
  router: CapabilityRouter;
  cache: AiCache;
  usage: AiUsage;
  providers: AIProvider[];
}

const globalRef = globalThis as unknown as { __jeffAi?: AiServerState };

function build(): AiServerState {
  const cache = new AiCache(10 * 60_000, 200);
  const usage = new AiUsage();

  // حل‌کنندهٔ کلید: کلیدِ درخواست کاربر اول، بعد متغیر محیطی سرور
  const envResolver =
    (envKey?: string) =>
    (byo?: string): string =>
      String(byo ?? "").trim() || (envKey ? String(process.env[envKey] ?? "").trim() : "");

  const providers: AIProvider[] = [
    new ZaiProvider(),
    new GeminiProvider(envResolver("GEMINI_API_KEY")),
    new GroqProvider(envResolver("GROQ_API_KEY")),
    new OpenRouterProvider(envResolver("OPENROUTER_API_KEY")),
    new HuggingFaceProvider(envResolver("HUGGINGFACE_API_KEY")),
    new JinaProvider(envResolver("JINA_API_KEY")),
    new EdgeTtsProvider(),
    new LocalProvider(),
  ];

  const registry = new ProviderRegistry();
  for (const p of providers) registry.register(p);
  const router = new CapabilityRouter(registry, cache, usage);
  return { registry, router, cache, usage, providers };
}

export function aiServer(): AiServerState {
  if (!globalRef.__jeffAi) globalRef.__jeffAi = build();
  return globalRef.__jeffAi;
}

/** استخراج اعتبارنامه‌های BYO از بدنهٔ درخواست (فقط سرور) — R1: + نقشهٔ کلید per-provider */
export function credsOf(body: Record<string, unknown>): {
  apiKey?: string;
  model?: string;
  keys?: Partial<Record<ProviderId, string>>;
} {
  const apiKey = String(body?.apiKey ?? "").trim() || undefined;
  const model = String(body?.model ?? "").trim() || undefined;
  const rawKeys = (body?.keys ?? {}) as Record<string, unknown>;
  const keys: Partial<Record<ProviderId, string>> = {};
  for (const pid of ["gemini", "openrouter", "groq", "huggingface", "jina"] as const) {
    const v = String(rawKeys[pid] ?? "").trim();
    if (v) keys[pid] = v;
  }
  return { apiKey, model, keys: Object.keys(keys).length ? keys : undefined };
}

export type { ProviderId };
