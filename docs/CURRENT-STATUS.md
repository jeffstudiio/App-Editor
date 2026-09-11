# CURRENT-STATUS — JEFF Creative Studio (Post Editor-UX Rebuild)

> تاریخ: ۱۴۰۴/۰۶/۲۱ — بعد از بازسازی حیاتی «Editor UX & Timeline Rebuild» (۴۸ بند)
> منبع حقیقت: کد + **۲۷۸ تست سبز** (`npm test` = core 104 · §44 regressions 53 · agent 86 · ai-arch 35) + `tsc --noEmit` پاک + lint پاک
> معماری جدید ادیتور: `EDITOR-ARCHITECTURE.md`
> اسناد مکمل: `REALITY-MATRIX.md` (جزئیات هر قابلیت) · `GAP-ANALYSIS.md` (کارهای باقی‌مانده) · `AI-PROVIDERS.md` · `ARCHITECTURE-STATUS.md` · `CURRENT-IMPLEMENTATION-AUDIT.md`

## ۱) خلاصهٔ یک‌نگاهی

| حوزه | وضعیت | توضیح |
|---|---|---|
| **مدل ترنزیشن (Edit-Point)** | **REAL (بازسازی)** | ترنزیشن = ویژگیِ مرز بین دو کلیپ مجاور (`Project.transitions`) با ۱۲ خانوادهٔ رندر متمایز + جهت + easing + clamp همسایه؛ مایگریشن خودکار از `transitionIn` قدیمی |
| **Workspace ادیتور** | **REAL (بازسازی)** | پیش‌نمایش/تایم‌لاین هرگز پوشیده نمی‌شوند: ToolDock داخلی (≤46dvh) در موبایل + Inspector راست در دسکتاپ؛ ابزار کاملاً بافتاری |
| **برش (Split)** | **REAL (ارتقا)** | `splitClipAt` واحد برای UI/Agent؛ کی‌فریم با پیوستگی می‌شکند؛ کلیپ راست انتخاب و نقطهٔ تدوین pulse می‌گیرد |
| **نقطهٔ تدوین روی تایم‌لاین** | **REAL (جدید)** | الماسِ مرز بین کلیپ‌ها + نوار ترنزیشن با مدت/برچسب؛ تپ = انتخاب یا مرورگر ترنزیشن |
| **مرورگر ترنزیشن** | **REAL (جدید)** | پیش‌نمایش زندهٔ موتور واقعی روی کلیپ‌های خود کاربر + ۱۷ کارت/۴ دسته + جست‌وجو/علاقه‌مندی/اخیر + مدت clamp‌شده + جهت/easing |
| **پریست‌ها** | **REAL (جدید)** | ۶ متن + ۱۳ رنگ (خانوادهٔ بیوتی) + ۱۲ انیمیشن — فقط روی آبجکت انتخاب‌شده |
| **مرورگر افکت** | **REAL (جدید)** | فقط ماژول‌های واقعی (نور/رنگ/وینیت/کیفیت+/لرزش‌گیر/کراپ/ماسک/کروما) |
| **زوم تایم‌لاین** | **REAL (جدید)** | دکمه + پینچ دورانگشتی با لنگر (18..160 px/s) |
| موتور تدوین (Timeline/Trim/Split/Speed/KF/Filter/Mask/Chroma) | **REAL** | پیش‌نمایش و خروجی WebCodecs هر دو روی `drawFrame` مشترک‌اند |
| **کراپ واقعی (P0 قبلی)** | **REAL (جدید)** | `CropState` نرمال‌شده در منبع؛ در preview + MediaRecorder + WebCodecs اعمال می‌شود؛ UI شیت + پریست نسبت‌دار + فرمان Agent |
| **کارائوکه (MOCK قبلی)** | **REAL (جدید)** | هم‌ترازی کلمه‌به‌کلمهٔ انرژی‌محور (`word-align.ts`) روی صدای ASR؛ هایلایت از روی زمان واقعی گفتار؛ بدون envelope → fallback نسبتیِ برچسب‌خورده |
| **موشن قالب→ادیتور (MOCK قبلی)** | **REAL (جدید)** | `motionTransform` تمام ۱۹ موشن بانک را به KeyframeMap واقعی تبدیل می‌کند؛ در خروجی هم دیده می‌شود؛ fx «vignette» هم تحویل می‌شود |
| **انتقال بین‌ترک / z-order / Replace (MISSING قبلی)** | **REAL (جدید)** | کلیپ↔لایهٔ رویی با حفظ transform/filter/kf؛ z-order با جابه‌جایی ترتیب رسم؛ تعویض منبع هم‌نوع با clamp تریم |
| AI Agent | **REAL — ۲۹ دستور** | +۵ فرمان جدید: `crop_clip`, `reset_crop`, `replace_clip`, `to_overlay`, `to_main_track`؛ validator جعلی‌ساز را رد می‌کند |
| خروجی MP4 (WebCodecs + AAC) | **REAL** | + گزینهٔ ۶۰fps (با هشدار صادقانهٔ سنگینی) |
| زیرنویس | **REAL** | SRT + **VTT (جدید)** در ادیتور و ابزار مستقل |
| Beat Sync | **REAL (قبلاً PARTIAL)** | دکمهٔ «برش کلیپ‌ها روی نشانگرها» — برش واقعی |
| برچسب «تحلیل صحنه» | **اصلاح شد** | حالا «تحلیل انرژی صدا» — همان کاری که واقعاً می‌کند |
| کلید per-provider (R1) | **REAL (جدید)** | نقشهٔ `keys` در درخواست؛ روتر کلید هر provider را فقط به خودش می‌دهد؛ کلید Gemini دیگر به Jina/HF نمی‌رسد |
| CI (M5) | **REAL (جدید)** | `.github/workflows/ci.yml`: tsc + lint + npm test روی push/PR |
| موتور پیش‌فرض AI (zai) و ۸ provider | **REAL** | free-first بدون تغییر |

