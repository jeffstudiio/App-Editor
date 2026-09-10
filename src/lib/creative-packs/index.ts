// ─────────────────────────────────────────────────────────────
// Pack Registry — ثبت/واکشی پک‌ها؛ هسته هرگز نام پک را نمی‌داند
// ─────────────────────────────────────────────────────────────

import { BEAUTY_PACK } from "./beauty";
import type { CreativePack, PackMusicMood } from "./types";

export type { CreativePack, PackMusicMood, PackWorkflow } from "./types";

const PACKS = new Map<string, CreativePack>();
function register(p: CreativePack) {
  PACKS.set(p.id, p);
}
register(BEAUTY_PACK);

export function getPack(id: string | undefined | null): CreativePack | null {
  if (!id) return null;
  return PACKS.get(id) ?? null;
}

export function listPacks(): CreativePack[] {
  return [...PACKS.values()];
}

/** انتخاب خودکار mood موسیقی از دل متن — واقعی و آفلاین */
export function pickMusicMood(pack: CreativePack, text: string): PackMusicMood | null {
  const norm = text.toLowerCase();
  let best: { mood: PackMusicMood; score: number } | null = null;
  for (const mood of pack.musicMoods) {
    let score = 0;
    for (const k of mood.keywords) {
      if (norm.includes(k.toLowerCase())) score += 1;
    }
    if (score > (best?.score ?? 0)) best = { mood, score };
  }
  return best?.mood ?? pack.musicMoods[0] ?? null;
}

export type { CreativePack as CreativePackType } from "./types";
