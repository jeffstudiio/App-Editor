// ─────────────────────────────────────────────────────────────
// Semantic Bank Search — §26: جست‌وجوی معنایی بانک تمپلیت
// لایهٔ ۱ (همیشه): تطبیق واژگانی با گسترش مترادف پک — آفلاین واقعی
// لایهٔ ۲ (اختیاری): بازچینش با امبدینگ — Jina با کلید، وگرنه محلی
// هر دو لایه واقعی‌اند؛ هیچ‌کدام شبیه‌سازی نیستند
// ─────────────────────────────────────────────────────────────

import type { BankTemplate } from "@/lib/template-bank/schema";
import { cosine, localEmbed, tokenize } from "@/lib/ai/core/local-embedding";
import { getPack } from "@/lib/creative-packs";
import { byoCreds } from "@/lib/ai/client/settings";
import { aiEmbeddings } from "@/lib/ai/client/gateway";

export function templateDoc(t: BankTemplate): string {
  return `${t.name} ${t.en} ${t.desc} ${t.cat} ${t.tags.join(" ")}`;
}

/** گسترش پرس‌وجو با مترادف پک + عمومی */
function expandQuery(q: string, packId?: string): string {
  const pack = getPack(packId ?? "beauty");
  const tokens = tokenize(q);
  const extra = new Set<string>(tokens);
  const norm = q.toLowerCase();
  const synAll: Record<string, string[]> = {
    ...(pack?.searchSynonyms ?? {}),
    لوکس: ["luxury", "premium"],
    زیبا: ["beauty"],
    مو: ["hair"],
  };
  for (const [k, vs] of Object.entries(synAll)) {
    if (norm.includes(k)) for (const v of vs) extra.add(v);
    if (tokens.includes(k)) for (const v of vs) extra.add(v);
  }
  return [...extra].join(" ");
}

/**
 * جست‌وجوی بانک با رتبه‌بندی معناییِ محلی (همیشه در دسترس، بدون شبکه).
 * score = 0.55·کازین(محلی) + 0.35·پوشش توکن + 0.1·برچسب پک
 */
export function searchBankLocal(tplList: BankTemplate[], q: string, packId?: string): BankTemplate[] {
  const query = q.trim();
  if (!query) return tplList;
  const expanded = expandQuery(query, packId);
  const qVec = localEmbed(expanded);
  const qTokens = tokenize(query).map((t) => t.toLowerCase());

  const scored = tplList.map((t) => {
    const doc = templateDoc(t);
    const c = cosine(qVec, localEmbed(doc));
    const docTokens = new Set(tokenize(doc).map((x) => x.toLowerCase()));
    let cover = 0;
    for (const tok of qTokens) if (docTokens.has(tok)) cover += 1;
    const coverage = qTokens.length ? cover / qTokens.length : 0;
    const packBoost = packId && getPack(packId)?.templateCategories.includes(t.cat) ? 1 : 0;
    return { t, score: 0.55 * c + 0.35 * coverage + 0.1 * packBoost };
  });

  return scored
    .filter((s) => s.score > 0.04)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.t);
}

/**
 * بازچینش با امبدینگ سرور (Jina اگر کلید باشد، وگرنه محلیِ سرور).
 * در نبود شبکه/کلید، همان نتیجهٔ محلی برمی‌گردد — بی‌سروصدا نیست:
 * caller می‌تواند provider برگشتی را نشان دهد.
 */
export async function semanticRerank(
  query: string,
  tplList: BankTemplate[],
  packId?: string,
): Promise<{ results: BankTemplate[]; provider: "jina" | "local"; error?: string }> {
  const base = searchBankLocal(tplList, query, packId);
  if (!query.trim() || base.length === 0) {
    return { results: base, provider: "local" };
  }
  try {
    const creds = byoCreds();
    const docs = base.map(templateDoc).slice(0, 48);
    const j = await aiEmbeddings({ query: expandQuery(query, packId), texts: docs, apiKey: creds.apiKey });
    if (!j.ok || !j.queryVector || !j.vectors) {
      return { results: base, provider: "local", error: j.error ? "embeddings-unavailable" : "embeddings-invalid" };
    }
    const ranked = base
      .map((t, i) => ({ t, s: cosine(j.queryVector!, j.vectors![i] ?? []) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t);
    return { results: ranked, provider: j.provider ?? "local" };
  } catch {
    return { results: base, provider: "local", error: "network" };
  }
}
