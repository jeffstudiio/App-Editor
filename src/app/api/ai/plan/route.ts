// ─────────────────────────────────────────────────────────────
// POST /api/ai/plan — عامل هوشمند: درخواست فارسی → برنامهٔ JSON (§18)
// زنجیره: zai → groq → gemini → openrouter (free-first router)
// خروجی سخت‌گیرانه اعتبارسنجی می‌شود؛ plan نامعتبر اجرا نمی‌شود
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/core/ai-errors";
import { buildSnapshot } from "@/lib/ai/agent/executor";
import { buildPlannerSystemPrompt, buildPlannerUserMessage, buildRepairMessage, extractJsonPlan } from "@/lib/ai/agent/planner-prompt";
import { validatePlan, type AIPlan } from "@/lib/ai/agent/plan-schema";
import type { PlanContextSnapshot } from "@/lib/ai/agent/plan-schema";
import { getPack } from "@/lib/creative-packs";
import { aiServer } from "@/lib/ai/server/registry";
import { clientIp, rateLimit, RATE_PRESETS } from "@/lib/ai/server/rate-limit";
import { readJsonWithLimit } from "@/lib/ai/server/route-helpers";
import type { ChatMessage } from "@/lib/ai/core/provider-types";

export const maxDuration = 120;

const MAX_BODY_BYTES = 512 * 1024; // snapshot متنی سبک — ۵۱۲KB کافی

interface IncomingSnapshot {
  aspect?: string;
  duration?: number;
  clips?: { id?: string; name?: string; kind?: string; timelineStart?: number; dur?: number }[];
  textItems?: { id?: string; role?: string; start?: number }[];
  audioItems?: { id?: string; name?: string; start?: number }[];
  hasCaptions?: boolean;
  hasMusic?: boolean;
}

/** snapshot ورودی را پاکسازی و محدود می‌کند — اعتماد به کلاینت ممنوع */
function sanitizeSnapshot(raw: IncomingSnapshot): PlanContextSnapshot {
  const clips = (Array.isArray(raw.clips) ? raw.clips : []).slice(0, 120).map((c, i) => ({
    id: String(c.id ?? `clip_${i + 1}`).slice(0, 48),
    name: String(c.name ?? "").slice(0, 60),
    kind: c.kind === "image" ? "image" : "video",
    timelineStart: Number(c.timelineStart) || 0,
    dur: Math.max(0, Number(c.dur) || 0),
  }));
  const textItems = (Array.isArray(raw.textItems) ? raw.textItems : []).slice(0, 120).map((t, i) => ({
    id: String(t.id ?? `tx_${i + 1}`).slice(0, 48),
    role: t.role === "caption" ? ("caption" as const) : ("title" as const),
    start: Math.max(0, Number(t.start) || 0),
  }));
  const audioItems = (Array.isArray(raw.audioItems) ? raw.audioItems : []).slice(0, 60).map((a, i) => ({
    id: String(a.id ?? `au_${i + 1}`).slice(0, 48),
    name: String(a.name ?? "").slice(0, 60),
    start: Math.max(0, Number(a.start) || 0),
  }));
  return {
    aspect: ["9:16", "1:1", "16:9", "4:5", "3:4"].includes(String(raw.aspect)) ? String(raw.aspect) : "9:16",
    duration: Math.max(0, Math.min(3600, Number(raw.duration) || 0)),
    clipIds: clips.map((c) => c.id),
    clips,
    textItems,
    audioItems,
    hasCaptions: Boolean(raw.hasCaptions),
    hasMusic: Boolean(raw.hasMusic),
    allItemIds: [...clips.map((c) => c.id), ...textItems.map((t) => t.id), ...audioItems.map((a) => a.id)],
  };
}

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`plan:${clientIp(req)}`, RATE_PRESETS.chat);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست‌های عامل هوشمند زیاد بوده — کمی صبر کن." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await readJsonWithLimit(req, MAX_BODY_BYTES);
    if (!body.ok) return body.resp;
    const instruction = String(body.body?.instruction ?? "").trim();
    if (instruction.length < 3) {
      return NextResponse.json({ error: "دستور را بنویس (حداقل ۳ حرف)." }, { status: 400 });
    }
    const snapshot = sanitizeSnapshot((body.body?.snapshot ?? {}) as IncomingSnapshot);
    const pack = getPack(typeof body.body?.pack === "string" ? body.body.pack : null);
    const apiKey = String(body.body?.apiKey ?? "").trim() || undefined;
    const model = String(body.body?.model ?? "").trim() || undefined;
    const prefer =
      body.body?.provider === "groq" || body.body?.provider === "gemini" || body.body?.provider === "openrouter"
        ? (body.body.provider as "groq" | "gemini" | "openrouter")
        : undefined;

    const messages: ChatMessage[] = [
      { role: "system", content: buildPlannerSystemPrompt(pack) },
      { role: "user", content: buildPlannerUserMessage(instruction, snapshot, pack) },
    ];

    const { router } = aiServer();
    let plan: AIPlan | null = null;
    let providerId = "";
    let via: string | undefined;
    let repairIssues: string[] = [];

    // دو تلاش — تلاش دوم با بازخورد دقیقِ خطاهای validator
    for (let attempt = 0; attempt < 2 && !plan; attempt++) {
      const msgs: ChatMessage[] =
        attempt === 0
          ? messages
          : [
              ...messages,
              { role: "user" as const, content: buildRepairMessage("", repairIssues) },
            ];
      const result = await router.route("fast_text", { capability: "fast_text", messages: msgs, jsonMode: true, apiKey, model }, { prefer });
      providerId = result.provider.id;
      via = result.via;
      if (result.output.kind !== "text") break;
      const parsed = extractJsonPlan(result.output.text);
      if (!parsed) continue;
      const v = validatePlan(parsed, snapshot);
      if (v.ok) {
        plan = v.plan;
      } else {
        repairIssues = v.issues.slice(0, 6);
      }
    }

    if (!plan) {
      return NextResponse.json(
        { error: "برنامهٔ تولیدشده معتبر نبود؛ دوباره امتحان کن.", issues: repairIssues },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      plan,
      provider: providerId,
      via,
      pack: pack?.id ?? null,
      snapshot: { clips: snapshot.clips, duration: snapshot.duration, hasCaptions: snapshot.hasCaptions },
    });
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.userMessage, code: err.code }, { status: err.httpStatus });
    }
    console.error("[ai-plan] error:", err);
    return NextResponse.json({ error: "عامل هوشمند پاسخ نداد؛ چند لحظه بعد دوباره تلاش کن." }, { status: 500 });
  }
}
