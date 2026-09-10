// ─────────────────────────────────────────────────────────────
// ZAI Provider — موتور پیش‌فرض میزبانی‌شدهٔ پلتفرم
// بدون کلید، بدون هزینهٔ کاربر؛ همان stack موجود routeها
// ─────────────────────────────────────────────────────────────

import ZAI from "z-ai-web-dev-sdk";
import { AIError } from "../core/ai-errors";
import type {
  AICapability,
  AIOutput,
  AIProvider,
  AIRequest,
  ChatMessage,
  ProviderHealth,
  ProviderId,
  PricingTier,
} from "../core/provider-types";

const CAPABILITIES: AICapability[] = [
  "text_generation",
  "fast_text",
  "translation",
  "image_generation",
  "image_editing",
  "speech_to_text",
  "text_to_speech",
];

/** صداهای موتور TTS پلتفرم (مثل route موجود /api/tts) */
export const ZAI_VOICES = new Set(["tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo"]);

function toAIError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort|timeout/i.test(msg)) return new AIError("timeout", { detail: msg });
  if (/429|rate/i.test(msg)) return new AIError("rate_limit", { detail: msg });
  return new AIError("unavailable", { detail: msg });
}

export class ZaiProvider implements AIProvider {
  readonly id: ProviderId = "zai";
  readonly name = "دستیار داخلی (میزبانی پلتفرم)";
  readonly capabilities = CAPABILITIES;
  readonly pricingTier: PricingTier = "free";
  readonly requiresApiKey = false;
  readonly docsUrl = "https://docs.z.ai";

  supports(cap: AICapability, req?: AIRequest): boolean {
    if (!CAPABILITIES.includes(cap)) return false;
    if (cap === "text_to_speech" && req?.capability === "text_to_speech") {
      const v = req.voice ?? "tongtong";
      return ZAI_VOICES.has(v);
    }
    return true;
  }

  isAvailable(): boolean {
    return true; // موتور پلتفرم — همیشه حاضر
  }

  healthCheck(): ProviderHealth {
    return { state: "available", detail: "میزبانی‌شدهٔ پلتفرم", checkedAt: Date.now() };
  }

  async verify(): Promise<ProviderHealth> {
    try {
      const zai = await ZAI.create();
      const r = await zai.chat.completions.create({
        messages: [{ role: "assistant", content: "ping" }, { role: "user", content: "ok" }],
        thinking: { type: "disabled" },
      });
      const text = r.choices[0]?.message?.content ?? "";
      return { state: text ? "available" : "unavailable", checkedAt: Date.now() };
    } catch (err) {
      return { state: "unavailable", detail: toAIError(err).userMessage, checkedAt: Date.now() };
    }
  }

  async execute(req: AIRequest): Promise<AIOutput> {
    const zai = await ZAI.create();
    try {
      switch (req.capability) {
        case "text_generation":
        case "fast_text":
        case "translation":
          return await this.chat(zai, req.messages, req.temperature, req.maxTokens, req.jsonMode);
        case "image_generation": {
          const res = await zai.images.generations.create({
            prompt: req.prompt.slice(0, 1500),
            size: (req.size ?? "768x1344") as "768x1344",
          });
          const b64 = res?.data?.[0]?.base64;
          if (!b64) throw new AIError("bad_response", { detail: "تصویری تولید نشد" });
          return { kind: "image", imageBase64: b64 };
        }
        case "image_editing": {
          const dataUrl = req.imageBase64.startsWith("data:")
            ? req.imageBase64
            : `data:image/jpeg;base64,${req.imageBase64}`;
          const res = await zai.images.generations.edit({
            prompt: req.prompt.slice(0, 1500),
            image: dataUrl,
            size: (req.size ?? "1024x1024") as "1024x1024",
          });
          const b64 = res?.data?.[0]?.base64;
          if (!b64) throw new AIError("bad_response", { detail: "ویرایش نتیجه‌ای برنگرداند" });
          return { kind: "image", imageBase64: b64 };
        }
        case "speech_to_text": {
          const res = await zai.audio.asr.create({ file_base64: req.audioBase64 });
          const text = String(res?.text ?? "").trim();
          if (!text) throw new AIError("bad_response", { detail: "متنی از گفتار استخراج نشد" });
          return { kind: "text", text };
        }
        case "text_to_speech": {
          const response = await zai.audio.tts.create({
            input: req.text.slice(0, 1000),
            voice: req.voice ?? "tongtong",
            speed: req.speed ?? 1,
            response_format: "wav",
            stream: false,
          });
          const ab = await response.arrayBuffer();
          if (ab.byteLength < 100) throw new AIError("bad_response", { detail: "صدای خالی" });
          return { kind: "audio", audio: ab, mime: "audio/wav" };
        }
        default:
          throw new AIError("invalid_input", { detail: `zai نمی‌تواند ${req.capability}` });
      }
    } catch (err) {
      throw toAIError(err);
    }
  }

  private async chat(
    zai: Awaited<ReturnType<typeof ZAI.create>>,
    messages: ChatMessage[],
    temperature?: number,
    maxTokens?: number,
    jsonMode?: boolean,
  ): Promise<AIOutput> {
    // SDK پلتفرم نقش system را به‌صورت assistant می‌پذیرد (رفتار مسیرهای موجود)
    const payload: Record<string, unknown> = { messages, thinking: { type: "disabled" } };
    if (temperature !== undefined) payload.temperature = temperature;
    if (maxTokens !== undefined) payload.max_tokens = maxTokens;
    if (jsonMode) payload.response_format = { type: "json_object" };
    const completion = await zai.chat.completions.create(payload as Parameters<typeof zai.chat.completions.create>[0]);
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) throw new AIError("bad_response", { detail: "پاسخ خالی از موتور داخلی" });
    return { kind: "text", text };
  }
}
