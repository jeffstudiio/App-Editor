import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit } from "@/lib/ai/server/route-helpers";

export const maxDuration = 120;

const SYSTEM = `تو «ویدئوساز خودکار» هستی: سناریوی کاربر را به صحنه‌های تصویری تبدیل می‌کنی تا از آن‌ها ویدئوی ریلز/استوری ساخته شود.
فقط JSON برگردان با این ساختار:
{
  "title": "عنوان کوتاه ویدئو",
  "scenes": [
    { "text": "متن زیرنویس/گوینده این صحنه به فارسی (حداکثر ۲۰ کلمه)", "imagePrompt": "English text-to-image prompt, cinematic vertical composition, describing the scene visually (no text in image)", "dur": 4 }
  ]
}
قواعد:
- تعداد صحنه‌ها بین ۳ تا ۶ (همان که کاربر خواسته).
- dur عددی بین ۳ تا ۶ ثانیه.
- imagePrompt حتماً انگلیسی، بسیار بصری و سینمایی، بدون متن داخل تصویر.
- داستان صحنه‌ها یک قوس منسجم داشته باشد (شروع قوی، اوج، جمع‌بندی).`;

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`scenes:${clientIp(req)}`, RATE_PRESETS.heavy);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌ها زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
    const bodyParsed = await readJsonWithLimit(req, 128 * 1024);
    if (!bodyParsed.ok) return bodyParsed.resp;
    const body = bodyParsed.body;
    const script = String(body?.script ?? "").trim().slice(0, 8000);
    const sceneCount = Math.max(3, Math.min(6, Number(body?.sceneCount) || 4));
    const tone = String(body?.tone ?? "صمیمی و پرانرژی");
    if (!script) {
      return NextResponse.json({ error: "سناریو یا موضوع را بنویس." }, { status: 400 });
    }

    const zai = await ZAI.create();
    const userContent = `موضوع/سناریو: ${script}\nتعداد صحنه: ${sceneCount}\nلحن: ${tone}`;

    let parsed: { title?: string; scenes?: unknown } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM },
          { role: "user", content: attempt === 0 ? userContent : `${userContent}\n(فقط JSON خام برگردان، بدون markdown)` },
        ],
        thinking: { type: "disabled" },
      });
      const raw = completion.choices[0]?.message?.content?.trim() ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) continue;
      try {
        parsed = JSON.parse(match[0]);
        break;
      } catch {
        continue;
      }
    }
    if (!parsed) {
      return NextResponse.json({ error: "پاسخ نامعتبر بود؛ دوباره تلاش کن." }, { status: 502 });
    }
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      return NextResponse.json({ error: "صحنه‌ای ساخته نشد؛ متن را دقیق‌تر بنویس." }, { status: 502 });
    }
    const scenes = parsed.scenes.slice(0, 6).map((s: { text?: string; imagePrompt?: string; dur?: number }) => ({
      text: String(s.text ?? "").slice(0, 160),
      imagePrompt: String(s.imagePrompt ?? "").slice(0, 600),
      dur: Math.max(3, Math.min(6, Number(s.dur) || 4)),
    }));
    return NextResponse.json({ title: String(parsed.title ?? "").slice(0, 80), scenes });
  } catch (err) {
    console.error("[script-scenes] error:", err);
    return NextResponse.json(
      { error: "ویدئوساز خودکار پاسخ نداد؛ چند لحظه بعد تلاش کن." },
      { status: 500 }
    );
  }
}
