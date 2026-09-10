# Template System

## دو سیستم فعلی (تا Milestone 5 یکی می‌شوند)
1. **Edit Recipes** (`lib/video/templates.ts`) — ۳۰ «دستور ویرایش»: aspect+filter+captionPreset+transition+title روی پروژهٔ جاری اعمال می‌شود. بدون ذخیره‌سازی. (آمار جعلی حذف شد — §82)
2. **Template Bank** (`lib/template-bank/*`) — ۸۷ قالب slot-based در ۱۰ دسته:
   - Schema: `BankTemplate { id, cat, slots[], texts[], scenes[], art }` — `MediaSlot.url?` برای بستهٔ کامل ابری (فقط http(s) مطلق — sanitize)
   - پخش‌کنندهٔ زندهٔ DOM (motions.ts) + `bank-apply.ts` → ساخت Project واقعی برای ادیتور (جایگرین گرادیانی برای اسلات خالی)
   - **بانک من**: قالب‌سازی کاربر در IDB `creative-studio-bank` + خروجی JSON برای انتشار
   - منبع ابری: آدرس JSON قابل تعویض (`template-bank-source`)

## Target Schema (§35 — سازگار با Bank فعلی)
```json
{ "id": "beauty-hair-reel-01", "name": "Luxury Hair Reveal", "category": "beauty",
  "duration": 15, "aspectRatio": "9:16", "scenes": [], "mediaSlots": [],
  "textSlots": [], "audioSlots": [], "animations": [], "effects": [], "transitions": [] }
```
- دستهٔ **beauty** (hair/makeup/skincare/nails) اولین extension بعد از Milestone 4
- Create Template از پروژه (§64): Project → تعریف اسلات‌ها → ذخیره در بانک من (همین مسیر ImportSheet برای فایل‌ها)

## قواعد
- هر قالب باید «با یک لمس ویدئوی کامل» پخش شود (رسانهٔ پیش‌فرض withDefaults)
- کاور کارت = پوستر فریم اول / ویدئوی زندهٔ نوار ویژه
- هیچ آمار نمایشی جعلی مجاز نیست
