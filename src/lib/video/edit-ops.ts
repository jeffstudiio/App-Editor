// ─────────────────────────────────────────────────────────────
// Pure edit operations — trim clamps + magnet snapping.
// بدون وابستگی به React/DOM تا تست‌پذیر باشد (test-core-engine).
// ─────────────────────────────────────────────────────────────

/** نزدیک‌ترین نقطهٔ اسنپ داخل آستانه را برمی‌گرداند؛ وگرنه همان t. */
export function snapTime(t: number, points: number[], thr = 0.15): number {
  let best = t;
  let bestD = thr;
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** نقاط اسنپ از پروژه: صفر، پلی‌هد، مرز کلیپ‌ها، مرز لایه‌ها، نشانگرها — end مطلق است */
export function snapPoints(
  p: {
    clips: { id?: string; start: number; end: number }[];
    texts: { id?: string; start: number; end: number }[];
    audios: { id?: string; start: number; end: number }[];
    overlays: { id?: string; start: number; end: number }[];
    markers: { t: number }[];
  },
  playhead: number,
  exceptId?: string
): number[] {
  const pts = new Set<number>([0, playhead]);
  const add = (a: number, b: number, id?: string) => {
    if (id && id === exceptId) return; // خودِ آیتمِ در حال جابه‌جایی نباید نقطهٔ اسنپ خودش باشد
    if (Number.isFinite(a)) pts.add(Math.max(0, a));
    if (Number.isFinite(b)) pts.add(Math.max(0, b));
  };
  for (const c of p.clips) add(c.start, c.end, c.id);
  for (const o of p.overlays) add(o.start, o.end, o.id);
  for (const t of p.texts) add(t.start, t.end, t.id);
  for (const a of p.audios) add(a.start, a.end, a.id);
  for (const m of p.markers) pts.add(Math.max(0, m.t));
  return [...pts];
}

export interface TrimRange {
  in: number;
  out: number;
  /** برای لایه‌ها: محل روی تایم‌لاین */
  start?: number;
  dur?: number;
}

/** تریم لبهٔ چپ کلیپ اصلی — in با سرعت جابه‌جا می‌شود؛ حداقل ۰.۲ ثانیه باقی می‌ماند */
export function trimClipLeft(orig: { in: number; out: number; speed: number }, dtSec: number): { in: number; out: number } {
  const srcShift = dtSec * orig.speed;
  const inN = Math.max(0, Math.min(orig.out - 0.2, orig.in + srcShift));
  return { in: inN, out: orig.out };
}

/** تریم لبهٔ راست کلیپ اصلی — ویدئو تا srcDur محدود است؛ عکس بی‌نهایت */
export function trimClipRight(orig: { in: number; out: number; speed: number; srcDur: number; isImage: boolean }, dtSec: number): { in: number; out: number } {
  const srcShift = dtSec * orig.speed;
  const max = orig.isImage ? Number.POSITIVE_INFINITY : orig.srcDur;
  const outN = Math.max(orig.in + 0.2, Math.min(max, orig.out + srcShift));
  return { in: orig.in, out: outN };
}

/** تریم سر/دم صدا درجا: لبهٔ چپ = جلو بردن in و start با هم */
export function trimAudioLeft(orig: { start: number; in: number; out: number }, dtSec: number): { start: number; in: number; out: number } {
  const dt = Math.max(-orig.in, dtSec);
  return {
    start: Math.max(0, orig.start + dt),
    in: Math.max(0, orig.in + dt),
    out: orig.out,
  };
}

export function trimAudioRight(orig: { in: number; out: number; srcDur: number }, dtSec: number): { in: number; out: number } {
  return { in: orig.in, out: Math.max(orig.in + 0.2, Math.min(orig.srcDur, orig.out + dtSec)) };
}

/** تریم لایهٔ رویی: لبهٔ چپ start/srcIn را می‌برد، لبهٔ راست dur */
export function trimOverlayLeft(
  orig: { start: number; dur: number; srcIn: number; srcDur: number; isVideo: boolean },
  dtSec: number
): { start: number; dur: number; srcIn: number } {
  let dt = dtSec;
  // max shift: حداقل ۰.۲ ثانیه بماند؛ برای ویدئو srcIn نباید از srcDur بگذرد
  const maxByDur = orig.dur - 0.2;
  const maxBySrc = orig.isVideo ? orig.srcDur - orig.srcIn - 0.2 : Number.POSITIVE_INFINITY;
  dt = Math.max(-orig.start, Math.min(dt, Math.min(maxByDur, maxBySrc)));
  return {
    start: orig.start + dt,
    dur: orig.dur - dt,
    srcIn: orig.isVideo ? orig.srcIn + dt : orig.srcIn,
  };
}

export function trimOverlayRight(orig: { dur: number; srcIn: number; srcDur: number; isVideo: boolean }, dtSec: number): { dur: number } {
  const max = orig.isVideo ? orig.srcDur - orig.srcIn : Number.POSITIVE_INFINITY;
  return { dur: Math.max(0.2, Math.min(max, orig.dur + dtSec)) };
}

/** تریم متن: لبهٔ چپ شروع را می‌برد (end ثابت)، لبهٔ راست end */
export function trimTextLeft(orig: { start: number; end: number }, dtSec: number): { start: number } {
  return { start: Math.max(0, Math.min(orig.end - 0.3, orig.start + dtSec)) };
}

export function trimTextRight(orig: { start: number; end: number }, dtSec: number): { end: number } {
  return { end: Math.max(orig.start + 0.3, orig.end + dtSec) };
}

// ─────────────────────────────────────────────────────────────
// عملیات بین‌ترکی (P1-M2): انتقال کلیپ↔لایه، z-order، تعویض منبع
// همهٔ توابع خالص‌اند: پروژه را درجا تغییر می‌دهند و پیام فارسی برمی‌گردانند
// ─────────────────────────────────────────────────────────────

export interface OpResult { ok: boolean; message: string }

/** شروع تایم‌لاینیِ کلیپ iام (بدون وابستگی به types تا حلقهٔ وابستگی نشود) */
function clipsTimelineStarts(clips: { dur: number }[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const c of clips) {
    starts.push(acc);
    acc += c.dur;
  }
  return starts;
}

/** z-order لایهٔ رویی: جابه‌جایی در ترتیب رسم (بعدی = جلوتر) */
export function reorderOverlay(
  overlays: { id: string }[],
  id: string,
  dir: "front" | "back" | "forward" | "backward"
): OpResult {
  const i = overlays.findIndex((o) => o.id === id);
  if (i < 0) return { ok: false, message: "لایه پیدا نشد" };
  const [item] = overlays.splice(i, 1);
  let j = i;
  if (dir === "front") j = overlays.length;
  else if (dir === "back") j = 0;
  else if (dir === "forward") j = Math.min(overlays.length, i + 1);
  else j = Math.max(0, i - 1);
  overlays.splice(j, 0, item);
  return { ok: true, message: dir === "front" ? "لایه به جلوترین سطح رفت" : dir === "back" ? "لایه به عقب‌ترین سطح رفت" : dir === "forward" ? "یک سطح جلو رفت" : "یک سطح عقب رفت" };
}

/**
 * تعویض منبع کلیپ/لایه با رسانهٔ دیگر از همان نوع — تریم‌ها تا حد ممکن حفظ می‌شوند.
 * kinds: نقشهٔ assetId→نوع ("video"|"image"|"audio") از کتابخانهٔ رسانه
 */
export function replaceSource(
  target: {
    assetId: string;
    kind: "video" | "image";
    in: number;
    out: number;
    srcDur: number;
    speed: number;
  },
  newAssetId: string,
  newKind: "video" | "image",
  newSrcDur: number
): OpResult {
  if (newKind !== target.kind) {
    return { ok: false, message: "نوع رسانه باید همان نوع قبلی باشد (ویدئو با ویدئو، عکس با عکس)" };
  }
  if (newKind === "video" && newSrcDur <= 0.2) {
    return { ok: false, message: "رسانهٔ جدید معتبر نیست" };
  }
  target.assetId = newAssetId;
  if (newKind === "video") {
    const len = Math.max(0.2, target.out - target.in);
    target.in = Math.min(target.in, Math.max(0, newSrcDur - 0.2));
    target.out = Math.min(newSrcDur, target.in + len);
    if (target.out - target.in < 0.2) target.out = Math.min(newSrcDur, target.in + 0.2);
    if (target.srcDur !== newSrcDur) target.srcDur = newSrcDur;
  }
  return { ok: true, message: "منبع کلیپ تعویض شد" };
}

/** تبدیل کلیپ اصلی → لایهٔ رویی در همان لحظهٔ تایم‌لاین (ثابت ماندن نما) */
export function clipToOverlayPayload(
  clip: {
    id: string;
    kind: "video" | "image";
    assetId: string;
    name: string;
    in: number;
    out: number;
    speed: number;
    srcDur: number;
    transform: unknown;
    filter: unknown;
    chroma: unknown;
    mask?: unknown;
    crop?: unknown;
    kf?: unknown;
  },
  timelineStart: number
): {
  id: string;
  kind: "video" | "image";
  assetId: string;
  name: string;
  start: number;
  dur: number;
  srcIn: number;
  srcDur: number;
  transform: unknown;
  filter: unknown;
  chroma: unknown;
  mask?: unknown;
  crop?: unknown;
  kf?: unknown;
} {
  return {
    id: clip.id,
    kind: clip.kind,
    assetId: clip.assetId,
    name: clip.name,
    start: timelineStart,
    dur: Math.max(0.2, (clip.out - clip.in) / (clip.kind === "image" ? 1 : clip.speed)),
    srcIn: clip.in,
    srcDur: clip.kind === "video" ? clip.srcDur : clip.out - clip.in,
    transform: clip.transform,
    filter: clip.filter,
    chroma: clip.chroma,
    mask: clip.mask,
    crop: clip.crop,
    kf: clip.kf,
  };
}

/**
 * انتقال لایهٔ رویی → ترک اصلی: در لحظهٔ start لایه، در صورت نیاز کلیپ اصلی
 * بریده می‌شود و لایه به‌عنوان کلیپ اصلی همان‌جا می‌نشیند.
 * clipDur: مدت هر کلیپ (بر حسب ثانیهٔ تایم‌لاین) — تابع clipDur از types
 */
export function overlayToMainInsert(
  clips: Array<Record<string, unknown> & { id: string }>,
  insert: Record<string, unknown> & { id: string },
  overlayStart: number,
  clipDurOf: (c: Record<string, unknown>) => number,
  makeClip: (id: string) => string,
  splitAt: (p: { clips: Array<Record<string, unknown> & { id: string }> }, index: number, srcSplit: number) => void
): OpResult {
  // محل درج: جمع مدت کلیپ‌ها تا overlayStart
  const starts = clipsTimelineStarts(clips.map((c) => ({ dur: clipDurOf(c) })));
  let idx = -1;
  for (let i = 0; i < clips.length; i++) {
    const s = starts[i];
    const e = s + clipDurOf(clips[i]);
    if (overlayStart >= s && overlayStart < e) {
      idx = i;
      // اگر وسط کلیپ است، اول برش بزن
      if (overlayStart > s + 0.25 && overlayStart < e - 0.25) {
        const c = clips[i] as unknown as { in: number; speed: number };
        const srcSplit = c.in + (overlayStart - s) * (c.speed || 1);
        splitAt({ clips }, i, srcSplit);
        idx = i + 1; // بعد از نیمهٔ چپ درج شود
      }
      break;
    }
    if (overlayStart < s) {
      idx = i;
      break;
    }
  }
  if (idx < 0) idx = clips.length;
  // id جدید برای کلیپ اصلی تا با لایهٔ حذف‌شده تداخل نکند
  (insert as { id: string }).id = makeClip(insert.id);
  clips.splice(idx, 0, insert);
  return { ok: true, message: `لایه به ترک اصلی در ${overlayStart.toFixed(1)}s منتقل شد` };
}
