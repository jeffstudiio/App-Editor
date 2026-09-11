# ممیزی پیاده‌سازی فعلی — Current Implementation Audit

> تاریخ: ۲۰۲۶-۰۹-۱۱ · مبنا: بازرسی خط‌به‌خط کد (۱۶۳ فایل src / ~۲۹هزار خط / ۱۷ API route) + ۶ ممیزی موازی عمیق
> قاعدهٔ این سند: **کد حقیقت است، نه README و نه UI.** هر حکم با شاهد `file:line` پشتیبانی می‌شود.
> وضعیت‌ها: `REAL` / `PARTIAL` / `UI_ONLY` / `MOCK` / `BROKEN` / `UNUSED` / `MISSING`

---

## ۰) خلاصهٔ یک‌نگاهی

| حوزه | حکم کلی |
|---|---|
| معماری AI Provider (Registry/Router/Fallback/Cache) | **REAL** — با ۳ عیب طراحی واقعی (کلید مشترک BYO، زنجیره‌های مرده، کش نادرست) |
| AI Editing Agent + ۲۴ دستور | **REAL (~۹۵٪)** — کامل‌ترین مسیر پروژه؛ همهٔ ۲۴ دستور واقعاً Timeline را تغییر می‌دهند |
| ویرایشگر ویدیو (پیش‌نمایش Canvas + خروجی WebCodecs) | **REAL** — موتور واقعی، اما گپ‌های عرضی (Crop/جابه‌جایی بین ترک/Replace ندارند) |
| خروجی نهایی MP4 | **REAL** — WebCodecs + mp4-muxer، فریم‌به‌فریم با AAC؛ MediaRecorder فقط fallback |
| بانک قالب (۸۷) | **REAL** — تعداد و صحت رسانه‌ها تأیید شد |
| جست‌وجوی معنایی | **REAL (لایهٔ محلی)** + لایهٔ دوم عملاً تزئینی (کلید اشتباه می‌رسد) |
| Assistant چت | **REAL بدون استریم** — یک نقطهٔ ناآگاهی: fallback ثابت Gemini مثل «لایو» جشن گرفته می‌شود |
| Design Studio | **PARTIAL** — «مولد تصویر» است نه ادیتور؛ بدون Canvas/لایه/تایپوگرافی + ۲ باگ واقعی |
| Retouch / Story / Subtitle Tool | **REAL** (ابزارهای واقعی، بدون persistence) |
| Prisma + `db.ts` + `tests/*.sh` + `/api` ریشه | **UNUSED / BROKEN** — وزن مرده |
| امنیت | بدون Critical؛ یک **HIGH** (کلید Gemini در URL → پروکسی‌های ثالث) و چند MEDIUM |

---

## ۱) AI SYSTEM — معماری Provider

### هسته
| مؤلفه | وضعیت | شاهد |
|---|---|---|
| ProviderRegistry | REAL (Map درون‌حافظه‌ای؛ متدهای `require/ids/withCapability` بلااستفاده) | `core/provider-registry.ts:7-39` |
| CapabilityRouter — fallback واقعی | REAL — در خطا provider بعدی امتحان می‌شود | `core/capability-router.ts:77-118` + تست `test-ai-architecture.ts:111-125` |
| `prefer` صریح | REAL — زنجیره را جلو می‌آورد؛ خطای fatal همان provider بی‌سکوت بالا می‌آید | `capability-router.ts:44-48,114-115` |
| Health | PARTIAL — فقط واکنشی (از ترافیک واقعی یا verify دستی)، درون‌حافظه‌ای، ری‌استارت پاک می‌شود | `ai-usage.ts:48-67` |
| Usage | REAL اما ناپایدار (بدون persistence) | `ai-usage.ts:35-67` |
| AiCache | REAL (LRU/TTL 10min/200) با ۲ عیب: اتصال hit به provider اشتباه + کلید خام apiKey در کلید کش | `ai-cache.ts:12-18`، `capability-router.ts:61-74` |
| AIError | REAL — نگاشت 401/402/429/5xx + پیام فارسی | `ai-errors.ts:48-77` |
| Rate limit | REAL ولی دورزدنی (اعتماد کورکورانه به `x-forwarded-for`) و فقط روی ۸ مسیر از ۱۶ | `server/rate-limit.ts:28-58` |
| local-embedding | REAL — feature hashing قطعی ۲۵۶بُعدی، واژه‌نامهٔ کانونی fa↔en؛ مصرف‌کنندهٔ واقعی دارد | `core/local-embedding.ts:15,149-193` |

