// ─────────────────────────────────────────────────────────────
// AI Settings client — خواندن تنظیمات BYO از localStorage
// کلیدها فقط در حافظهٔ مرورگر می‌مانند و در هر درخواست به سرور
// ارسال می‌شوند (هرگز در باندل/کوکی)
// ─────────────────────────────────────────────────────────────

export interface AssistantAiSettings {
  provider: "default" | "openrouter" | "gemini";
  openrouter: { apiKey: string; model: string };
  gemini: { apiKey: string; model: string };
}

const AI_SETTINGS_KEY = "ai-assistant-settings";

export function loadAssistantSettings(): AssistantAiSettings | null {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AssistantAiSettings;
    if (!s || typeof s !== "object") return null;
    return s;
  } catch {
    return null;
  }
}

/** اعتبارنامهٔ رایج برای routeهای AI از تنظیمات دستیار — R1: + کلید per-provider */
export function byoCreds(): {
  apiKey?: string;
  model?: string;
  provider?: string;
  keys?: Record<string, string>;
} {
  const s = loadAssistantSettings();
  if (!s) return {};
  // نقشهٔ کلیدها مستقل از provider انتخابی هم می‌رود تا روتر هر کلید را
  // فقط به صاحبش بدهد (کلید Gemini به Jina نمی‌رسد)
  const keys: Record<string, string> = {};
  if (s.gemini?.apiKey?.trim()) keys.gemini = s.gemini.apiKey.trim();
  if (s.openrouter?.apiKey?.trim()) keys.openrouter = s.openrouter.apiKey.trim();
  const base = (() => {
    if (!s.provider || s.provider === "default") return {};
    if (s.provider === "gemini" && s.gemini?.apiKey) {
      return { provider: "gemini", apiKey: s.gemini.apiKey, model: s.gemini.model || undefined };
    }
    if (s.provider === "openrouter" && s.openrouter?.apiKey) {
      return { provider: "openrouter", apiKey: s.openrouter.apiKey, model: s.openrouter.model || undefined };
    }
    return {};
  })();
  return { ...base, keys: Object.keys(keys).length ? keys : undefined };
}
