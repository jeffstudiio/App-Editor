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
