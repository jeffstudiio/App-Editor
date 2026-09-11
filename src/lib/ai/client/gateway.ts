"use client";

// ─────────────────────────────────────────────────────────────
// Client AI Gateway — تنها دروازهٔ هوش مصنوعی سمت کلاینت
// ─────────────────────────────────────────────────────────────
// مشکل ریشه‌ای: اپ روی میزبانی استاتیک (GitHub Pages) هیچ /api/* ندارد
// و همهٔ قابلیت‌های AI با ۴۰۴/خطای کد خام می‌مردند.
// راه‌حل: تشخیص حالت میزبانی + اجرای مستقیم همان معماری provider در مرورگر
// (Gemini / Groq / OpenRouter / Jina / local / Edge-TTS مرورگری) با کلید BYO.
// قرارداد پاسخ هر تابع عیناً همان قرارداد route سرور است تا فیک نباشد.
// ─────────────────────────────────────────────────────────────

import { AIError } from "../core/ai-errors";
import type { AIRequest, AIOutput, ChatMessage, ProviderId, ProviderHealth } from "../core/provider-types";
import { CAPABILITY_CHAIN } from "../core/capability-router";
import { GeminiProvider } from "../providers/gemini";
import { GroqProvider } from "../providers/groq";
import { OpenRouterProvider } from "../providers/openrouter";
import { JinaProvider } from "../providers/jina";
import { LocalProvider } from "../providers/local";
import { byoCreds } from "./settings";
import { edgeTtsBlob } from "./edge-tts-browser";
import { geminiFetch } from "@/lib/video/gemini-client";
import {
  buildPlannerSystemPrompt,
  buildPlannerUserMessage,
  buildRepairMessage,
  extractJsonPlan,
} from "../agent/planner-prompt";
import { validatePlan, type AIPlan, type PlanContextSnapshot } from "../agent/plan-schema";
import {
  EDIT_PLAN_SYSTEM,
  SCRIPT_SCENES_SYSTEM,
  extractJsonObject,
  sanitizeScenes,
  translateSystemPrompt,
  applyTranslateBatch,
  isKnownLang,
} from "../shared/prompts";
import { PERSONAS, type PersonaId } from "@/lib/studio-data";
import { GEMINI_BASE, OPENROUTER_MODELS_URL, OPENROUTER_KEY_URL, MODELS } from "../model-defaults";

// ── حالت میزبانی ─────────────────────────────────────────────
export type HostingMode = "server" | "static";

let modeCache: HostingMode | null = null;
let modeProbe: Promise<HostingMode> | null = null;

/** تشخیص یک‌باره: مسیر /api/ai/status واقعی است یا استاتیک؟ */
export function hostingMode(): Promise<HostingMode> {
  if (modeCache) return Promise.resolve(modeCache);
  if (modeProbe) return modeProbe;
  modeProbe = (async () => {
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && ct.includes("application/json")) {
        const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        modeCache = j?.ok ? "server" : "static";
      } else {
        modeCache = "static";
      }
    } catch {
      modeCache = "static";
    }
    return modeCache;
  })();
  return modeProbe;
}

/** مقدار کش‌شده (اگر هنوز پروب نشده، "unknown") — فقط برای UI */
export function hostingModeCached(): HostingMode | "unknown" {
  return modeCache ?? "unknown";
}

// ── روتر کلاینت (آینهٔ CapabilityRouter برای مرورگر، بدون zai) ──
const BROWSER_CHAIN_OVERRIDES: Partial<Record<keyof typeof CAPABILITY_CHAIN, ProviderId[]>> = {
  text_generation: ["gemini", "groq", "openrouter"],
  fast_text: ["gemini", "groq", "openrouter"],
  translation: ["gemini", "groq", "openrouter"],
  image_generation: ["gemini"],
  image_editing: ["gemini"],
  speech_to_text: ["gemini"],
  text_to_speech: ["edge-tts"],
  embeddings: ["jina", "local"],
};

interface BrowserProvider {
  id: ProviderId;
  capabilities: string[];
  execute(req: AIRequest): Promise<AIOutput>;
  supports?(cap: string, req?: AIRequest): boolean;
}

const gemini = new GeminiProvider((b) => b ?? "");
const groq = new GroqProvider((b) => b ?? "");
const openrouter = new OpenRouterProvider((b) => b ?? "");
const jina = new JinaProvider((b) => b ?? "");
const localP = new LocalProvider();

function browserProvider(id: ProviderId): BrowserProvider | null {
  switch (id) {
    case "gemini": return gemini;
    case "groq": return groq;
    case "openrouter": return openrouter;
    case "jina": return jina;
    case "local": return localP;
    default: return null; // zai/hf/edge-tts(سروری) در مرورگر اجرا نمی‌شوند
  }
}

