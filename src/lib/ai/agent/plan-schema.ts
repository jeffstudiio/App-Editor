// ─────────────────────────────────────────────────────────────
// AI Plan Schema — فرمت برنامهٔ ساخت‌یافته (§18) با zod
// هر عملیات باید یکی از دستورهای کاتالوگ باشد — اجرای دلخواه ممنوع
// ─────────────────────────────────────────────────────────────

import { z } from "zod";
import { CommandParams } from "./commands";

export const PlanOperationSchema = z.object({
  tool: z.string(),
  // بقیهٔ فیلدها در validatePlan با اسکیمای همان دستور سنجیده می‌شود
}).passthrough();

export const AIPlanSchema = z.object({
  intent: z.string().max(80).optional(),
  summary: z.string().max(400).optional(),
  aspectRatio: z.enum(["9:16", "1:1", "16:9", "4:5", "3:4"]).optional(),
  operations: z.array(PlanOperationSchema).max(40),
  notes: z.array(z.string().max(200)).max(6).optional(),
});

export type AIPlan = z.infer<typeof AIPlanSchema>;
export type PlanOperation = z.infer<typeof PlanOperationSchema>;

/** اعتبارسنجی کامل plan: اسکیمای هر دستور + شناسه‌ها علیه پروژه (§18/§36) */
export function validatePlan(
  plan: unknown,
  snapshot: PlanContextSnapshot,
): { ok: true; plan: AIPlan } | { ok: false; issues: string[] } {
  const parsed = AIPlanSchema.safeParse(plan);
  if (!parsed.success) {
    return { ok: false, issues: ["شکل کلی برنامه معتبر نیست (JSON نامعتبر یا عملیات زیاد)."] };
  }
  const issues: string[] = [];
  for (let i = 0; i < parsed.data.operations.length; i++) {
    const op = parsed.data.operations[i];
    const def = CommandParams[op.tool];
    if (!def) {
      issues.push(`عملیات ${i + 1}: «${op.tool}» دستور شناخته‌شده‌ای نیست. فقط از لیست مجاز استفاده کن.`);
      continue;
    }
    const res = def.safeParse(op);
    if (!res.success) {
      for (const issue of res.error.issues.slice(0, 2)) {
        const path = issue.path?.length ? String(issue.path[0]) : "";
        issues.push(translateZodIssue(i + 1, op.tool, path, issue.message, issue.code));
      }
    }
  }
  // بررسی زمینه: شناسه‌ها واقعاً در پروژه هستند؟
  for (let i = 0; i < parsed.data.operations.length; i++) {
    const op = parsed.data.operations[i] as Record<string, unknown>;
    if ("clipId" in op && typeof op.clipId === "string" && !snapshot.clipIds.includes(op.clipId)) {
      issues.push(`عملیات ${i + 1}: کلیپ ${op.clipId} در پروژه نیست.`);
    }
    // id فقط در دستورهای کی‌فریم به آیتم پروژه اشاره می‌کند (add_sfx id نوع افکت است)
    const idTargetsItem = op.tool === "add_keyframe" || op.tool === "remove_keyframe";
    if (idTargetsItem && "id" in op && typeof op.id === "string" && !snapshot.allItemIds.includes(op.id)) {
      issues.push(`عملیات ${i + 1}: آیتم ${op.id} در پروژه نیست.`);
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, plan: parsed.data };
}

/** پیام خطای zod → فارسیِ روشن برای مدل و کاربر */
function translateZodIssue(opNo: number, tool: string, path: string, raw: string, code: string): string {
  const base = `عملیات ${opNo} (${tool}):`;
  if (code === "invalid_type" && /undefined/.test(raw)) return `${base} پارامتر «${path}» الزامی است و جا افتاده.`;
  if (code === "invalid_value") return `${base} مقدار «${path}» مجاز نیست — فقط مقادیر فهرست‌شده در راهنما.`;
  if (code === "too_small") return `${base} مقدار «${path}» خیلی کوچک است (${raw}).`;
  if (code === "too_big") return `${base} مقدار «${path}» خیلی بزرگ است (${raw}).`;
  return `${base} ${raw}${path ? ` [${path}]` : ""}`;
}

/** خلاصهٔ سبک پروژه برای planner + validator (بدون رسانهٔ سنگین) */
export interface PlanContextSnapshot {
  aspect: string;
  duration: number;
  clipIds: string[];
  clips: { id: string; name: string; kind: string; timelineStart: number; dur: number }[];
  textItems: { id: string; role: "title" | "caption"; start: number }[];
  audioItems: { id: string; name: string; start: number }[];
  hasCaptions: boolean;
  hasMusic: boolean;
  allItemIds: string[];
}
