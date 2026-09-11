# Reality Matrix — وضعیت واقعی هر قابلیت

> مبنا: کد، نه README. ستون‌ها: UI کاربر-رو · Engine (منطق/پردازش) · API (سمت سرور) · Provider · نتیجهٔ واقعی سراسر-زنجیره · حکم نهایی.
> تعریف حکم‌ها همانند CURRENT-IMPLEMENTATION-AUDIT.md است.
> **به‌روزرسانی Sprint تبدیل محصول:** کراپ ✓ REAL · کارائوکه ✓ REAL · موشن قالب ✓ REAL · بین‌ترک/z-order/Replace ✓ REAL · CI ✓ — جزئیات: CURRENT-STATUS.md

## A) هوش مصنوعی

| Feature | UI | Engine | API | Provider | Real Result | Status |
|---|:-:|:-:|:-:|---|:-:|---|
| چت دستیار (۴ پرسونا) | ✓ | ✓ | ✓ | zai→groq→gemini→openrouter→hf | ✓ | **REAL** (بدون استریم/پیوست) |
| انتخاب مدل Gemini | ✓ | ✓ | ✓ | gemini | ✓ | **PARTIAL** — fallback ثابت به‌جای «لایو» جشن گرفته می‌شود |
| انتخاب مدل OpenRouter | ✓ | ✓ | ✓ | openrouter | ✓ | **REAL** |
| پنل وضعیت Providerها + تست اتصال | ✓ | ✓ | ✓ | همه (verify واقعی) | ✓ | **REAL** (zai از پیش سبز) |
| AI Agent (پلن→اعتبارسنجی→اجرا) | ✓ | ✓ | ✓ | zai/groq/gemini/openrouter | ✓ | **REAL** |
| ۲۹ دستور ادیتوری | ✓ | ✓ | — (سمت کلاینت) | ۴تای async سرویس واقعی | ✓ | **REAL** (۲۹/۲۹ — +کراپ/تعویض/بین‌ترک) |
| ویرایشگر پیشنهادی قدیمی (/api/edit-plan) | ✓ | ✓ | ✓ | zai مستقیم | ✓ | **PARTIAL** — بدون zod، همپوشان با agent |
| تولید تصویر (داخلی) | ✓ | ✓ | ✓ | zai→gemini | ✓ | **REAL** |
| تولید تصویر (Nano-Banana) | ✓ | ✓ | ✓ | gemini (رله در geo-block) | ✓ | **REAL** (DesignStudio کلید کاربر را نمی‌فرستد — باگ) |
| ویرایش تصویر با AI (Retouch) | ✓ | ✓ | ✓ | zai→gemini | ✓ | **REAL** |
| TTS عصبی (Edge) | ✓ | ✓ | ✓ | msedge-tts | ✓ | **REAL** (provider مسیر bypass است) |
| TTS پلتفرم (/api/tts) | ✓ | ✓ | ✓ | zai مستقیم | ✓ | **REAL** |
| ASR (رونویسی) | ✓ | ✓ | ✓ | zai مستقیم | ✓ | **REAL** — segment-level، بدون word-timing |
| هایلایت کارائوکه کلمه‌به‌کلمه | ✓ | ✓ | — | — | ✓ | **REAL** — هم‌ترازی انرژی صدا (word-align.ts)؛ بدون envelope → نسبتیِ برچسب‌خورده |
| ترجمهٔ زیرنویس/دوبله | ✓ | ✓ | ✓ | zai مستقیم | ✓ | **REAL** |
| جست‌وجوی معنایی — لایهٔ محلی | ✓ | ✓ | — (کلاینت) | local-embedding | ✓ | **REAL** |
| جست‌وجوی معنایی — rerank سرور | ✓ | ✓ | ✓ | jina→local | ~ | **PARTIAL** — کلید per-provider حل شد؛ Pages: فقط محلی |
| تشخیص ضرب (BPM/مارکر) | ✓ | ✓ | — | — | ✓ | **REAL** (تحلیل صوت) |
| «تحلیل صحنه» AI Clipper | ✓ | ✓ (فقط صدا) | — | — | ✓ | **PARTIAL** — برچسب اصلاح شد به «تحلیل انرژی صدا»؛ تحلیل بصری ندارد |
| Autovid (سناریو→ویدیو) | ✓ | ✓ | ✓ | zai+image-gen+TTS | ✓ | **REAL** |
| AI Extend (ادامهٔ کلیپ) | ✓ | ✓ | ✓ | image-gen | ✓ | **REAL** |

## B) ویرایشگر ویدیو