interface Creds { apiKey?: string; model?: string; keys?: Record<string, string> }

function effectiveKey(creds: Creds, id: ProviderId): string | undefined {
  const own = creds.keys?.[id];
  return (own ?? creds.apiKey ?? "").trim() || undefined;
}

/** مسیردهی سمت مرورگر — همان قواعد زنجیره + fallback با گزارش صادقانه */
async function browserRoute(cap: keyof typeof CAPABILITY_CHAIN, req: AIRequest, creds: Creds, prefer?: string): Promise<{ output: AIOutput; provider: ProviderId; via?: string }> {
  const chain = (BROWSER_CHAIN_OVERRIDES[cap] ?? CAPABILITY_CHAIN[cap] ?? []).slice();
  if (prefer) {
    const i = chain.indexOf(prefer as ProviderId);
    if (i > 0) chain.unshift(...chain.splice(i, 1));
  }
  const attempts: string[] = [];
  let executedAny = false;
  for (const id of chain) {
    if (id === "edge-tts") continue; // TTS مسیر اختصاصی خودش را دارد
    const p = browserProvider(id);
    if (!p) continue;
    const key = effectiveKey(creds, id);
    const supports = p.supports ? p.supports(cap, req) : p.capabilities.includes(cap);
    if (!supports) continue;
    if (!key) {
      attempts.push(`${id}: کلید تنظیم نشده`);
      continue;
    }
    executedAny = true;
    try {
      const reqWithKey = { ...req, apiKey: key } as AIRequest;
      const output = await p.execute(reqWithKey);
      return { output, provider: id };
    } catch (err) {
      const msg = err instanceof AIError ? err.userMessage : err instanceof Error ? err.message : "خطا";
      attempts.push(`${id}: ${msg}`);
      if (err instanceof AIError && err.fatal && prefer === id) throw err; // انتخاب صریح → بی‌سروصدا سوییچ ممنوع
    }
  }
  // هیچ‌کلیدی اصلاً تنظیم نشده بود → راهنمای عملیاتی بده، نه «سرویس در دسترس نیست»
  if (!executedAny) {
    throw new AIError("missing_key", { detail: "در حالت استاتیک، متن/تصویر/گفتار با کلید خودت اجرا می‌شود (Gemini رایگان: aistudio.google.com/apikey)" });
  }
  throw new AIError("unavailable", { detail: attempts.join(" | ") || "هیچ ارائه‌دهنده‌ای برای این قابلیت در مرورگر فعال نیست" });
}

// ── خطاهای fetch به مسیرهای سرور (وقتی مدعی سروریم ولی پاسخ HTML/۴۰۴ است) ──
async function postRoute<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    modeCache = "static"; // شبکه/سرور مرده — دفعهٔ بعد مستقیم مرورگر
    throw new AIError("network");
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    modeCache = "static";
    throw new AIError("unavailable", { detail: "مسیر سرور در دسترس نیست (میزبانی استاتیک)" });
  }
  const j = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!j) throw new AIError("bad_response");
  if (!res.ok || j.error) {
    throw new AIError(res.status === 401 ? "auth" : res.status === 429 ? "rate_limit" : "unavailable", {
      detail: j.error ?? `HTTP ${res.status}`,
    });
  }
  return j;
}

// ── پیام خطای فارسیِ قابل‌ اقدام برای UI ──
export function aiErrorMessage(err: unknown): string {
  if (err instanceof AIError) {
    if (err.code === "missing_key") {
      return `${err.userMessage} (تنظیمات → هوش مصنوعی → کلید Gemini یا OpenRouter را وارد کن)`;
    }
    return err.userMessage;
  }
  return "خطای نامشخص — دوباره تلاش کن.";
}

// ═════════════════════════════════════════════════════════════
// ۱) عامل هوشمند — plan (قرارداد /api/ai/plan)
// ═════════════════════════════════════════════════════════════
export interface PlanApiResponse {
  ok?: boolean;
  plan?: AIPlan;
  provider?: string;
  via?: string;
  pack?: string | null;
  error?: string;
  issues?: string[];
}

