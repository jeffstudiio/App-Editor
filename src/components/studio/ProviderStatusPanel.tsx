"use client";

// ─────────────────────────────────────────────────────────────
// ProviderStatusPanel — ماتریس ارائه‌دهنده‌ها برای کاربر (§33/§34)
// صادقانه: وصل/تنظیم‌نشده/خطا — با تست اتصال واقعی
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { byoCreds } from "@/lib/ai/client/settings";

interface ProviderStatus {
  id: string;
  name: string;
  capabilities: string[];
  pricingTier: string;
  requiresApiKey: boolean;
  envKey: string | null;
  envKeySet: boolean;
  health: { state: string; detail?: string };
}

interface StatusResponse {
  ok?: boolean;
  providers?: ProviderStatus[];
  localTools?: { id: string; name: string }[];
  error?: string;
}

const CAP_FA: Record<string, string> = {
  text_generation: "متن",
  fast_text: "متن سریع",
  image_generation: "تولید تصویر",
  image_editing: "ویرایش تصویر",
  speech_to_text: "گفتار به متن",
  text_to_speech: "متن به گفتار",
  translation: "ترجمه",
  embeddings: "جست‌وجوی معنایی",
};

const TIER_FA: Record<string, string> = {
  free: "رایگان",
  free_tier: "رایگان (محدود)",
  paid: "پولی",
  local: "محلی",
  unknown: "نامشخص",
};

const STATE_FA: Record<string, { label: string; cls: string; dot: string }> = {
  available: { label: "وصل", cls: "text-emerald-500", dot: "bg-emerald-500" },
  not_configured: { label: "تنظیم نشده", cls: "text-muted-foreground", dot: "bg-zinc-500" },
  rate_limited: { label: "محدودیت نرخ", cls: "text-amber-500", dot: "bg-amber-500" },
  auth_error: { label: "کلید نامعتبر", cls: "text-red-500", dot: "bg-red-500" },
  timeout: { label: "زمان تمام شد", cls: "text-amber-500", dot: "bg-amber-500" },
  unavailable: { label: "در دسترس نیست", cls: "text-red-400", dot: "bg-red-400" },
  unknown: { label: "آزموده نشده", cls: "text-muted-foreground", dot: "bg-zinc-400" },
};

export function ProviderStatusPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      setData((await res.json()) as StatusResponse);
    } catch {
      setData({ error: "status-unreachable" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async (id: string) => {
    setVerifying(id);
    setVerifyNote(null);
    try {
      const creds = byoCreds();
      const res = await fetch(`/api/ai/status?verify=${encodeURIComponent(id)}`, {
        headers: creds.apiKey ? { "x-ai-key": creds.apiKey } : undefined,
      });
      const j = (await res.json()) as { ok?: boolean; health?: { state: string; detail?: string } };
      const state = j.health?.state ?? "unknown";
      setVerifyNote(`${id}: ${STATE_FA[state]?.label ?? state}`);
      void load();
    } catch {
      setVerifyNote(`${id}: تست ناموفق`);
    } finally {
      setVerifying(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border p-3 text-xs text-muted-foreground">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> در حال خواندن وضعیت ارائه‌دهنده‌ها…
      </div>
    );
  }
  if (!data?.providers) {
    return (
      <div className="rounded-2xl border border-border p-3 text-xs text-muted-foreground">
        وضعیت ارائه‌دهنده‌ها در دسترس نیست (احتمالاً در حالت آفلاین/ Pages).
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold">ارائه‌دهنده‌های هوش مصنوعی</h4>
        {verifyNote && <span className="text-[10px] text-muted-foreground">{verifyNote}</span>}
      </div>
      <div className="space-y-1.5">
        {data.providers.map((p) => {
          const st = STATE_FA[p.health.state] ?? STATE_FA.unknown;
          const configured = p.health.state !== "not_configured";
          return (
            <div key={p.id} className="rounded-xl bg-muted/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                  <p className="truncate text-xs font-semibold">{p.name}</p>
                  <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground border border-border">
                    {TIER_FA[p.pricingTier] ?? p.pricingTier}
                  </span>
                </div>
                <button
                  onClick={() => void verify(p.id)}
                  disabled={verifying !== null}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition disabled:opacity-40"
                >
                  {verifying === p.id ? "…" : "تست اتصال"}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {p.capabilities.map((c) => (
                  <span key={c} className="rounded-md bg-background border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {CAP_FA[c] ?? c}
                  </span>
                ))}
                {p.envKey && !p.envKeySet && (
                  <span className="rounded-md bg-background border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    کلید سرور: {p.envKey}
                  </span>
                )}
              </div>
              <p className={`mt-1 text-[10px] ${st.cls}`}>
                {st.label}
                {p.health.detail ? ` — ${p.health.detail}` : ""}
              </p>
            </div>
          );
        })}
      </div>

      {data.localTools && data.localTools.length > 0 && (
        <div className="rounded-xl border border-dashed border-border p-2.5">
          <p className="text-[10px] font-bold text-muted-foreground">ابزارهای محلی (همیشه فعال، بدون شبکه):</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {data.localTools.map((t) => (
              <li key={t.id} className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                {t.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