| Feature | UI | Engine | API | Provider | Real Result | Status |
|---|:-:|:-:|:-:|---|:-:|---|
| تایم‌لاین ۵ لایه (کلیپ/overlay/متن/صدا/مارکر) | ✓ | ✓ | — | — | ✓ | **REAL** (بدون ترک دلخواه چندگانه) |
| تریم/برش/حذف(+ripple)/تکثیر/جابه‌جایی | ✓ | ✓ | — | — | ✓ | **REAL** |
| انتقال کلیپ بین ترک‌ها | ✓ | ✓ | — | — | ✓ | **REAL** — to_overlay / to_main_track (با برش خودکار) |
| z-order / چندلایهٔ overlay | ✓ | ✓ | — | — | ✓ | **REAL** — جلو/عقب/جلوتترین/عقب‌ترین |
| Replace source | ✓ | ✓ | — | — | ✓ | **REAL** — هم‌نوع با clamp تریم؛ فرمان agent با validator |
| Crop | ✓ (شیت + پریست) | ✓ | — | — | ✓ | **REAL** — preview + MediaRecorder + WebCodecs (P0 حل شد) |
| سرعت 0.25–4× | ✓ | ✓ | — | — | ✓ | **REAL** |
| Reverse | ✓ | ✓ (lossy) | — | — | ✓ | **PARTIAL** (12fps/480px/≤10s/بی‌صدا) |
| Freeze / Stabilize / Extend | ✓ | ✓ | — | — | ✓ | **REAL** |
| Detach audio | ✓ | ✓ | — | — | ✓ | **REAL** |
| کی‌فریم (scale/x/y/rotate/opacity) | ✓ | ✓ | — | — | ✓ | **REAL** — فقط ۵ پراپرتی transform |
| Graph/Curve editor | ✗ | — | — | — | ✗ | **MISSING** |
| فیلترها/رنگ (۸ پارامتر + presets) | ✓ | ✓ | — | — | ✓ | **REAL** (پیش‌نمایش و خروجی) |
| ماسک (۴ شکل + feather) | ✓ | ✓ | — | — | ✓ | **REAL** |
| Chroma key | ✓ | ✓ | — | — | ✓ | **REAL** (سنگین — getImageData هر فریم) |
| ترنزیشن‌ها | ✓ | ✓ | — | — | ✓ | **PARTIAL** — فقط ورودی؛ cross-dissolve بین دو کلیپ نیست |
| Undo/Redo | ✓ | ✓ | — | — | ✓ | **PARTIAL** — هر تیک اسلایدر یک entry |
| خروجی MP4 فریم‌دقیق | ✓ | ✓ | — | — | ✓ | **REAL** (WebCodecs+mp4-muxer، H.264+AAC) |
| 60fps / WebM / VP9 / HEVC | ✓ (60fps جدید) | ✓ (60fps) | — | — | ~ | **PARTIAL** — ۶۰fps اضافه شد؛ WebM/VP9/HEVC MISSING (P3) |
| میکس صدا در خروجی | ✓ | ✓ | — | — | ✓ | **REAL** |
| SFX سنتز (۸ افکت) | ✓ | ✓ | — | — | ✓ | **REAL** |
| Beat Sync (برش روی ضرب) | ✓ | ✓ | — | — | ✓ | **REAL** — مارکر + دکمهٔ برش روی نشانگرها (C8 حل شد) |
| دوبلهٔ فارسی→زبان | ✓ | ✓ | ✓ | zai+edge-tts | ✓ | **REAL** |
| زیرنویس در ادیتور (ASR→استایل→burn-in) | ✓ | ✓ | ✓ | zai | ✓ | **REAL** — با کارائوکهٔ واقعی کلمه‌به‌کلمه |
| خروجی SRT | ✓ | ✓ | — | — | ✓ | **REAL** — VTT هم اضافه شد (C5 حل شد) |
| Proxy media | ✗ | — | — | — | ✗ | **MISSING** |
| تایم‌لاین مجازی‌شده | ✗ | — | — | — | ✗ | **MISSING** |

## C) بانک قالب و پک

