// ─────────────────────────────────────────────────────────────
// §44 مشخصات — ۸ تست رگرسیون حیاتی ادیتور + تست‌های مایگریشن/سقف ترنزیشن
// اجرا: npx tsx scripts/test-editor-regressions.ts
// همهٔ تست‌ها روی مدل خالص (بدون DOM) اجرا می‌شوند — همان توابعی که UI و Agent استفاده می‌کنند.
// ─────────────────────────────────────────────────────────────
import {
  normalizeProject, emptyProject, clipDur, clipStart, getBoundaryTransition, maxBoundaryDur, uid,
  type Project, type Clip,
} from "../src/lib/video/types";
import { splitClipAt, setBoundaryTransition, removeBoundaryTransition, cleanupTransitions } from "../src/lib/video/edit-ops";
import { splitKeyframeMap, evalKf } from "../src/lib/video/keyframes";
import { applySyncCommand } from "../src/lib/ai/agent/executor";

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
    console.error(`✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${name}`);
  }
}

let idc = 0;
const nid = (p: string) => `${p}_t${++idc}`;

/** کلیپ آزمایشی — طول مشخص، با ترنسفورم/فیلتر قابل تشخیص */
function mkClip(name: string, dur: number, opts: Partial<Clip> = {}): Clip {
  return {
    id: nid("cl"),
    kind: "video",
    assetId: nid("as"),
    name,
    in: 0,
    out: dur,
    speed: 1,
    transform: { scale: 1, x: 0, y: 0, rotate: 0, flipH: false, flipV: false, opacity: 1 },
    filter: { presetId: "none", brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, sepia: 0, temp: 0, vignette: 0 },
    chroma: { enabled: false, color: "#00b140", similarity: 0.4, smoothness: 0.1 },
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    srcDur: dur + 5,
    srcW: 1080,
    srcH: 1920,
    ...opts,
  };
}

function mkProject(...clips: Clip[]): Project {
  const p = emptyProject("9:16");
  p.clips = clips.map((c) => JSON.parse(JSON.stringify(c)) as Clip);
  return p;
}

// ═══════════ تست ۱ — Split واقعی (§44.1 + §6) ═══════════
{
  const p = mkProject(mkClip("A", 10));
  const A = p.clips[0];
  // برش در ثانیهٔ ۵ تایم‌لاین → منبع = ۵
  const res = splitClipAt(p.clips as never, 0, 5, () => nid("cl"));
  ok("T1: split succeeds", !!res);
  ok("T1: two clips now", p.clips.length === 2);
  const [A1, A2] = p.clips as [Clip, Clip];
  ok("T1: left keeps identity", A1.id === A.id);
  eq("T1: left out = 5", A1.out, 5);
  eq("T1: right in = 5", A2.in, 5);
  eq("T1: right out preserved", A2.out, 10);
  eq("T1: duration sum preserved", clipDur(A1) + clipDur(A2), 10);
  eq("T1: left transform", A1.transform.scale, 1);
  eq("T1: right transform", A2.transform.scale, 1);
  // split با ترنزیشن قبلی: مرز (قبلی|A) باید روی نیمهٔ چپ بماند
  const p2 = mkProject(mkClip("Z", 4), mkClip("A", 10));
  setBoundaryTransition(p2, p2.clips[0].id, p2.clips[1].id, { type: "fade", dur: 0.4 }, () => nid("tr"));
  const res2 = splitClipAt(p2.clips as never, 1, 5, () => nid("cl"));
  ok("T1: split with prev transition", !!res2 && p2.transitions.length === 1);
  ok("T1: boundary transition stays on left half", p2.transitions[0].rightClipId === p2.clips[1].id && p2.transitions[0].leftClipId === p2.clips[0].id);
  // مرز تازهٔ (A1|A2) هیچ ترنزیشنی ندارد
  ok("T1: new boundary clean", !getBoundaryTransition(p2, p2.clips[1].id, p2.clips[2].id));
}

// ═══════════ تست ۲ — ترنزیشن فقط مرز A/B را عوض می‌کند (§44.2 + §7) ═══════════
{
  const p = mkProject(mkClip("A", 4), mkClip("B", 4), mkClip("C", 4));
  const r = applySyncCommand(p, { tool: "add_transition", type: "zoom", dur: 0.4, target: "clip", clipId: p.clips[1].id } as never);
  ok("T2: command ok", r.ok);
  ok("T2: exactly one transition", p.transitions.length === 1);
  const tr = getBoundaryTransition(p, p.clips[0].id, p.clips[1].id);
  ok("T2: attached to A|B", !!tr && tr.type === "zoom");
  ok("T2: no transition on B|C", !getBoundaryTransition(p, p.clips[1].id, p.clips[2].id));
}