## ۲) آنچه در این Sprint تغییر کرد (فایل‌های کلیدی)

- `src/lib/video/types.ts` — `CropState` + `WordTiming` + sanitize/normalize
- `src/lib/video/word-align.ts` — **جدید**: RMS envelope + تشخیص مکث + هم‌ترازی کلمه (خالص و تست‌پذیر)
- `src/lib/video/engine.ts` — کراپ در `drawClip` (cover) و `drawOverlay` (contain)
- `src/lib/video/filters.ts` — کارائوکهٔ واقعی از `item.words`
- `src/lib/video/asr-client.ts` — اتصال هم‌ترازی به خط لولهٔ ASR
- `src/lib/video/bank-apply.ts` — `motionTransform`: موشن قالب → کی‌فریم
- `src/lib/video/edit-ops.ts` — `reorderOverlay`, `replaceSource`, `clipToOverlayPayload`, `overlayToMainInsert`
- `src/lib/ai/agent/*` — ۵ فرمان جدید + snapshot.assets/overlayIds + پرامپت به‌روز
- `src/lib/ai/core/capability-router.ts` + `provider-types.ts` + `server/registry.ts` + `route-helpers.ts` + ۵ route — کلید per-provider
- `ClipSheets.tsx` — شیت Crop + بخش تعویض منبع؛ `VideoView.tsx` — ابزارها/آیکون‌ها/انتقال بین‌ترک
- `AiSheets.tsx` — VTT + برش روی نشانگرها + ۶۰fps؛ `SubtitleView.tsx` — VTT
- `.github/workflows/ci.yml` — **جدید**
- تست‌ها: ۱۵۴ → **۲۲۳** (core 104 / agent 84 / AI-arch 35)

## ۳) MOCK/BROKEN باقی‌مانده (صادقانه)

| مورد | وضعیت | توضیح |
|---|---|---|
| کارائوکه بدون envelope | **تقریبی (برچسب‌خورده)** | اگر استخراج صدا شکست بخورد، هایلایت نسبتی می‌ماند — fallback شفاف، نه ادعای دقیق |
| موشن‌های فیلتری بانک (sweepFocus/warmGlow/coldReveal) | **PARTIAL** | فقط جزء transform تحویل می‌شود؛ انیمیشن فیلتر در موتور کی‌فریم موجود نیست |
| WebM/VP9 در خروجی | **MISSING** | نیاز به webm-muxer — P3 |
| Reverse | **PARTIAL** | همان محدودیت سابق (12fps/480px/≤10s) |
| Graph/Curve editor، Proxy media، تایم‌لاین مجازی‌شده | **MISSING** | P2/P3 طبق GAP-ANALYSIS |
| Persistence ابزارهای مستقل (Story/Design/Retouch) | **MISSING** | P2 (C7) |
| سمت سرور (DB چند‌کاربره/رندر ابری) | **MISSING — عمدی** | فاز Platform (P3)؛ نسخهٔ Pages استاتیک است و AI سمت سرور می‌خواهد |

## ۴) GitHub Pages vs سرور واقعی

- **Pages (فعلی):** بانک ۸۷تایی، پخش‌کننده، ادیتور کامل محلی، خروجی WebCodecs، ابزارهای آفلاین — همه کار می‌کنند. AI/ASR/TTS/تصویر غیرفعال (API routes ندارند).
- **سرور واقعی (P3):** همان کد با `npm run build` (standalone) → ۱۷ API route + کلیدها در env → همهٔ AI فعال. هیچ بازنویسی‌ای لازم نیست؛ فقط دیپلوی.
