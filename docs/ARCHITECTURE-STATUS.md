# Architecture Status — وضعیت معماری پس از ممیزی

> تکمیل‌کنندهٔ `architecture.md` (طرح هدف) و `CURRENT-IMPLEMENTATION-AUDIT.md` (واقعیت کد).
> این سند پاسخ می‌دهد: معماری الان چیست؟ کجا frontend↔backend قطع است؟ GitHub Pages چه می‌دهد و سرور واقعی چه می‌خواهد؟

## ۱) معماری فعلی (واقعیت، نه آرزو)

```text
┌─ کلاینت (PWA / GitHub Pages یا Node standalone) ────────────────────────────┐
│ page.tsx (SPA shell, hash-router) ── unmount کامل در سوییچ تب              │
│   ├─ HomeView ──── IndexedDB projects-db (پروژه‌ها + blob + autosave)      │
│   ├─ VideoStudioView → VideoView                                          │
│   │     ├─ useState<Project> + undo(۶۰ snapshot JSON)                     │
│   │     ├─ EditorEngine (engine.ts) — Canvas2D + rAF + WebAudio graph     │
│   │     ├─ export-advanced.ts — WebCodecs + mp4-muxer (H.264+AAC)         │
│   │     ├─ AgentSheet ── /api/ai/plan → executor → ctx.mutate             │
│   │     └─ sheets (Clip/Media/Ai/More/Dubbing/Keyframe/Templates)         │
│   ├─ TemplateBankView ── بانک ۸۷ + Player + search.ts (محلی) + IDB بانک من│
│   ├─ AssistantView ── /api/assistant (بدون استریم)                         │
│   ├─ DesignStudio / Retouch / Story / Subtitle / Explore                  │
│   └─ transfer.ts (one-shot handoff بین viewها — حافظه)                    │
└──────────────────────────────────────────────────────────────────────────────┘
                │ fetch /api/*  (کلاینت هرگز مستقیم به provider نمی‌زند)
┌─ سرور (فقط در standalone؛ روی Pages وجود ندارد) ────────────────────────────┐
│ ۵ مسیر → CapabilityRouter → ۸ Provider (zai/groq/gemini/openrouter/hf/     │
│          jina/edge-tts/local) + AiCache + AiUsage + AIError + RateLimit    │
│ ۸ مسیر bypass → ZAI.create()/msedge-tts/fetch مستقیم (بدون cache/usage)    │
│ /api/explore → z-ai CLI (execFile)                                        │
│ state سرور: درون‌حافظه فقط (بدون DB)                                        │
└──────────────────────────────────────────────────────────────────────────────┘
Prisma/db.ts: UNUSED · mini-services: خالی · tests/*.sh: BROKEN
```

