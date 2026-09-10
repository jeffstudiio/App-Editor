# Caption System

## زنجیرهٔ فعلی (REAL)
```
decode (WebAudio) → RMS/50ms → VAD آستانهٔ نویز (percentile) → merge/pad
   → ≤۲۶ سگمنت → 16kHz WAV → /api/transcribe (cloud ASR) → {start,end,text}
   → TextItem(isCaption, karaoke) → رندر canvas (drawSubtitle مشترک) → burn-in در export
```
- محدود: ۳۰۰s مدیا، سگمنت-محور (بدون word-timing واقعی — karaoke فعلاً تناسبی)
- خروجی: **SRT** (BOM) + PNG شفاف ۱۰۸۰×۱۹۲۰ هر خط
- دوبله: همان ASR → `/api/translate` (نگهبان drift فارسی) → edge-tts روی تراک جدا

## Milestone 2 — Word-level
1. تقسیم سگمنت به کلمات: پروجکشن تناسبی روی انرژی RMS داخل سگمنت (بدون ASR اضافه)
2. `TextItem.words?: {w, t0, t1}[]` + highlight دقیق کلمه (karaoke واقعی)
3. فرمت‌ها: VTT + ASS (+ JSON) در کنار SRT
4. پرست‌ها: Minimal/Karaoke/Pop/Luxury/Beauty/TikTok/... (پایه: SUBTITLE_PRESETS)

## Transcript-based editing (§55)
پس از word-timing: حذف جمله در متن → حذف بازهٔ متناظر از تایم‌لاین (split+ripple موجود را صدا می‌زند).
