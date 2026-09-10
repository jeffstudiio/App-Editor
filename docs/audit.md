# Repository Audit — JEFF Creative Studio

> تاریخ: ۲۰۲۶-۰۹-۱۰ • روش: سه Audit عمیق موازی (موتور ادیتور / persistence و ویوها / AI و API) + تست‌های واقعی

## Existing

### Stable (واقعی و end-to-end)
| بخش | شرح |
|---|---|
| موتور رندر | Canvas 2D کامپوزیتور (`engine.ts`) — کلیپ/overlay/متن/fx، RAF clock، drift-correction صدا |
| میکس صدا | WebAudio per-asset: gain/fade/echo/ducking + MediaStreamDestination برای export |
| Export | MediaRecorder روی `captureStream` — MP4(H.264+aac) با fallback WebM — واقعی با صدا |
| پروژه‌ها | IndexedDB `creative-studio-projects` — JSON + Blob + thumbnail (اکنون +autosave و schema v2) |
| فیلتر/رنگ | ۸ پریست CSS-filter + دستی + temp/vignette + enhance |
| ماسک/کروما | feathered/hard mask، chroma-key پیکسلی |
| لرزش‌گیر | SAD block-matching واقعی |
| سرعت/معکوس/فریز | playbackRate + استخراج فریم معکوس + freeze از grabFrame |
| زیرنویس | ASR واقعی (VAD + cloud ASR) → SRT + burn-in در export |
| دوبله/ترجمه | ASR → translate → edge-tts روی تراک جدا |
| AutoVideo | سناریو → صحنه → تصویر AI → TTS → پروژه کامل |
| بانک تمپلیت | ۸۷ قالب / ۱۰ دسته + پخش‌کنندهٔ زنده + «بانک من» (IDB) |
| دستیار AI | چت ۴ پرسونا + voice loop، سه provider (default/OpenRouter/Gemini) |
| PWA | manifest + SW + بیلد استاتیک گوشی (GitHub Pages) |

### Partial
- **Trim**: فقط اسلایدر، بدون دستگیرهٔ درگ
- **Reverse**: ≤10s، 12fps، بدون صدا
- **Ripple**: اکنون واقعی شد (حذف کلیپ لایه‌های بعد را شیفت می‌دهد)
- **Undo**: snapshot JSON هر mutation (بدون coalesce)
- Undo/Redo/copy(=duplicate) بدون کلیپ‌بورد بین پروژه‌ها

### Broken (رفع شد در همین Audit)
- `totalDur` لایه‌ها را نادیده می‌گرفت → PiP بریده می‌شد ✅ fix
- `animOut: slideUp/typewriter` انتخابی ولی بی‌اثر ✅ fix
- DesignStudio caption `j.reply` → همیشه خالی ✅ fix (`j.content`)
- نشتی AudioContext در detach ✅ fix
- نشتی objectURL معکوس (باقی‌مانده — بک‌لاگ)

### Fake (قانون §82 — حذف/شفاف شد)
- آمار جعلی «استفاده/لایک» گالری تمپلیت ✅ حذف → دادهٔ واقعی (musicMood)

## Missing — Critical
1. Render غیرریل‌تایم (WebCodecs/ffmpeg-wasm) — سقف کیفی export
2. Multi-track NLE کامل (تراک دلخواه، z-order قابل تغییر)
3. Graph/Curve Editor
4. Word-level caption timing (ASR فعلاً جمله‌ای است)
5. Job/Queue سیستم برای عملیات طولانی AI
6. Rate limiting روی APIها

## Missing — Important
- Drag-trim دستگیره‌ای، detach audio، گروه‌بندی، multi-select، کلیپ‌بورد واقعی
- Mask freehand/brush، tracking واقعی، LUT/curves/scopes
- ذخیرهٔ طراحی Story/Design (اکنون memory-only)
- لایسنس متادیتا برای assetها

## Refactor
- **Required**: شکستن `VideoView.tsx` (~۱۴۰۰ خط) به واحدهای کوچک‌تر + store سراسری
- **Required**: تجمیع ۳ واژگان موشن (editor/template-bank/StoryView) به یک موشن‌بانک
- **Optional**: حذف Prisma مرده، پاک‌سازی shadcn toast/sidebar بلااستفاده، حذف deps مرده (@dnd-kit, recharts, react-query, next-auth…)
