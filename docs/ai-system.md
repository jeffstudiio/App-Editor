# AI System

## معماری Provider (نسل ۲ — پیاده‌شده)

ساختار کد:

```text
src/lib/ai/
  core/
    provider-types.ts      # قرارداد AIProvider، قابلیت‌ها، PricingTier
    provider-registry.ts   # ثبت/واکشی
    capability-router.ts   # زنجیره‌های free-first + fallback + کش
    ai-errors.ts           # AIError تایپ‌دار با پیام فارسی
    ai-cache.ts            # کش TTL/LRU برای متن/امبدینگ
    ai-usage.ts            # شمارندهٔ واقعی مصرف/خطا/تأخیر
    local-embedding.ts     # امبدینگ آفلاین (hashing + مترادف فارسی)
  providers/               # ۸ adapter واقعی: zai, gemini, openrouter,
                           # groq, huggingface, jina, edge-tts, local
  server/                  # singleton رجیستری، rate-limit، route helpers
  agent/
    commands.ts            # کاتالوگ ۲۴ دستور واقعی + zod
    plan-schema.ts         # validator برنامه (zod + بررسی زمینه)
    executor.ts            # اجرای sync خالص + درج رسانهٔ واقعی
    planner-prompt.ts      # پرامپت planner + repair loop
  client/settings.ts       # BYO creds از تنظیمات دستیار
  search.ts                # جست‌وجوی معنایی بانک (محلی + Jina اختیاری)
```

جزئیات کامل providerها و ماتریس: **`docs/AI-PROVIDERS.md`**

## قابلیت‌های REAL امروز

| قابلیت | مسیر | Provider (زنجیره) |
|---|---|---|
| چت ۴ پرسونا | `/api/assistant` → router | zai → groq → gemini → openrouter |
| تولید/ویرایش تصویر | `/api/image-gen` `/api/image-edit` → router | zai → gemini (یا انتخاب صریح gemini) |
| زیرنویس خودکار | `asr-client` (VAD محلی) → `/api/transcribe` | zai ASR |
| دوبله/ترجمه | `/api/translate` + `/api/edge-tts` | zai + Edge Neural |
| ویدئوساز خودکار | `/api/script-scenes` → image-gen → edge-tts | zai |
| **عامل تدوین** | `/api/ai/plan` + `AgentSheet` | zai → groq → gemini → openrouter |
| جست‌وجوی معنایی بانک | `search.ts` → `/api/ai/embeddings` | jina → local |
| TTS | `/api/tts` `/api/edge-tts` | zai / Edge (بی‌کلید) |
| وضعیت providerها | `/api/ai/status` + `ProviderStatusPanel` | — |

## AI Editing Agent — پیاده‌شده (قبلاً Milestone 6 بود)

```text
دستور فارسی کاربر + snapshot تایم‌لاین + پک زیبایی
   ↓ /api/ai/plan (jsonMode + repair loop با خطاهای فارسی validator)
plan: {intent, summary, aspectRatio?, operations[≤25], notes?}
   ↓ validatePlan (zod هر دستور + شناسه‌ها علیه پروژهٔ زنده)
پیش‌نمایش فارسی در AgentSheet → تأیید کاربر
   ↓ applySyncPlan داخل یک ctx.mutate (یک undo واحد)
عملیات ناهمگام: add_music / add_sfx / generate_image / generate_voice
   ← سرویس‌های واقعی: بانک موسیقی، سنتز SFX، image-gen، edge-tts
نتیجهٔ هر عملیات صادقانه گزارش می‌شود (✓/✗ + پیام)
```

۲۴ دستور واقعی: set_aspect, apply_filter, adjust_color, add_title, style_titles,
set_caption_style, clear_captions, trim_clip, split_clip, remove_clip, move_clip,
duplicate_clip, change_speed, add_transition, set_fades, set_volume, duck_music,
add_marker, add_keyframe, remove_keyframe, add_music*, add_sfx*, generate_image*,
generate_voice* (* = ناهمگام با سرویس واقعی)

## Creative Packs (§25)

`src/lib/creative-packs/` — پک = داده/پیکربندی خالص؛ هسته نام پک را نمی‌داند.
پک فعلی: **beauty** (فیلتر/زیرنویس/SFX/موسیقیِ واقعی بانک + ۴ workflow آماده + مترادف جست‌وجو).
پک جدید = یک فایل export جدید + یک `register()`.

## امنیت (پیاده‌شده)

- کلیدها فقط سمت سرور؛ BYO در body درخواست و در باندل نمی‌نشیند
- rate limit توکن‌سطری per-IP برای chat/heavy/light (`server/rate-limit.ts`)
- سقف حجم بدنه: transcribe ۱۶MB (رسانه ≤۱۰MB)، image-edit ۱۲MB (≤۸MB)، plan ۵۱۲KB
- اعتبارسنجی سختِ خروجی AI (validator) قبل از اجرا؛ اجرای دستور دلخواه ممنوع
- سقف عملیات plan ≤ ۲۵؛ پاکسازی snapshot ورودی

## تست‌ها

```bash
npx tsx scripts/test-ai-architecture.ts   # ۳۵ assert — router/fallback/cache/usage
npx tsx scripts/test-agent.ts             # ۵۶ assert — validator/executor/Beauty E2E
npx tsx scripts/test-core-engine.ts       # ۶۳ assert — هستهٔ ادیتور
```
