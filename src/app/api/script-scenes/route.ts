import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit } from "@/lib/ai/server/route-helpers";
import { SCRIPT_SCENES_SYSTEM, sanitizeScenes } from "@/lib/ai/shared/prompts";

export const maxDuration = 120;

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
          { role: "assistant", content: SCRIPT_SCENES_SYSTEM },
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
    const clean = sanitizeScenes(parsed as { title?: unknown; scenes?: unknown });
    if (!clean) {
      return NextResponse.json({ error: "صحنه‌ای ساخته نشد؛ متن را دقیق‌تر بنویس." }, { status: 502 });
    }
    return NextResponse.json(clean);
  } catch (err) {
    console.error("[script-scenes] error:", err);
    return NextResponse.json(
      { error: "ویدئوساز خودکار پاسخ نداد؛ چند لحظه بعد تلاش کن." },
      { status: 500 }
    );
  }
}
