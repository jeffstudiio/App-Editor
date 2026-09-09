// ─────────────────────────────────────────────────────────────
// بانک موشن — ۵۰+ حرکت واقعی برای صحنه، متن و ترنزیشن
// هر موشن یک تابع p (پیشرفت 0..1) → استایل CSS است؛ هم در
// پیش‌نمایش بانک تمپلیت استفاده می‌شود هم در هندآف به ادیتور.
// ─────────────────────────────────────────────────────────────

export interface MotionStyle {
  transform?: string;
  opacity?: number;
  filter?: string;
  clipPath?: string;
}

export interface MediaMotion {
  id: string;
  label: string;
  css: (p: number) => MotionStyle;
}

export interface TextMotion {
  id: string;
  label: string;
  defDur: number;
  css: (p: number) => MotionStyle;
}

export interface TransMotion {
  id: string;
  label: string;
  dur: number;
  outCss: (p: number) => MotionStyle;
  inCss?: (p: number) => MotionStyle;
  /** صحنهٔ بعدی روی فعال رندر شود (وایپ/ماسک) */
  nextOnTop?: boolean;
}

// ---------- easing helpers ----------
const eo = (p: number) => 1 - Math.pow(1 - p, 3); // easeOutCubic
const ei = (p: number) => p * p * p; // easeInCubic
const eio = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const back = (p: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

// ---------- موشن‌های رسانه (کل مدت صحنه) ----------
export const MOTION_MEDIA: MediaMotion[] = [
  { id: "kenburnsIn", label: "کن‌برنز زوم", css: (p) => ({ transform: `scale(${1.02 + eo(p) * 0.14})` }) },
  { id: "kenburnsOut", label: "کن‌برنز عقب", css: (p) => ({ transform: `scale(${1.18 - eo(p) * 0.14})` }) },
  { id: "panL", label: "پن چپ", css: (p) => ({ transform: `scale(1.16) translateX(${eo(p) * 6}%)` }) },
  { id: "panR", label: "پن راست", css: (p) => ({ transform: `scale(1.16) translateX(${-eo(p) * 6}%)` }) },
  { id: "panU", label: "پن بالا", css: (p) => ({ transform: `scale(1.16) translateY(${eo(p) * 6}%)` }) },
  { id: "panD", label: "پن پایین", css: (p) => ({ transform: `scale(1.16) translateY(${-eo(p) * 6}%)` }) },
  { id: "driftLU", label: "رَفت چپ-بالا", css: (p) => ({ transform: `scale(1.2) translate(${eo(p) * 4}%, ${eo(p) * 4}%)` }) },
  { id: "driftRU", label: "رَفت راست-بالا", css: (p) => ({ transform: `scale(1.2) translate(${-eo(p) * 4}%, ${eo(p) * 4}%)` }) },
  { id: "dollyIn", label: "دالی جلو", css: (p) => ({ transform: `scale(${1 + ei(p) * 0.22})` }) },
  { id: "dollyOut", label: "دالی عقب", css: (p) => ({ transform: `scale(${1.24 - ei(p) * 0.22})` }) },
  { id: "zoomPulse", label: "پالس ضرب", css: (p) => {
      const beat = Math.abs(Math.sin(p * Math.PI * 4));
      return { transform: `scale(${1.04 + beat * 0.05})` };
    } },
  { id: "handheld", label: "دست‌دار", css: (p) => {
      const x = Math.sin(p * Math.PI * 6) * 0.7;
      const y = Math.cos(p * Math.PI * 4.3) * 0.6;
      return { transform: `scale(1.1) translate(${x}%, ${y}%) rotate(${x * 0.3}deg)` };
    } },
  { id: "breathe", label: "نفس‌کشیدن", css: (p) => ({ transform: `scale(${1.03 + Math.sin(p * Math.PI * 2) * 0.025})` }) },
  { id: "floatY", label: "شناوری", css: (p) => ({ transform: `scale(1.08) translateY(${Math.sin(p * Math.PI * 3) * -1.5}%)` }) },
  { id: "tiltL", label: "تیلت چپ", css: (p) => ({ transform: `scale(1.22) rotate(${eo(p) * 1.6}deg)` }) },
  { id: "tiltR", label: "تیلت راست", css: (p) => ({ transform: `scale(1.22) rotate(${-eo(p) * 1.6}deg)` }) },
  { id: "sweepFocus", label: "فوکوس‌سوئیپ", css: (p) => ({ transform: "scale(1.06)", filter: `blur(${Math.max(0, 5 - eo(p) * 6)}px) saturate(${100 + eo(p) * 10}%)` }) },
  { id: "warmGlowIn", label: "گرمای آرام", css: (p) => ({ transform: `scale(${1.05 + eo(p) * 0.05})`, filter: `saturate(${95 + eo(p) * 20}%) brightness(${96 + eo(p) * 8}%)` }) },
  { id: "coldReveal", label: "پردهٔ سرد", css: (p) => ({ transform: `scale(${1.1 - eo(p) * 0.06})`, filter: `saturate(${70 + eo(p) * 45}%) contrast(${105 + eo(p) * 8}%)` }) },
  { id: "hold", label: "ثابت", css: () => ({ transform: "scale(1.02)" }) },
];

// ---------- انیمیشن‌های متن ----------
export const MOTION_TEXTS: TextMotion[] = [
  { id: "fadeUp", label: "شدن به بالا", defDur: 0.6, css: (p) => ({ opacity: eo(p), transform: `translateY(${(1 - eo(p)) * 26}px)` }) },
  { id: "fadeIn", label: "محو ورود", defDur: 0.5, css: (p) => ({ opacity: eo(p) }) },
  { id: "popIn", label: "پاپ فنری", defDur: 0.55, css: (p) => ({ opacity: clamp01(p * 2.2), transform: `scale(${0.4 + back(p) * 0.6})` }) },
  { id: "blurIn", label: "از تاری", defDur: 0.65, css: (p) => ({ opacity: eo(p), filter: `blur(${(1 - eo(p)) * 10}px)` }) },
  { id: "typewriter", label: "تایپ‌رایتر", defDur: 0.9, css: (p) => ({ opacity: Math.min(1, p * 4), clipPath: `inset(0 0 0 ${(1 - clamp01(p * 1.15)) * 100}%)` }) }, // RTL: از راست نمایش داده می‌شود
  { id: "neonOn", label: "روشن‌شدن نئون", defDur: 0.7, css: (p) => {
      const flick = p < 0.7 ? (Math.sin(p * 40) > 0 ? 1 : 0.35) : 1;
      return { opacity: clamp01(p * 1.5) * flick, filter: `drop-shadow(0 0 ${(eo(p) * 18)}px rgba(224,167,143,.95))` };
    } },
  { id: "glitchIn", label: "گلیچ", defDur: 0.5, css: (p) => ({
      opacity: clamp01(p * 2),
      transform: `translateX(${p < 0.6 ? (Math.sin(p * 55) * (1 - p) * 10) : 0}px)`,
      filter: p < 0.55 ? "hue-rotate(35deg) saturate(2.2)" : undefined,
    }) },
  { id: "flipIn", label: "فلیپ سه‌بعدی", defDur: 0.6, css: (p) => ({ opacity: clamp01(p * 1.8), transform: `perspective(600px) rotateX(${(1 - eo(p)) * 80}deg)` }) },
  { id: "bounceIn", label: "جهش", defDur: 0.65, css: (p) => ({ opacity: clamp01(p * 3), transform: `translateY(${(1 - back(p)) * -34}px) scale(${0.7 + back(p) * 0.3})` }) },
  { id: "wipeUp", label: "مَسک به بالا", defDur: 0.6, css: (p) => ({ clipPath: `inset(${(1 - eo(p)) * 100}% 0 0 0)`, transform: `translateY(${(1 - eo(p)) * 12}px)` }) },
  { id: "slideSide", label: "اسلاید کناری", defDur: 0.55, css: (p) => ({ opacity: clamp01(p * 1.6), transform: `translateX(${(1 - eo(p)) * -40}px)` }) },
  { id: "stampIn", label: "مُهر", defDur: 0.5, css: (p) => ({ opacity: clamp01(p * 2.4), transform: `scale(${1.9 - back(p) * 0.9}) rotate(${(1 - eo(p)) * -7}deg)` }) },
  { id: "zoomText", label: "زوم متن", defDur: 0.5, css: (p) => ({ opacity: clamp01(p * 2), transform: `scale(${2.4 - eo(p) * 1.4})` }) },
  { id: "shakeIn", label: "لرزش ورود", defDur: 0.5, css: (p) => ({
      opacity: clamp01(p * 2.5),
      transform: `translateX(${p < 0.5 ? Math.sin(p * 50) * (1 - p) * 9 : 0}px) scale(${0.92 + eo(p) * 0.08})`,
    }) },
  { id: "trackIn", label: "حروف‌چینی باز", defDur: 0.8, css: (p) => ({ opacity: eo(p), letterSpacing: `${(1 - eo(p)) * 0.3}em`, filter: p < 0.9 ? `blur(${(1 - eo(p)) * 3}px)` : undefined }) },
];

// ---------- ترنزیشن‌های بین صحنه‌ها ----------
export const MOTION_TRANS: TransMotion[] = [
  { id: "cut", label: "کات", dur: 0, outCss: () => ({}) },
  { id: "fade", label: "محو", dur: 0.5, outCss: (p) => ({ opacity: 1 - eo(p) }) },
  { id: "dipBlack", label: "سیاهی", dur: 0.6, outCss: (p) => ({ opacity: 1 - eo(p) * 1.6 }), inCss: (p) => ({ opacity: clamp01(ei(p) * 1.6) }) },
  { id: "dipWhite", label: "سفیدی", dur: 0.55, outCss: (p) => ({ opacity: 1 - eo(p) * 1.6 }), inCss: (p) => ({ opacity: clamp01(ei(p) * 1.6) }) },
  { id: "zoomBlur", label: "زوم تار", dur: 0.5, outCss: (p) => ({ transform: `scale(${1 + eo(p) * 0.5})`, opacity: 1 - eo(p), filter: `blur(${eo(p) * 12}px)` }), inCss: (p) => ({ transform: `scale(${1.5 - eo(p) * 0.5})`, filter: `blur(${(1 - eo(p)) * 10}px)` }) },
  { id: "zoomPunch", label: "پانچ سریع", dur: 0.35, outCss: (p) => ({ transform: `scale(${1 + ei(p) * 0.9})`, opacity: 1 - ei(p) }), inCss: (p) => ({ transform: `scale(${1.4 - back(p) * 0.4})` }) },
  { id: "whipL", label: "و هیپ چپ", dur: 0.4, outCss: (p) => ({ transform: `translateX(${ei(p) * -110}%)`, filter: `blur(${ei(p) * 8}px)` }), inCss: (p) => ({ transform: `translateX(${(1 - eo(p)) * 110}%)`, filter: `blur(${(1 - eo(p)) * 8}px)` }) },
  { id: "whipR", label: "و هیپ راست", dur: 0.4, outCss: (p) => ({ transform: `translateX(${ei(p) * 110}%)`, filter: `blur(${ei(p) * 8}px)` }), inCss: (p) => ({ transform: `translateX(${(1 - eo(p)) * -110}%)`, filter: `blur(${(1 - eo(p)) * 8}px)` }) },
  { id: "slideL", label: "سواید چپ", dur: 0.5, outCss: (p) => ({ transform: `translateX(${eio(p) * -100}%)` }), inCss: (p) => ({ transform: `translateX(${(1 - eio(p)) * 100}%)` }) },
  { id: "slideR", label: "سواید راست", dur: 0.5, outCss: (p) => ({ transform: `translateX(${eio(p) * 100}%)` }), inCss: (p) => ({ transform: `translateX(${(1 - eio(p)) * -100}%)` }) },
  { id: "wipeUpTr", label: "وایپ بالا", dur: 0.55, nextOnTop: true, outCss: () => ({}), inCss: (p) => ({ clipPath: `inset(${(1 - eio(p)) * 100}% 0 0 0)` }) },
  { id: "glitchTr", label: "گلیچ", dur: 0.4, outCss: (p) => ({ opacity: 1 - eo(p * 1.4), transform: `translateX(${Math.sin(p * 45) * (1 - p) * 14}px)`, filter: p < 0.7 ? "hue-rotate(60deg) saturate(2.5) contrast(1.4)" : undefined }), inCss: (p) => ({ opacity: clamp01(eo(p) * 1.6) }) },
  { id: "flashTr", label: "فلش", dur: 0.3, outCss: (p) => ({ opacity: 1 - eo(p) * 1.35 }), inCss: (p) => ({ opacity: clamp01(ei(p) * 1.5) }) },
  { id: "filmBurnTr", label: "سوختگی فیلم", dur: 0.7, outCss: (p) => ({ opacity: 1 - eo(p * 1.3), filter: `saturate(${100 + p * 250}%) brightness(${100 + p * 90}%) contrast(${100 - p * 30}%)` }), inCss: (p) => ({ opacity: clamp01(ei(p) * 1.4), filter: `saturate(${100 + (1 - p) * 200}%) brightness(${100 + (1 - p) * 70}%)` }) },
  { id: "dropBlack", label: "پرش سیاه", dur: 0.5, outCss: (p) => ({ transform: `translateY(${eo(p) * -14}%)`, opacity: 1 - eo(p) }), inCss: (p) => ({ transform: `translateY(${(1 - eo(p)) * 14}%)`, opacity: eo(p) }) },
  { id: "spinTr", label: "چرخش", dur: 0.55, outCss: (p) => ({ transform: `rotate(${eio(p) * 6}deg) scale(${1 + eo(p) * 0.35})`, opacity: 1 - eo(p) }), inCss: (p) => ({ transform: `rotate(${(1 - eio(p)) * -6}deg) scale(${1.35 - eio(p) * 0.35})`, opacity: eo(p) }) },
];

export const MOTION_FX: { id: string; label: string }[] = [
  { id: "grain", label: "دانهٔ فیلم" },
  { id: "vignette", label: "وینیت" },
  { id: "leak", label: "نشت نور" },
  { id: "scan", label: "خط اسکن" },
  { id: "letterbox", label: "نوار سینما" },
];

const mediaMap = new Map(MOTION_MEDIA.map((m) => [m.id, m]));
const textMap = new Map(MOTION_TEXTS.map((m) => [m.id, m]));
const transMap = new Map(MOTION_TRANS.map((m) => [m.id, m]));

export const getMediaMotion = (id: string): MediaMotion => mediaMap.get(id) ?? MOTION_MEDIA[0];
export const getTextMotion = (id: string): TextMotion => textMap.get(id) ?? MOTION_TEXTS[0];
export const getTransMotion = (id: string): TransMotion => transMap.get(id) ?? MOTION_TRANS[0];

export const MOTION_BANK_STATS = {
  media: MOTION_MEDIA.length,
  text: MOTION_TEXTS.length,
  trans: MOTION_TRANS.length,
  fx: MOTION_FX.length,
};
