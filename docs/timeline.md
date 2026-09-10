# Timeline Engine

## مدل فعلی
- **تراک اصلی**: کلیپ‌های متوالی — starts مشتق؛ حذف/جابه‌جایی = آرایه‌ای
- **لایه‌ها**: overlay (PiP) / text (تیتر+کپشن) / audio — start مطلق + درگ افقی با snap (پلی‌هد، صفر، گام ۰.۰۵s)
- **درگ & reorder (جدید)**: کلیپ = جابه‌جایی ترتیب (آستانهٔ تپ ۶px)؛ لایه = جابه‌جایی زمان؛ touch-action none روی آیتم‌ها؛ suppress click پس از درگ
- **Playhead/Scrub**: pointer روی timeline با sample ثابت
- **Undo**: ۶۰ snapshot JSON — گروه‌بندی coalesce در Milestone 2

## تراک‌های هدف (Milestone 2+)
```
Video | Overlay | Image | Text | Caption | Adjustment | Music | Voice | SFX
هر تراک: lock/hide/mute/solo/rename/duplicate/delete/reorder
```
گام اول: تبدیل آرایه‌های تخت به `tracks: Track[]` با `normalizeProject` سازگار (مایگریشن از مدل فعلی: نگاشت ۱:۱ به تراک‌های پیش‌فرض).