// ═══════════ تست ۳ — چند ترنزیشن مستقل (§44.3) ═══════════
{
  const p = mkProject(mkClip("A", 4), mkClip("B", 4), mkClip("C", 4));
  setBoundaryTransition(p, p.clips[0].id, p.clips[1].id, { type: "fade", dur: 0.3 }, () => nid("tr"));
  setBoundaryTransition(p, p.clips[1].id, p.clips[2].id, { type: "zoom", dur: 0.5 }, () => nid("tr"));
  ok("T3: two independent transitions", p.transitions.length === 2);
  ok("T3: A/B = fade", getBoundaryTransition(p, p.clips[0].id, p.clips[1].id)?.type === "fade");
  ok("T3: B/C = zoom", getBoundaryTransition(p, p.clips[1].id, p.clips[2].id)?.type === "zoom");
  // تغییر مرز اول، مرز دوم را لمس نمی‌کند
  setBoundaryTransition(p, p.clips[0].id, p.clips[1].id, { type: "flash", dur: 0.2 }, () => nid("tr"));
  ok("T3: editing A/B leaves B/C intact", getBoundaryTransition(p, p.clips[1].id, p.clips[2].id)?.type === "zoom" && p.transitions.length === 2);
}

// ═══════════ تست ۴ — حذف ترنزیشن A/B روی B/C اثر ندارد (§44.4) ═══════════
{
  const p = mkProject(mkClip("A", 4), mkClip("B", 4), mkClip("C", 4));
  setBoundaryTransition(p, p.clips[0].id, p.clips[1].id, { type: "fade", dur: 0.3 }, () => nid("tr"));
  setBoundaryTransition(p, p.clips[1].id, p.clips[2].id, { type: "zoom", dur: 0.5 }, () => nid("tr"));
  const removed = removeBoundaryTransition(p, p.clips[0].id, p.clips[1].id);
  ok("T4: removed", removed);
  ok("T4: A/B gone", !getBoundaryTransition(p, p.clips[0].id, p.clips[1].id));
  ok("T4: B/C survives", getBoundaryTransition(p, p.clips[1].id, p.clips[2].id)?.type === "zoom");
  ok("T4: count = 1", p.transitions.length === 1);
}

// ═══════════ تست ۵ — فیلتر روی B فقط B (§44.5) ═══════════
{
  const p = mkProject(mkClip("A", 4), mkClip("B", 4), mkClip("C", 4));
  applySyncCommand(p, { tool: "apply_filter", preset: "noir", target: "clip", clipId: p.clips[1].id } as never);
  eq("T5: B filtered", p.clips[1].filter.presetId, "noir");
  eq("T5: A untouched", p.clips[0].filter.presetId, "none");
  eq("T5: C untouched", p.clips[2].filter.presetId, "none");
}

// ═══════════ تست ۶ — ویرایش متن لایه ۲ فقط لایه ۲ (§44.6) ═══════════
{
  const p = mkProject(mkClip("A", 8));
  p.texts.push(
    { id: "tx1", text: "اول", start: 0, end: 2, x: 0.5, y: 0.3, font: "Vazirmatn", weight: 800, size: 64, color: "#fff", accent: "#000", strokeColor: "#000", strokeW: 0, bgColor: "#000", bgOpacity: 0, shadow: true, gradient: false, animIn: "fade", animOut: "none", rotate: 0, opacity: 1, karaoke: false },
    { id: "tx2", text: "دوم", start: 3, end: 5, x: 0.5, y: 0.6, font: "Vazirmatn", weight: 800, size: 64, color: "#fff", accent: "#000", strokeColor: "#000", strokeW: 0, bgColor: "#000", bgOpacity: 0, shadow: true, gradient: false, animIn: "fade", animOut: "none", rotate: 0, opacity: 1, karaoke: false },
  );
  const t2 = p.texts[1];
  t2.text = "تغییر یافته";
  t2.size = 90;
  eq("T6: layer2 edited", p.texts[1].text, "تغییر یافته");
  eq("T6: layer2 size", p.texts[1].size, 90);
  eq("T6: layer1 untouched", p.texts[0].text, "اول");
  eq("T6: layer1 size", p.texts[0].size, 64);
}

// ═══════════ تست ۷ — AI ترنزیشن را فقط به مرز A/B می‌چسباند (§44.7) ═══════════
{
  const p = mkProject(mkClip("A", 4), mkClip("B", 4));
  const r = applySyncCommand(p, { tool: "add_transition", type: "dipBlack", dur: 0.5, target: "clip", clipId: p.clips[1].id } as never);
  ok("T7: AI ok", r.ok);
  ok("T7: one transition, on A|B only", p.transitions.length === 1 && p.transitions[0].leftClipId === p.clips[0].id && p.transitions[0].rightClipId === p.clips[1].id);
  // و add_transition برای اولین کلیپ مرز ورودی ندارد — خطای صادقانه
  const r0 = applySyncCommand(p, { tool: "add_transition", type: "fade", target: "clip", clipId: p.clips[0].id } as never);
  ok("T7: first clip honestly rejected", !r0.ok);
}

