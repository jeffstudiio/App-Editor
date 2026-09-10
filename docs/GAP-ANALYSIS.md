# Gap Analysis — آنچه باید ساخته / تکمیل / refactor / حذف شود

> ورودی: CURRENT-IMPLEMENTATION-AUDIT.md + REALITY-MATRIX.md
> قاعده: **هیچ چیزِ واقعی و کارکردی بدون دلیل خراب نشود.** اولویت‌بندی: P0 حیاتی → P1 هسته → P2 مهم → P3 آینده.

> ✅ **وضعیت Sprint تبدیل محصول (به‌روز):** A2 (کراپ واقعی) · A3 · B1 (C2 موشن قالب→کی‌فریم) · B2 (M2 بین‌ترک+z-order+replace) · B3 (C1/M6 کارائوکهٔ واقعی با word-align انرژی‌محور) · B4 (M5 CI) · B5 (R1 کلید per-provider) — **همه انجام شد.** P2 سریع: C5 (VTT) · C8 (برش روی مارکر) · M3 نیمه (60fps) · برچسب صادقانهٔ C9 — انجام شد. باقی: C3/C4/C6/C7 + M3 WebM/M4/M7/M8/M9/M10 (P2) و فاز Platform (P3). جزئیات: CURRENT-STATUS.md

---

## ۱) Already complete — به این‌ها دست نزنید

| مورد | چرا |
|---|---|
| معماری Provider Router + Fallback + AIError + ۸ provider | واقعی و تست‌شده است؛ فقط عیب‌های نقطه‌ای‌اش را در §۲ می‌بندیم |
| AI Agent: ۲۴ دستور + zod + حلقهٔ ترمیم + executor صادقانه | کامل‌ترین مسیر پروژه (تست ۵۶ assertion) |
| خروجی WebCodecs + mp4-muxer + میکس AAC | سخت‌ترین بخش کار کرده؛ فقط pause-before-export و await reverse-frames |
| موتور پیش‌نمایش Canvas + کی‌فریم ۵ پراپرتی + فیلتر/ماسک/کروما | کیفیت خوب؛ گسترش سطح (نه بازنویسی) |
| بانک ۸۷ قالب + sanitizer + Player + بانک من IDB | دیتا و کد سالم؛ صفر لینک شکسته |
| جست‌وجوی معنایی لایهٔ محلی (hashing قطعی) | آفلاین و قطعی؛ لایهٔ ۲ فقط needs-completion است |
| دوبلهٔ end-to-end + SFX سنتز + Beat detection | زنجیرهٔ واقعی و کامل |
| Retouch / Story / Subtitle tool | ابزارهای واقعی؛ فقط persistence می‌خواهند |
| PWA + basePath + بیلد دورشته‌ای (standalone/export) | روی Pages تأیید شده |

## ۲) Needs completion — نیمه‌کاره‌هایی که کامل می‌کنیم

| # | مورد | وضعیت امروز | تعریف «کامل» | اولویت |
|---|---|---|---|---|
| C1 | ورد-تایمینگ زیرنویس | کارائوکه MOCK (نسبتی) | word-timing واقعی از ASR یا forced-alignment محلی؛ در خروجی هم اعمال شود | **P1** |
| C2 | scene.motion در تحویل قالب→ادیتور | ساکت drop می‌شود (`bank-apply.ts:158-177`) | موشن kenburns/pan/… به Clip کی‌فریم تبدیل شود | **P1** (بزرگ‌ترین شکاف وعده/واقعیت) |
| C3 | لایهٔ ۲ جست‌وجو (Jina) | کلید BYO اشتباه می‌رسد | routing کلید per-provider + fail صریح وقتی کلید جینا نیست | **P2** |
| C4 | Assistant | بدون استریم/پیوست؛ fallback جشن گرفته می‌شود | SSE streaming + نمایش صادقانهٔ `fallback:true` + پیوست تصویر | **P2** |
| C5 | زیرنویس در ادیتور | فقط SRT | خروجی VTT (+ASS اختیاری) از همان TextItemها | **P2** |
| C6 | undo اتمیک Agent + coalescing اسلایدر | هر تیک یک entry؛ async چند undo | یک mutate برای کل پلن (sync+async) + debounce تاریخ | **P2** |
| C7 | persistence ابزارها | Story/Subtitle/Design/Retouch با خروج می‌میرند | الگوی autosave موجود VideoView تعمیم یابد | **P2** |
| C8 | Beat Sync | فقط مارکر | برش اختیاری روی مارکرها (split-at-markers) | **P2** |
| C9 | «تحلیل صحنه» بصری | فقط انرژی صوت | تشخیص برش بصری (histogram diff) به ai-clipper اضافه شود یا برچسب اصلاح شود | **P2** |

## ۳) Needs refactoring — کار می‌کند ولی معماری ضعیف دارد

| # | مورد | مشکل | اقدام |
|---|---|---|---|
| R1 | **تک‌کلید BYO مشترک** (`registry.ts:37-40`) | کلید Gemini/OpenRouter به HF/Jina هم داده می‌شود → 401 تضمینی + سایه‌انداختن روی env | نگاشت per-provider key: `{gemini:…, openrouter:…, jina:…}` در settings؛ envResolver قبل از BYO، تعلق کلید را چک کند | 
| R2 | **۸ مسیر bypass از router** | translate/tts/transcribe/edit-plan/script-scenes/edge-tts/models* بدون کش/آمار/fallback | تمرکز: حداقل rate limit + سقف بدنه برای همه (فوری)؛ مهاجرت تدریجی به router |
| R3 | کش نادرست + apiKey در کلید کش | hit به `prefer??"zai"` منتسب می‌شود؛ کلید خام در رشتهٔ کلید | انتساب از attempts واقعی؛ hash/strip apiKey |
| R4 | نام مدل‌های Gemini ثابت و بیرون از منبع واحد | ۳ بار `GEMINI_BASE`؛ hardcode در دو View؛ 404 مسیر چت رینیم ندارد | همه از `model-defaults.ts`؛ auto-follow 404 به چت هم بیاید |
| R5 | undo با اسنپ‌شات JSON×۶۰ | حافظه + flooding | coalescing زمانی + سقف هوشمند |
| R6 | دوباره‌نویسی منطق edge-tts در route و provider | کپی یکسان | route از provider استفاده کند |
| R7 | executor و edit-ops همپوشانی | trim دوبار پیاده شده | یک منبع حقیقت برای عملیات |

