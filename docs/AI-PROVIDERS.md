# AI Providers — ماتریس واقعی ارائه‌دهنده‌ها (§33/§40)

> این سند پس از راستی‌آزمایی نوشته شده است. هیچ مقدار «حدسی» در جدول‌ها نیست.
> هر provider فقط وقتی «فعال» است که واقعاً در کد وصل شده باشد.
> تاریخ بررسی: ۲۰۲۶-۰۹ — endpointها بر اساس مستند رسمی هر سرویس.

## معماری (خلاصه)

```text
کاربر → UI → /api/* → CapabilityRouter (src/lib/ai/core/capability-router.ts)
                         ↓ زنجیرهٔ هر قابلیت (free-first)
                     Provider Registry → ارائه‌دهندهٔ انتخابی → خروجی ساخت‌یافته
                         ↓ خطا؟
                     ارائه‌دهندهٔ بعدی (fallback) — خطای پیکربندیِ انتخاب صریح کاربر بی‌صدا fallback نمی‌شود
```

قابلیت‌ها: `text_generation` · `fast_text` · `translation` · `image_generation` · `image_editing` · `speech_to_text` · `text_to_speech` · `embeddings`

---

## ۱. Recommended — وصل‌شده و فعال

| Capability | Provider | Free | API Key | Local | Fallback | Status | متغیر محیطی |
|---|---|---|---|---|---|---|---|
| Text / Fast Text / Translation | **ZAI (دستیار داخلی)** | ✓ (میزبانی پلتفرم) | — | — | groq → gemini → openrouter | **Active** | — (بدون کلید) |
| Text / Translation / Image Gen & Edit | **Google Gemini** | ✓/tier | ✓ | — | groq → openrouter | **Active** (کلید لازم) | `GEMINI_API_KEY` |
| Fast Text / Text | **Groq** | ✓/tier | ✓ | — | zai → gemini | **Active** (کلید لازم) | `GROQ_API_KEY` |
| Text (مدل‌های `:free`) | **OpenRouter** | ✓/tier | ✓ | — | zai → groq | **Active** (BYO کلید+مدل) | `OPENROUTER_API_KEY` (اختیاری) |
| Text / Translation / Embeddings | **Hugging Face Router** | ✓/tier | ✓ | ✓ (مدل متن‌باز) | jina → local | **Active** (کلید لازم) | `HUGGINGFACE_API_KEY` |
| Embeddings | **Jina AI** (`jina-embeddings-v3`) | ✓/tier (۱۰M توکن رایگان) | ✓ | — | local | **Active** (کلید لازم) | `JINA_API_KEY` |
| Text-to-Speech | **Edge Neural TTS** | ✓ (کاملاً رایگان، بی‌کلید) | — | — | zai | **Active** | — |
| Embeddings | **Local hashing** (۲۵۶بعدی، فارسی‌آگاه) | ✓ | — | ✓ | — | **Active** (همیشه) | — |

### ابزارهای محلی مرورگر (بدون شبکه، همیشه واقعی)

| قابلیت | ماژول |
|---|---|
| تحلیل صحنه/لحظهٔ طلایی | `src/lib/video/ai-clipper.ts` |
| تشخیص ضرب و BPM | `src/lib/video/sfx.ts` |
| VAD تشخیص گفتار | `src/lib/video/asr-client.ts` |
| سنتز ۸ افکت صوتی | `src/lib/video/sfx.ts` |
| جست‌وجوی معنایی آفلاین | `src/lib/ai/core/local-embedding.ts` |

### نکته‌های عملیاتی

- **زنجیره‌ها در `CAPABILITY_CHAIN`** تعریف شده‌اند؛ تغییر ترجیح‌ها = تغییر یک ثابت.
- **کلیدها فقط سمت سرور** مصرف می‌شوند؛ کلیدهای BYO از تنظیمات دستیار در هر درخواست ارسال می‌شوند و ذخیرهٔ سمت سرور ندارند.
- **Gemini از سرور منطقه‌بسته است**؛ لایهٔ انتقال `gemini-client.ts` روی بلاک منطقه با relay می‌جنگد و نتیجه را صادقانه گزارش می‌کند (`region`).
- **ASR** فقط موتور پلتفرم است (زنجیرهٔ تک‌عضوی)؛ صداهای پلتفرم با `fa-IR-*` سازگار نیستند و `supports()` رد می‌کند.

## ۲. Optional — معماری پشتیبانی می‌کند، فعلاً غیرفعال