### زنجیره‌ها (`capability-router.ts:15-24`)
```
text_generation: zai → groq → gemini → openrouter → huggingface
fast_text:       zai → groq → gemini → openrouter
translation:     zai → gemini → groq → openrouter      ← زنجیرهٔ مرده (هیچ مسیری از router استفاده نمی‌کند)
image_generation: zai → gemini
image_editing:   zai → gemini
embeddings:      jina → local                          ← free-first نقض شده: اول کلیددار، بعد بی‌کلید
text_to_speech:  edge-tts → zai                        ← زنجیرهٔ مرده
speech_to_text:  zai                                   ← زنجیرهٔ مرده
```

**یافتهٔ ساختاری ۱ — تک‌کلیدِ در‌اشتراک:** کلاینت فقط یک فیلد `apiKey` می‌فرستد (کلید Gemini یا OpenRouter بسته به تنظیمات) و router همان را به همهٔ اعضای زنجیره می‌دهد؛ پس HF (عضو پنجم) همیشه با کلید بیگانه 401 می‌گیرد و کلید BYO کلید env را هم سایه می‌اندازد (`registry.ts:37-40`).

**یافتهٔ ساختاری ۲ — bypass گسترده:** ۸ مسیر از ۱۶ به‌جای router، مستقیم `ZAI.create()` یا کتابخانه صدا می‌زنند (translate، tts، transcribe، edit-plan، script-scenes، edge-tts، gemini/models، openrouter/models) → بدون کش/آمار/fallback و عمدتاً بدون rate limit.

---

## ۲) Provider-by-Provider

| Provider | تماس واقعی | قابلیت‌های پیاده‌شده | جای زنجیره | مصرف واقعی | حکم |
|---|---|---|---|---|---|
| **zai** | بله، سرور-ساید؛ SDK پلتفرم (`zai.ts:80-133`) | text/fast/translate/ImgGen/ImgEdit/ASR/TTS | #۱ اکثر قابلیت‌ها | بله — assistant/plan/image* + ۵ مسیر bypass | **REAL** |
| **gemini** | بله؛ `generateContent?key=…` + رله‌های CORS ثالث (`gemini-client.ts:17-29`) | text/fast/translate/ImgGen/ImgEdit (5/5) | #۲-#۳ | بله (prefer از UI) | **REAL** با ریسک HIGH (§۲۰) |
| **groq** | بله؛ OpenAI-compatible (`openai-chat.ts:29-44`) | text/fast/translate | #۲ | فقط با `GROQ_API_KEY` env؛ UI نمی‌تواند prefer کند | **REAL / عملاً env-only** |
| **openrouter** | بله؛ `openrouter.ai/api/v1` (`openrouter.ts:30-34`) | text/fast/translate (+ شرط `req.model` در `supports`) | #۳-#۴ | بله — مسیر اصلی BYO | **REAL** |
| **huggingface** | بله؛ chat+embeddings+whoami (`huggingface.ts:31-105`) | ۳ قابلیت اعلان‌شده، اما embeddings∉زنجیرهٔ embeddings و ترجمه عملاً نمی‌رسد | #۵ (آخر) | تقریباً هیچ — تلهٔ تک‌کلید | **REAL code / PRACTICALLY UNUSED** |
| **jina** | بله؛ `api.jina.ai/v1/embeddings` (`jina.ts:68-76`) | embeddings | #۱ embeddings | بله — ولی BYO کلید اشتباه (gemini/openrouter) می‌فرستد | **REAL / سیم‌کشی کلید معیوب** |
| **edge-tts** | بله؛ `msedge-tts` → wss بینگ (`edge-tts.ts:83-101`) | TTS با گیت صدا | #۱ TTS | **هرگز از router عبور نمی‌کند** — مسیر واقعی `/api/edge-tts` کپیِ همین منطق است | **REAL / UNUSED به‌عنوان provider** |
| **local** | بدون شبکه — `localEmbed` | embeddings | #۲ embeddings | بله (fallback واقعی + سمت کلاینت) | **REAL** |

- `openai-chat.ts` کلاس پایهٔ مشترک است (provider نیست) → «۸ ارائه‌دهنده» درست است.
- **هیچ پاسخ fake/canned در execute() هیچ providerای وجود ندارد** — همه روی خروجی خالی `bad_response` می‌اندازند. تنها خروجی ثابت: لیست مدل‌های Gemini هنگام بلاک منطقه‌ای با `fallback:true` (`gemini/models/route.ts:51-61`) که کلاینت نادیده‌اش می‌گیرد.
- نام مدل‌های پیش‌فرض Gemini (`gemini-3.6-flash` و…) در کاتالوگ عمومی گوگل وجود ندارد؛ فقط مسیر تصویر 404-رینیم دارد (`gemini-image.ts:64-70`)، مسیر چت نه.

