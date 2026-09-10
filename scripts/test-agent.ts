// تست عامل هوشمند: snapshot / validator / executor / Beauty workflow
// اجرا: npx tsx scripts/test-agent.ts
import { emptyProject, clipDur, totalDur, type Clip, type Project } from "../src/lib/video/types";
import { buildSnapshot, applySyncPlan, applySyncCommand, insertAudioAsset, insertImageAsset } from "../src/lib/ai/agent/executor";
import { validatePlan, type PlanContextSnapshot } from "../src/lib/ai/agent/plan-schema";
import { buildPlannerSystemPrompt, buildPlannerUserMessage, extractJsonPlan } from "../src/lib/ai/agent/planner-prompt";
import { describeOperationFa, CommandParams } from "../src/lib/ai/agent/commands";
import { getPack, pickMusicMood, listPacks } from "../src/lib/creative-packs";
import type { MediaAsset } from "../src/lib/video/types";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown, tol = 1e-9) {
  const ok =
    typeof want === "number" && typeof got === "number"
      ? Math.abs(got - want) <= tol
      : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}: got ${JSON.stringify(got)?.slice(0, 140)}, want ${JSON.stringify(want)?.slice(0, 140)}`);
  }
}
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${name}`);
  }
}

function makeVideoClip(id: string, inS: number, outS: number, speed = 1): Clip {
  return {
    id, kind: "video", assetId: `asset_${id}`, name: `کلیپ ${id}`,
    in: inS, out: outS, speed,
    transform: { scale: 1, x: 0, y: 0, rotate: 0, flipH: false, flipV: false, opacity: 1 },
    filter: { presetId: "none", brightness: 0, contrast: 0, saturate: 0, hue: 0, blur: 0, sepia: 0, temp: 0, vignette: 0 },
    chroma: { enabled: false, color: "#00b140", similarity: 0.4, smoothness: 0.1 },
    volume: 1, muted: false, fadeIn: 0, fadeOut: 0,
    transitionIn: { type: "none", dur: 0 },
    srcDur: outS + 10, srcW: 1080, srcH: 1920,
  };
}

function sampleProject(): Project {
  const p = emptyProject();
  p.aspect = "9:16";
  p.clips = [makeVideoClip("clip_01", 0, 4), makeVideoClip("clip_02", 0, 6), makeVideoClip("clip_03", 2, 5)];
  return p;
}

// ── ۱) buildSnapshot ──
{
  const p = sampleProject();
  const snap = buildSnapshot(p);
  eq("snapshot aspect", snap.aspect, "9:16");
  eq("snapshot clips", snap.clips.length, 3);
  eq("snapshot clip2 start", snap.clips[1].timelineStart, 4);
  eq("snapshot duration", snap.duration, 13);
  ok("snapshot ids", snap.clipIds.includes("clip_02") && snap.allItemIds.includes("clip_03"));
}

// ── ۲) validator ──
{
  const p = sampleProject();
  const snap = buildSnapshot(p);
  const good = validatePlan(
    { intent: "x", summary: "ی", operations: [{ tool: "trim_clip", clipId: "clip_01", start: 0, end: 2 }] },
    snap,
  );
  ok("valid plan accepted", good.ok);

  const bad1 = validatePlan({ operations: [{ tool: "explode_timeline" }] }, snap);
  ok("unknown tool rejected", !bad1.ok && (bad1 as { issues: string[] }).issues.length === 1);

  const bad2 = validatePlan({ operations: [{ tool: "remove_clip", clipId: "clip_99" }] }, snap);
  ok("unknown clipId rejected", !bad2.ok);

  const bad3 = validatePlan({ operations: [{ tool: "change_speed", clipId: "clip_01", speed: 9 }] }, snap);
  ok("speed out of range rejected", !bad3.ok);

  const bad4 = validatePlan({ operations: Array.from({ length: 50 }, () => ({ tool: "add_marker", t: 1 })) }, snap);
  ok("too many operations rejected", !bad4.ok);
}

