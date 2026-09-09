import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const audioBase64 = body?.audio_base64 as string;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return NextResponse.json({ error: "audio_base64 الزامی است." }, { status: 400 });
    }

    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({ file_base64: audioBase64 });
    const text = (response?.text ?? "").trim();

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[transcribe] error:", err);
    return NextResponse.json(
      { error: "تبدیل گفتار به متن ناموفق بود؛ بخش صوتی معتبر نیست یا خیلی بزرگ است." },
      { status: 500 }
    );
  }
}
