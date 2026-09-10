// ─────────────────────────────────────────────────────────────
// Keyframe Engine — عمومی و مستقل از UI
// هر property انیمیت‌پذیر یک آرایهٔ keyframe مرتب‌سازی‌شده دارد؛
// مقدار در زمان t با interpolation بین دو کلید همسایه حساب می‌شود.
// زمان‌ها نسبت به شروع آیتم‌اند (کلیپ: لوکال، لایه/متن: t - start).
// ─────────────────────────────────────────────────────────────

export type EaseId = "linear" | "in" | "out" | "inout" | "back" | "elastic" | "bounce";

export const EASES: { id: EaseId; name: string }[] = [
  { id: "linear", name: "خطی" },
  { id: "in", name: "شتاب‌گیر" },
  { id: "out", name: "کندشو" },
  { id: "inout", name: "نرم" },
  { id: "back", name: "پس‌کش" },
  { id: "elastic", name: "فنری" },
  { id: "bounce", name: "جهشی" },
];

export interface Keyframe {
  t: number; // ثانیه از شروع آیتم
  v: number; // مقدار
  ease: EaseId;
}

/** پراپرتی‌های انیمیت‌پذیر (فاز ۱ موتور) */
export type KfProp = "scale" | "x" | "y" | "rotate" | "opacity";

export type KeyframeMap = Partial<Record<KfProp, Keyframe[]>>;

export const KF_PROPS: { id: KfProp; name: string; unit: string; min: number; max: number; def: number }[] = [
  { id: "scale", name: "مقیاس", unit: "×", min: 0.1, max: 3, def: 1 },
  { id: "x", name: "جابه‌جایی افقی", unit: "", min: -1, max: 1, def: 0 },
  { id: "y", name: "جابه‌جایی عمودی", unit: "", min: -1, max: 1, def: 0 },
  { id: "rotate", name: "چرخش", unit: "°", min: -180, max: 180, def: 0 },
  { id: "opacity", name: "شفافیت", unit: "", min: 0, max: 1, def: 1 },
];

function easeFn(id: EaseId): (p: number) => number {
  switch (id) {
    case "in":
      return (p) => p * p * p;
    case "out":
      return (p) => 1 - Math.pow(1 - p, 3);
    case "inout":
      return (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    case "back": {
      return (p) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
      };
    }
    case "elastic":
      return (p) => {
        if (p === 0 || p === 1) return p;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
      };
    case "bounce":
      return (p) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (p < 1 / d1) return n1 * p * p;
        if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
        if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
        return n1 * (p -= 2.625 / d1) * p + 0.984375;
      };
    default:
      return (p) => p;
  }
}

function applyEase(id: EaseId, p: number): number {
  const f = easeFn(id);
  const v = f(Math.max(0, Math.min(1, p)));
  return Number.isFinite(v) ? v : p;
}

export function sortKeys(keys: Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.t - b.t);
}

/**
 * مقدار پراپرتی در زمان t (نسبت به شروع آیتم).
 * قبل از اولین کلید و بعد از آخرین کلید، مقدار همان کلیدِ لبه ثابت می‌ماند.
 * بدون کلید → fallback (مقدار استاتیک آیتم).
 */
export function evalKf(keys: Keyframe[] | undefined, t: number, fallback: number): number {
  if (!keys || keys.length === 0) return fallback;
  if (keys.length === 1) return keys[0].v;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  for (let k = 0; k < keys.length - 1; k++) {
    if (t >= keys[k].t && t < keys[k + 1].t) {
      i = k;
      break;
    }
  }
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(1e-6, b.t - a.t);
  const p = applyEase(b.ease, (t - a.t) / span);
  return a.v + (b.v - a.v) * p;
}

/** آیا این property حداقل یک کلید دارد؟ */
export function hasKf(map: KeyframeMap | undefined, prop: KfProp): boolean {
  return !!map?.[prop] && map[prop]!.length > 0;
}

/** افزودن/به‌روزرسانی کلید در زمان t (زمان‌ها گرد به ۰.۰۵s) */
export function upsertKey(keys: Keyframe[], t: number, v: number, ease: EaseId = "inout"): Keyframe[] {
  const tt = Math.max(0, Math.round(t * 20) / 20);
  const next = keys.filter((k) => Math.abs(k.t - tt) > 0.024);
  next.push({ t: tt, v, ease });
  return sortKeys(next);
}

export function removeKeyAt(keys: Keyframe[], t: number): Keyframe[] {
  const tt = Math.round(t * 20) / 20;
  return keys.filter((k) => Math.abs(k.t - tt) > 0.024);
}

/**
 * شکستن کی‌فریم‌ها هنگام برش کلیپ (P0 — split واقعی).
 * زمان‌ها نسبت به شروع کلیپ‌اند؛ srcSplitT = لحظهٔ برش بر حسب ثانیهٔ لوکالِ کلیپِ اصلی.
 * خروجی: کی‌فریم نیمهٔ چپ (a) و نیمهٔ راست (b — زمان‌ها شیفت‌خورده) با تضمین پیوستگی:
 * اگر کلیدی بعد از نقطهٔ برش باشد، برای A کلید مصنوعیِ همان لحظه و برای B کلید مصنوعیِ صفر ساخته می‌شود.
 */
export function splitKeyframeMap(
  kf: KeyframeMap | undefined,
  srcSplitT: number
): { a?: KeyframeMap; b?: KeyframeMap } {
  if (!kf) return {};
  const a: KeyframeMap = {};
  const b: KeyframeMap = {};
  let anyA = false;
  let anyB = false;
  for (const [prop, keys] of Object.entries(kf) as [KfProp, Keyframe[] | undefined][]) {
    if (!keys || keys.length === 0) continue;
    const sorted = sortKeys(keys);
    const left = sorted.filter((k) => k.t <= srcSplitT);
    const right = sorted.filter((k) => k.t > srcSplitT);
    if (left.length === 0 && right.length === 0) continue;
    if (left.length > 0) {
      const aKeys = [...left];
      if (right.length > 0) {
        // پیوستگی A: کلید مصنوعی در لحظهٔ برش با مقدار درون‌یابی‌شده
        const vAtSplit = evalKf(sorted, srcSplitT, left[left.length - 1].v);
        aKeys.push({ t: Math.round(srcSplitT * 20) / 20, v: vAtSplit, ease: "linear" });
      }
      a[prop] = aKeys;
      anyA = true;
    }
    if (right.length > 0) {
      const bKeys: Keyframe[] = [];
      if (left.length > 0) {
        // پیوستگی B: کلید مصنوعی در صفر با همان مقدار لحظهٔ برش
        bKeys.push({ t: 0, v: evalKf(sorted, srcSplitT, left[left.length - 1].v), ease: "linear" });
      }
      for (const k of right) bKeys.push({ ...k, t: Math.round((k.t - srcSplitT) * 20) / 20 });
      b[prop] = bKeys;
      anyB = true;
    }
  }
  return {
    a: anyA ? a : undefined,
    b: anyB ? b : undefined,
  };
}