---

## ۳) AI AGENT — ردیابی کامل «یک ریلز لوکس قبل و بعد مو بساز»

| مرحله | فایل/تابع | واقعی؟ |
|---|---|---|
| UI entry | `VideoView.tsx:1282` دکمهٔ «عامل تدوین» → `AgentSheet` | ✅ |
| Snapshot پروژهٔ زنده | `executor.ts:33-52 buildSnapshot` | ✅ |
| POST /api/ai/plan | `AgentSheet.tsx:61-65` | ✅ |
| Rate limit + سقف بدنهٔ 512KB + sanitize اسنپ‌شات | `ai/plan/route.ts:67,75,34-63` | ✅ |
| پرامپت (کاتالوگ+enum+pack) | `planner-prompt.ts:11-84` | ✅ |
| LLM | `router.route("fast_text", jsonMode)` → zai (پیش‌فرض) یا BYO | ✅ |
| استخراج JSON | `planner-prompt.ts:87-96` | ✅ |
| اعتبارسنجی zod per-command + چکِ ID با اسنپ‌شات | `plan-schema.ts:26-63` | ✅ |
| حلقهٔ ترمیم فارسی (۱ تلاش مجدد) | `route.ts:102-122` | ✅ |
| اعتبارسنجی دوم سمت کلاینت با اسنپ‌شات زنده | `AgentSheet.tsx:73-78` | ✅ |
| پیش‌نمایش پلن + دکمهٔ «اجرا» | `AgentSheet.tsx:252-298` | ✅ |
| Executor → `ctx.mutate` روی همان Project موتور رندر | `executor.ts:62-365` → `engine.ts:112` | ✅ |
| Async: موسیقی/افکت/تصویر/صدا | `AgentSheet.tsx:89-157` — فایل واقعی بانک، سنتز WebAudio، /api/image-gen، /api/edge-tts | ✅ |
| گزارش ✓/✗ هر عملیات | `AgentSheet.tsx:300-309` | ✅ |

**هر ۲۴ دستور REAL است** — فهرست کامل: `set_aspect, apply_filter, adjust_color, add_title, style_titles, set_caption_style, clear_captions, trim_clip, split_clip, remove_clip, move_clip, duplicate_clip, change_speed, add_transition, set_fades, set_volume, duck_music, add_marker, add_keyframe, remove_keyframe, add_music, add_sfx, generate_image, generate_voice` — هرکدام: zod تیک، اجرای واقعی تیک، پیام فارسی صادقانه در شکست.
عیب‌ها: undo پلن اتمیک نیست (بخش sync یک واحد، هر async جدا)؛ id کلیدفریم با لیستی که audio را هم دارد اعتبارسنجی می‌شود ولی executor فقط clips/overlays/texts را می‌گردد (`executor.ts:50` مقابل `:333,346`)؛ `aspectRatio` در AIPlanSchema مرده است؛ سقف عملیات در پرامپت ۲۵ و در اسکیما ۴۰.

---

## ۴) ویرایشگر ویدیو

### مدل و عملیات
| مورد | وضعیت | شاهد/یادداشت |
|---|---|---|
| مدل ۵ لایه (clips/overlays/texts/audios/markers) | REAL | `types.ts:283-296` — ترک اصلی magnetically sequential، بدون فیلد start |
| trim / split / delete(+ripple) / duplicate / reorder | REAL | `edit-ops.ts:55-112`، `VideoView.tsx:514-531,634-684,997-1009` |
| جابه‌جایی بین ترک‌ها، z-order overlay، Replace source | **MISSING** | فقط delete+re-add |
| سرعت (0.25–4) | REAL | پیش‌نمایش و خروجی هر دو |
| Reverse | REAL اما lossy (12fps/480px/≤10s/بدون صدا؛ trim/split غیرفعال؛ فریم‌های اول خروجی می‌تواند سیاه شود) | `engine.ts:823-861`، `engine.ts:278` |
| Freeze frame | REAL | `engine.ts:772-792` |
| Detach audio | REAL (decode→OfflineAudioContext→WAV) | `audio-extract.ts:58-102` |
| Crop | **MISSING** — آیکون Crop در واقع «تریم» برچسب خورده! | `VideoView.tsx:1292` |
| Stabilize دیجیتال (SAD) | REAL | `engine.ts:870-976` |
| Undo/Redo | REAL (اسنپ‌شات JSON، سقف ۶۰) اما هر تیکِ اسلایدر = یک entry | `VideoView.tsx:212-242` |

