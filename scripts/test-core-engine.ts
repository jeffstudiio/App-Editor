// تست هسته: Keyframe Engine + normalizeProject + totalDur + edit-ops — اجرا: npx tsx scripts/test-core-engine.ts
import { evalKf, upsertKey, removeKeyAt, sortKeys, type Keyframe } from "../src/lib/video/keyframes";
import { normalizeProject, totalDur, clipDur, clipStart, emptyProject, sanitizeCrop, isCropped } from "../src/lib/video/types";
import {
  snapTime, snapPoints, trimClipLeft, trimClipRight,
  trimAudioLeft, trimAudioRight, trimOverlayLeft, trimOverlayRight, trimTextLeft, trimTextRight,
  reorderOverlay, replaceSource, overlayToMainInsert,
} from "../src/lib/video/edit-ops";
import { rmsEnvelope, findWordPauses, alignWords, alignAllSegments } from "../src/lib/video/word-align";
import { motionTransform } from "../src/lib/video/bank-apply";

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
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${name}`);
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
eq("schemaVersion", np.schemaVersion, 3);
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
  volume: 1, muted: false, fadeIn: 0, fadeOut: 0,
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

// ── audio-extract: WAV encoder (بدون DOM — فقط ساختار AudioBuffer) ──
import { audioBufferToWav } from "../src/lib/video/audio-extract";
void (async () => {
const fakeBuf = {
  numberOfChannels: 2,
  sampleRate: 44100,
  length: 1000,
  getChannelData: (c: number) => new Float32Array(1000).fill(c === 0 ? 1.5 : -1.5),
} as unknown as AudioBuffer;
const wav = audioBufferToWav(fakeBuf);
const wab = await wav.arrayBuffer();
const wv = new DataView(wab);
const wstr = (o: number, n: number) => String.fromCharCode(...new Uint8Array(wab, o, n));
eq("wav RIFF magic", wstr(0, 4), "RIFF");
eq("wav WAVE magic", wstr(8, 4), "WAVE");
eq("wav channels", wv.getUint16(22, true), 2);
eq("wav sampleRate", wv.getUint32(24, true), 44100);
eq("wav dataSize", wv.getUint32(40, true), 1000 * 2 * 2);
eq("wav riffSize", wv.getUint32(4, true), 36 + 1000 * 2 * 2);
eq("wav clamp >1", new Int16Array(wab, 44, 1)[0], 32767);
eq("wav clamp <-1", new Int16Array(wab, 46, 1)[0], -32768);

// ── Crop واقعی (P0-M1): sanitize + normalize + isCropped ──
{
  const c = sanitizeCrop({ x: 0.2, y: -1, w: 99, h: 0.5 });
  eq("crop sanitize clamp x", c.x, 0.2);
  eq("crop sanitize clamp y", c.y, 0);
  eq("crop sanitize clamp w→1-x", Math.round(c.w * 100) / 100, 0.8);
  eq("crop sanitize clamp h", c.h, 0.5);
  eq("crop full → not cropped", isCropped(sanitizeCrop({ x: 0, y: 0, w: 1, h: 1 })), false);
  eq("crop partial → cropped", isCropped(sanitizeCrop({ x: 0.1, y: 0, w: 0.9, h: 1 })), true);
  eq("crop invalid input → default", isCropped(sanitizeCrop("garbage")), false);
  const proj = normalizeProject({ clips: [{ id: "c1", kind: "video", assetId: "a", in: 0, out: 2, srcDur: 10, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } }] });
  eq("normalize keeps crop", (proj.clips[0].crop as { w: number }).w, 0.8);
  const proj2 = normalizeProject({ texts: [{ id: "t1", text: "سلام دنیا خوبی", start: 0, end: 2, karaoke: true, words: [{ w: "سلام", start: 0, end: 0.4 }, { w: "دنیا", start: 0.4, end: 0.9 }, { w: "", start: 9, end: 0 }] }] });
  eq("normalize keeps valid words only", (proj2.texts[0].words as { w: string }[]).length, 2);
}

// ── Word-align (C1/M6): کارائوکهٔ واقعی انرژی‌محور ──
{
  // سیگنال مصنوعی: ۴ کلمهٔ ۰.۳ ثانیه‌ای با مکث ۰.۲ ثانیه‌ای بینشان (کل ۱.۸s @ 8kHz)
  const sr = 8000;
  const len = Math.round(1.8 * sr);
  const data = new Float32Array(len);
  const words = [
    [0.0, 0.3],
    [0.5, 0.8],
    [1.0, 1.3],
    [1.5, 1.8],
  ];
  for (const [a, b] of words) {
    for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) {
      data[i] = Math.sin(2 * Math.PI * 220 * (i / sr)) * 0.6;
    }
  }
  const env = rmsEnvelope(data, sr);
  eq("envelope winDur ≈ 30ms", Math.round(env.winDur * 1000), 30);
  const { mids } = findWordPauses(env, 0, 1.8);
  // سه مکث واقعی بین چهار کلمه باید پیدا شود
  ok("word pauses found ≥3", mids.length >= 3);
  if (mids.length >= 3) {
    const sorted = [...mids].sort((a, b) => a - b);
    ok("pause1 near 0.4s", Math.abs(sorted[0] - 0.4) < 0.1);
    ok("pause2 near 0.9s", Math.abs(sorted[1] - 0.9) < 0.1);
    ok("pause3 near 1.4s", Math.abs(sorted[2] - 1.4) < 0.1);
  }
  const wt = alignWords("سلام روی دنیا خوب", 0, 1.8, mids);
  eq("alignWords count", wt.length, 4);
  ok("alignWords ascending", wt.every((x, i) => i === 0 || x.start >= wt[i - 1].start));
  ok("alignWords covers seg", Math.abs(wt[0].start - 0) < 0.06 && wt[wt.length - 1].end <= 1.81);
  // بدون مکث → توزیع به‌تناسب حرف
  const wt2 = alignWords("یک دو سه", 0, 3, []);
  eq("align no-pause count", wt2.length, 3);
  ok("align no-pause proportional", wt2[1].end - wt2[1].start > 0.8); // «دو» ۲ حرف از ۵ حرف در ۳s ≈ 1.2s
  const all = alignAllSegments(data, sr, [{ text: "سلام روی دنیا خوب", start: 0, end: 1.8 }]);
  eq("alignAllSegments count", all.length, 1);
  eq("alignAllSegments words", all[0].length, 4);
}

// ── بین‌ترک (M2): z-order + replace + انتقال لایه→ترک اصلی ──
{
  const ovs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  reorderOverlay(ovs, "a", "front");
  eq("reorder front", ovs.map((o) => o.id), ["b", "c", "a"]);
  reorderOverlay(ovs, "a", "back");
  eq("reorder back", ovs.map((o) => o.id), ["a", "b", "c"]);
  reorderOverlay(ovs, "b", "backward");
  eq("reorder backward", ovs.map((o) => o.id), ["b", "a", "c"]);
  eq("reorder missing", reorderOverlay(ovs, "zz", "front").ok, false);

  const target = { assetId: "v1", kind: "video" as const, in: 2, out: 4, srcDur: 10, speed: 1 };
  eq("replace same kind ok", replaceSource(target, "v2", "video", 3).ok, true);
  eq("replace keeps len clamped", Math.round((target.out - target.in) * 100) / 100, 1); // طول ۲s → clamp به srcDur=3 با in=2 → out=3 → len=1
  eq("replace kind mismatch", replaceSource(target, "i1", "image", 5).ok, false);

  // overlay→main درج با برش خودکار کلیپ زیرش
  const clips: Array<Record<string, unknown> & { id: string }> = [
    { id: "m1", in: 0, out: 4, speed: 1, kind: "video", srcDur: 10 },
  ];
  const durOf = (c: Record<string, unknown>) => ((c.out as number) - (c.in as number)) / ((c.speed as number) || 1);
  const res = overlayToMainInsert(
    clips,
    { id: "ov1", kind: "video", in: 0, out: 2 },
    2,
    durOf,
    () => "new_id",
    ({ clips: cs }, index, srcSplit) => {
      const c = cs[index] as unknown as { in: number; out: number };
      cs.splice(index + 1, 0, { id: "right", in: srcSplit, out: c.out });
      c.out = srcSplit;
    }
  );
  eq("overlay→main ok", res.ok, true);
  eq("overlay→main split count", clips.length, 3);
  eq("overlay→main insert pos", clips[1].id, "new_id");
  eq("overlay→main left half", clips[0].out, 2);
}

// ── C2: موشن قالب → کی‌فریم واقعی ──
{
  const kb = motionTransform("kenburnsIn", 3);
  ok("kenburnsIn has scale kf", !!kb.kf?.scale && kb.kf.scale.length === 2);
  eq("kenburnsIn start", kb.transform.scale, 1.02);
  eq("kenburnsIn end", kb.kf?.scale?.[1].v, 1.16);
  const pan = motionTransform("panL", 2);
  ok("panL x kf", !!pan.kf?.x && pan.kf.x.length === 2);
  eq("panL end x", pan.kf?.x?.[1].v, 0.06);
  const pulse = motionTransform("zoomPulse", 4);
  eq("zoomPulse samples", pulse.kf?.scale?.length, 9);
  const hold = motionTransform("hold", 2);
  eq("hold no kf", hold.kf, undefined);
  eq("hold scale", hold.transform.scale, 1.02);
  const unk = motionTransform("ناشناخته", 2);
  eq("unknown motion → hold", unk.transform.scale, 1.02);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
})();
