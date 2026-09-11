// ─────────────────────────────────────────────────────────────
// Edge-TTS Provider — TTS عصبی مایکروسافت؛ رایگانِ واقعی، بدون کلید
// صداهای فارسی fa-IR-DilaraNeural / fa-IR-FaridNeural
// از همان الگوی مسیر /api/edge-tts استفاده می‌کند
// ─────────────────────────────────────────────────────────────

import { AIError, isAbortError } from "../core/ai-errors";
import type {
  AICapability,
  AIOutput,
  AIProvider,
  AIRequest,
  ProviderHealth,
  ProviderId,
  PricingTier,
} from "../core/provider-types";

const CAPABILITIES: AICapability[] = ["text_to_speech"];

export { EDGE_VOICE_IDS as EDGE_VOICES } from "../../ai/shared/edge-voices";
import { EDGE_VOICE_IDS } from "../../ai/shared/edge-voices";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export class EdgeTtsProvider implements AIProvider {
  readonly id: ProviderId = "edge-tts";
  readonly name = "Edge Neural TTS (رایگان)";
  readonly capabilities = CAPABILITIES;
  readonly pricingTier: PricingTier = "free";
  readonly requiresApiKey = false;
  readonly docsUrl = "https://learn.microsoft.com/azure/ai-services/speech-service";

  supports(cap: AICapability, req?: AIRequest): boolean {
    if (cap !== "text_to_speech") return false;
    if (req?.capability === "text_to_speech") {
      const v = req.voice ?? "fa-IR-DilaraNeural";
      return EDGE_VOICE_IDS.has(v);
    }
    return true;
  }

  isAvailable(): boolean {
    return true;
  }

  healthCheck(): ProviderHealth {
    return { state: "available", detail: "بدون کلید", checkedAt: Date.now() };
  }

  async verify(): Promise<ProviderHealth> {
    try {
      const out = await this.execute({ capability: "text_to_speech", text: "سلام", voice: "fa-IR-DilaraNeural" });
      return out.kind === "audio" && out.audio.byteLength > 100
        ? { state: "available", checkedAt: Date.now() }
        : { state: "unavailable", checkedAt: Date.now() };
    } catch {
      return { state: "unavailable", checkedAt: Date.now() };
    }
  }

  async execute(req: AIRequest): Promise<AIOutput> {
    if (req.capability !== "text_to_speech") throw new AIError("invalid_input");
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const voice = req.voice ?? "fa-IR-DilaraNeural";
    const rateNum = Math.max(0.5, Math.min(2, req.speed ?? 1));
    const ratePct = `${rateNum >= 1 ? "+" : "-"}${Math.abs(Math.round((rateNum - 1) * 100))}%`;

    const synth = async (): Promise<Buffer> => {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(req.text.slice(0, 1200)), {
        rate: ratePct,
        pitch: "+0Hz",
        volume: "+0%",
      });
      const chunks: Buffer[] = [];
      for await (const c of audioStream as unknown as Iterable<Buffer>) {
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      }
      return Buffer.concat(chunks);
    };

    let buffer: Buffer | null = null;
    try {
      buffer = await synth();
    } catch (err) {
      if (isAbortError(err)) throw new AIError("timeout");
      // یک تلاش دوباره بعد از ۹۰۰ms — همان رفتار مسیر موجود
      try {
        await new Promise((r) => setTimeout(r, 900));
        buffer = await synth();
      } catch {
        throw new AIError("unavailable", { detail: "سرویس Edge TTS پاسخ نداد" });
      }
    }
    if (!buffer || buffer.length < 100) throw new AIError("bad_response", { detail: "صدای خالی" });
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);
    return { kind: "audio", audio: ab, mime: "audio/mpeg" };
  }
}
