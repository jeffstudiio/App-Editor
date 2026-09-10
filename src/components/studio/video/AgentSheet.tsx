"use client";

// ─────────────────────────────────────────────────────────────
// AgentSheet — عامل هوشمند ادیتور (§16-§18)
// دستور فارسی → plan از سرور → پیش‌نمایش → اجرای واقعی روی تایم‌لاین
// NO FAKE: هر عملیات واقعاً اجرا یا صادقانه «ناموفق» گزارش می‌شود
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Bot, Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPack, pickMusicMood } from "@/lib/creative-packs";
import { withBase } from "@/lib/base-path";
import { byoCreds } from "@/lib/ai/client/settings";
import { describeOperationFa, CommandParams } from "@/lib/ai/agent/commands";
import { validatePlan, type AIPlan } from "@/lib/ai/agent/plan-schema";
import { buildSnapshot, applySyncPlan, insertAudioAsset, insertImageAsset, type CommandResult } from "@/lib/ai/agent/executor";
import { renderSfx } from "@/lib/video/sfx";
import type { EditorCtx } from "./ctx";

const PACK = getPack("beauty");

interface PlanResponse {
  ok?: boolean;
  plan?: AIPlan;
  provider?: string;
  error?: string;
  issues?: string[];
}

interface SyncOutcome {
  tool: string;
  ok: boolean;
  message: string;
}

