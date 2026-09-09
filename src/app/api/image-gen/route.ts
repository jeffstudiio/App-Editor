import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { geminiTextToImage, sizeToAspect } from "@/lib/video/gemini-image";

export const maxDuration = 180;

const SIZES = new Set([
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = String(body?.prompt ?? "").trim();
    const size = SIZES.has(body?.size) ? body.size : "768x1344";
    if (!prompt) {
      return NextResponse.json({ error: "prompt الزامی است." }, { status: 400 });
    }

    // Optional Nano Banana (Gemini image) engine — BYO key
    if (body?.engine === "gemini") {
      const apiKey =
        String(body?.apiKey ?? "").trim() || String(process.env.GEMINI_API_KEY ?? "").trim();
      const model = String(body?.model ?? "").trim() || "gemini-3.1-flash-image";
      if (!apiKey) {
        return NextResponse.json({ error: "برای نانو‌بنانا، کلید Gemini را در تنظیمات دستیار وارد کن." }, { status: 400 });
      }
      const g = await geminiTextToImage(apiKey, model, prompt.slice(0, 1500), sizeToAspect(size));
      if (!g.ok || !g.image_base64) {
        return NextResponse.json({ error: g.message ?? "تولید تصویر نانو‌بنانا ناموفق بود." }, { status: 400 });
      }
      return NextResponse.json({ image_base64: g.image_base64, engine: "gemini", via: g.via });
    }

    const zai = await ZAI.create();
    const response = await zai.images.generations.create({
      prompt: prompt.slice(0, 1500),
      size,
    });
    const b64 = response?.data?.[0]?.base64;
    if (!b64) {
      return NextResponse.json({ error: "تصویری تولید نشد؛ دوباره تلاش کن." }, { status: 502 });
    }
    return NextResponse.json({ image_base64: b64 });
  } catch (err) {
    console.error("[image-gen] error:", err);
    return NextResponse.json(
      { error: "تولید تصویر ناموفق بود؛ چند لحظه بعد دوباره تلاش کن." },
      { status: 500 }
    );
  }
}