| Feature | UI | Engine | API | Provider | Real Result | Status |
|---|:-:|:-:|:-:|---|:-:|---|
| ۸۷ قالب / ۱۰ دسته | ✓ | ✓ | — | — | ✓ | **REAL** |
| پخش‌کنندهٔ قالب (ویدیو+موسیقی+موشن+FX) | ✓ | ✓ | — | — | ✓ | **REAL** |
| Scrubbing دقیق | ✓ | ~ | — | — | ✗ | **PARTIAL** — ویدیو به 0 ریست می‌شود |
| جست‌وجو (واژگانی+معنایی محلی) | ✓ | ✓ | — | — | ✓ | **REAL** |
| بانک من (IndexedDB) | ✓ | ✓ | — | — | ✓ | **REAL** |
| Export JSON قالب سفارشی | ✓ | ✓ | — | — | ✓ | **REAL** |
| Import فایل JSON | ✗ | — | — | — | ✗ | **MISSING** (فقط URL ریموت) |
| ماندگاری جایگزینی کاربر روی قالب stock | ✗ | — | — | — | ✗ | **UI_ONLY** — session-only |
| اعمال قالب به ادیتور | ✓ | ✓ | — | — | ✓ | **REAL** — scene.motion → کی‌فریم واقعی (MOCK قبلی حل شد؛ فقط ۳ موشن فیلتری transform-only) |
| Beauty pack | ✓ | ✓ | ✓ (planner) | — | ✓ | **REAL** — workflows فقط ۴ پرامپت آماده |

## D) ابزارهای دیگر

| Feature | UI | Engine | API | Provider | Real Result | Status |
|---|:-:|:-:|:-:|---|:-:|---|
| Retouch (اسلایدرها+AI+خروجی) | ✓ | ✓ | ✓ | zai/gemini | ✓ | **REAL** |
| Story (لایه/motion/PNG 1080) | ✓ | ✓ | — | — | ✓ | **REAL** — بدون persistence |
| Subtitle Tool مستقل | ✓ | ✓ | ✓ | zai | ✓ | **REAL** — ادغام ادیتور ندارد |
| Design Studio | ✓ | ✗ (فقط مولد) | ✓ | zai/gemini | ~ | **PARTIAL** — Canvas/لایه/تایپوگرافی **MISSING** + ۲ باگ کلید |
| Explore | ✓ | ✓ (CLI) | ✓ | z-ai image-search | ✓ | **REAL** viewer — بدون لایسنس‌نوت/بدون ادغام |
| HomeView (پروژه‌ها) | ✓ | ✓ | — | — | ✓ | **REAL** |

## E) زیرساخت

| Feature | Status | شاهد |
|---|---|---|
| PWA (manifest/SW/basePath) | **REAL** | `manifest.json` کامل؛ SW network-first؛ نصب‌پذیر |
| Prisma + db.ts | **UNUSED** | هیچ importerای برای db.ts |
| tests/*.sh | **BROKEN** | هدف `.zscripts` وجود ندارد |
| `/api` (hello world) | **UNUSED** | هیچ فراخوانی کلاینت |
| Rate limit | **PARTIAL** | ۸ مسیر پوشش، ۸ مسیر بدون پوشش؛ دورزدنی |
| کلید per-provider (R1) | **REAL** | نقشهٔ keys → هر کلید فقط به صاحبش |
| CI / npm test | **REAL** | .github/workflows/ci.yml — tsc+lint+test |
| گیت تایپ در build | **PARTIAL** | `ignoreBuildErrors: true` همیشگی |

## شمارش نهایی حکم‌ها (features ارزیابی‌شده: ~۷۵)

| حکم | تعداد (قبل → بعد Sprint) | نمونه‌های مهم |
|---|:-:|---|
| REAL | ~۵۲ → **~۶۰** | Agent ۲۹تایی، خروجی WebCodecs، بانک ۸۷تایی، کراپ، کارائوکهٔ واقعی، بین‌ترک |
| PARTIAL | ~۱۲ → ~۱۰ | Assistant، Health، Undo، Reverse، 60fps-only |
| MOCK | ۲ → **۰** | هر دو MOCK (کارائوکه، موشن قالب) حل شد |
| UI_ONLY | ۲ | StudioHub (طبیعی)، ماندگاری جایگزینی‌های بانک stock |
| BROKEN | ۱ → ۰ | tests/*.sh حذف شد |
| UNUSED | ۳ | Prisma/db.ts، /api ریشه (حذف شد)، EdgeTtsProvider (به‌عنوان provider) |
| MISSING | ~۱۲ → ~۸ | باقی: Graph editor، WebM/VP9، Proxy، Virtualized timeline، Import JSON، Persistence ابزارها |

**جمع‌بندی صادقانه:** این پروژه «نمای صندلی حرفه‌ای» نیست — موتورهای اصلی واقعاً کار می‌کنند و مسیر frontend→engine→result در قابلیت‌های اصلی بسته است. دروغ‌های نسخهٔ قبلی (هایلایت کارائوکه، موشن‌های قالب، کراپ غایب) همگی با پیاده‌سازی واقعی جایگزین شدند؛ باقی‌مانده‌ها برچسب صادقانه دارند.