export function AgentSheet({ ctx }: { ctx: EditorCtx }) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<SyncOutcome[] | null>(null);

  const requestPlan = async (inst?: string) => {
    const text = (inst ?? instruction).trim();
    if (text.length < 3) {
      setError("دستور را کامل‌تر بنویس.");
      return;
    }
    setLoading(true);
    setError(null);
    setIssues([]);
    setPlan(null);
    setOutcomes(null);
    try {
      const creds = byoCreds();
      const snap = buildSnapshot(ctx.project, [...ctx.assets.values()]);
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, snapshot: snap, pack: PACK?.id, ...creds }),
      });
      const j = (await res.json()) as PlanResponse;
      if (!res.ok || !j.ok || !j.plan) {
        setError(j.error ?? "برنامه‌سازی ناموفق بود.");
        if (j.issues?.length) setIssues(j.issues);
        return;
      }
      // اعتبارسنجی دوم روی کلاینت با snapshot زندهٔ همین لحظه
      const v = validatePlan(j.plan, buildSnapshot(ctx.project, [...ctx.assets.values()]));
      if (!v.ok) {
        setIssues(v.issues);
        setError("برنامه با وضعیت فعلی پروژه نمی‌خواند — پروژه را ذخیره/باز کن یا دستور را تکرار کن.");
        return;
      }
      setPlan(v.plan);
      setProvider(j.provider ?? null);
    } catch {
      setError("ارتباط با عامل هوشمند برقرار نشد.");
    } finally {
      setLoading(false);
    }
  };

  // ── سرویس‌های واقعی برای دستورهای ناهمگام ──
  const runAsyncOp = async (op: Record<string, unknown>): Promise<SyncOutcome> => {
    try {
      if (op.tool === "add_music") {
        const mood = PACK?.musicMoods.find((m) => m.id === op.mood) ?? pickMusicMood(PACK!, String(op.mood ?? ""));
        if (!mood) return { tool: "add_music", ok: false, message: "حال‌وهوای موسیقی پیدا نشد" };
        const res = await fetch(withBase(`/bank-media/music/${mood.file}.m4a`));
        if (!res.ok) return { tool: "add_music", ok: false, message: "فایل موسیقی بانک در دسترس نبود" };
        const blob = await res.blob();
        const asset = await ctx.importFile(new File([blob], `${mood.file}.m4a`, { type: "audio/mp4" }));
        if (!asset) return { tool: "add_music", ok: false, message: "بارگیری موسیقی ناموفق" };
        ctx.mutate((p) => insertAudioAsset(p, asset, 0, Number(op.volume ?? 0.6), false));
        return { tool: "add_music", ok: true, message: `موسیقی «${mood.labelFa}» اضافه شد` };
      }
      if (op.tool === "add_sfx") {
        const blob = await renderSfx(String(op.id));
        const asset = await ctx.importFile(new File([blob], `sfx-${op.id}.wav`, { type: "audio/wav" }));
        if (!asset) return { tool: "add_sfx", ok: false, message: "ساخت افکت صوتی ناموفق" };
        ctx.mutate((p) => insertAudioAsset(p, asset, Number(op.t ?? 0), 0.9, false));
        return { tool: "add_sfx", ok: true, message: `افکت ${op.id} در ${Number(op.t ?? 0).toFixed(1)}s` };
      }
      if (op.tool === "generate_image") {
        const size = ctx.project.aspect === "16:9" ? "1344x768" : ctx.project.aspect === "1:1" ? "1024x1024" : "768x1344";
        const res = await fetch("/api/image-gen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: op.prompt, size, ...byoCreds() }),
        });
        const j = (await res.json()) as { image_base64?: string; error?: string };
        if (!res.ok || !j.image_base64) {
          return { tool: "generate_image", ok: false, message: j.error ?? "تولید تصویر ناموفق بود" };
        }
        const file = dataUrlToFile(j.image_base64, `ai-${Date.now()}.png`);
        const asset = await ctx.importFile(file);
        if (!asset) return { tool: "generate_image", ok: false, message: "ورود تصویر به پروژه ناموفق" };
        const at = Number(op.at ?? 0);
        const dur = Number(op.dur ?? 2.5);
        ctx.mutate((p) => {
          // درج بعد از کلیپی که لحظهٔ at را پوشش می‌دهد
          let acc = 0;
          let idx = p.clips.length;
          for (let i = 0; i < p.clips.length; i++) {
            const c = p.clips[i];
            const d = (c.out - c.in) / (c.kind === "image" ? 1 : c.speed);
            if (at >= acc && at < acc + d) {
              idx = i + 1;
              break;
            }
            acc += d;
          }
          insertImageAsset(p, asset, idx, dur);
        });
        return { tool: "generate_image", ok: true, message: "تصویر AI تولید و درج شد" };
      }
      if (op.tool === "generate_voice") {
        const res = await fetch("/api/edge-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: op.text, voice: op.voice || "fa-IR-DilaraNeural", rate: 1 }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          return { tool: "generate_voice", ok: false, message: j.error ?? "گویندگی AI ناموفق بود" };
        }
        const blob = await res.blob();
        const asset = await ctx.importFile(new File([blob], `voice-${Date.now()}.mp3`, { type: "audio/mpeg" }));
        if (!asset) return { tool: "generate_voice", ok: false, message: "ورود صدا به پروژه ناموفق" };
        ctx.mutate((p) => insertAudioAsset(p, asset, Number(op.at ?? 0), 1, true));
        return { tool: "generate_voice", ok: true, message: "گویندگی اضافه شد" };
      }
      return { tool: String(op.tool), ok: false, message: "سرویس این دستور تعریف نشده است" };
    } catch (err) {
      return { tool: String(op.tool), ok: false, message: err instanceof Error ? err.message : "خطای نامشخص" };
    }
  };

  const applyPlan = async () => {
    if (!plan) return;
    setApplying(true);
    const all: SyncOutcome[] = [];
    try {
      const syncOps = plan.operations.filter((o) => !isAsync(o.tool));
      const asyncOps = plan.operations.filter((o) => isAsync(o.tool));
      if (syncOps.length) {
        let results: CommandResult[] = [];
        ctx.mutate((p) => {
          results = applySyncPlan(p, syncOps as Record<string, unknown>[], { assets: [...ctx.assets.values()] });
        });
        all.push(...results);
      }
      for (const op of asyncOps) {
        all.push(await runAsyncOp(op as Record<string, unknown>));
      }
      setOutcomes(all);
      const failed = all.filter((r) => !r.ok);
      if (failed.length === 0) ctx.toast(`برنامه اجرا شد — ${all.length} عملیات ✓`, "success");
      else ctx.toast(`${all.length - failed.length} عملیات انجام شد، ${failed.length} مورد ناموفق`, "info");
      setPlan(null);
    } finally {
      setApplying(false);
    }
  };

  const workflows = PACK?.workflows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
        <p className="text-[13px] leading-6 text-violet-100">
          درخواست تدوین را فارسی بنویس — عامل هوشمند برنامهٔ عملیاتی می‌سازد و با تأیید تو، واقعاً روی تایم‌لاین اجرا می‌کند.
        </p>
      </div>

      {workflows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {workflows.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={loading || applying}
              onClick={() => {
                setInstruction(w.instructionFa);
                void requestPlan(w.instructionFa);
              }}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-40"
            >
              {w.labelFa}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="مثلاً: یک ریلز لوکسِ ۱۵ ثانیه‌ای بساز؛ فیلتر گرم بزن، ترنزیشن محو بگذار، موسیقی لوکس اضافه کن و صدای کلیپ‌ها را کم کن…"
        rows={4}
        dir="rtl"
        className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 text-sm leading-6 text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
      />

      <Button
        onClick={() => void requestPlan()}
        disabled={loading || applying}
        className="w-full gap-2 rounded-2xl bg-gradient-to-l from-violet-600 to-fuchsia-600 font-bold text-white"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {loading ? "در حال ساختن برنامه…" : "ساختن برنامهٔ تدوین"}
      </Button>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] leading-6 text-red-200">
          {error}
          {issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pr-4 text-[12px] text-red-300/90">
              {issues.map((i, k) => (
                <li key={k}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {plan && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">{plan.summary || "برنامهٔ تدوین"}</p>
            {provider && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
                {provider === "zai" ? "دستیار داخلی" : provider}
              </span>
            )}
          </div>
          <ol className="space-y-1.5">
            {plan.operations.map((op, i) => {
              const unknown = !CommandParams[String((op as Record<string, unknown>).tool)];
              return (
                <li key={i} className="flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2 text-[13px] text-white/90">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-400" />
                  <span dir="rtl">
                    <span className="text-white/40">{i + 1}. </span>
                    {unknown ? `دستور ناشناخته: ${String((op as Record<string, unknown>).tool)}` : describeOperationFa(op as Record<string, unknown>)}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex gap-2">
            <Button
              onClick={() => void applyPlan()}
              disabled={applying}
              className="flex-1 gap-2 rounded-2xl bg-emerald-600 font-bold text-white hover:bg-emerald-500"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {applying ? "در حال اجرا…" : `اجرا (${plan.operations.length} عملیات)`}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPlan(null);
                setOutcomes(null);
              }}
              disabled={applying}
              className="rounded-2xl border-white/15 text-white/70"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {outcomes && (
        <div className="space-y-1.5 rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-bold text-white/60">نتیجهٔ اجرا:</p>
          {outcomes.map((r, i) => (
            <p key={i} className={`text-[13px] ${r.ok ? "text-emerald-300" : "text-amber-300"}`}>
              {r.ok ? "✓" : "✗"} {r.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function isAsync(tool: string): boolean {
  return ["add_music", "add_sfx", "generate_image", "generate_voice"].includes(tool);
}

function dataUrlToFile(dataUrl: string, name: string): File {
  if (dataUrl.startsWith("data:")) {
    const [head, b64] = dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }
  return new File([new Uint8Array(atob(dataUrl).split("").map((c) => c.charCodeAt(0)))], name, { type: "image/png" });
}
