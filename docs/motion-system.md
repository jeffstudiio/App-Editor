# Motion System — Keyframe Engine v1

فایل: `src/lib/video/keyframes.ts` • اتصال: `engine.ts` (drawClip/drawOverlay/texts)

## مدل
```ts
Keyframe { t, v, ease }        // t نسبت به شروع آیتم (لوکال)
KeyframeMap = Partial<Record<KfProp, Keyframe[]>>  // scale|x|y|rotate|opacity
```
- `evalKf(keys, t, fallback)`: قبل از اولین/بعد از آخرین کلید → clamp؛ بین دو کلید → ease **کلید دوم**
- Easingها: linear, in, out, inout, back, elastic, bounce
- `upsertKey` (گام ۰.۰۵s، dedupe نزدیک‌تر از ۰.۰۲۴s) / `removeKeyAt` / `sortKeys`

## مصرف در رندر
- **Clip**: `ktf` = transform با override از kf در زمان لوکال → alpha، translate، rotate، scale — همهٔ مسیرها (پخش + export از همان drawFrame می‌گذرند)
- **Overlay**: همین منطق با `t - ov.start`
- **Text**: override opacity/x/y/rotate + scale ضریبِ size

## UI
شیت «کی‌فریم» (ابزار Diamond روی کلیپ/لایه): پنج ردیف پراپرتی —
«کلید اینجا» (مقدار لحظهٔ پلی‌هد)، اسلایدر زنده (اگر روی کلید باشی همان کلید را جابه‌جا می‌کند)، چیپ کلیدها (کلیک=پرش، آیکن چرخش=تغییر ease، ×=حذف).

## بعدی (Milestone 3)
Graph/Curve editor (value+speed، Bezier handles) روی همین ساختار؛ keyframe برای volume/color/mask؛ copy-paste keyframe.