function sanitizeSnapshotLocal(raw: unknown): PlanContextSnapshot {
  const r = (raw ?? {}) as Record<string, unknown>;
  const clips = (Array.isArray(r.clips) ? r.clips : []).slice(0, 120).map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? `clip_${i + 1}`).slice(0, 48),
      name: String(o.name ?? "").slice(0, 60),
      kind: o.kind === "image" ? ("image" as const) : ("video" as const),
      timelineStart: Number(o.timelineStart) || 0,
      dur: Math.max(0, Number(o.dur) || 0),
    };
  });
  const textItems = (Array.isArray(r.textItems) ? r.textItems : []).slice(0, 120).map((t, i) => {
    const o = (t ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? `tx_${i + 1}`).slice(0, 48),
      role: o.role === "caption" ? ("caption" as const) : ("title" as const),
      start: Math.max(0, Number(o.start) || 0),
    };
  });
  const audioItems = (Array.isArray(r.audioItems) ? r.audioItems : []).slice(0, 60).map((a, i) => {
    const o = (a ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? `au_${i + 1}`).slice(0, 48),
      name: String(o.name ?? "").slice(0, 60),
      start: Math.max(0, Number(o.start) || 0),
    };
  });
  return {
    aspect: ["9:16", "1:1", "16:9", "4:5", "3:4"].includes(String(r.aspect)) ? String(r.aspect) : "9:16",
    duration: Math.max(0, Math.min(3600, Number(r.duration) || 0)),
    clipIds: clips.map((c) => c.id),
    clips,
    textItems,
    audioItems,
    hasCaptions: Boolean(r.hasCaptions),
    hasMusic: Boolean(r.hasMusic),
    allItemIds: [...clips.map((c) => c.id), ...textItems.map((t) => t.id), ...audioItems.map((a) => a.id)],
  };
}

export async function aiPlan(body: {
  instruction: string;
  snapshot: unknown;
  pack?: string | null;
  provider?: string;
  apiKey?: string;
  model?: string;
  keys?: Record<string, string>;
}): Promise<PlanApiResponse> {
  const creds: Creds = { apiKey: body.apiKey, model: body.model, keys: body.keys };
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute<PlanApiResponse>("/api/ai/plan", body);
    } catch (err) {
      if (err instanceof AIError && err.code === "network") return staticPlan(body, creds);
      if (err instanceof AIError && err.code === "unavailable") return staticPlan(body, creds);
      return { error: aiErrorMessage(err) };
    }
  }
  return staticPlan(body, creds);
}

async function staticPlan(body: Parameters<typeof aiPlan>[0], creds: Creds): Promise<PlanApiResponse> {
  const instruction = String(body.instruction ?? "").trim();
  if (instruction.length < 3) return { error: "دستور را بنویس (حداقل ۳ حرف)." };
  const snapshot = sanitizeSnapshotLocal(body.snapshot);
  const prefer = body.provider === "gemini" || body.provider === "openrouter" || body.provider === "groq" ? body.provider : undefined;
  const messages: ChatMessage[] = [
    { role: "system", content: buildPlannerSystemPrompt(null) },
    { role: "user", content: buildPlannerUserMessage(instruction, snapshot, null) },
  ];
  let providerId = "";
  let issues: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs: ChatMessage[] =
      attempt === 0 ? messages : [...messages, { role: "user" as const, content: buildRepairMessage("", issues) }];
    let text = "";
    try {
      const r = await browserRoute("fast_text", { capability: "fast_text", messages: msgs, jsonMode: true, model: creds.model }, creds, prefer);
      providerId = r.provider;
      if (r.output.kind !== "text") break;
      text = r.output.text;
    } catch (err) {
      return { error: aiErrorMessage(err) };
    }
    const parsed = extractJsonPlan(text);
    if (!parsed) continue;
    const v = validatePlan(parsed, snapshot);
    if (v.ok) {
      return { ok: true, plan: v.plan, provider: providerId || "browser" };
    }
    issues = v.issues.slice(0, 6);
  }
  return { error: "برنامهٔ تولیدشده معتبر نبود؛ دوباره امتحان کن.", issues };
}

// ═════════════════════════════════════════════════════════════
// ۲) دستیار گفتگو (قرارداد /api/assistant)
// ═════════════════════════════════════════════════════════════
export interface AssistantApiResponse {
  content?: string;
  engine?: string;
  via?: string;
  notice?: string;
  error?: string;
}

export async function aiAssistant(body: {
  personaId: PersonaId;
  messages: { role: "user" | "assistant"; content: string }[];
  provider?: string;
  apiKey?: string;
  model?: string;
  keys?: Record<string, string>;
}): Promise<AssistantApiResponse> {
  const creds: Creds = { apiKey: body.apiKey, model: body.model, keys: body.keys };
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute<AssistantApiResponse>("/api/assistant", body);
    } catch (err) {
      if (err instanceof AIError && (err.code === "network" || err.code === "unavailable")) {
        return staticAssistant(body, creds);
      }
      return { error: aiErrorMessage(err) };
    }
  }
  return staticAssistant(body, creds);
}