**نکات معماری مهم:**
- **تک‌منبع حقیقت Project:** همان آبجکت `types.ts:Project` در UI، موتور، undo، autosave و agent استفاده می‌شود — معماری تمیز است و God Component ندارد (VideoView بزرگ است ولی منطق در lib/* لایه‌بندی شده).
- **UI↔منطق جدا:** عملیات خالص در `edit-ops.ts`/`keyframes.ts`/`filters.ts`/`executor.ts` (تست‌پذیر، ۱۵۴ assertion) — این الگو باید حفظ و گسترش یابد.
- **نقطهٔ ضعف معماری ۱:** ۸ مسیر bypass — دو «راه رفتن» برای یک کار.
- **نقطهٔ ضعف معماری ۲:** تنظیمات تک‌کلید BYO (settings.ts) با مدل per-provider معماری ناسازگار است.
- **نقطهٔ ضعف معماری ۳:** unmount در سوییچ تب → persistence فقط برای VideoView.

## ۲) شکاف frontend ↔ backend (§14 درخواست)

الگوی کامل مسیر: `UI → hook/ctx → client logic → API → provider → engine → نتیجه`

| قابلیت | UI | API | Provider | مصرف نتیجه | حکم شکاف |
|---|:-:|:-:|---|:-:|---|
| Agent ادیت | ✓ | ✓ | ✓ | ✓ mutate تایم‌لاین | **بسته** |
| image-gen در Agent/Autovid/Design | ✓ | ✓ | ✓ | ✓ import به پروژه | **بسته** |
| TTS → تایم‌لاین | ✓ | ✓ | ✓ | ✓ AudioItem | **بسته** |
| ASR → کیپشن ادیتور | ✓ | ✓ | ✓ | ✓ TextItem | **بسته** (بدون word-timing) |
| دوبله | ✓ | ✓✓✓ | ✓ | ✓ | **بسته** |
| Embeddings rerank | ✓ | ✓ | ✓ | ✗ کلید اشتباه → عملاً local | **نیمه‌باز** (C3) |
| مدل‌های Gemini | ✓ | ✓ | ✓ | ✗ فلگ fallback نادیده | **نیمه‌باز** |
| Design Studio کلید کاربر | ✓ | ✓ | ✓ | ✗ باگ `gemini.key` + ارسال‌نکردن | **قطع** (باگ مشخص) |
| Explore → ادیتور | ✓ | ✓ | ✓ | ✗ هیچ handoff | **قطع** (تصمیم محصول لازم) |
| Subtitle tool → ادیتور | ✓ | ✓ | ✓ | ✗ دو سیستم موازی | **قطع عمدی فعلاً** |
| چت → اجرای ویرایش | ✓ | ✗ | — | ✗ | **قطع** (عمدی؛ agent جایگزین است) |

## ۳) GitHub Pages — چه چیز کار می‌کند / چه چیز نمی‌کند (§13)

**بیلد استاتیک = صفر API** (`build-phone.sh` مسیر `src/app/api` را برمی‌دارد).

| روی Pages کار می‌کند (کاملاً آفلاین/کلاینت) | روی Pages 404 می‌دهد (کنترل‌شده) |
|---|---|
| بانک ۸۷ قالب + Player + موسیقی/ویدیوی باندل‌شده | Assistant چت · Agent پلن‌گیری |
| ویرایشگر کامل: تایم‌لاین، کی‌فریم، فیلتر، ماسک، کروما | image-gen / image-edit (AI) |
| **خروجی MP4 کامل (WebCodecs) + میکس صدا** | transcribe / translate / دوبله / TTS |
| SFX سنتز، Beat detection، Reverse، Freeze، Stabilize | Explore · مدل‌ها · status |
| جست‌وجوی بانک (لایهٔ محلی)، بانک من IDB، Retouch دستی، Story، Subtitle دستی | لایهٔ ۲ جست‌وجو (Jina) |
| پروژه‌ها (IDB)، autosave، PWA نصب‌پذیر آفلاین | |

پیام‌های خطای این مسیرها فارسی و کنترل‌شده‌اند (crash نیست). **فرچunte:** SW رسانه‌ها را کش می‌کند → بانک بعد از اولین بازدید آفلاین است.

## ۴) برای «سرور production واقعی» چه لازم است؟ (M در گزارش نهایی)

همین مخزن standalone build دارد (`npm run build && npm start`)؛ لیست حداقلی برای production:

1. **متغیرهای env**: `GEMINI_API_KEY` / `GROQ_API_KEY` / `JINA_API_KEY` / `HUGGINGFACE_API_KEY` / `OPENROUTER_API_KEY` (همه اختیاری بجز zai پلتفرمی) — `.env.example` کامل است.
2. **پروکسی معکوس** که `X-Forwarded-For` واقعی ست کند (وگرنه rate limit دورزدنی است — M-1).
3. **اصلاحات امنیتی بخش ۷ همین سند** (کلید در هدر، سقف بدنه، rate limit همهٔ مسیرها) — انجام شد.
4. **Persistence اختیاری**: فعلاً هیچ DB لازم نیست (پروژه‌ها سمت کلاینت)؛ وقتی حساب کاربری/اشتراک آمد → Prisma از نو طراحی شود (M11/P3).
5. **CI + npm test** تا استقرار گیت کیفیت داشته باشد (M5).
6. **CORS/domains**: رله‌های corsfix فقط برای geo-block Gemini؛ در سرور با IP غیرمسدود یا مسیر رسمی، حذفشان امن‌تر است.

## ۵) آنچه روی Pages فیزیکاً ناممکن است (N در گزارش نهایی)

- هر قابلیتی که کلید API لازم دارد و کلید نباید در باندل کلاینت بیاید (تمام AI، ASR، TTS، ترجمه، image gen/edit) — مگر اینکه کاربر کلیدش را در مرورگر وارد کند و سرورِ واسط… که خودش API می‌خواهد → ناممکن.
- `/api/explore` (نیازمند binary سمت سرور).
- Rate limiting واقعی و دفاع DoS.
- آیندهٔ multi-user (حساب/اشتراک/سی‌وِیو) — نیازمند سرور و DB.

**جمع‌بندی معماری:** ستون فقرات (موتور کلاینت + router سرور) سالم و واقعی است. سه جراحی رتبهٔ بعد: وحدت مسیرها (bypass→router)، کلید per-provider، و persistence تعمیم‌یافته بین تب‌ها.
