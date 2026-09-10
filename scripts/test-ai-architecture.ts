// تست معماری AI Provider: registry / router / fallback / cache / usage / local-embedding
// اجرا: npx tsx scripts/test-ai-architecture.ts
import { AIError } from "../src/lib/ai/core/ai-errors";
import { AiCache, cacheKey } from "../src/lib/ai/core/ai-cache";
import { AiUsage } from "../src/lib/ai/core/ai-usage";
import { CapabilityRouter } from "../src/lib/ai/core/capability-router";
import { ProviderRegistry } from "../src/lib/ai/core/provider-registry";
import { cosine, localEmbed, normalizeFaEn, tokenize } from "../src/lib/ai/core/local-embedding";
import { LocalProvider } from "../src/lib/ai/providers/local";
import { EdgeTtsProvider } from "../src/lib/ai/providers/edge-tts";
import { GeminiProvider } from "../src/lib/ai/providers/gemini";
import type {
  AIOutput,
  AIProvider,
  AIRequest,
  ProviderHealth,
  ProviderId,
  PricingTier,
} from "../src/lib/ai/core/provider-types";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown, tol = 1e-9) {
  const ok =
    typeof want === "number" && typeof got === "number"
      ? Math.abs(got - want) <= tol
      : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}: got ${JSON.stringify(got)?.slice(0, 160)}, want ${JSON.stringify(want)?.slice(0, 160)}`);
  }
}
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${name}`);
  }
}

// ── provider آزمایشی با رفتار کنترل‌شده (فقط برای تست router) ──
class FakeProvider implements AIProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly pricingTier: PricingTier;
  readonly requiresApiKey: boolean;
  readonly capabilities: import("../src/lib/ai/core/provider-types").AICapability[];
  readonly docsUrl = "";
  calls = 0;
  constructor(
    id: ProviderId,
    caps: import("../src/lib/ai/core/provider-types").AICapability[],
    private behavior: () => Promise<AIOutput>,
    private needsKey = false,
    tier: PricingTier = "free_tier",
  ) {
    this.id = id;
    this.capabilities = caps;
    this.requiresApiKey = needsKey;
    this.pricingTier = tier;
    this.name = id;
  }
  supports(cap: string): boolean {
    return this.capabilities.includes(cap as never);
  }
  isAvailable(key?: string): boolean {
    return this.needsKey ? Boolean(key) : true;
  }
  healthCheck(): ProviderHealth {
    return { state: this.isAvailable() ? "unknown" : "not_configured", checkedAt: 0 };
  }
  async verify(): Promise<ProviderHealth> {
    return { state: "available", checkedAt: 0 };
  }
  async execute(): Promise<AIOutput> {
    this.calls += 1;
    return this.behavior();
  }
}

const textReq = (apiKey?: string): AIRequest => ({
  capability: "text_generation",
  messages: [{ role: "user", content: "سلام" }],
  apiKey,
});
const textOut = (t: string): AIOutput => ({ kind: "text", text: t });

// ── ۱) Registry ──
{
  const reg = new ProviderRegistry();
  const p = new FakeProvider("zai", ["text_generation"], async () => textOut("ok"));
  reg.register(p);
  eq("registry.get", reg.get("zai")?.id, "zai");
  eq("registry.withCapability", reg.withCapability("text_generation").length, 1);
  let threw = false;
  try {
    reg.register(p);
  } catch {
    threw = true;
  }
  ok("registry duplicate rejected", threw);
}

