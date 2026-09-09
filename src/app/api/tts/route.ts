import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const maxDuration = 120;

const ALLOWED_VOICES = new Set([
  "tongtong",
  "chuichui",
  "xiaochen",
  "jam",
  "kazi",
  "douji",
  "luodo",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body?.text ?? "").trim();
    const voice = ALLOWED_VOICES.has(body?.voice) ? body.voice : "tongtong";
    const speed = Math.max(0.5, Math.min(2, Number(body?.speed) || 1));

    if (!text) {
      return NextResponse.json({ error: "متنی برای گوینده وارد نشده است." }, { status: 400 });
    }
    if (text.length > 1000) {
      return NextResponse.json(
        { error: "متن طولانی است؛ هر بار حداکثر ۱۰۰۰ کاراکتر (می‌توانی چند تکه بسازی)." },
        { status: 400 }
      );
    }

    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: text,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    if (buffer.length < 100) {
      return NextResponse.json({ error: "صدایی تولید نشد؛ متن را ساده‌تر امتحان کن." }, { status: 502 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[tts] error:", err);
    return NextResponse.json(
      { error: "تولید صدا ناموفق بود؛ چند لحظه بعد دوباره تلاش کن." },
      { status: 500 }
    );
  }
}
