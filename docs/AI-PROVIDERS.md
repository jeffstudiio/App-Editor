# AI Providers — ماتریس واقعی ارائه‌دهنده‌ها (بازبینی ممیزی ۲۰۲۶-۰۹-۱۱)

> این سند پس از راستی‌آزمایی خط‌به‌خط کد نوشته/به‌روز شده است. هیچ مقدار «حدسی» در جدول‌ها نیست.
> جزئیات شواهد: `CURRENT-IMPLEMENTATION-AUDIT.md §۱-۲` · ماتریس: `REALITY-MATRIX.md §A`

## معماری (خلاصه)

```text
کاربر → UI → /api/* → CapabilityRouter (src/lib/ai/core/capability-router.ts)
                         ↓ زنجیرهٔ هر قابلیت (free-first)
                     Provider Registry (۸ ارائه‌دهنده) → Provider انتخابی → خروجی ساخت‌یافته
                         ↓ خطا؟
                     ارائه‌دهندهٔ بعدی (fallback) — خطای پیکربندیِ انتخاب صریح کاربر بی‌صدا fallback نمی‌شود
```

## زنجیره‌های واقعی (`CAPABILITY_CHAIN`، `capability-router.ts:15-24`)

```text
text_generation:  zai → groq → gemini → openrouter → huggingface
fast_text:        zai → groq → gemini → openrouter
translation:      zai → gemini → groq → openrouter      ← مرده: هیچ مسیری از router عبور نمی‌کند
image_generation: zai → gemini
image_editing:    zai → gemini
embeddings:       jina → local                           ← free-first نقض شده (اول کلیددار)
text_to_speech:   edge-tts → zai                         ← مرده: مسیر واقعی /api/edge-tts کپی مستقیم است
speech_to_text:   zai                                    ← مرده: /api/transcribe مستقیم
```

## ماتریس providerها (بعد از ممیزی)

| Provider | تماس واقعی | قابلیت‌های پیاده‌شده | مصرف واقعی در اپ | حکم | یادداشت ممیزی |
|---|---|---|---|---|---|
| **ZAI (داخلی)** | ✓ سرور-ساید، بی‌کلید | text/fast/translate/ImgGen/ImgEdit/ASR/TTS | ۵ مسیر router + ۵ مسیر bypass | **REAL** | `healthCheck` همیشه available (`zai.ts:61-63`) — باید صادقانه شود |
| **Gemini** | ✓ `generateContent` (+رله در geo-block) | text/fast/translate/ImgGen/ImgEdit | prefer از UI؛ image-gen/edit | **REAL** | کلید در URL → رله ثالث (HIGH)؛ مدل پیش‌فرض در کاتالوگ عمومی نیست؛ چت auto-404 ندارد |
| **Groq** | ✓ OpenAI-compatible | text/fast/translate | فقط با `GROQ_API_KEY` env؛ UI prefer ندارد | **REAL / env-only** | عضو واقعی زنجیره |
| **OpenRouter** | ✓ + هدر Referer | text/fast/translate (شرط req.model) | مسیر اصلی BYO | **REAL** | بدون model → skip بی‌ردی در attempts |
| **Hugging Face** | ✓ chat+embeddings+whoami | ۳ قابلیت اعلان‌شده | عملاً هیچ (تلهٔ تک‌کلید + خارج از زنجیرهٔ embeddings) | **REAL / PRACTICALLY UNUSED** | نگهداری می‌شود؛ اشکال در سیم‌کشی کلید است |
| **Jina** | ✓ `api.jina.ai/v1/embeddings` | embeddings | #۱ زنجیرهٔ embeddings | **REAL / سیم‌کشی کلید معیوب** | کلاینت کلید gemini/openrouter می‌فرستد (`search.ts:84`) |
| **Edge-TTS** | ✓ msedge-tts → wss بینگ | TTS (گیت صدا fa-IR) | provider هرگز از router رد نمی‌شود؛ مسیر واقعی route کپی است | **REAL / UNUSED به‌عنوان provider** | R6: route از provider استفاده کند |
| **Local** | بدون شبکه — hashing قطعی ۲۵۶بعدی | embeddings | fallback همیشه-فعال + مصرف کلاینتی | **REAL** | free-first واقعی embeddings همین است که اول نیست |

### ابزارهای محلی مرورگر (بدون شبکه، همیشه واقعی)

| قابلیت | ماژول | حکم ممیزی |
|---|---|---|
| «تحلیل صحنه/لحظهٔ طلایی» | `src/lib/video/ai-clipper.ts` | واقعی اما **فقط تحلیل صوت** — برچسب UI اغراق است |
| تشخیص ضرب و BPM | `src/lib/video/sfx.ts` | واقعی (انرژی-فلوکس) |
| VAD تشخیص گفتار | `src/lib/video/asr-client.ts` | واقعی (segment-level، ≤۲۶ بخش/۵ دقیقه) |
| سنتز ۸ افکت صوتی | `src/lib/video/sfx.ts` | واقعی (OfflineAudioContext) |
| جست‌وجوی معنایی آفلاین | `src/lib/ai/core/local-embedding.ts` | واقعی و قطعی |

## نقشهٔ مسیرها — چه کسی از معماری عبور می‌کند؟

| مسیر | مسیر اجرای AI | router؟ |
|---|---|:-:|
| `/api/assistant` | router · text_generation | ✅ |
| `/api/ai/plan` | router · fast_text (×۲ تلاش ترمیم) | ✅ |
| `/api/ai/embeddings` | router · embeddings | ✅ |
| `/api/image-gen` / `/api/image-edit` | router · image_* | ✅ |
| `/api/ai/status` | registry + verify واقعی | ✅ |
| `/api/translate` `/api/edit-plan` `/api/script-scenes` `/api/tts` `/api/transcribe` | `ZAI.create()` مستقیم | ❌ |
| `/api/edge-tts` | msedge-tts مستقیم (کپی provider) | ❌ |
| `/api/gemini/models` `/api/openrouter/models` | fetch مستقیم | ❌ |
| `/api/explore` | CLI خارجی (execFile) | ❌ |

## اصلاحات تعیین‌شده توسط ممیزی (به ترتیب)

1. **H-1 امنیتی:** کلید Gemini از query-string به هدر `x-goog-api-key` منتقل شود (حداقل برای کاندیداهای رله) — کلید کاربر نباید از پروکسی ثالث عبور کند.
2. **R1:** کلید per-provider (gemini/openrouter/jina/…) — پایان تلهٔ تک‌کلید.
3. **R3:** کلید کش بدون apiKey + انتساب صحیح provider در cache-hit.
4. **R2:** سقف بدنه + rate limit برای ۸ مسیر بی‌پوشش.
5. **embeddings free-first واقعی:** local اول، jina بعد (یا jina فقط وقتی کلید جینا هست).
6. **R4:** منبع واحد مدل‌ها (`model-defaults.ts`) + auto-404 برای چت.
7. **zai healthCheck صادقانه** (unknown به‌جای available).

## تست‌ها

۳ سوییت دستی (tsx): `test-ai-architecture.ts` (۳۵) · `test-agent.ts` (۵۶) · `test-core-engine.ts` (۶۳) = **۱۵۴ assertion سبز** — بدون CI (گپ M5 در GAP-ANALYSIS).