// ── ۳) executor: عملیات اصلی ──
{
  const p = sampleProject();
  let r = applySyncCommand(p, { tool: "trim_clip", clipId: "clip_02", start: 4.5, end: 6.5 });
  ok("trim ok", r.ok);
  eq("trim in shifted", p.clips[1].in, 0.5); // 4.5 - 4.0 = 0.5s shift
  eq("trim out", p.clips[1].out, 2.5); // 0.5 + 2.0s

  r = applySyncCommand(p, { tool: "split_clip", at: 5 });
  ok("split ok", r.ok);
  eq("split count", p.clips.length, 4);

  r = applySyncCommand(p, { tool: "duplicate_clip", clipId: "clip_01" });
  eq("dup count", p.clips.length, 5);
  const dupId = p.clips[1].id;
  r = applySyncCommand(p, { tool: "move_clip", clipId: dupId, index: 0 });
  eq("move to first", p.clips[0].id, dupId);
  r = applySyncCommand(p, { tool: "remove_clip", clipId: p.clips[0].id });
  eq("remove count", p.clips.length, 4);

  r = applySyncCommand(p, { tool: "change_speed", clipId: p.clips[0].id, speed: 2 });
  eq("speed set", p.clips[0].speed, 2);

  r = applySyncCommand(p, { tool: "add_transition", type: "fade", dur: 0.5 });
  ok("transition all", p.clips.every((c) => c.transitionIn.type === "fade"));

  r = applySyncCommand(p, { tool: "apply_filter", preset: "warmglow" });
  eq("filter preset applied", p.clips[0].filter.presetId, "warmglow");

  const before = p.clips[0].filter.brightness; // مقدار مطلق پریست
  r = applySyncCommand(p, { tool: "adjust_color", brightness: 10 });
  eq("color delta on top of preset", p.clips[0].filter.brightness, before + 10);

  r = applySyncCommand(p, { tool: "add_title", text: "قبل", start: 0, dur: 2 });
  ok("title added", p.texts.some((t) => t.text === "قبل" && !t.isCaption));

  r = applySyncCommand(p, { tool: "set_fades", fadeIn: 0.5, fadeOut: 1 });
  eq("fade in", p.clips[0].fadeIn, 0.5);
  eq("fade out", p.clips[0].fadeOut, 1);

  r = applySyncCommand(p, { tool: "add_marker", t: 8, label: "رونمایی" });
  ok("marker added", p.markers.some((m) => m.label === "رونمایی"));

  const clipId = p.clips[0].id;
  r = applySyncCommand(p, { tool: "add_keyframe", id: clipId, prop: "scale", t: 1, value: 1.4, ease: "inout" });
  ok("kf added", !!p.clips[0].kf?.scale?.length);
  r = applySyncCommand(p, { tool: "add_keyframe", id: clipId, prop: "scale", t: 2, value: 2 });
  eq("kf count", p.clips[0].kf!.scale!.length, 2);
  r = applySyncCommand(p, { tool: "remove_keyframe", id: clipId, prop: "scale", t: 1 });
  eq("kf removed", p.clips[0].kf!.scale!.length, 1);
}

// ── ۴) کپشن و موسیقی ──
{
  const p = sampleProject();
  p.texts.push({
    id: "tx_c1", text: "سلام", start: 0, end: 2, x: 0.5, y: 0.8, font: "Vazirmatn", weight: 700,
    size: 60, color: "#fff", accent: "#facc15", strokeColor: "#000", strokeW: 8, bgColor: "#000",
    bgOpacity: 0.5, shadow: true, gradient: false, animIn: "fade", animOut: "none", rotate: 0,
    opacity: 1, karaoke: true, isCaption: true,
  });
  let r = applySyncCommand(p, { tool: "set_caption_style", preset: "lalezar" });
  ok("caption styled", r.ok && p.texts[0].font === "Lalezar");

  r = applySyncCommand(p, { tool: "duck_music", volume: 0.2 });
  ok("duck without music fails honestly", !r.ok);

  const asset: MediaAsset = { id: "as_m1", type: "audio", url: "blob:x", name: "ambient-dark", duration: 30, width: 0, height: 0 };
  insertAudioAsset(p, asset, 0, 0.6);
  eq("music inserted", p.audios.length, 1);
  const r2 = applySyncCommand(p, { tool: "duck_music", volume: 0.2 });
  ok("duck lowers music", r2.ok && Math.abs(p.audios[0].volume - 0.2) < 1e-9);
}