async function staticAssistant(body: Parameters<typeof aiAssistant>[0], creds: Creds): Promise<AssistantApiResponse> {
  const persona = PERSONAS.find((p) => p.id === body.personaId);
  if (!persona) return { error: "پرسونای نامعتبر است." };
  const history = (body.messages ?? []).slice(-16).map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 6000) })).filter((m) => m.content.trim());
  if (!history.length) return { error: "پیامی برای ارسال وجود ندارد." };
  const messages: ChatMessage[] = [{ role: "system", content: persona.systemPrompt }, ...history];
  try {
    const prefer = body.provider === "gemini" || body.provider === "openrouter" || body.provider === "groq" ? body.provider : undefined;
    const r = await browserRoute(
      "text_generation",
      { capability: "text_generation", messages, model: creds.model, temperature: 0.8 },
      creds,
      prefer,
    );
    if (r.output.kind !== "text") return { error: "پاسخ متنی دریافت نشد." };
    return { content: r.output.text, engine: r.provider, via: r.via };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

// ═════════════════════════════════════════════════════════════
// ۳) TTS — Edge (بدون کلید) و گوینده‌های پلتفرم
// ═════════════════════════════════════════════════════════════

/** گویندگی عصبی فارسی/چندزبانه — در استاتیک مستقیم از مرورگر، در سرور از route */
export async function aiEdgeTtsBlob(text: string, voice: string, rate = 1): Promise<Blob> {
  if ((await hostingMode()) === "server") {
    try {
      const res = await fetch("/api/edge-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, rate }),
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.startsWith("audio/")) return await res.blob();
      }
      // هر خطایی → فالبک مرورگری (همان موتور، همان خروجی)
    } catch {
      modeCache = "static";
    }
  }
  return edgeTtsBlob(text, voice, rate);
}

/** گوینده‌های شخصیت‌دار پلتفرم (tongtong و…) — فقط روی میزبانی سروری */
export async function aiZaiTtsBlob(text: string, voice: string, speed = 1): Promise<Blob> {
  if ((await hostingMode()) === "server") {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed }),
    });
    if (res.ok) return await res.blob();
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AIError("unavailable", { detail: j.error ?? `HTTP ${res.status}` });
  }
  throw new AIError("unavailable", {
    detail: "این گوینده فقط در نسخهٔ سروری فعال است — از گویندگی Edge (مثل Dilara) استفاده کن که همین‌جا هم کار می‌کند.",
  });
}

// ═════════════════════════════════════════════════════════════
// ۴) تصویر — تولید و ویرایش (قرارداد /api/image-gen | /api/image-edit)
// ═════════════════════════════════════════════════════════════
const IMAGE_SIZES = new Set(["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"]);

export async function aiImageGen(body: { prompt: string; size?: string; engine?: string; apiKey?: string; model?: string; keys?: Record<string, string> }): Promise<{ image_base64?: string; engine?: string; via?: string; error?: string }> {
  const size = IMAGE_SIZES.has(String(body.size)) ? String(body.size) : "768x1344";
  const prompt = String(body.prompt ?? "").slice(0, 1500);
  if (!prompt.trim()) return { error: "prompt الزامی است." };
  const creds: Creds = { apiKey: body.apiKey, model: body.model, keys: body.keys };
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute("/api/image-gen", { ...body, prompt, size });
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { error: aiErrorMessage(err) };
      }
    }
  }
  try {
    const r = await browserRoute("image_generation", { capability: "image_generation", prompt, size, model: creds.model }, creds, body.engine === "gemini" ? "gemini" : undefined);
    if (r.output.kind !== "image") return { error: "خروجی تصویر نامعتبر بود." };
    return { image_base64: r.output.imageBase64, engine: r.provider, via: r.via };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

export async function aiImageEdit(body: { prompt: string; image_base64: string; size?: string; apiKey?: string; model?: string; keys?: Record<string, string> }): Promise<{ image_base64?: string; engine?: string; via?: string; error?: string }> {
  const prompt = String(body.prompt ?? "").slice(0, 1500);
  const imageBase64 = String(body.image_base64 ?? "");
  if (!prompt.trim() || !imageBase64) return { error: "prompt و image_base64 الزامی هستند." };
  const creds: Creds = { apiKey: body.apiKey, model: body.model, keys: body.keys };
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute("/api/image-edit", { ...body, prompt, image_base64: imageBase64 });
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { error: aiErrorMessage(err) };
      }
    }
  }
  try {
    const r = await browserRoute("image_editing", { capability: "image_editing", prompt, imageBase64, model: creds.model }, creds, "gemini");
    if (r.output.kind !== "image") return { error: "خروجی تصویر نامعتبر بود." };
    return { image_base64: r.output.imageBase64, engine: r.provider, via: r.via };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

// ═════════════════════════════════════════════════════════════
// ۵) ASR — گفتار به متن (قرارداد /api/transcribe)
// ═════════════════════════════════════════════════════════════
export async function aiTranscribe(body: { audio_base64: string; apiKey?: string; keys?: Record<string, string> }): Promise<{ text?: string; engine?: string; error?: string }> {
  const creds: Creds = { apiKey: body.apiKey, keys: body.keys };
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute<{ text: string }>("/api/transcribe", body);
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { error: aiErrorMessage(err) };
      }
    }
  }
  try {
    const r = await browserRoute("speech_to_text", { capability: "speech_to_text", audioBase64: body.audio_base64, audioMime: "audio/wav" }, creds, "gemini");
    if (r.output.kind !== "text") return { error: "پیام صوتی معتبر نبود." };
    return { text: r.output.text, engine: r.provider };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

// ═════════════════════════════════════════════════════════════
// ۶) ترجمه / اصلاح ASR (قرارداد /api/translate)
// ═════════════════════════════════════════════════════════════
export async function aiTranslate(body: { mode: "translate" | "fix"; target?: string; segments: string[]; apiKey?: string; model?: string; keys?: Record<string, string> }): Promise<{ segments?: string[]; error?: string }> {
  const mode = body.mode === "fix" ? ("fix" as const) : ("translate" as const);
  const target = body.target && isKnownLang(body.target) ? body.target : "fa";
  const segments = (Array.isArray(body.segments) ? body.segments : []).slice(0, 120).map((s) => String(s ?? "").slice(0, 4000));
  if (!segments.length || segments.every((s) => !s.trim())) return { error: "متنی برای پردازش ارسال نشده." };
  const creds: Creds = { apiKey: body.apiKey, model: body.model, keys: body.keys };

  if ((await hostingMode()) === "server") {
    try {
      return await postRoute<{ segments: string[] }>("/api/translate", { ...body, mode, target, segments });
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { error: aiErrorMessage(err) };
      }
    }
  }
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < segments.length; i += 24) chunks.push(segments.slice(i, i + 24));
    const results = await Promise.all(chunks.map((c) => translateChunk(c, mode, target, creds)));
    return { segments: results.flat() };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

