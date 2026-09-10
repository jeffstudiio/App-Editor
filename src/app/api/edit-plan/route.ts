import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit } from "@/lib/ai/server/route-helpers";

export const maxDuration = 120;

const SYSTEM = `تو «دستیار ادیت» هستی و برای یک ویرایشگر ویدئوی موبایلی (مشابه کپ‌کات) برنامه ادیت پیشنهاد می‌دهی.
ویدئوی کاربر را بر اساس توضیحش تحلیل کن و یک JSON دقیق با این ساختار برگردان (فقط JSON، بدون توضیح اضافه):
{
  "title": "یک متن تیتر کوتاه و جذاب فارسی (حداکثر ۴۰ کاراکتر) برای اوّل ویدئو یا null",
  "titleStart": 0.2,
  "titleDur": 3,
  "filterPresetId": "یکی از: none | cinema | warmglow | noir | faded | neon | clean | mint",
  "captionPresetId": "یکی از: impact | neon | minimal | classic | lalezar",
  "musicMood": "یک توصیف یک‌خطی فارسی از حس موزیک مناسب",
  "tips": ["نکته اجرایی کوتاه ۱", "نکته ۲", "نکته ۳"],
  "hookIdea": "ایده هوک ۳ ثانیه اول در یک جمله فارسی"
}
قواعد: لحن فارسی صمیمی-حرفه‌ای؛ مقادیر خارج از لیست مجاز نده؛ title اگر واقعاً مفید نبود null بده.`;

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`edit-plan:${clientIp(req)}`, RATE_PRESETS.heavy);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های برنامه‌ریزی زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
    const parsed = await readJsonWithLimit(req, 128 * 1024);
    if (!parsed.ok) return parsed.resp;
    const body = parsed.body;
    const brief = String(body?.brief ?? "").trim().slice(0, 8000);
    const context = String(body?.context ?? "").trim().slice(0, 8000);
    if (!brief) {
      return NextResponse.json({ error: "توضیح ویدئو را بنویس." }, { status: 400 });
    }

    const zai = await ZAI.create();
    const userContent = `توضیح ویدئو: ${brief}\n${context ? `اطلاعات تکمیلی تایم‌لاین: ${context}` : ""}`;

    let plan: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM },
          { role: "user", content: attempt === 0 ? userContent : `${userContent}\n(فقط JSON خام برگردان)` },
        ],
        thinking: { type: "disabled" },
      });
      const raw = completion.choices[0]?.message?.content?.trim() ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) continue;
      try {
        plan = JSON.parse(match[0]);
        break;
      } catch {
        continue;
      }
    }
    if (!plan) {
      return NextResponse.json({ error: "پاسخ نامعتبر بود؛ دوباره تلاش کن." }, { status: 502 });
    }
    return NextResponse.json({ plan });
  } catch (err) {
    console.error("[edit-plan] error:", err);
    return NextResponse.json(
      { error: "دستیار ادیت پاسخ نداد؛ چند لحظه بعد تلاش کن." },
      { status: 500 }
    );
  }
}
