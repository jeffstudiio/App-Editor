// ─────────────────────────────────────────────────────────────
// AI Errors — تایپ‌دار، با پیام کاربرپسند فارسی (§35)
// هیچ‌وقت 500 خام به کاربر نشان داده نمی‌شود
// ─────────────────────────────────────────────────────────────

export type AIErrorCode =
  | "missing_key" // ارائه‌دهنده کلید ندارد — تنظیمات لازم
  | "auth" // کلید نامعتبر
  | "quota" // سهمیه تمام شد (۴۰۲/کوتا)
  | "rate_limit" // محدودیت نرخ
  | "region" // محدودیت جغرافیایی
  | "timeout"
  | "network"
  | "bad_response" // پاسخ نامعتبر/خالی
  | "invalid_input"
  | "unavailable";

const USER_MESSAGES: Record<AIErrorCode, string> = {
  missing_key: "این ارائه‌دهندهٔ هوش مصنوعی تنظیم نشده است — کلید آن را در تنظیمات وارد کن یا از موتور دیگری استفاده کن.",
  auth: "کلید این ارائه‌دهنده نامعتبر است — از تنظیمات دستیار درستش کن.",
  quota: "سهمیهٔ رایگان این ارائه‌دهنده موقتاً تمام شده — کمی بعد دوباره امتحان کن.",
  rate_limit: "محدودیت نرخ درخواست — چند لحظه صبر کن و دوباره تلاش کن.",
  region: "این سرویس از سرور فعلی در دسترس نیست (محدودیت منطقه‌ای).",
  timeout: "پاسخ بیش از حد طول کشید — دوباره تلاش کن.",
  network: "اتصال شبکه برقرار نشد — اینترنت یا دسترسی سرویس را بررسی کن.",
  bad_response: "پاسخ نامعتبری از سرویس دریافت شد — دوباره تلاش کن.",
  invalid_input: "ورودی درخواست نامعتبر است.",
  unavailable: "سرویس موقتاً در دسترس نیست.",
};

export class AIError extends Error {
  readonly code: AIErrorCode;
  /** خطای پیکربندیِ مرگبار: وقتی کاربر خودش provider را انتخاب کرده، نباید بی‌سروصدا سوییچ کنیم */
  readonly fatal: boolean;
  readonly userMessage: string;
  readonly httpStatus: number;

  constructor(code: AIErrorCode, opts: { detail?: string; fatal?: boolean } = {}) {
    const userMessage = USER_MESSAGES[code];
    super(opts.detail ? `${userMessage} (${opts.detail})` : userMessage);
    this.name = "AIError";
    this.code = code;
    this.userMessage = userMessage;
    this.fatal = opts.fatal ?? (code === "missing_key" || code === "auth");
    this.httpStatus = httpStatusFor(code);
  }

  static fromHttpStatus(status: number, detail?: string): AIError {
    if (status === 401 || status === 403) return new AIError("auth", { detail });
    if (status === 402) return new AIError("quota", { detail });
    if (status === 429) return new AIError("rate_limit", { detail });
    if (status === 408) return new AIError("timeout", { detail });
    if (status >= 500) return new AIError("unavailable", { detail });
    return new AIError("bad_response", { detail: detail ?? `HTTP ${status}` });
  }
}

export function httpStatusFor(code: AIErrorCode): number {
  switch (code) {
    case "missing_key":
    case "invalid_input":
      return 400;
    case "auth":
      return 401;
    case "quota":
      return 402;
    case "rate_limit":
      return 429;
    case "timeout":
      return 504;
    case "region":
    case "unavailable":
      return 503;
    default:
      return 502;
  }
}

/** آیا خطای AbortSignal بود؟ */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}
