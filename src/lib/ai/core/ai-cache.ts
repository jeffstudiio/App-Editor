// ─────────────────────────────────────────────────────────────
// AI Cache — §23: کش درخواست‌های یکسانِ متن/امبدینگ
// (تصویر/صدا/ASR کش نمی‌شود؛ محتوای حساس کاربر هم کش نمی‌شود)
// LRU + TTL، سقف سخت برای حافظه
// ─────────────────────────────────────────────────────────────

interface Entry {
  expires: number;
  value: unknown;
}

export class AiCache {
  private map = new Map<string, Entry>();

  constructor(
    private ttlMs = 10 * 60_000,
    private maxEntries = 200,
  ) {}

  get<T>(key: string): T | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (Date.now() > e.expires) {
      this.map.delete(key);
      return null;
    }
    // LRU touch
    this.map.delete(key);
    this.map.set(key, e);
    return e.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.map.size >= this.maxEntries) {
      // قدیمی‌ترین (اول درج‌شده) را بیرون بینداز
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { expires: Date.now() + this.ttlMs, value });
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** کلید کش پایدار — فیلدهای base64 خلاصه می‌شوند */
export function cacheKey(parts: (string | number | undefined | null | boolean | object)[]): string {
  return parts
    .map((p) => {
      if (p === undefined || p === null) return "∅";
      if (typeof p === "object") return stableStringify(p);
      return String(p);
    })
    .join("¦");
}

export function stableStringify(value: unknown, depth = 0): string {
  if (depth > 4) return "…";
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") {
    if (typeof value === "string" && value.length > 120 && /^([A-Za-z0-9+/=]+|data:)/.test(value)) {
      return `b64:${value.length}:${hashStr(value.slice(0, 2048))}`;
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v, depth + 1)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k], depth + 1)}`).join(",")}}`;
}

export function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