async function translateChunk(segments: string[], mode: "translate" | "fix", target: string, creds: Creds): Promise<string[]> {
  const payload = JSON.stringify(segments.map((text, i) => ({ i, text })));
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await browserRoute(
        "translation",
        {
          capability: "translation",
          messages: [
            { role: "system", content: translateSystemPrompt(mode, target) },
            { role: "user", content: `${payload}\n\nخروجی را دقیقاً به شکل JSON آرایه بده بدون هیچ متن اضافه: [{"i":0,"text":"..."},...]` },
          ],
          temperature: 0.2,
          maxTokens: 4096,
          model: creds.model,
        },
        creds,
      );
      if (r.output.kind !== "text") throw new AIError("bad_response");
      const out = applyTranslateBatch(segments, r.output.text, mode, target);
      if (!out) throw new Error("bad-llm-output");
      return out;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof AIError && err.fatal) throw err;
      if (msg.includes("429") || msg.includes("rate")) {
        await new Promise((r) => setTimeout(r, 1600 * (attempt + 1)));
        continue;
      }
      if (attempt === 0) continue; // یک تلاش دوباره برای خروجی بد
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("llm-failed");
}

// ═════════════════════════════════════════════════════════════
// ۷) دستیار ادیت (قرارداد /api/edit-plan) + ویدئوساز خودکار (/api/script-scenes)
// ═════════════════════════════════════════════════════════════
export async function aiEditPlan(body: { brief: string; context?: string; apiKey?: string; model?: string; keys?: Record<string, string> }): Promise<{ plan?: Record<string, unknown>; error?: string }> {
  const brief = String(body.brief ?? "").trim().slice(0, 8000);
  if (!brief) return { error: "توضیح ویدئو را بنویس." };
  const context = String(body.context ?? "").trim().slice(0, 8000);
  const creds: Creds = { apiKey: body.apiKey, model: body.model, keys: body.keys };
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute("/api/edit-plan", { ...body, brief, context });
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { error: aiErrorMessage(err) };
      }
    }
  }
  const userContent = `توضیح ویدئو: ${brief}\n${context ? `اطلاعات تکمیلی تایم‌لاین: ${context}` : ""}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await browserRoute(
        "fast_text",
        {
          capability: "fast_text",
          messages: [
            { role: "system", content: EDIT_PLAN_SYSTEM },
            { role: "user", content: attempt === 0 ? userContent : `${userContent}\n(فقط JSON خام برگردان)` },
          ],
          jsonMode: true,
          model: creds.model,
        },
        creds,
      );
      if (r.output.kind !== "text") continue;
      const parsed = extractJsonObject(r.output.text);
      if (parsed) return { plan: parsed };
    } catch (err) {
      return { error: aiErrorMessage(err) };
    }
  }
  return { error: "پاسخ نامعتبر بود؛ دوباره تلاش کن." };
}

export async function aiScriptScenes(body: { script: string; sceneCount?: number; tone?: string; apiKey?: string; model?: string; keys?: Record<string, string> }): Promise<{ title?: string; scenes?: { text: string; imagePrompt: string; dur: number }[]; error?: string }> {
  const script = String(body.script ?? "").trim().slice(0, 8000);
  if (!script) return { error: "سناریو یا موضوع را بنویس." };
  const sceneCount = Math.max(3, Math.min(6, Number(body.sceneCount) || 4));
  const tone = String(body.tone ?? "صمیمی و پرانرژی");
  const creds: Creds = { apiKey: body.apiKey, model: body.model, keys: body.keys };
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute("/api/script-scenes", { ...body, script, sceneCount, tone });
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { error: aiErrorMessage(err) };
      }
    }
  }
  const userContent = `موضوع/سناریو: ${script}\nتعداد صحنه: ${sceneCount}\nلحن: ${tone}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await browserRoute(
        "fast_text",
        {
          capability: "fast_text",
          messages: [
            { role: "system", content: SCRIPT_SCENES_SYSTEM },
            { role: "user", content: attempt === 0 ? userContent : `${userContent}\n(فقط JSON خام برگردان، بدون markdown)` },
          ],
          jsonMode: true,
          model: creds.model,
        },
        creds,
      );
      if (r.output.kind !== "text") continue;
      const parsed = extractJsonObject(r.output.text) as { title?: unknown; scenes?: unknown } | null;
      const clean = parsed ? sanitizeScenes(parsed) : null;
      if (clean) return clean;
    } catch (err) {
      return { error: aiErrorMessage(err) };
    }
  }
  return { error: "صحنه‌ای ساخته نشد؛ متن را دقیق‌تر بنویس." };
}