### کی‌فریم
موتور واقعی (`keyframes.ts:20-125`) با ۷ easing، ارزیابی per-frame در پیش‌نمایش و خروجی (`engine.ts:373-382,552-561,335-345`)؛ فقط ۵ پراپرتی transform؛ **Graph editor ندارد**؛ کی‌فریم متن فقط از راه Agent قابل نوشتن است (UI ندارد).

### پیش‌نمایش
کامپوزیت Canvas2D واقعی با حلقهٔ rAF و درِیفت‌کورکشن ±0.2s؛ فیلترها/ماسک‌ها/کروما/ترنزیشن‌های ورودی واقعی؛ متن RTL با انیمیشن واقعی (`filters.ts:302-393`).

### خروجی
| مورد | وضعیت |
|---|---|
| WebCodecs + mp4-muxer (H.264+AAC، فریم‌دقیق، keyframe هر 2s) | **REAL** — `export-advanced.ts:249-321` |
| MediaRecorder realtime | REAL فقط fallback (`engine.ts:691-769`) |
| رزولوشن/فریم‌ریت | 720/1080/1440 و فقط 24/30fps؛ WebM/VP9/60fps در مسیر اصلی نیست |
| میکس صدا (fade/duck/echo) | REAL — OfflineAudioContext 48k |
| باگ‌ها | خروجی ابتدا playback را pause نمی‌کند (`engine.ts:250-257`)؛ renderStill لود فریم‌های reverse را await نمی‌کند |

### صدا و AI
SFX سنتز واقعی ۸ افکت؛ Beat detection واقعی (انرژی-فلوکس→مارکر)؛ TTS عصبی واقعی؛ **دوبلهٔ کامل end-to-end واقعی** (ASR→ترجمه→TTS→قرارگیری تایم‌لاین با ducking)؛ AI Clipper فقط تحلیل **صوت** است (برچسب «تحلیل صحنه» اغراق است)؛ Autovid واقعی (script-scenes→image-gen→TTS→کیپشن).

---

## ۵) بانک قالب و پک‌ها

- **۸۷ قالب تأیید شد** (۸+۷+۸+۱۳+۸+۷+۹+۱۱+۷+۹)؛ کاملاً دیتادریو (MediaSlot/Scene JSON) + sanitizer allowlist واقعی (`schema.ts:108-174`)؛ صحت ID و رسانه‌ها با اسکریپت validate تیک شد؛ **صفر لینک رسانهٔ شکسته** (۱۰ bg + ۹ موسیقی + ۱۰ پوستر همگی روی دیسک).
- Player واقعاً پخش می‌کند: ساعت rAF، موسیقی با درِیفت‌کورکشن، ۲۰ motion رسانه + ۱۵ انیمیشن متن + ۱۶ ترنزیشن + ۵ FX (شامل grain با SVG-turbulence). Scrubbing ناقص (ویدیو به 0 برمی‌گردد).
- جست‌وجو: لایهٔ محلی همیشه واقعی؛ لایهٔ دوم (Jina) عملاً تزئینی — کلید BYO اشتباه می‌رسد و روی Pages هم endpoint وجود ندارد (fallback محلی با شفافیت).
- بانک من: IndexedDB واقعی (templates+assets)، ساخت قالب سفارشی و export JSON واقعی؛ **import فایل JSON وجود ندارد**؛ جایگزینی کاربر روی قالب‌های stock فقط session است و هر بار پاک می‌شود.
- **Beauty pack واقعاً مصرف می‌شود** (۳ مصرف‌کننده: جست‌وجو، AgentSheet workflows، پرامپت planner) — فقط preset نیست؛ ولی workflows فقط ۴ پرامپت آماده‌اند.
- **Apply-to-editor واقعی** (probe duration، placeholder گرادیانی، ترنزیشن/فیلتر/متن/صدا) — ولی `scene.motion` (مثل kenburns) در تحویل به ادیتور **ساکت دور ریخته می‌شود** (`bank-apply.ts:158-177`)؛ بزرگ‌ترین شکاف وعده/واقعیت بانک.

---

## ۶) بقیهٔ Viewها

