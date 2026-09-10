// Server-side Gemini fetch with automatic relay fallback.
//
// The server egress (HK) is region-blocked by Google ("User location is not
// supported"), so when the direct call hits that gate we retry through public
// CORS relays whose egress rotates across regions — each attempt has a decent
// chance of landing in an allowed region. The user's own key stays valid; the
// relay only forwards the request we already built.

export type GeminiVia = "direct" | "corsfix" | "cors-lol" | "none";

interface RelayDef {
  id: Exclude<GeminiVia, "direct" | "none">;
  wrap: (url: string) => string;
  extraHeaders: Record<string, string>;
}

const RELAYS: RelayDef[] = [
  {
    id: "corsfix",
    // corsfix takes the raw target URL after "?" and requires a browser-like Origin
    wrap: (u) => `https://proxy.corsfix.com/?${u}`,
    extraHeaders: { Origin: "http://localhost:3000" },
  },
  {
    id: "cors-lol",
    wrap: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
    extraHeaders: {},
  },
];

const REGION_RE = /location is not supported|FAILED_PRECONDITION/i;

// Per-process hints so we stop paying for paths that just failed
let lastGood: GeminiVia | null = null;
let directDead = false;

export interface GeminiFetchResult {
  /** true when we got a real Google API JSON response (even 4xx like 429/404) */
  reachedGoogle: boolean;
  status: number;
  bodyText: string;
  via: GeminiVia;
}

function looksLikeGoogleJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    const j = JSON.parse(t) as {
      candidates?: unknown;
      error?: { code?: unknown; status?: unknown; message?: unknown };
    };
    if (j.candidates) return true;
    if (j.error && (typeof j.error.code === "number" || typeof j.error.status === "string")) {
      // Google errors carry a numeric code or gRPC status; relay errors don't
      return !/corsfix|cors\.lol|rate limit exceeded/i.test(String(j.error.message ?? ""));
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Fetch a Gemini API endpoint, retrying across direct + relay candidates.
 * Returns the first real Google response, or reachedGoogle=false when every
 * attempt hit the region gate / relay failure.
 */
export async function geminiFetch(
  url: string,
  opts: { method?: string; body?: string; timeoutMs?: number; maxAttempts?: number; quotaWait?: boolean } = {}
): Promise<GeminiFetchResult> {
  const { method = "POST", body, timeoutMs = 60_000, maxAttempts = 6, quotaWait = false } = opts;

  interface Cand {
    via: GeminiVia;
    url: string;
    headers: Record<string, string>;
  }
  const buildCandidates = (): Cand[] => {
    const list: Cand[] = [];
    // ── امنیت (ممیزی H-1): کلید از query-string استخراج و برای کاندیداهای
    // رله در هدر x-goog-api-key قرار می‌گیرد — کلید هرگز از پروکسی ثالث
    // در URL عبور نمی‌کند. تماس مستقیم (HTTPS به گوگل) بدون تغییر می‌ماند.
    const urlDirect = url;
    let urlRelay = url;
    const keyHeader: Record<string, string> = {};
    const m = /[?&]key=([^&]+)/.exec(url);
    if (m) {
      const decoded = decodeURIComponent(m[1]);
      keyHeader["x-goog-api-key"] = decoded;
      urlRelay = url.replace(/([?&])key=[^&]+&?/, "$1").replace(/[?&]$/, "");
    }
    if (!directDead) {
      list.push({ via: "direct", url: urlDirect, headers: { "Content-Type": "application/json", ...keyHeader } });
    }
    for (const r of RELAYS) {
      list.push({
        via: r.id,
        url: r.wrap(urlRelay),
        headers: { "Content-Type": "application/json", ...keyHeader, ...r.extraHeaders },
      });
    }
    // Try the last-good path first to avoid re-paying dead attempts
    if (lastGood) {
      const i = list.findIndex((c) => c.via === lastGood);
      if (i > 0) list.unshift(...list.splice(i, 1));
    }
    return list;
  };

  let quotaWaited = false; // wait for the quota window only once per call
  for (let round = 0; round < maxAttempts; round++) {
    for (const c of buildCandidates()) {
      let res: Response | null = null;
      try {
        res = await fetch(c.url, {
          method,
          headers: c.headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        continue; // network/relay failure — next candidate
      }
      let text = "";
      try {
        text = await res.text();
      } catch {
        continue;
      }
      if (REGION_RE.test(text)) {
        if (c.via === "direct") directDead = true; // this region never passes directly
        continue; // region gate miss — next candidate / round
      }
      if (!looksLikeGoogleJson(text)) continue; // relay HTML / relay error — next
      // Google says "Please retry in Xs" for per-minute quota — wait once and retry
      if (res.status === 429 && quotaWait && !quotaWaited) {
        const m = /retry in ([\d.]+)s/i.exec(text);
        if (m) {
          quotaWaited = true;
          const ms = Math.min((parseFloat(m[1]) + 2) * 1000, 40_000);
          await new Promise((r) => setTimeout(r, ms));
          round = Math.max(round - 1, -1); // don't count the wait against our attempts
          break; // rebuild candidates (lastGood may have changed)
        }
      }
      lastGood = c.via;
      return { reachedGoogle: true, status: res.status, bodyText: text, via: c.via };
    }
    if (round < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  return {
    reachedGoogle: false,
    status: 0,
    bodyText: JSON.stringify({
      error: { code: 400, message: "User location is not supported for the API use.", status: "FAILED_PRECONDITION" },
    }),
    via: "none",
  };
}

/** Extract the current model name Google suggests on 404 "no longer available". */
export function suggestedModel(bodyText: string): string | null {
  const m = /use models\/([a-z0-9.\-]+)/i.exec(bodyText);
  return m ? m[1] : null;
}