## ۴) Needs replacement — بهتر است عوض شود

| مورد | جایگزین |
|---|---|
| `tests/*.sh` (هدف ناموجود `.zscripts`) | حذف؛ جایگزین: `npm test` = اجرای ۳ اسکریپت tsx + (آینده: vitest) |
| `/api` hello world | حذف |
| اسکیممای Prisma بویلرپلیت + db.ts | حذف از باندل/وابستگی‌ها تا وقتی سرور multi-user ساخته شود (دادهٔ واقعی: IndexedDB) — در فاز Platform (P3) دوباره طراحی می‌شود |
| `typescript.ignoreBuildErrors: true` | false + exclude کردن `skills/` از tsconfig (گیت تایپ واقعی) |

## ۵) Missing — وجود ندارد (به ترتیب اولویت)

| # | قابلیت | اولویت | یادداشت |
|---|---|---|---|
| M1 | **Crop واقعی** (و رفع برچسب گمراه‌کنندهٔ آیکون Crop) | **P0** | وعدهٔ UI بدون موتور = تعارض با NO-FAKE |
| M2 | جابه‌جایی کلیپ بین ترک‌ها + z-order overlay + Replace source | **P1** | قلب workflow حرفه‌ای NLE |
| M3 | 60fps و WebM/VP9 در خروجی WebCodecs | **P2** | codec string negotiation موجود است؛ افزودن گزینه |
| M4 | Graph/Curve editor کی‌فریم | **P2** | موتور ارزیابی موجود؛ فقط UI |
| M5 | CI + npm test | **P1** | گیت کیفیت؛ بدون آن ۱۵۴ تست فقط آرشیوند |
| M6 | word-level ASR / forced alignment | **P1** → C1 | پایهٔ کارائوکه واقعی |
| M7 | Proxy media + virtualized timeline | **P2** | برای پروژه‌های بزرگ/۴K |
| M8 | Import فایل JSON به بانک من | **P2** | export موجود؛ قرینه‌اش نیست |
| M9 | لایه‌بندی Design Studio (Canvas+Text) | **P2** | StoryView تقریباً همین موتور را دارد — قابل استفادهٔ مجدد |
| M10 | یادداشت لایسنس/اتریبیوشن در Explore | **P2** | الزام حقوقی-اخلاقی تصاویر hotlink |
| M11 | حذف DB چند-کاربره (Cloud/Marketplace/کولب) | **P3** | فاز Platform |
| M12 | Rendering سمت سرور (FFmpeg روی سرور) | **P3** | خروجی مرورگر کفایت می‌کند تا P3 |

## ۶) نقشهٔ اولویت پیشنهادی (Sprintهای بعدی)

```
Sprint فوری (P0+امنیت):
  A1. امنیت: x-goog-api-key هدر به‌جای URL برای رله‌ها + سقف بدنه و rate limit روی ۸ مسیر
      + hash apiKey در کلید کش                [کم‌ریسک — همین امروز انجام شد §۷]
  A2. Crop واقعی + اصلاح آیکون                  [P0]
  A3. npm test + حذف tests/*.sh مرده + ignoreBuildErrors=false

Sprint ۲ (P1):
  B1. C2 — موشن قالب→کی‌فریم در bank-apply
  B2. M2 — انتقال بین ترک‌ها + z-order + replace
  B3. M6/C1 — word-timing (شروع: forced-alignment محلی روی ASR segment)
  B4. CI (GitHub Actions) روی ۳ سوییت موجود
  B5. R1 — کلید per-provider

Sprint ۳ (P2):
  C3..C9 طبق جدول §۲ + M3/M4/M7/M8/M9/M10
```

## ۷) مقایسه با محصول هدف (§۲۵ سند هدف)

| ستون هدف | وضعیت فعلی | فاصله |
|---|---|---|
| سادگی CapCut | ✓ موجود (فلوهای one-tap، بانک قالب) | کم |
| عمق تدوین Premiere | △ نیمه — ترک واحد اصلی، بدون crop/replace/z-order | **متوسط → M2** |
| موشن AE | △ کی‌فریم transform واقعی، بدون curve editor و پراپرتی‌های بیشتر | متوسط → M4 |
| فتوشاپ تصویر | △ Retouch واقعی؛ Design Studio مولد است | متوسط → M9 |
| رنگ/صدای DaVinci | △ فیلتر ۸ پارامتری + میکس واقعی؛ بدون scopes/ducking پیشرفته | کم-متوسط |
| وارک‌فلو اجتماعی Canva | ✓ بانک ۸۷ + Story + Explore | کم |
| Agent سبک Runway | ✓ **بیشتر از سبک Runway** — پلن ساختاریافته اجرای واقعی | کم |

**نتیجه:** ستون‌های «سادگی» و «Agent» امروز هم رقابتی‌اند؛ سرمایهٔ بعدی باید روی «عمق تدوین» (M2/Crop/Replace) و «صحت» (word-timing) برود — نه افزودن provider یا ویژگی تزئینی.
