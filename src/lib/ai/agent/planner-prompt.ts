// ─────────────────────────────────────────────────────────────
// Planner Prompt — ساخت پرامپت برنامه‌ریز عامل (§16/§17/§18)
// مشترک بین سرور (route) و کلاینت (پیش‌نمایش) — بدون server-only
// ─────────────────────────────────────────────────────────────

import { COMMAND_CATALOG } from "./commands";
import type { AIPlan } from "./plan-schema";
import type { PlanContextSnapshot } from "./plan-schema";
import type { CreativePack } from "@/lib/creative-packs";

export function buildPlannerSystemPrompt(pack: CreativePack | null): string {
  const catalog = COMMAND_CATALOG.map((c) => `  - ${c.id}: ${c.en}${c.async ? " (needs real media service)" : ""}`).join("\n");
  const packBlock = pack
    ? `\nSTYLE PACK (${pack.id}): ${pack.name}\n${pack.styleHints.map((s) => `- ${s}`).join("\n")}\nPreferred filters: ${pack.filterPresets.join(", ")}\nPreferred caption presets: ${pack.captionPresets.join(", ")}\n`
    : "";
  const enumBlock = `EXACT PARAMETER VALUES (must match these strings):
  - set_aspect.aspect: "9:16" | "1:1" | "16:9" | "4:5" | "3:4"
  - apply_filter.preset: "none" | "cinema" | "warmglow" | "noir" | "faded" | "neon" | "clean" | "mint"   ; target: "all" | "clip"
  - adjust_color: brightness/contrast/saturate/temp are DELTAS (-40..40), vignette 0..100 ; target: "all" | "clip"
  - add_title: start (timeline sec), dur 0.5-15, size 24-160, animIn: "fade"|"pop"|"slideUp"|"typewriter"
  - style_titles: font: "Vazirmatn" | "Lalezar"
  - set_caption_style.preset: "impact" | "neon" | "minimal" | "classic" | "lalezar"
  - change_speed.speed: 0.25..4
  - add_transition.type: "none" | "fade" | "black" | "slide" | "zoom"  ; dur 0.1-2  ; target: "all" | "clip"
  - set_volume.target: "clips" | "audios"  (clips=footage volume, audios=music/voice), volume 0..2
  - duck_music.volume: 0..1 (default 0.25)
  - add_keyframe: prop: "scale"|"x"|"y"|"rotate"|"opacity" ; ease: "linear"|"in"|"out"|"inout"|"back"|"elastic"|"bounce"
  - add_music.mood: "luxury" | "warm" | "emotional" | "energetic" | "cinematic" | "calm" | "clean"
  - add_sfx.id: "whoosh" | "pop" | "riser" | "impact" | "ding" | "heartbeat" | "click" | "gleam"
  - crop_clip: x/y/w/h normalized 0..1 source rect (e.g. {x:0, y:0.1, w:1, h:0.8} cuts 10% top) — REAL crop in preview AND export; prefer centered ratios like 1:1 (w=h=min) for square posts
  - reset_crop: removes crop from a clip
  - replace_clip.assetId: ONLY from snapshot.assets list (same kind as the clip — video with video, image with image)
  - to_overlay: moves a main clip to the overlay (PiP) track; to_main_track.id: an overlay id from snapshot.overlayIds
  - generate_voice.voice: use "fa-IR-DilaraNeural" (Persian female) or "fa-IR-FaridNeural" (Persian male)`;

  return `You are the JEFF Creative Studio AI EDITING AGENT. You convert a user's Persian editing request into a structured JSON edit plan that executes on a real timeline.

AVAILABLE TOOLS (the ONLY allowed "tool" values):
${catalog}

${enumBlock}

HARD RULES:
1. Output ONLY pure JSON, no markdown fences, no commentary.
2. Every operation must be an object starting with "tool" plus its required parameters.
3. Use ONLY the context snapshot's real IDs (clipIds / text ids / audio ids). Never invent IDs. Use "" fields from the snapshot for timing math.
4. For trim_clip: "start"/"end" are TIMELINE seconds (absolute), not source seconds.
5. For split_clip: "at" is a TIMELINE second inside one clip (0.25s away from its edges).
6. Use add_title only for headline text. Captions styling (set_caption_style) works ONLY if hasCaptions is true.
7. Maximum 25 operations. Keep plans minimal and purposeful — do not add operations the user did not ask for.
8. If the request cannot be satisfied with the available tools and context, return operations: [] and explain in "notes" (Persian).
9. "summary" must be ONE short Persian sentence describing what you will do.
10. Keyframe times are absolute timeline seconds; property values: scale 0.2-3, x/y -1..1, opacity 0-1, rotate degrees.
11. For a "before/after reveal": order clips so the "before" clip is first, add fade transitions, and a title like «قبل» / «بعد» timing is up to you.
12. duck_music sets music volume low under speech — prefer it over set_volume for music when captions/speech exist.
13. add_title MUST include "text" — the actual Persian title string the user sees.
14. Every tool's required params are REQUIRED. Omitting one invalidates the whole operation.

PLAN SHAPE:
{"intent":"<short-en-label>","summary":"<one Persian sentence>","aspectRatio":"9:16|1:1|16:9|4:5|3:4 (only if user asks)","operations":[{"tool":"...","...params}],"notes":["<optional Persian notes>"]}
${packBlock}`;
}