// ═══════════ تست ۸ — Undo عملیات AI (§44.8) — شبیه‌سازی تاریخچهٔ همان mutate ادیتور ═══════════
{
  const p = mkProject(mkClip("A", 4), mkClip("B", 4));
  const past: string[] = [];
  const mutate = (fn: (pp: Project) => void) => {
    past.push(JSON.stringify(p));
    fn(p);
    cleanupTransitions(p);
  };
  const undo = () => {
    const snap = past.pop();
    if (!snap) return;
    const restored = JSON.parse(snap) as Project;
    p.clips = restored.clips;
    p.transitions = restored.transitions;
  };

  mutate((pp) => {
    applySyncCommand(pp, { tool: "add_transition", type: "glitch", dur: 0.4, target: "clip", clipId: pp.clips[1].id } as never);
  });
  ok("T8: AI transition applied", p.transitions.length === 1 && p.transitions[0].type === "glitch");
  undo();
  ok("T8: undo removes AI transition", p.transitions.length === 0);
  ok("T8: clips intact", p.clips.length === 2);
}

// ═══════════ مایگریشن نسخهٔ قدیمی (transitionIn → مرز) ═══════════
{
  const legacy = {
    aspect: "9:16",
    clips: [
      { id: "c1", kind: "video", assetId: "a1", name: "one", in: 0, out: 5, speed: 1, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, transitionIn: { type: "none", dur: 0.4 }, srcDur: 10, srcW: 1080, srcH: 1920, transform: {}, filter: {}, chroma: {} },
      { id: "c2", kind: "video", assetId: "a2", name: "two", in: 0, out: 5, speed: 1, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, transitionIn: { type: "fade", dur: 0.6 }, srcDur: 10, srcW: 1080, srcH: 1920, transform: {}, filter: {}, chroma: {} },
      { id: "c3", kind: "video", assetId: "a3", name: "three", in: 0, out: 5, speed: 1, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, transitionIn: { type: "black", dur: 0.5 }, srcDur: 10, srcW: 1080, srcH: 1920, transform: {}, filter: {}, chroma: {} },
    ],
    overlays: [],
    texts: [],
    audios: [],
    markers: [],
  };
  const p = normalizeProject(legacy);
  ok("M: schema v3", p.schemaVersion === 3);
  ok("M: two boundary transitions", p.transitions.length === 2);
  ok("M: c1|c2 = fade", getBoundaryTransition(p, "c1", "c2")?.type === "fade");
  ok("M: c2|c3 = dipBlack (migrated from black)", getBoundaryTransition(p, "c2", "c3")?.type === "dipBlack");
  ok("M: legacy transitionIn stripped from clips", !("transitionIn" in (p.clips[0] as unknown as Record<string, unknown>)));
  ok("M: durations intact", p.clips.every((c) => clipDur(c) === 5));
}

// ═══════════ سقف مدت + cleanup بعد از جابه‌جایی ═══════════
{
  const p = mkProject(mkClip("A", 1), mkClip("B", 8), mkClip("C", 8));
  setBoundaryTransition(p, p.clips[0].id, p.clips[1].id, { type: "fade", dur: 1.4 }, () => nid("tr"));
  eq("CLAMP: dur clamped to half of shorter neighbor (0.5)", p.transitions[0].dur, 0.5);
  eq("CLAMP: maxBoundaryDur", maxBoundaryDur(1, 8), 0.5);

  // جابه‌جایی C به ابتدا → ترنزیشن A|B می‌ماند (همچنان مجاور)، و ترنزیشن‌های شکسته حذف می‌شوند
  setBoundaryTransition(p, p.clips[1].id, p.clips[2].id, { type: "zoom", dur: 0.5 }, () => nid("tr"));
  const moved = p.clips.splice(2, 1)[0];
  p.clips.unshift(moved);
  cleanupTransitions(p);
  ok("CLEANUP: still 1 transition (A|B)", p.transitions.length === 1 && p.transitions[0].type === "fade");
}

// ═══════════ کی‌فریم‌ها در برش با پیوستگی شکسته می‌شوند ═══════════
{
  const kf = { scale: [{ t: 0, v: 1, ease: "linear" as const }, { t: 10, v: 2, ease: "linear" as const }] };
  const { a, b } = splitKeyframeMap(kf, 5);
  ok("KF: both halves", !!a?.scale && !!b?.scale);
  eq("KF: A value at end", evalKf(a!.scale, 5, 1), 1.5);
  eq("KF: B value at 0 (continuity)", evalKf(b!.scale, 0, 1), 1.5);
  eq("KF: B continues", evalKf(b!.scale, 5, 1), 2);
  eq("KF: A continuity before split", evalKf(a!.scale, 2.5, 1), 1.25);
}

// ═══════════ clipStart بعد از split ═══════════
{
  const p = mkProject(mkClip("A", 6), mkClip("B", 6));
  splitClipAt(p.clips as never, 0, 3, () => nid("cl"));
  eq("POS: clipStart of right half", clipStart(p, p.clips[1].id), 3);
  eq("POS: clipStart of second clip", clipStart(p, p.clips[2].id), 6);
}

console.log(`\n§44 regression: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
