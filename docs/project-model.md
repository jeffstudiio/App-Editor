# Project Model (schema v2)

فایل مرجع: `src/lib/video/types.ts` • نسخه: **PROJECT_SCHEMA_VERSION = 2**

```ts
Project {
  schemaVersion?: 2
  aspect: "9:16" | "1:1" | "16:9" | "4:5" | "3:4"
  clips: Clip[]          // تراک اصلی — start ها «مشتق» است (جمع مدت‌ها)
  overlays: OverlayItem[] // PiP — start مطلق
  texts: TextItem[]       // تیتر/استیکر/زیرنویس — start/end مطلق
  audios: AudioItem[]     // موزیک/گوینده — start مطلق، in/out سورس
  markers: Marker[]
}

Clip { id, kind: video|image, assetId, name, in, out, speed 0.25..4,
       transform: TransformState, filter: FilterState, chroma: ChromaState,
       volume, muted, fadeIn, fadeOut, transitionIn{type,dur},
       srcDur, srcW, srcH, reverse?, stab?, mask?, enhance?, kf?: KeyframeMap }

KeyframeMap = Partial<Record<"scale"|"x"|"y"|"rotate"|"opacity", Keyframe[]>>
Keyframe { t (ثانیه از شروع آیتم), v, ease: linear|in|out|inout|back|elastic|bounce }
```

## قوانین
- **زمان کلیپ‌ها مشتق است**: `clipStart(p,id)` جمع clipDur قبلی‌هاست → reorder فقط با جابه‌جایی آرایه.
- **حذف کلیپ = ripple واقعی**: لایه‌هایی که بعد از کلیپِ حذف‌شده شروع می‌شوند به‌اندازهٔ حفره شیفت می‌شوند (VideoView.deleteSelected).
- **`totalDur`** = max(انتهای کلیپ‌ها، صداها، متن‌ها، **overlays**).
- **Keyframe time-local است**: برای کلیپ نسبت به شروع کلیپ، برای overlay/text نسبت به `start`.

## Persistence
- `creative-studio-projects` (IDB v2):
  - `projects`: {id, name, createdAt, updatedAt, aspect, thumb, project, clipCount, duration}
  - `blobs`: `${projectId}:${assetId}` → {blob, type}
  - `autosave`: slot "draft" → {projectId, name, project, savedAt, assetIds} + بولب‌ها با کلید `auto:${assetId}`
- **Autosave**: دیبانس ۲.۵s پس از هر تغییر (پخش تایمر را ریست می‌کند)؛ فقط بولب‌های جدید نوشته می‌شوند؛ هنگام mount بدون هندآف، پرامپت بازیابی نشان داده می‌شود.

## Migration (§75)
هر JSON قدیمی/ناقص → `normalizeProject()` → clamp اعداد، merge تنظیمات پیش‌فرض، فیلتر enumها، clamp زمان‌ها. هر تغییر آینده: فیلد را optional اضافه کن + normalize را گسترش بده + `PROJECT_SCHEMA_VERSION` را bump کن.
