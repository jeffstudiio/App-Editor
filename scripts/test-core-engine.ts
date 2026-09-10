// تست هسته: Keyframe Engine + normalizeProject + totalDur + edit-ops — اجرا: npx tsx scripts/test-core-engine.ts
import { evalKf, upsertKey, removeKeyAt, sortKeys, type Keyframe } from "../src/lib/video/keyframes";
import { normalizeProject, totalDur, clipDur, clipStart, emptyProject } from "../src/lib/video/types";
import {
  snapTime, snapPoints, trimClipLeft, trimClipRight,
  trimAudioLeft, trimAudioRight, trimOverlayLeft, trimOverlayRight, trimTextLeft, trimTextRight,
} from "../src/lib/video/edit-ops";

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

// ── edit-ops: snap ──
eq("snapTime exact hit", snapTime(2.01, [0, 2, 4], 0.15), 2);
eq("snapTime out of range → unchanged", snapTime(2.5, [0, 2, 4], 0.15), 2.5);
eq("snapTime picks nearest", snapTime(1.9, [0, 2, 4], 0.15), 2);
eq("snapTime zero point", snapTime(0.05, [0, 5], 0.15), 0);
const sp = snapPoints(
  {
    clips: [{ id: "c1", start: 0, end: 3 }],
    texts: [{ id: "t1", start: 3, end: 5 }],
    audios: [{ id: "a1", start: 0, end: 6 }],
    overlays: [{ id: "o1", start: 1, end: 4 }],
    markers: [{ t: 7 }],
  },
  2.5
);
eq("snapPoints includes playhead", sp.includes(2.5), true);
eq("snapPoints includes clip bounds", sp.includes(3), true);
eq("snapPoints includes marker", sp.includes(7), true);
const spEx = snapPoints(
  {
    clips: [],
    texts: [{ id: "t1", start: 3, end: 5 }],
    audios: [],
    overlays: [],
    markers: [],
  },
  2.5,
  "t1"
);
eq("snapPoints excludes self", spEx.filter((x) => x === 3 || x === 5).length, 0);

// ── edit-ops: trim ──
eq("trimClipLeft shifts in by speed", trimClipLeft({ in: 1, out: 5, speed: 2 }, 0.5).in, 2);
eq("trimClipLeft min 0.2 remains (drag right)", trimClipLeft({ in: 0, out: 0.5, speed: 1 }, 3).in, 0.3);
eq("trimClipLeft no negative in (drag left)", trimClipLeft({ in: 1, out: 5, speed: 1 }, -5).in, 0);
eq("trimClipRight grows out", trimClipRight({ in: 1, out: 3, speed: 2, srcDur: 10, isImage: false }, 1).out, 5);
eq("trimClipRight video clamped to srcDur", trimClipRight({ in: 1, out: 9, speed: 1, srcDur: 10, isImage: false }, 5).out, 10);
eq("trimClipRight image unbounded", trimClipRight({ in: 0, out: 4, speed: 1, srcDur: 4, isImage: true }, 10).out, 14);
eq("trimAudioLeft moves start+in together", trimAudioLeft({ start: 2, in: 1, out: 8 }, 0.5), { start: 2.5, in: 1.5, out: 8 });
eq("trimAudioLeft clamps at in=0", trimAudioLeft({ start: 1, in: 0.2, out: 8 }, -1).in, 0);
eq("trimAudioRight clamped to srcDur", trimAudioRight({ in: 0, out: 9, srcDur: 10 }, 5).out, 10);
eq("trimAudioRight min length", trimAudioRight({ in: 0, out: 0.3, srcDur: 10 }, -5).out, 0.2);
eq("trimOverlayLeft moves start+srcIn", trimOverlayLeft({ start: 2, dur: 4, srcIn: 1, srcDur: 10, isVideo: true }, 0.5), { start: 2.5, dur: 3.5, srcIn: 1.5 });
eq("trimOverlayLeft keeps min dur (drag right)", trimOverlayLeft({ start: 0, dur: 0.3, srcIn: 0, srcDur: 10, isVideo: true }, 1).dur, 0.2);
eq("trimOverlayLeft clamps at zero (drag left)", trimOverlayLeft({ start: 0, dur: 0.3, srcIn: 0, srcDur: 10, isVideo: true }, -1).dur, 0.3);
eq("trimOverlayLeft image ignores srcIn", trimOverlayLeft({ start: 1, dur: 2, srcIn: 0, srcDur: 0, isVideo: false }, 0.4).srcIn, 0);
eq("trimOverlayRight video clamp", trimOverlayRight({ dur: 3, srcIn: 2, srcDur: 5, isVideo: true }, 10).dur, 3);
eq("trimOverlayRight grows", trimOverlayRight({ dur: 3, srcIn: 2, srcDur: 10, isVideo: true }, 1).dur, 4);
eq("trimTextLeft clamps before end", trimTextLeft({ start: 1, end: 2 }, 5).start, 1.7);
eq("trimTextLeft no negative", trimTextLeft({ start: 1, end: 5 }, -4).start, 0);
eq("trimTextRight grows", trimTextRight({ start: 1, end: 5 }, 2).end, 7);
eq("trimTextRight min 0.3", trimTextRight({ start: 1, end: 1.2 }, -3).end, 1.3);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
