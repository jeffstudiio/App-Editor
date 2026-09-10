# Development Roadmap

> اولویت‌سنجی همیشه با §79: «آیا تولید محتوای واقعی را سریع‌تر/حرفه‌ای‌تر/قابل‌اعتمادتر می‌کند؟»
> Use Case اول: **Beauty / Hair Color / Instagram** — اما Core Engine generic می‌ماند.

## ✅ MILESTONE 0 — Audit & Docs (انجام شد)
سه audit موازی + این مستندات + تصمیم معماری.

## ✅ MILESTONE 1 — Foundation fixes (انجام شد)
- fix: totalDur لایه‌ها، ripple delete، animOut واقعی، نشتی AudioContext، حذف آمار جعلی (§82)، باگ کپشن Design
- feat: **drag & reorder تایم‌لاین** (کلیپ: ترتیب / لایه: زمان با snap به پلی‌هد)
- feat: **Autosave + crash recovery** (IDB store + restore prompt) + schema v2 + normalizeProject + rename پروژه
- feat: **keyboard shortcuts** (Space/S/Delete/Ctrl+Z/Y/D/Arrows)
- feat: **Keyframe Engine v1** — ۵ پراپرتی (scale/x/y/rotate/opacity)، ۷ easing، UI شیت با ease-per-key + تست ۲۷ assert
- docs: /docs کامل

## MILESTONE 2 — Professional Editor
1. ✅ **Trim دستگیره‌ای** روی تایم‌لاین (in/out handles با درگ) + اسنپ مغناطیسی — commit 770d3db
2. ✅ **Export نسل ۲**: WebCodecs H.264 + AAC با mp4-muxer، فریم‌به‌فریم دقیق؛ صدا مستقل از gesture (OfflineAudioContext)؛ fallback MediaRecorder؛ cancel UI — commit f8183df
3. ✅ **Detach audio** (decode → offline render → WAV) + **کلیپ‌بورد واقعی** (IDB store؛ copy/paste بین پروژه‌ها و پس از reload؛ Ctrl+C/V) — commit 41a1a97
4. Multi-select + گروه‌بندی (بعدی)
5. Adjustment layer + LUT (.cube parser ساده) + curves
6. Word-level caption: تشخیص کلمه از VAD boundryها + karaoke واقعی

## MILESTONE 3 — Motion & Design
1. **Graph Editor** (value/speed، Bezier handle) روی موتور keyframe موجود
2. Parent/child + Null Object
3. Shape layers (rect/circle/star/SVG path) با انیمیشن
4. Tracking واقعی (point tracker با الگوی SAD موجود در stab)
5. Mask freehand/brush + keyframe ماسک
6. Image Editor مستقل با layers (پایه: RetouchView + موتور keyframe)

## MILESTONE 4 — Social Content (Beauty-first)
1. **Before/After Engine**: اسلایدر/split/wipe/animated-reveal به‌صورت Template-based (پایه: overlay track)
2. پریست‌های Social (Reel/Story/Post/TikTok/Shorts با safe-zone واقعی)
3. **Beauty workflow**: پریست رنگ «حفظ پوست/نمایش رنگ مو» + پریست‌های زيرنویس Beauty/Editorial
4. Story Studio: اتصال به پروژه + export متحرک (WebM) نه فقط PNG
5. قالب‌های Hair Color / Transformation / Before-After در بانک (دستهٔ beauty)

## MILESTONE 5 — Content Library
1. Asset Library واحد (IDB) با search/tag/favorite + PNG/Video/Audio banks
2. یکسان‌سازی دو سیستم تمپلیت (Edit recipes → Bank schema) با مایگریشن
3. SFX/موسیقی بیشتر (سینتی، CC0) + متادیتای لایسنس برای همهٔ assetها
4. فونت‌های بیشتر (Persian display/serif)

## MILESTONE 6 — AI Agent واقعی
1. **Command registry** (`src/lib/video/commands.ts`): هر §45 به op تایپ‌دار روی mutate
2. **Project serializer** برای context مدل (خلاصهٔ تایم‌لاین)
3. `/api/agent`: tool-calling با zod validation + diff preview + apply با undo grouping
4. Auto Edit / Auto Story روی همان executor
5. AI Job System (IDB job store + progress + resume)
6. Rate limiting ساده (per-IP token bucket در middleware)

## MILESTONE 7 — Performance & Professional
1. Workers: stab/beat/ASR-slice/reverse خارج از main thread
2. Proxy workflow (نسخهٔ سبک ۴۸۰p برای ادیت، export از اصل)
3. Virtualized timeline + thumbnail strip cache
4. WebCodecs render در Worker + ffmpeg-wasm fallback

## MILESTONE 8 — Platform
Cloud sync / community templates / marketplace — فقط بعد از تکمیل Core (§77).