// ── ۵) Workflow واقعی Beauty: «ریلز قبل/بعدِ لوکس ۱۵ ثانیه» ──
{
  const pack = getPack("beauty");
  ok("beauty pack registered", !!pack);
  eq("pack count", listPacks().length, 1);

  const p = sampleProject();
  p.aspect = "16:9";
  const plan = {
    intent: "create_reel",
    summary: "ریلز لوکس قبل/بعد با فیلتر گرم و موسیقی",
    aspectRatio: "9:16",
    operations: [
      { tool: "set_aspect", aspect: "9:16" },
      { tool: "apply_filter", preset: "warmglow", target: "all" },
      { tool: "add_transition", type: "fade", dur: 0.5, target: "all" },
      { tool: "trim_clip", clipId: "clip_01", start: 0, end: 4 },
      { tool: "trim_clip", clipId: "clip_02", start: 4, end: 9 },
      { tool: "trim_clip", clipId: "clip_03", start: 9, end: 15 },
      { tool: "add_title", text: "تحول مو ✨", start: 0, dur: 2.5, size: 92 },
      { tool: "add_title", text: "بعد", start: 12.5, dur: 2.5 },
      { tool: "add_music", mood: "luxury", volume: 0.5 },
      { tool: "set_volume", target: "clips", volume: 0.3 },
      { tool: "add_sfx", id: "gleam", t: 9 },
    ],
    notes: [],
  };
  const snap = buildSnapshot(p);
  const v = validatePlan(plan, snap);
  ok("beauty plan valid", v.ok);

  // اجرای بخش sync (همهٔ عملیات غیر از add_music/add_sfx)
  const syncOps = plan.operations.filter((o) => !["add_music", "add_sfx"].includes(String(o.tool)));
  const results = applySyncPlan(p, syncOps);
  ok("all sync ops ok", results.every((r) => r.ok));
  eq("beauty aspect", p.aspect, "9:16");
  eq("beauty filter", p.clips[0].filter.presetId, "warmglow");
  eq("beauty volume", p.clips[0].volume, 0.3);
  eq("beauty titles", p.texts.length, 2);
  ok("beauty duration ~15s", Math.abs(totalDur(p) - 15) < 0.5);

  // mood selection واقعی از متن کاربر
  const mood = pickMusicMood(pack!, "می‌خوام حس لوکس و شیک داشته باشه");
  eq("mood pick luxury", mood?.file, "ambient-dark");
  const mood2 = pickMusicMood(pack!, "پرانرژی و کات‌دار");
  eq("mood pick energetic", mood2?.file, "trap-drive");

  // insertImage واقعی (نتیجهٔ generate_image)
  const imgAsset: MediaAsset = { id: "as_i1", type: "image", url: "blob:y", name: "ai.png", duration: 0, width: 768, height: 1344 };
  insertImageAsset(p, imgAsset, 1, 2);
  eq("image clip inserted", p.clips[1].kind, "image");
  eq("image clip dur", clipDur(p.clips[1]), 2);
}

// ── ۶) planner prompt و استخراج JSON ──
{
  const pack = getPack("beauty");
  const sys = buildPlannerSystemPrompt(pack);
  ok("system prompt has tools", sys.includes("trim_clip") && sys.includes("add_music"));
  ok("system prompt has pack", pack ? sys.includes("STYLE PACK (beauty)") : true);
  const user = buildPlannerUserMessage("ریلز لوکس بساز", buildSnapshot(sampleProject()), pack);
  ok("user msg has ids", user.includes("clip_01"));
  ok("user msg has request", user.includes("ریلز لوکس بساز"));

  const json = extractJsonPlan('```json\n{"intent":"a","operations":[{"tool":"set_aspect","aspect":"9:16"}]}\n```');
  ok("extract from fences", !!json);
  const json2 = extractJsonPlan('blah blah {"intent":"b","operations":[]} trailing');
  ok("extract from prose", !!json2);
  eq("extract null for none", extractJsonPlan("no json here"), null);
}

// ── ۷) توضیح فارسی عملیات ──
{
  eq("describe aspect", describeOperationFa({ tool: "set_aspect", aspect: "9:16" }), "تغییر نسبت تصویر (9:16)");
  eq("describe speed", describeOperationFa({ tool: "change_speed", clipId: "clip_1", speed: 2 }), "تغییر سرعت (clip_1، سرعت ×2)");
  ok("catalog complete", Object.keys(CommandParams).length >= 29);
}