| Provider | قابلیت بالقوه | چرا فعال نشد |
|---|---|---|
| Roboflow | Object Detection / Segmentation | هیچ مسیر UI ای به تشخیص شیء وصل نیست؛ اتصالش بدون مصرف‌کننده واقعی = قابلیتِ نمایشی می‌شد (نقض §31) |
| Clarifai | Vision / tagging | تکرارِ همان قابلیت با Gemini Vision؛ §38: over-integration ممنوع |
| Shotstack | رندر ابری ویدئو | tier رایگانش آب‌نشان می‌گذارد + خروجی 720p؛ موتور محلی منبع حقیقت است (§13/§43) و رندر ابری Adapters آینده است |
| JSON2Video | رندر ابری از template JSON | همان دلیل Shotstack — ارزان نبودن و عدم ضرورت فعلی |
| Freesound | SFX واقعی | OAuth دوپایه + الزام attribution در UI؛ سنتز محلی فعلی بی‌مجوز و بی‌واسطه است. Adapter ساده است هر وقت فعال شد |

## ۳. Rejected — بررسی و رد شد

| Provider | دلیل |
|---|---|
| **CORS relays عمومی به‌عنوان پایپلاین اصلی Gemini** | کلید کاربر از مبدأ ثالث عبور می‌کند؛ فقط در لایهٔ انتقال Gemini به‌عنوان چرخش اضطراری باقی مانده و `via` در پاسخ شفاف است |
| هر API که «رایگانِ اعتباری» دارد ولی card می‌خواهد | §3/§4: تفاوت `UNLIMITED_FREE` و `FREE_TIER` محترم است؛ signup با کارت برای هستهٔ محصول ممنوع |
| APIهای غیرفعال/متروک فهرست public-apis | §39: چند سرویس (از جمله برخی OCRهای معروف فهرست) endpoint مرده یا بدون SLA دارند — با پینگ راستی‌آزمایی شد و رد شدند |

---

## تفاوت FREE و FREE_TIER در کد (§4)

`PricingTier` در `src/lib/ai/core/provider-types.ts`:

```ts
type PricingTier = "free" | "free_tier" | "paid" | "local" | "unknown";
```

- `free` → zai (میزبانی پلتفرم) و edge-tts: بدون کلید، بدون سقف شناخته‌شدهٔ کاربر
- `free_tier` → gemini / groq / openrouter / huggingface / jina: سقف نرخ/سهمیه دارند
- `local` → امبدینگ هش‌شده: مطلقاً آفلاین

پنل تنظیمات (`ProviderStatusPanel`) این طبقه‌بندی را عیناً نشان می‌دهد و دروغ نمی‌گوید:
«وصل / تنظیم نشده / محدودیت نرخ / کلید نامعتبر» فقط از وضعیت واقعی اجرا می‌آید.

## متغیرهای محیطی (§20)

```text
GEMINI_API_KEY=        # اختیاری — fallback سمت سرور برای Gemini
GROQ_API_KEY=          # اختیاری — متن سریع
HUGGINGFACE_API_KEY=   # اختیاری — متن/ترجمه/امبدینگ متن‌باز
JINA_API_KEY=          # اختیاری — امبدینگ عصبی
OPENROUTER_API_KEY=    # اختیاری — fallback سرور (کاربر معمولاً BYO می‌فرستد)
```

اپ بدون همهٔ این‌ها هم کار می‌کند (موتور پلتفرم + ابزارهای محلی).

## جایگزینی Provider بدون بازنویسی (§44 — الزام سخت)

هر ارائه‌دهنده فقط این قرارداد را پیاده می‌کند:

```ts
interface AIProvider {
  id; name; capabilities; pricingTier; requiresApiKey; envKey?; docsUrl;
  supports(cap, req?); isAvailable(key?); healthCheck(key?); verify(key?); execute(req);
}
```

جایگزینی Gemini/Jina/Shotstack = نوشتن یک adapter جدید + یک خط در `CAPABILITY_CHAIN`.
Agent / Timeline / Editor / بانک تمپلیت هیچ وابستگی مستقیمی به نام provider ندارند
(بجز aliasهای قدیمی `engine: "gemini"` که به `prefer` ترجمه می‌شوند).

## تست‌ها

- `npx tsx scripts/test-ai-architecture.ts` — ۳۵ assert: registry، fallback، کش، usage، امبدینگ محلی، گیت صدا، خطاها
- `npx tsx scripts/test-agent.ts` — ۵۶ assert: snapshot، validator، executor، **workflow واقعی Beauty**، پرامپت planner
