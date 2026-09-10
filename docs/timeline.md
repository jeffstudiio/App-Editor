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

---

## ✅ پیاده‌سازی شد (Milestone 2) — Trim دستگیره‌ای + اسنپ مغناطیسی
`src/lib/video/edit-ops.ts` (خالص و تست‌شده) + `VideoView`:
- دستگیره‌های in/out روی کلیپ اصلی (سرعت-آگاه؛ کلیپ reverse مستثنا) — تراک مغناطیسی ripple خودکار دارد
- تغییر اندازهٔ لبه‌ای متن/صدا/رویی: صدا سرش را درجا تریم می‌کند (in+start با هم)، ویدئوی رویی srcIn را دنبال می‌کند
- **snapTime/snapPoints**: اسنپ به صفر/پلی‌هد/مرز کلیپ‌ها/لبهٔ لایه‌ها/نشانگرها (خودِ آیتم مستثنا) — آستانهٔ ۰.۱۵s
- ۲۰ تست جدید روی عملیات‌های خالص (مجموع ۶۳)