// ═════════════════════════════════════════════════════════════
// ۸) فهرست مدل‌ها — Gemini / OpenRouter (قرارداد دو route)
// ═════════════════════════════════════════════════════════════
export interface ModelItem { id: string; name: string; context: number; paid?: boolean }

const STATIC_CHAT_MODELS: ModelItem[] = [
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash (پیش‌فرض)", context: 1000000 },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", context: 1000000 },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", context: 1000000 },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (پیش‌نمایش)", context: 2000000 },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", context: 1000000 },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", context: 1000000 },
];

export async function aiGeminiModels(apiKey?: string): Promise<{ ok: boolean; models?: ModelItem[]; keyValid?: boolean; serverKey?: boolean; fallback?: boolean; via?: string; error?: string }> {
  const creds = byoCreds();
  const key = String(apiKey ?? "").trim() || creds.keys?.gemini || creds.apiKey || "";
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute("/api/gemini/models", { apiKey: key });
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { ok: false, error: aiErrorMessage(err) };
      }
    }
  }
  if (!key) return { ok: false, error: "اول کلید Gemini رو وارد کن.", serverKey: false };
  const r = await geminiFetch(`${GEMINI_BASE}/models?pageSize=200&key=${encodeURIComponent(key)}`, {
    method: "GET",
    timeoutMs: 30_000,
    maxAttempts: 5,
  });
  if (!r.reachedGoogle) {
    return { ok: true, serverKey: false, fallback: true, via: "none", models: STATIC_CHAT_MODELS };
  }
  let j: { models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }[]; error?: { message?: string } } = {};
  try {
    j = JSON.parse(r.bodyText);
  } catch {
    return { ok: false, error: "پاسخ نامعتبر از Google AI.", serverKey: false };
  }
  if (r.status !== 200) {
    const detail = String(j?.error?.message ?? "");
    const invalidKey = /api key not valid|API_KEY_INVALID/i.test(detail);
    return {
      ok: false,
      serverKey: false,
      error: invalidKey ? "کلید Gemini نامعتبره — از aistudio.google.com/apikey دوباره بگیر." : `دریافت مدل‌ها ناموفق بود (کد ${r.status}). ${detail.slice(0, 120)}`,
    };
  }
  const models = (Array.isArray(j.models) ? j.models : [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .filter((m) => typeof m.name === "string" && /gemini/i.test(m.name))
    .filter((m) => !/thinking|lite|image|tts|live|embed/i.test(m.name ?? ""))
    .map((m) => ({
      id: String(m.name ?? "").replace(/^models\//, ""),
      name: String(m.displayName ?? m.name ?? ""),
      context: Number(m.inputTokenLimit ?? 0),
    }))
    .sort((a, b) => b.context - a.context);
  return { ok: true, models, keyValid: true, serverKey: false, via: r.via };
}

export async function aiOpenRouterModels(apiKey?: string): Promise<{ ok: boolean; models?: ModelItem[]; keyValid?: boolean; error?: string }> {
  const creds = byoCreds();
  const key = String(apiKey ?? "").trim() || creds.keys?.openrouter || "";
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute("/api/openrouter/models", { apiKey: key });
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { ok: false, error: aiErrorMessage(err) };
      }
    }
  }
  if (key) {
    const keyRes = await fetch(OPENROUTER_KEY_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!keyRes) return { ok: false, error: "اتصال به openrouter.ai برقرار نشد (اینترنت یا دسترسی شبکه)." };
    if (keyRes.status === 401 || keyRes.status === 403) return { ok: false, error: "کلید OpenRouter نامعتبره — دوباره چکش کن." };
    if (!keyRes.ok) return { ok: false, error: `بررسی کلید ناموفق بود (کد ${keyRes.status}).` };
  }
  const mRes = await fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!mRes || !mRes.ok) return { ok: false, error: `دریافت لیست مدل‌ها ناموفق بود (کد ${mRes ? mRes.status : 0}).` };
  const j = (await mRes.json().catch(() => null)) as { data?: { id?: string; name?: string; context_length?: number }[] } | null;
  const all = Array.isArray(j?.data) ? j.data : [];
  const free = all
    .filter((m) => typeof m.id === "string" && m.id.endsWith(":free"))
    .filter((m) => !/safety|moderation|guard|embed|whisper/i.test(String(m.id)))
    .map((m) => ({ id: m.id as string, name: String(m.name ?? m.id).replace(/\s*\(free\)\s*$/i, ""), context: Number(m.context_length ?? 0), paid: false }))
    .sort((a, b) => b.context - a.context);
  const paidGemini = all
    .filter((m) => typeof m.id === "string" && m.id.startsWith("google/gemini"))
    .filter((m) => !/:free|:batch|image|imagen|aqa/i.test(String(m.id)))
    .map((m) => ({ id: m.id as string, name: String(m.name ?? m.id).replace(/^Google:\s*/i, ""), context: Number(m.context_length ?? 0), paid: true }))
    .sort((a, b) => b.context - a.context)
    .slice(0, 6);
  return { ok: true, models: [...free, ...paidGemini], keyValid: Boolean(key) };
}

