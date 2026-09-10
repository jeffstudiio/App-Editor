// ─────────────────────────────────────────────────────────────
// Rate Limit — سطل توکن در حافظه، هر IP+مسیر (§36)
// جلوی سوختن سهمیهٔ رایگانِ کلید سرور توسط فراخوان ناشناس
// ─────────────────────────────────────────────────────────────

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const globalRef = globalThis as unknown as { __jeffRate?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = globalRef.__jeffRate ?? new Map();
globalRef.__jeffRate = buckets;

export interface RateLimitConfig {
  /** ظرفیت برست */
  capacity: number;
  /** نرخ پرشدن توکن در دقیقه */
  perMinute: number;
}

export const RATE_PRESETS = {
  chat: { capacity: 12, perMinute: 10 } as RateLimitConfig,
  heavy: { capacity: 6, perMinute: 5 } as RateLimitConfig, // تصویر/صدا/ASR
  light: { capacity: 40, perMinute: 30 } as RateLimitConfig,
};

export function rateLimit(key: string, cfg: RateLimitConfig): { ok: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  const refillRate = cfg.perMinute / 60_000; // توکن بر میلی‌ثانیه
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: cfg.capacity, updatedAt: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(cfg.capacity, b.tokens + (now - b.updatedAt) * refillRate);
  b.updatedAt = now;

  if (b.tokens < 1) {
    const waitMs = Math.ceil((1 - b.tokens) / refillRate);
    return { ok: false, retryAfterSec: Math.ceil(waitMs / 1000), remaining: 0 };
  }
  b.tokens -= 1;
  // پاکسازی دوره‌ای
  if (buckets.size > 5000) {
    for (const [k, bb] of buckets) {
      if (now - bb.updatedAt > 30 * 60_000) buckets.delete(k);
    }
  }
  return { ok: true, retryAfterSec: 0, remaining: Math.floor(b.tokens) };
}

/** IP کلاینت از هدرهای پروکسی-آگاه */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
