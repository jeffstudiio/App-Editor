// ─────────────────────────────────────────────────────────────
// GET /api/ai/status — ماتریس provider برای پنل تنظیمات (§34/§33)
// صادقانه: هرگز provider تنظیم‌نشده را «وصل‌شده» نشان نمی‌دهد
// ?verify=<provider> → تست اتصال واقعی (کلید BYO از هدر)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/core/ai-errors";
import { aiServer } from "@/lib/ai/server/registry";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const rl = rateLimit(`status:${clientIp(req)}`, RATE_PRESETS.light);
  if (!rl.ok) {
    return NextResponse.json({ error: "درخواست‌های زیاد — کمی بعد تلاش کن." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  const { registry, usage } = aiServer();
  const verifyId = req.nextUrl.searchParams.get("verify");
  const byoKey = req.headers.get("x-ai-key") ?? undefined;

  // تست اتصال واقعیِ یک provider (از پنل تنظیمات)
  if (verifyId) {
    const p = registry.get(verifyId as never);
    if (!p) return NextResponse.json({ error: "provider ناشناس است." }, { status: 400 });
    try {
      const health = await p.verify(byoKey);
      usage.setHealth(p.id, health);
      return NextResponse.json({ ok: true, health });
    } catch (err) {
      const health =
        err instanceof AIError
          ? { state: err.code === "auth" ? ("auth_error" as const) : ("unavailable" as const), detail: err.userMessage, checkedAt: Date.now() }
          : { state: "unavailable" as const, detail: "خطای ناشناخته", checkedAt: Date.now() };
      usage.setHealth(p.id, health);
      return NextResponse.json({ ok: false, health });
    }
  }

  const providers = registry.list().map((p) => {
    const envKeySet = p.envKey ? Boolean(String(process.env[p.envKey] ?? "").trim()) : false;
    const runtime = usage.getHealth(p.id);
    return {
      id: p.id,
      name: p.name,
      capabilities: p.capabilities,
      pricingTier: p.pricingTier,
      requiresApiKey: p.requiresApiKey,
      envKey: p.envKey ?? null,
      envKeySet,
      docsUrl: p.docsUrl,
      health: runtime ?? p.healthCheck(),
      usage: usage.snapshot().filter((u) => u.provider === p.id),
    };
  });

  return NextResponse.json({
    ok: true,
    providers,
    // ابزارهای محلیِ مرورگر — همیشه واقعاً در دسترس (بدون شبکه)
    localTools: [
      { id: "scene-analysis", name: "تحلیل صحنه و لحظهٔ طلایی", module: "src/lib/video/ai-clipper.ts" },
      { id: "beat-detection", name: "تشخیص ضرب و BPM", module: "src/lib/video/sfx.ts" },
      { id: "vad", name: "تشخیص بازهٔ گفتار (VAD)", module: "src/lib/video/asr-client.ts" },
      { id: "sfx-synth", name: "سنتز افکت صوتی (۸ افکت)", module: "src/lib/video/sfx.ts" },
      { id: "local-embeddings", name: "جست‌وجوی معنایی آفلاین", module: "src/lib/ai/core/local-embedding.ts" },
    ],
  });
}