// ═════════════════════════════════════════════════════════════
// ۹) امبدینگ — جست‌وجوی معنایی (قرارداد /api/ai/embeddings)
// ═════════════════════════════════════════════════════════════
export async function aiEmbeddings(body: { query?: string; texts: string[]; apiKey?: string }): Promise<{ ok: boolean; provider?: "jina" | "local"; queryVector?: number[] | null; vectors?: number[][]; error?: string }> {
  const texts = (body.texts ?? []).slice(0, 64);
  if (!texts.length) return { ok: false, error: "query یا texts لازم است." };
  const creds = byoCreds();
  const key = String(body.apiKey ?? "").trim() || creds.keys?.jina || "";
  if ((await hostingMode()) === "server") {
    try {
      return await postRoute("/api/ai/embeddings", { query: body.query, texts, apiKey: key });
    } catch (err) {
      if (!(err instanceof AIError && (err.code === "network" || err.code === "unavailable"))) {
        return { ok: false, error: aiErrorMessage(err) };
      }
    }
  }
  // مرورگر: Jina با کلید، وگرنه امبدینگ محلی (خالص TS — همیشه کار می‌کند)
  if (key) {
    try {
      const r = await jina.execute({ capability: "embeddings", texts });
      if (r.kind === "embeddings") {
        let queryVector: number[] | null = null;
        if (body.query) {
          const q = await jina.execute({ capability: "embeddings", texts: [body.query.slice(0, 2000)] });
          if (q.kind === "embeddings") queryVector = q.vectors[0] ?? null;
        }
        return { ok: true, provider: "jina", queryVector, vectors: r.vectors };
      }
    } catch {
      // Jina از مرورگر نشد → محلی
    }
  }
  const { localEmbed } = await import("../core/local-embedding");
  const vectors = texts.map((t) => localEmbed(t));
  const queryVector = body.query ? localEmbed(body.query) : null;
  return { ok: true, provider: "local", queryVector, vectors };
}

// ═════════════════════════════════════════════════════════════
// ۱۰) وضعیت ارائه‌دهنده‌ها (قرارداد /api/ai/status) + verify
// ═════════════════════════════════════════════════════════════
export interface StatusProvider {
  id: string;
  name: string;
  capabilities: string[];
  pricingTier: string;
  requiresApiKey: boolean;
  envKey: string | null;
  envKeySet: boolean;
  health: ProviderHealth;
}

export interface StatusApiResponse {
  ok?: boolean;
  mode?: HostingMode;
  providers?: StatusProvider[];
  localTools?: { id: string; name: string }[];
  error?: string;
}