// ── ۸) دستورهای جدید P0/P1: crop / replace / بین‌ترک ──
{
  const p = sampleProject();
  const assets: MediaAsset[] = [
    { id: "asset_clip_01", type: "video", url: "blob:x", name: "ویدئوی الف", duration: 12, width: 1080, height: 1920 },
    { id: "img1", type: "image", url: "blob:y", name: "عکس ب", duration: 10, width: 1080, height: 1920 },
  ];

  // crop_clip — کراپ واقعی
  const r1 = applySyncCommand(p, { tool: "crop_clip", clipId: "clip_01", x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  ok("crop_clip ok", r1.ok);
  eq("crop_clip value", p.clips[0].crop?.w, 0.8);
  const r1b = applySyncCommand(p, { tool: "crop_clip", clipId: "ناموجود", x: 0, y: 0, w: 1, h: 1 });
  ok("crop_clip missing clip fails", !r1b.ok);

  // reset_crop
  const r2 = applySyncCommand(p, { tool: "reset_crop", clipId: "clip_01" });
  ok("reset_crop ok", r2.ok);
  eq("reset_crop cleared", p.clips[0].crop, undefined);
  const r2b = applySyncCommand(p, { tool: "reset_crop", clipId: "clip_01" });
  ok("reset_crop twice fails honestly", !r2b.ok);

  // replace_clip — با کلید واقعی
  const r3 = applySyncCommand(p, { tool: "replace_clip", clipId: "clip_01", assetId: "asset_clip_01" }, { assets });
  ok("replace_clip ok", r3.ok);
  eq("replace_clip asset", p.clips.find((c) => c.id === "clip_01")?.assetId, "asset_clip_01");
  const r3b = applySyncCommand(p, { tool: "replace_clip", clipId: "clip_01", assetId: "img1" }, { assets });
  ok("replace_clip kind mismatch fails", !r3b.ok);
  const r3c = applySyncCommand(p, { tool: "replace_clip", clipId: "clip_01", assetId: "asset_clip_01" });
  ok("replace_clip without assets fails honestly", !r3c.ok);

  // to_overlay — کلیپ دوم به لایهٔ رویی
  const r4 = applySyncCommand(p, { tool: "to_overlay", clipId: "clip_02" });
  ok("to_overlay ok", r4.ok);
  eq("to_overlay clips count", p.clips.length, 2);
  eq("to_overlay overlay start", p.overlays[0].start, 4); // بعد از clip_01 (۴ ثانیه)
  eq("to_overlay keeps srcIn", p.overlays[0].srcIn, 0);
  eq("to_overlay keeps transform", p.overlays[0].transform.scale, 1);

  // to_main_track — برگشت همان لایه با برش خودکار
  const overlayId = p.overlays[0].id;
  const r5 = applySyncCommand(p, { tool: "to_main_track", id: overlayId });
  ok("to_main_track ok", r5.ok);
  eq("to_main_track overlays empty", p.overlays.length, 0);
  eq("to_main_track clips count", p.clips.length, 3); // clip_01 + لایهٔ درج‌شده در 4s + clip_03
  eq("to_main_track inserted kind", p.clips[1].kind, "video");
  eq("to_main_track inserted in", p.clips[1].in, 0);
  eq("to_main_track keeps out bound", p.clips[1].out <= p.clips[1].srcDur, true);

  // validator: replace_clip با asset واقعی/جعلی + kind mismatch
  const snap = buildSnapshot(p, assets);
  ok("snapshot has assets", snap.assets?.length === 2);
  ok("snapshot has overlayIds field", Array.isArray(snap.overlayIds));
  const v1 = validatePlan({ intent: "t", operations: [{ tool: "replace_clip", clipId: p.clips[0].id, assetId: "asset_clip_01" }] }, snap);
  ok("validate replace real asset", v1.ok);
  const v2 = validatePlan({ intent: "t", operations: [{ tool: "replace_clip", clipId: p.clips[0].id, assetId: "fake_asset" }] }, snap);
  ok("validate replace fake asset rejected", !v2.ok);
  const imgClip = p.clips.find((c) => c.kind === "image");
  if (imgClip) {
    const v3 = validatePlan({ intent: "t", operations: [{ tool: "replace_clip", clipId: imgClip.id, assetId: "asset_clip_01" }] }, snap);
    ok("validate replace kind mismatch rejected", !v3.ok);
  }
  // planner prompt شامل ابزارهای جدید
  const sys = buildPlannerSystemPrompt(null);
  ok("prompt has crop_clip", sys.includes("crop_clip"));
  ok("prompt has replace_clip", sys.includes("replace_clip"));
  ok("prompt has to_main_track", sys.includes("to_main_track"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