| View | حکم | نکتهٔ کلیدی |
|---|---|---|
| AssistantView | REAL (بدون استریم/بدون پیوست/بدون اجرای ویرایش) | fallback ثابت Gemini به‌عنوان «لایو» جشن گرفته می‌شود (`AssistantView.tsx:297-306` فلگ `fallback` نادیده) |
| ProviderStatusPanel | REAL — ping واقعی با `?verify=` | استثنا: `healthCheck` زای همیشه «available» برمی‌گرداند (`zai.ts:61-63`) |
| DesignStudioView | **PARTIAL** — مولد تصویر؛ بدون Canvas/لایه/تایپوگرافی | باگ ۱: `s?.gemini?.key` خوانده می‌شود ولی ذخیره‌شده `apiKey` است (`:94`)؛ باگ ۲: کلید کاربر به route ارسال نمی‌شود (`:119`) |
| RetouchView | REAL — پیکسل‌پردازی واقعی + AI + خروجی + undo | undo فقط per-AI-action؛ before/after دکمهٔ نگه‌داشتن است نه اسلایدر |
| SubtitleView | REAL — ابزار مستقل کامل (ASR+رندر+SRT+PNG) | ادغام با تایم‌لاین ادیتور ندارد؛ word-timing ندارد |
| ExploreView | REAL viewer | فقط URL در localStorage (لینک‌ها می‌پوسند)؛ **بدون یادداشت لایسنس**؛ بدون ارسال به ادیتور |
| StoryView | REAL — لایه+drag+۱۴ motion+خروجی PNG 1080 | بدون persistence/undo |
| TemplatesGallery / HomeView | REAL — دستور پخت واقعی → اعمال در ادیتور / CRUD پروژه | — |
| StudioHub | UI_ONLY (طبیعی — منوی ناوبری است) | — |

---

## ۷) State / Persistence

```
page.tsx (SPA) — سوییچ تب = unmount کامل view (page.tsx:69-90)
├── VideoView: useState<Project> + undo(60 snapshot) + autosave 2.5s → IDB
│    ⚠ تایمر autosave در unmount کنسل می‌شود → ≤2.5s آخر می‌تواند گم شود
├── projects-db.ts (IDB "creative-studio-projects" v3): projects/blobs/autosave/clipboard — REAL
├── localStorage: studio-chat:* · ai-assistant-settings · design-brand-kit ·
│    studio-explore-saved · gemini-via-toast · remote bank URL
├── transfer.ts: pendingProject/Template/Bank/assistantPrefill (one-shot، حافظه)
└── بدون persistence: Story · Subtitle · Design results · Retouch image/history · Explore cache
سرور: فقط درون‌حافظه (usage/health/explore-cache/ai-cache)
```
تضاد سخت منبع حقیقت وجود ندارد؛ سه نرم: تک‌اسلاتِ autosave «draft»، واگرایی autosave بعد از save صریح، duration ساختگی ۰/۱۰ در بازگشایی HomeView.

## ۸) Prisma / دیتابیس

**UNUSED** — `db.ts` تنها importer پرisma است و هیچ‌کس `db.ts` را import نمی‌کند؛ اسکیمما `User/Post` بویلرپلیت است؛ اسکریپت‌های `db:*` در build/start استفاده نمی‌شوند. دادهٔ واقعی پروژه‌ها = IndexedDB.

## ۹) تست‌ها / Build

- ۱۵۴ assertion واقعی در ۳ اسکریپت tsx (engine 63 + agent 56 + ai-arch 35) — اما **بدون npm test و بدون CI**؛ اجرای دستی.
- `tests/*.sh` هر سه **BROKEN** — به `.zscripts` اشاره می‌کنند که در مخزن وجود ندارد.
- `next.config.ts:26-28` → `typescript.ignoreBuildErrors: true` همیشگی (گیت تایپ عملاً خاموش).
- هم `bun.lock` هم `package-lock.json` کامیت‌اند؛ دو پکیج‌منیجر بدون مرجع تک.
- بیلد گوشی: `build-phone.sh` مسیر `src/app/api` را موقتاً برمی‌دارد → خروجی استاتیک **صفر API**؛ همهٔ فراخوانی‌های `/api/...` کلاینت هم بدون basePath-اند → روی Pages 404 (با پیام فارسی کنترل‌شده).

## ۱۰) امنیت (خلاصه؛ جزئیات در GAP-ANALYSIS)

- **CRITICAL: هیچ** (بدون کلید کامیت‌شده، بدون injection، بدنهٔ پلن agent با whitelist بسته و sanitize سمت سرور — `ai/plan/route.ts:34-63`).
- **HIGH: کلید BYO Gemini در URL query** و در مسیر fallback از پروکسی‌های ثالث عمومی (corsfix/cors.lol) عبور می‌کند (`gemini-client.ts:17-29`، `gemini.ts:119`).
- MEDIUM: rate limit دورزدنی+per-instance؛ ۸ مسیر بدون سقف بدنه؛ هزینهٔ آزاد z-ai بدون محدودیت در ۳ مسیر؛ apiKey خام در کلید کش.
- LOW: `x-ai-key` در هدر (بدون لاگ)، کش explore بدون سقف.