export async function aiStatus(): Promise<StatusApiResponse> {
  if ((await hostingMode()) === "server") {
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && ct.includes("application/json")) {
        const j = (await res.json()) as StatusApiResponse;
        return { ...j, mode: "server" as const };
      }
    } catch {
      modeCache = "static";
    }
  }
  // حالت استاتیک — ماتریس صادقانه از providerهای مرورگری
  const creds = byoCreds();
  const keyOf = (id: string) => creds.keys?.[id] || creds.apiKey || "";
  const withKey = (id: ProviderId, name: string, caps: string[], tier: string): StatusProvider => {
    const has = Boolean(keyOf(id));
    return {
      id,
      name,
      capabilities: caps,
      pricingTier: tier,
      requiresApiKey: true,
      envKey: null,
      envKeySet: false,
      health: { state: has ? "unknown" : "not_configured", detail: has ? "کلید تنظیم شده — تست اتصال را بزن" : "کلید لازم است (تنظیمات دستیار)", checkedAt: Date.now() },
    };
  };
  const providers: StatusProvider[] = [
    {
      id: "zai",
      name: "موتور میزبانی‌شدهٔ پلتفرم",
      capabilities: ["text_generation", "image_generation", "speech_to_text", "text_to_speech"],
      pricingTier: "free",
      requiresApiKey: false,
      envKey: null,
      envKeySet: false,
      health: { state: "unavailable", detail: "فقط در نسخهٔ سروری — این نسخه استاتیک است", checkedAt: Date.now() },
    },
    withKey("gemini", "Google Gemini", ["text_generation", "fast_text", "translation", "image_generation", "image_editing", "speech_to_text"], "free_tier"),
    withKey("groq", "Groq (سریع)", ["text_generation", "fast_text", "translation"], "free_tier"),
    withKey("openrouter", "OpenRouter (رایگان BYO)", ["text_generation", "fast_text", "translation"], "free_tier"),
    withKey("jina", "Jina AI", ["embeddings"], "free_tier"),
    {
      id: "edge-tts",
      name: "Edge Neural TTS (رایگان)",
      capabilities: ["text_to_speech"],
      pricingTier: "free",
      requiresApiKey: false,
      envKey: null,
      envKeySet: false,
      health: { state: "available", detail: "بدون کلید — مستقیم در مرورگر", checkedAt: Date.now() },
    },
    {
      id: "local",
      name: "محلی (آفلاین)",
      capabilities: ["embeddings"],
      pricingTier: "local",
      requiresApiKey: false,
      envKey: null,
      envKeySet: false,
      health: { state: "available", detail: "بدون شبکه", checkedAt: Date.now() },
    },
  ];
  return {
    ok: true,
    mode: "static",
    providers,
    localTools: [
      { id: "word-align", name: "هم‌ترازی کلمه (کارائوکه)" },
      { id: "sfx-render", name: "رندر افکت صوتی" },
      { id: "local-embed", name: "جست‌وجوی معنایی محلی" },
      { id: "edge-tts-browser", name: "گویندگی مرورگری" },
    ],
  };
}

/** تست اتصال واقعی یک provider — سرور: route، استاتیک: مستقیم از مرورگر */
export async function aiVerifyProvider(id: string, apiKey?: string): Promise<{ ok: boolean; health: ProviderHealth }> {
  const creds = byoCreds();
  const key = String(apiKey ?? "").trim() || creds.keys?.[id] || creds.apiKey || "";
  if ((await hostingMode()) === "server") {
    try {
      const res = await fetch(`/api/ai/status?verify=${encodeURIComponent(id)}`, {
        headers: key ? { "x-ai-key": key } : undefined,
      });
      const j = (await res.json()) as { ok?: boolean; health?: ProviderHealth };
      return { ok: Boolean(j.ok), health: j.health ?? { state: "unknown", checkedAt: Date.now() } };
    } catch {
      modeCache = "static";
    }
  }
  const p = browserProvider(id as ProviderId);
  if (!p) {
    const state: ProviderHealth["state"] = id === "zai" ? "unavailable" : "unknown";
    return {
      ok: false,
      health: {
        state,
        detail: id === "zai" ? "فقط در نسخهٔ سروری" : "تست مرورگری این provider تعریف نشده",
        checkedAt: Date.now(),
      },
    };
  }
  const impl = p as unknown as { verify?: (k?: string) => Promise<ProviderHealth> };
  if (typeof impl.verify === "function") {
    try {
      const health = await impl.verify(key || undefined);
      return { ok: health.state === "available", health };
    } catch (err) {
      return { ok: false, health: { state: "unavailable", detail: err instanceof Error ? err.message : "خطا", checkedAt: Date.now() } };
    }
  }
  return { ok: false, health: { state: "unknown", detail: "تست اتصال ندارد", checkedAt: Date.now() } };
}
