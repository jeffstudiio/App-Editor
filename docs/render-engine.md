# Render Engine — وضعیت و نقشه

## فعلی (MediaRecorder realtime)
`engine.exportVideo` (engine.ts):
1. offscreen canvas با `exportDims` (بلندترین ضلع 720/1080/1440)
2. `canvas.captureStream(fps)` + `MediaStreamAudioDestinationNode` (صدای گراف WebAudio)
3. MediaRecorder → mime ترجیحی `video/mp4;codecs=avc1,mp4a` سپس WebM VP9/VP8
4. RAF loop: زمان پیش می‌رود (دیوار)، `drawFrame` روی offscreen → واقعی اما **realtime**
   - الزام: تب باز و فوکوس؛ خروجی VFR در drop؛ طول export = طول ویدئو

## محدودیت‌های شناخته‌شده
- صدا فقط اگر گراف WebAudio از قبل ساخته شده باشد (fallback: بی‌صدا — بک‌لاگ: ساخت گراف در شروع export)
- کدک MP4 وابسته به Chromium ≥ ~126
- سرعت ۱×؛ رندر سریع‌تر از realtime ممکن نیست

## نقشه (Milestone 2)
1. **WebCodecs fixed-step**: `VideoEncoder`(avc1) + `AudioEncoder`(aac/opus) — حلقهٔ ثابت 1/fps؛ seek دقیق ویدیوها (decode → draw)؛ muxer: mp4-muxer سبک یا WebM با EBML دستی؛ MediaRecorder فقط fallback.
2. Audio render: OfflineAudioContext → AudioBuffer → encode.
3. Cancel + progress دقیق (فریم i از N).
4. بعداً: render در Worker + proxy media.

---

## ✅ پیاده‌سازی شد (Milestone 2) — Export نسل ۲
`src/lib/video/export-advanced.ts` + `EditorEngine.renderStill()`:
- **WebCodecs VideoEncoder** (H.264) + **AudioEncoder** (AAC) + مالتی‌پلکس **mp4-muxer** → MP4 واقعی
- حلقهٔ ثابت 1/fps با seek دقیق ویدئوی فعال و overlayها (`renderStill`) + انتظار decode تصاویر
- صدا **مستقل از gesture**: OfflineAudioContext با playbackRate واقعی (سرعت)، ramp فیدها، گراف اکو، ducking زمان‌بندی‌شدهٔ زیرنویس
- مذاکرهٔ خودکار کدک بین ۹ پروفایل/سطح AVC با `isConfigSupported`
- fallback شفاف به MediaRecorder + دکمهٔ لغو + نمایش وضعیت قابلیت در ExportSheet
