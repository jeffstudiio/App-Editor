// تست هسته: Keyframe Engine + normalizeProject + totalDur — اجرا: npx tsx scripts/test-core-engine.ts
import { evalKf, upsertKey, removeKeyAt, sortKeys, type Keyframe } from "../src/lib/video/keyframes";
import { normalizeProject, totalDur, clipDur, clipStart, emptyProject } from "../src/lib/video/types";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown, tol = 1e-9) {
  const ok =
    typeof want === "number" && typeof got === "number"
      ? Math.abs(got - want) <= tol
      : JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// ── Keyframes ──
const keys: Keyframe[] = [
  { t: 0, v: 0, ease: "linear" },
  { t: 1, v: 100, ease: "inout" },
  { t: 2, v: 50, ease: "linear" },
];
eq("evalKf before first clamps", evalKf(keys, -1, 9), 0);
eq("evalKf after last clamps", evalKf(keys, 5, 9), 50);
eq("evalKf at key exact", evalKf(keys, 1, 9), 100);
eq("evalKf linear midpoint", evalKf([keys[0], { ...keys[1], ease: "linear" }], 0.5, 9), 50);
eq("evalKf empty → fallback", evalKf(undefined, 0.5, 0.42), 0.42);
eq("evalKf single key", evalKf([{ t: 0.3, v: 7, ease: "linear" }], 2, 1), 7);
eq("ease.out at 0.5 > linear", evalKf([{ t: 0, v: 0, ease: "linear" }, { t: 1, v: 1, ease: "out" }], 0.5, 0), evalKf([{ t: 0, v: 0, ease: "out" }, { t: 1, v: 1, ease: "out" }], 0.5, 0));

const up = upsertKey(keys, 1.02, 33); // نزدیک کلید موجود → جایگزین
eq("upsert replaces near key", up.filter((k) => Math.abs(k.t - 1) < 0.024).length, 1);
eq("upsert value", up.find((k) => Math.abs(k.t - 1) < 0.024)?.v, 33);
const up2 = upsertKey(keys, 1.5, 66);
eq("upsert adds new", up2.length, 4);
eq("upsert sorted", up2.map((k) => k.t), [0, 1, 1.5, 2]);
eq("removeKeyAt", removeKeyAt(up2, 1.5).length, 3);
eq("sortKeys", sortKeys([keys[2], keys[0], keys[1]]).map((k) => k.v), [0, 100, 50]);

// ── normalizeProject ──
const raw = {
  aspect: "1:1",
  clips: [{ id: "c1", assetId: "a1", in: 0, out: 3, speed: 99, transform: { scale: 2 } }],
  texts: [{ id: "t1", text: "سلام", start: 1, end: 0.2, animIn: "nonsense", weight: "x" }],
  overlays: null,
  audios: [{ start: -5 }],
  markers: "nope",
};
const np = normalizeProject(raw);
eq("normalize keeps valid aspect", np.aspect, "1:1");
eq("schemaVersion", np.schemaVersion, 2);
eq("clip speed clamped", np.clips[0].speed, 4);
eq("clip transform merged", np.clips[0].transform.scale, 2);
eq("clip transform default merged", np.clips[0].transform.rotate, 0);
eq("text end >= start+0.3", np.texts[0].end >= np.texts[0].start + 0.3, true);
eq("text anim fallback", np.texts[0].animIn, "fade");
eq("audio start clamped", np.audios[0].start, 0);
eq("markers array", Array.isArray(np.markers), true);
eq("text font fallback", np.texts[0].font, "Vazirmatn");
eq("empty project", normalizeProject(null).clips.length, 0);

// ── totalDur (fix: overlays لحاظ می‌شوند) ──
const p = emptyProject("9:16");
p.clips.push({
  id: "c1", kind: "video", assetId: "a", name: "x", in: 0, out: 5, speed: 1,
  transform: {} as never, filter: {} as never, chroma: {} as never,
  volume: 1, muted: false, fadeIn: 0, fadeOut: 0, transitionIn: { type: "none", dur: 0 },
  srcDur: 10, srcW: 100, srcH: 100,
});
p.overlays.push({
  id: "o1", kind: "image", assetId: "b", name: "pip", start: 2, dur: 8, srcIn: 0, srcDur: 8,
  transform: {} as never, filter: {} as never, chroma: {} as never,
});
eq("clipDur", clipDur(p.clips[0]), 5);
eq("clipStart second clip", clipStart(p, "c1"), 0);
eq("totalDur includes overlay end (10 > 5)", Math.round(totalDur(p)), 10);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
