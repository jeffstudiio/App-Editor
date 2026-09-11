// ─────────────────────────────────────────────────────────────
// Word-level forced alignment (انرژی‌محور، محلی و آفلاین)
// ورودی: سیگنال مونو + بازهٔ هر جملهٔ ASR → خروجی: تایمینگ واقعی
// هر کلمه از روی افت‌های انرژی (فاصلهٔ بین کلمه‌ها) در صدا.
// این ماژول خالص و بدون DOM است تا در تست node هم قابل اجرا باشد.
// ─────────────────────────────────────────────────────────────

export interface WordTiming {
  w: string;
  start: number;
  end: number;
}

export interface Envelope {
  rms: Float32Array; // انرژی هر پنجره
  winDur: number; // مدت هر پنجره بر حسب ثانیه
}

/** پاکت انرژی RMS با پنجرهٔ ~۳۰ms — برای هم‌ترازی کلمه (دقیق‌تر از VAD جمله) */
export function rmsEnvelope(data: Float32Array, sampleRate: number, winSec = 0.03): Envelope {
  const win = Math.max(1, Math.round(sampleRate * winSec));
  const n = Math.max(0, Math.floor(data.length / win));
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * win;
    for (let j = 0; j < win; j++) {
      const v = data[off + j];
      s += v * v;
    }
    rms[i] = Math.sqrt(s / win);
  }
  return { rms, winDur: win / sampleRate };
}

/** نویزفلوئ محلی: صدک ۲۰ام انرژی داخل بازه */
function localFloor(rms: Float32Array, i0: number, i1: number): number {
  const slice = Array.from(rms.subarray(i0, i1)).sort((a, b) => a - b);
  return slice[Math.floor(slice.length * 0.2)] || 0;
}

/**
 * مکث‌های بین‌کلمه‌ای داخل یک جمله را پیدا می‌کند (بر حسب ثانیه، نسبی به segStart).
 * خروجی: نقاط میانی مکث‌ها، عمیق‌ترین‌ها اول مرتب‌سازی‌شده بر اساس عمق افت.
 */
export function findWordPauses(
  env: Envelope,
  segStart: number,
  segEnd: number,
  opts: { minPause?: number } = {}
): { mids: number[]; depth: number[] } {
  const minPause = opts.minPause ?? 0.07; // مکث < ۷۰ms معنای کلمه‌ای ندارد
  const i0 = Math.max(0, Math.floor(segStart / env.winDur));
  const i1 = Math.min(env.rms.length, Math.ceil(segEnd / env.winDur));
  if (i1 - i0 < 4) return { mids: [], depth: [] };

  const floor = localFloor(env.rms, i0, i1);
  let peak = 0;
  for (let i = i0; i < i1; i++) if (env.rms[i] > peak) peak = env.rms[i];
  if (peak < 1e-4) return { mids: [], depth: [] };

  // آستانهٔ مکث: میان‌راهِ نویزفلوئ و پیک — مکث واقعی خیلی زیر سطح گفتار است
  const thr = Math.max(floor * 2.2, peak * 0.16);
  const minFrames = Math.max(1, Math.round(minPause / env.winDur));

  const pauses: { mid: number; depth: number }[] = [];
  let runStart = -1;
  let runMin = Infinity;
  for (let i = i0; i <= i1; i++) {
    const below = i < i1 && env.rms[i] < thr;
    if (below && runStart < 0) {
      runStart = i;
      runMin = env.rms[i];
    } else if (below && runStart >= 0) {
      if (env.rms[i] < runMin) runMin = env.rms[i];
    } else if (!below && runStart >= 0) {
      const frames = i - runStart;
      if (frames >= minFrames) {
        const mid = ((runStart + i) / 2) * env.winDur;
        pauses.push({ mid, depth: thr - runMin });
      }
      runStart = -1;
      runMin = Infinity;
    }
  }
  // عمیق‌ترین مکث‌ها اول — caller تعداد موردنیاز کلمات را برمی‌دارد
  pauses.sort((a, b) => b.depth - a.depth);
  return {
    mids: pauses.map((p) => p.mid),
    depth: pauses.map((p) => p.depth),
  };
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * هم‌ترازی کلمه‌ها داخل بازهٔ [segStart, segEnd]:
 * ۱) اگر تعداد مکثِ یافته‌شده ≥ کلمات-۱ → عمیق‌ترین مکث‌ها مرز کلمه می‌شوند.
 * ۲) وگرنه کلمه‌ها به ناحیه‌های بین مکث‌ها (به‌تناسب تعداد حرف) توزیع می‌شوند
 *    و داخل هر ناحیه هم توزیع حرف‌به‌حرف انجام می‌شود.
 * خروجی همیشه به تعداد کلمات متن است و زمان‌ها صعودی و بدون هم‌پوشانی.
 */