async function main() {
// ── ۲) Router: ترجیح صریح و fallback ──
{
  const reg = new ProviderRegistry();
  const cache = new AiCache();
  const usage = new AiUsage();
  const failing = new FakeProvider("zai", ["text_generation"], async () => {
    throw new AIError("rate_limit");
  });
  const working = new FakeProvider("groq", ["text_generation"], async () => textOut("از groq"), true);
  reg.register(failing);
  reg.register(working);
  const router = new CapabilityRouter(reg, cache, usage);

  // zai اول زنجیره است و خطای 429 می‌دهد → groq (کلید از درخواست)
  const r = await router.route("text_generation", textReq("کلید-آزمایشی"));
  eq("fallback to next provider", r.output.kind === "text" ? r.output.text : "", "از groq");
  eq("attempts recorded", r.attempts.length, 2);
  eq("failed attempt code", r.attempts[0].code, "rate_limit");
  eq("usage failed counter", usage.snapshot()[0]?.failed, 1);
  eq("usage success counter", usage.snapshot()[1]?.success, 1);
}

// ── ۳) Router: انتخاب صریح + خطای مرگبار → سوییچ بی‌صدا ممنوع ──
{
  const reg = new ProviderRegistry();
  const cache = new AiCache();
  const usage = new AiUsage();
  const badAuth = new FakeProvider("zai", ["text_generation"], async () => {
    throw new AIError("auth");
  });
  const zai = new FakeProvider("groq", ["text_generation"], async () => textOut("ok"), true);
  reg.register(badAuth);
  reg.register(zai);
  const router = new CapabilityRouter(reg, cache, usage);

  let err: AIError | null = null;
  try {
    await router.route("text_generation", textReq("کلید-بد"), { prefer: "zai" });
  } catch (e) {
    err = e as AIError;
  }
  ok("explicit prefer + auth error surfaces", err?.code === "auth");
  eq("groq not called after fatal", zai.calls, 0);
}

// ── ۴) Router: provider بدون کلید رد می‌شود (skip) ──
{
  const reg = new ProviderRegistry();
  const cache = new AiCache();
  const usage = new AiUsage();
  const needsKey = new FakeProvider("jina", ["embeddings"], async () => ({ kind: "embeddings", vectors: [] }), true);
  const zai = new FakeProvider("zai", ["text_generation"], async () => textOut("ok"));
  reg.register(needsKey);
  reg.register(zai);
  const router = new CapabilityRouter(reg, cache, usage);

  // embeddings: jina اول است ولی بدون کلید skip → خطای جمع‌بندی (هیچ embeddings دیگر نیست)
  let err: AIError | null = null;
  try {
    await router.route("embeddings", { capability: "embeddings", texts: ["متن"] });
  } catch (e) {
    err = e as AIError;
  }
  ok("all-skipped chain throws unavailable", err?.code === "unavailable");
}

// ── ۵) Cache: متن کش می‌شود، اجرای دوم provider را صدا نمی‌زند ──
{
  const reg = new ProviderRegistry();
  const cache = new AiCache();
  const usage = new AiUsage();
  const p = new FakeProvider("zai", ["text_generation"], async () => textOut("پاسخ"));
  reg.register(p);
  const router = new CapabilityRouter(reg, cache, usage);

  await router.route("text_generation", textReq());
  const r2 = await router.route("text_generation", textReq());
  eq("cache prevents second call", p.calls, 1);
  eq("cached flag", r2.cached, true);

  // درخواست متفاوت → کش نمی‌خورد
  await router.route("text_generation", textReq(), { bypassCache: true });
  eq("bypassCache forces call", p.calls, 2);
}

// ── ۶) cacheKey: base64 خلاصه می‌شود ──
{
  const k1 = cacheKey(["a", { img: "x".repeat(5000) }]);
  const k2 = cacheKey(["a", { img: "y".repeat(5000) }]);
  ok("cacheKey stable for identical", k1 === cacheKey(["a", { img: "x".repeat(5000) }]));
  ok("cacheKey differs for different b64", k1 !== k2);
}

// ── ۷) Local embedding: قطعی، نرمال، شباهت معنایی سبک ──
{
  const a = localEmbed("رنگ موی لوکس برای سالن زیبایی");
  const b = localEmbed("hair color luxury salon beauty");
  const c = localEmbed("غذای دریایی رستوران");
  const dot = a.reduce((s, x, i) => s + x * a[i], 0);
  ok("localEmbed normalized", Math.abs(dot - 1) < 1e-6);
  ok("fa-en synonyms closer than unrelated", cosine(a, b) > cosine(a, c));
  ok("embeddings deterministic", JSON.stringify(localEmbed("ریلز مو")) === JSON.stringify(localEmbed("ریلز مو")));
  eq("normalizeFaEn: ي→ی", normalizeFaEn("كتاب يک"), "کتاب یک");
  ok("tokenize stems plural", tokenize("premium colors salons").includes("color") || tokenize("colors").includes("color"));
}

// ── ۸) LocalProvider واقعی ──
{
  const lp = new LocalProvider();
  eq("local pricingTier", lp.pricingTier, "local");
  const out = await lp.execute({ capability: "embeddings", texts: ["متن آزمایش"] });
  eq("local executes embeddings", out.kind === "embeddings" ? (out.vectors[0]?.length ?? 0) : 0, 256);
}

// ── ۹) EdgeTtsProvider: گیت صدا + بدون کلید ──
{
  const ep = new EdgeTtsProvider();
  eq("edge requiresApiKey false", ep.requiresApiKey, false);
  ok("edge supports fa voice", ep.supports("text_to_speech", { capability: "text_to_speech", text: "x", voice: "fa-IR-DilaraNeural" }));
  ok("edge rejects unknown voice", !ep.supports("text_to_speech", { capability: "text_to_speech", text: "x", voice: "made-up-voice" }));
  ok("edge rejects other caps", !ep.supports("text_generation"));
}

// ── ۱۰) GeminiProvider: بدون کلید → not_configured صادقانه ──
{
  const env = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const gp = new GeminiProvider(() => String(process.env.GEMINI_API_KEY ?? ""));
  eq("gemini available w/o key", gp.isAvailable(), false);
  eq("gemini health w/o key", gp.healthCheck().state, "not_configured");
  let err: AIError | null = null;
  try {
    await gp.execute(textReq());
  } catch (e) {
    err = e as AIError;
  }
  ok("gemini execute w/o key throws missing_key", err?.code === "missing_key");
  if (env !== undefined) process.env.GEMINI_API_KEY = env;
}

// ── ۱۱) AiError: نگاشت HTTP و پیام فارسی ──
{
  eq("429 → rate_limit", AIError.fromHttpStatus(429).code, "rate_limit");
  eq("401 → auth", AIError.fromHttpStatus(401).code, "auth");
  eq("402 → quota", AIError.fromHttpStatus(402).code, "quota");
  eq("500 → unavailable", AIError.fromHttpStatus(500).code, "unavailable");
  ok("user message is Persian", AIError.fromHttpStatus(429).userMessage.includes("محدودیت"));
}

}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
