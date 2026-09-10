// ─────────────────────────────────────────────────────────────
// AI Provider Architecture — core types
// معماری ارائه‌دهندهٔ هوش مصنوعی — قابلیت‌محور، مستقل از vendor
// اصل: JEFF مالک پروژه است؛ providerها فقط هوش یا پردازش می‌دهند
// ─────────────────────────────────────────────────────────────

/** طبقه‌بندی قیمت‌گذاری — «رایگانِ محدود» با «رایگانِ نامحدود» فرق دارد */
export type PricingTier = "free" | "free_tier" | "paid" | "local" | "unknown";

/** قابلیت‌هایی که سامانه از ارائه‌دهنده‌ها انتظار دارد */
export type AICapability =
  | "text_generation" // مکالمه / برنامه‌ریزی عامل / تولید متن
  | "fast_text" // متن ساختاریافتهٔ کم‌تأخیر (JSON plans)
  | "image_generation"
  | "image_editing"
  | "speech_to_text"
  | "text_to_speech"
  | "translation"
  | "embeddings"; // جست‌وجوی معنایی بانک/دارایی‌ها

export type ProviderId =
  | "zai" // موتور پیش‌فرض میزبانی‌شدهٔ پلتفرم (بدون کلید)
  | "gemini"
  | "openrouter"
  | "groq"
  | "huggingface"
  | "jina"
  | "edge-tts"
  | "local";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ProviderKeyMap = Partial<Record<ProviderId, string>>;

/** درخواست یکپارچه — متمایز بر اساس capability */
export type AIRequest =
  | {
      capability: "text_generation" | "fast_text" | "translation";
      messages: ChatMessage[];
      temperature?: number;
      maxTokens?: number;
      /** اگر true باشد ارائه‌دهنده باید JSON برگرداند (best-effort) */
      jsonMode?: boolean;
      model?: string;
      apiKey?: string;
      /** کلید اختصاصی هر provider (R1) — کلید گوگل به Jina نمی‌رسد */
      keys?: ProviderKeyMap;
    }
  | { capability: "image_generation"; prompt: string; size?: string; model?: string; apiKey?: string; keys?: ProviderKeyMap }
  | {
      capability: "image_editing";
      prompt: string;
      imageBase64: string;
      size?: string;
      model?: string;
      apiKey?: string;
      keys?: ProviderKeyMap;
    }
  | { capability: "speech_to_text"; audioBase64: string; model?: string; apiKey?: string; keys?: ProviderKeyMap }
  | { capability: "text_to_speech"; text: string; voice?: string; speed?: number; model?: string; apiKey?: string; keys?: ProviderKeyMap }
  | { capability: "embeddings"; texts: string[]; model?: string; apiKey?: string; keys?: ProviderKeyMap };

export type AIOutput =
  | { kind: "text"; text: string }
  | { kind: "image"; imageBase64: string }
  | { kind: "audio"; audio: ArrayBuffer; mime: string }
  | { kind: "embeddings"; vectors: number[][] };

/** وضعیت سلامت — صادقانه؛ هرگز «فرضی» پر نمی‌شود */
export interface ProviderHealth {
  state:
    | "available" // آخرین اجرا/پینگ موفق
    | "not_configured" // کلید ندارد
    | "rate_limited"
    | "auth_error"
    | "timeout"
    | "unavailable" // خطای شبکه/سرور
    | "unknown"; // تنظیم است ولی هنوز آزموده نشده
  detail?: string;
  checkedAt: number;
}

/**
 * قرارداد همهٔ ارائه‌دهنده‌ها — §6 spec
 * جایگزینی هر provider بدون تغییر Agent/Timeline/Editor تضمین‌شده است.
 */
export interface AIProvider {
  id: ProviderId;
  name: string;
  capabilities: AICapability[];
  pricingTier: PricingTier;
  requiresApiKey: boolean;
  /** نام متغیر محیطی کلید سرور (اگر دارد) */
  envKey?: string;
  docsUrl: string;

  /** آیا این provider امکان اجرای این درخواست را دارد؟ (صداقت: بدون کلید = خیر) */
  supports(cap: AICapability, req?: AIRequest): boolean;

  /** کلید موجود است؟ (کلید BYO از درخواست می‌آید، نه از باندل کلاینت) */
  isAvailable(apiKey?: string): boolean;

  /** سلامت واقعی — هرگز شبکه را بی‌دلیل کوبیدن؛ نتیجهٔ آخرین اجرا + وضعیت کلید */
  healthCheck(apiKey?: string): ProviderHealth;

  /** تست اتصال واقعی (فراخوان سبک) — فقط از پنل تنظیمات صدا زده می‌شود */
  verify(apiKey?: string): Promise<ProviderHealth>;

  execute(req: AIRequest): Promise<AIOutput>;
}

/** نتیجهٔ مسیریابی — شامل ردپای کامل تلاش‌ها برای شفافیت */
export interface RouteAttempt {
  provider: ProviderId;
  ok: boolean;
  error?: string; // پیام فارسیِ قابل‌فهم
  code?: string;
  skipped?: boolean; // اصلاً امتحان نشد (مثلاً بدون کلید)
}

export interface AIResult {
  output: AIOutput;
  provider: { id: ProviderId; name: string; pricingTier: PricingTier };
  model?: string;
  via?: string;
  cached?: boolean;
  attempts: RouteAttempt[];
}
