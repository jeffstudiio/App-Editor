// ─────────────────────────────────────────────────────────────
// بانک تمپلیت — تجمیع دادهٔ محلی + بارگیری منبع ابری
// منبع داده می‌تواند آدرس JSON روی GitHub Raw / jsDelivr یا هر
// فضای ابری باشد (از داخل اپ قابل تنظیم است) و در نبود آن،
// نسخهٔ محلی استفاده می‌شود.
// ─────────────────────────────────────────────────────────────

import type { BankManifest, BankTemplate, CategoryId } from "./schema";
import { sanitizeTemplate } from "./schema";
import { withDefaults } from "./defaults";
import { INTRO_TEMPLATES } from "./data/intro";
import { LOGO_TEMPLATES } from "./data/logo";
import { REELS_TEMPLATES } from "./data/reels";
import { STORY_TEMPLATES } from "./data/story";
import { CINEMATIC_TEMPLATES } from "./data/cinematic";
import { TYPO_TEMPLATES } from "./data/typo";
import { PRODUCT_TEMPLATES } from "./data/product";
import { OCCASION_TEMPLATES } from "./data/occasion";
import { MUSIC_TEMPLATES } from "./data/music";
import { SLIDESHOW_TEMPLATES } from "./data/slideshow";

export const BANK_VERSION = "1.0.0";

/** نسخهٔ محلی (fallback همیشه در دسترس) */
export const LOCAL_BANK: BankManifest = {
  version: BANK_VERSION,
  updatedAt: "2026-09-10",
  count: 0, // در پایین پر می‌شود
  templates: [
    ...INTRO_TEMPLATES,
    ...LOGO_TEMPLATES,
    ...REELS_TEMPLATES,
    ...STORY_TEMPLATES,
    ...CINEMATIC_TEMPLATES,
    ...TYPO_TEMPLATES,
    ...PRODUCT_TEMPLATES,
    ...OCCASION_TEMPLATES,
    ...MUSIC_TEMPLATES,
    ...SLIDESHOW_TEMPLATES,
  ],
};
LOCAL_BANK.count = LOCAL_BANK.templates.length;

export const BANK_STORAGE_KEY = "template-bank-source";

export interface LoadedBank {
  manifest: BankManifest;
  source: "remote" | "local";
  /** آدرس منبع وقتی ریموت است */
  url?: string;
}

export function getSavedBankUrl(): string {
  try {
    return localStorage.getItem(BANK_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveBankUrl(url: string) {
  try {
    if (url) localStorage.setItem(BANK_STORAGE_KEY, url);
    else localStorage.removeItem(BANK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** بارگیری بانک: اول منبع ابری ذخیره‌شده، بعد نسخهٔ محلی */
export async function loadBank(): Promise<LoadedBank> {
  const url = getSavedBankUrl();
  if (url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const raw = (await res.json()) as unknown;
        const list = Array.isArray(raw)
          ? raw
          : ((raw as Record<string, unknown>).templates as unknown[]);
        const templates = (list ?? []).map(sanitizeTemplate).filter((t): t is BankTemplate => !!t).map(withDefaults);
        if (templates.length > 0) {
          return {
            manifest: { version: BANK_VERSION, updatedAt: new Date().toISOString().slice(0, 10), count: templates.length, templates },
            source: "remote",
            url,
          };
        }
      }
    } catch {
      // fall through to local
    }
  }
  return { manifest: { ...LOCAL_BANK, templates: LOCAL_BANK.templates.map(withDefaults) }, source: "local" };
}

export function byCategory(tplList: BankTemplate[], cat: CategoryId | "all"): BankTemplate[] {
  return cat === "all" ? tplList : tplList.filter((t) => t.cat === cat);
}

export function searchBank(tplList: BankTemplate[], q: string): BankTemplate[] {
  const query = q.trim().toLowerCase();
  if (!query) return tplList;
  return tplList.filter(
    (t) =>
      t.name.toLowerCase().includes(query) ||
      t.en.toLowerCase().includes(query) ||
      t.desc.toLowerCase().includes(query) ||
      t.tags.some((tag) => tag.toLowerCase().includes(query)),
  );
}

export * from "./schema";
export * from "./motions";
