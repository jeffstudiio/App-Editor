import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit } from "@/lib/ai/server/route-helpers";

export const maxDuration = 120;

// Curated neural voices (Microsoft Edge Read-Aloud) — includes real Persian voices
const ALLOWED_VOICES = new Set([
  // Persian (Iran)
  "fa-IR-DilaraNeural",
  "fa-IR-FaridNeural",
  // English
  "en-US-AriaNeural",
  "en-US-GuyNeural",
  "en-GB-SoniaNeural",
  // Arabic
  "ar-SA-ZariyahNeural",
  "ar-SA-HamedNeural",
  // Turkish
  "tr-TR-EmelNeural",
  "tr-TR-AhmetNeural",
  // Chinese
  "zh-CN-XiaoxiaoNeural",
  "zh-CN-YunxiNeural",
  // Spanish
  "es-ES-ElviraNeural",
  "es-ES-AlvaroNeural",
]);

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`edge-tts:${clientIp(req)}`, RATE_PRESETS.light);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های گوینده زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
    const parsed = await readJsonWithLimit(req, 16 * 1024);
    if (!parsed.ok) return parsed.resp;
    const body = parsed.body;
    const text = String(body?.text ?? "").trim();
    const voice = ALLOWED_VOICES.has(String(body?.voice)) ? String(body?.voice) : "fa-IR-DilaraNeural";
    // rate: 0.5..2 (1 = normal) → percentage string for SSML
    const rateNum = Math.max(0.5, Math.min(2, Number(body?.rate) || 1));
    const ratePct = `${rateNum >= 1 ? "+" : "-"}${Math.abs(Math.round((rateNum - 1) * 100))}%`;

    if (!text) {
      return NextResponse.json({ error: "متنی برای گوینده وارد نشده است." }, { status: 400 });
    }
    if (text.length > 1200) {
      return NextResponse.json(
        { error: "متن طولانی است؛ هر بار حداکثر ۱۲۰۰ کاراکتر." },
        { status: 400 }
      );
    }

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // retry once on transient network failures (timeout / connection reset)
    let buffer: Buffer | null = null;
    for (let attempt = 0; attempt < 2 && !buffer; attempt++) {
      try {
        const { audioStream } = tts.toStream(escapeXml(text), {
          rate: ratePct,
          pitch: "+0Hz",
          volume: "+0%",
        });
        const chunks: Buffer[] = [];
        for await (const c of audioStream as unknown as Iterable<Buffer>) {
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        }
        const b = Buffer.concat(chunks);
        if (b.length >= 100) buffer = b;
      } catch (e) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 900));
          continue;
        }
        throw e;
      }
    }
    if (!buffer) {
      return NextResponse.json({ error: "صدایی تولید نشد؛ متن را ساده‌تر امتحان کن." }, { status: 502 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[edge-tts] error:", err);
    return NextResponse.json(
      { error: "تولید صدای عصبی ناموفق بود؛ چند لحظه بعد دوباره تلاش کن." },
      { status: 500 }
    );
  }
}
