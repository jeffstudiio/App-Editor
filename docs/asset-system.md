# Asset System — وضعیت و نقشه

## فعلی (پراکنده اما واقعی)
| منبع | محل | محتوا |
|---|---|---|
| رسانهٔ پروژه | memory (objectURL) + IDB blobs هنگام ذخیره | video/image/audio کاربر |
| بانک پیش‌فرض | `public/bank-media/` | ۱۰ bg video + ۹ موزیک + پوسترها (۱۰۰٪ سینتی، CC0) |
| بانک من | IDB `creative-studio-bank` | رسانهٔ قالب‌های کاربر |
| Explore | ریموت (URL) | ذخیره فقط URL — روت می‌شود |
| SFX | سینتیز OfflineAudioContext | ۸ جلوه تولیدی |

## Milestone 5 — Asset Library واحد
- IDB `creative-studio-assets`: {id, type, name, tags[], favorite, lastUsed, blob, license}
- دسته‌ها: PNG (arrows/frames/leaks/…)، Video overlays، Music، SFX، Fonts، Stickers
- Search بر اساس name/tag/type/favorite/recent
- مهاجرت bank-media به همان API (منبع فایل همان public می‌ماند)
- **متادیتای license برای هر asset الزامی** (§40)