export function buildRepairMessage(baseUser: string, issues: string[]): string {
  return `${baseUser}

YOUR PREVIOUS PLAN WAS REJECTED BY THE VALIDATOR:
${issues.map((i) => `- ${i}`).join("\n")}

Fix these exact problems and output the corrected pure JSON plan now.`;
}

export function buildPlannerUserMessage(instruction: string, snapshot: PlanContextSnapshot, pack: CreativePack | null): string {
  const packLine = pack ? `\nPACK_MOODS: ${pack.musicMoods.map((m) => m.id).join(", ")}` : "";
  const assetsLine = snapshot.assets?.length
    ? `\nassets (replace_clip source pool): ${snapshot.assets.map((a) => `{id:"${a.id}", name:"${a.name}", type:${a.type}}`).join(", ")}`
    : "\nassets: none (do NOT use replace_clip)";
  const overlaysLine = snapshot.overlayIds?.length
    ? `\noverlays: ${snapshot.overlayIds.join(", ")}`
    : "";
  return `TIMELINE CONTEXT (real current project):
aspect: ${snapshot.aspect}
totalDuration: ${snapshot.duration.toFixed(2)}s
clips (timelineStart..end): ${snapshot.clips.map((c) => `{id:"${c.id}", name:"${c.name}", kind:${c.kind}, ${c.timelineStart.toFixed(2)}..${(c.timelineStart + c.dur).toFixed(2)}}`).join(", ") || "EMPTY"}
texts: ${snapshot.textItems.map((t) => `{id:"${t.id}", role:${t.role}, start:${t.start.toFixed(2)}}`).join(", ") || "none"}
audios: ${snapshot.audioItems.map((a) => `{id:"${a.id}", name:"${a.name}", start:${a.start.toFixed(2)}}`).join(", ") || "none"}${overlaysLine}${assetsLine}
hasCaptions: ${snapshot.hasCaptions}
hasMusic: ${snapshot.hasMusic}${packLine}

USER REQUEST (Persian):
${instruction.slice(0, 1200)}

Produce the JSON plan now.`;
}

/** استخراج اولین آبجکت JSON از پاسخ مدل — همان تکنیک مسیرهای موجود */
export function extractJsonPlan(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?([\s\S]*?)```/g, "$1").trim();
  const m = /\{[\s\S]*\}/.exec(cleaned);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as unknown;
  } catch {
    return null;
  }
}

export type { AIPlan };