export function alignWords(
  text: string,
  segStart: number,
  segEnd: number,
  pauseMids: number[]
): WordTiming[] {
  const words = splitWords(text);
  if (!words.length) return [];
  const span = Math.max(0.12, segEnd - segStart);
  if (words.length === 1) return [{ w: words[0], start: segStart, end: segStart + span }];

  // مرزهای نامزد: مکث‌های داخل بازه
  const lo = segStart + span * 0.06;
  const hi = segEnd - span * 0.06;
  const cuts = [...new Set(pauseMids)]
    .filter((m) => m > lo && m < hi)
    .sort((a, b) => a - b)
    .slice(0, words.length - 1); // حداکثر کلمات-۱ مرز

  const out: WordTiming[] = [];
  if (cuts.length >= words.length - 1) {
    // هر کلمه دقیقاً بین دو مرز (مرزها = مکث‌های منتخب + لبه‌ها)
    const bounds = [segStart, ...cuts, segEnd];
    // توزیع ناهم‌قرینه وقتی مرزها کمتر از انتظار است — اینجا کامل هست
    for (let i = 0; i < words.length; i++) {
      out.push({ w: words[i], start: bounds[i], end: bounds[i + 1] });
    }
  } else {
    // ناحیه‌بندی: [segStart, c1], [c1, c2], ..., [ck, segEnd]
    const bounds = [segStart, ...cuts, segEnd];
    const regions = bounds.length - 1;
    const chars = words.map((w) => Math.max(1, w.length));
    const totalChars = chars.reduce((a, b) => a + b, 0);
    // سهم هر ناحیه از کلمه‌ها به‌تناسب حرف‌ها
    const perRegion = Math.max(1, Math.ceil(words.length / regions));
    let wi = 0;
    for (let r = 0; r < regions && wi < words.length; r++) {
      const rStart = bounds[r];
      const rEnd = bounds[r + 1];
      const take = Math.min(words.length - wi, r === regions - 1 ? words.length - wi : perRegion);
      const group = chars.slice(wi, wi + take);
      const gTotal = group.reduce((a, b) => a + b, 0) || 1;
      const gDur = rEnd - rStart;
      let acc = rStart;
      for (let k = 0; k < take; k++) {
        const d = (group[k] / gTotal) * gDur;
        out.push({ w: words[wi + k], start: acc, end: acc + d });
        acc += d;
      }
      wi += take;
    }
  }
  // پاک‌سازی نهایی: مرتب‌سازی زمانی + جلوگیری از هم‌پوشانی
  out.sort((a, b) => a.start - b.start);
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start;
  }
  return out;
}

/** هم‌ترازی یک جمله از سیگنال کامل — میان‌حالابی راحت برای asr-client */
export function alignSegmentWords(
  data: Float32Array,
  sampleRate: number,
  text: string,
  segStart: number,
  segEnd: number
): WordTiming[] {
  const env = rmsEnvelope(data, sampleRate);
  const { mids } = findWordPauses(env, segStart, segEnd);
  return alignWords(text, segStart, segEnd, mids);
}

/**
 * هم‌ترازی دسته‌ای: برای هر جملهٔ ASR تایمینگ کلمه‌ها را برمی‌گرداند.
 * (یک Envelope برای همهٔ جمله‌ها ساخته می‌شود — کارآمدتر)
 */
export function alignAllSegments(
  data: Float32Array,
  sampleRate: number,
  segs: { text: string; start: number; end: number }[]
): WordTiming[][] {
  const env = rmsEnvelope(data, sampleRate);
  return segs.map((s) => {
    const { mids } = findWordPauses(env, s.start, s.end);
    return alignWords(s.text, s.start, s.end, mids);
  });
}
