# AI System

## لایهٔ Provider (فعلی)
- **default**: `z-ai-web-dev-sdk` (chat/asr/tts/image) — بدون کلید
- **openrouter**: BYO key از UI → body (فقط سرور مصرف می‌کند)
- **gemini**: BYO یا env `GEMINI_API_KEY` — ترنسپورت: `gemini-client.ts` (direct → corsfix → cors.lol با memoization)؛ تصویر: `gemini-image.ts` (Nano Banana)
- الگو در ۳ route تکرار شده (assistant/image-gen/image-edit) — Milestone 6: interface واحد `AIProvider`

## قابلیت‌های REAL امروزی
| قابلیت | مسیر |
|---|---|
| چت ۴ پرسونا + voice loop | `/api/assistant` + edge-tts |
| تصویرسازی/ویرایش تصویر | `/api/image-gen` `/api/image-edit` (default یا Gemini) |
| زیرنویس خودکار | `asr-client` (VAD محلی) → `/api/transcribe` |
| دوبله/ترجمه | `/api/translate` + `/api/edge-tts` |
| ویدئوساز | `/api/script-scenes` → image-gen → edge-tts → پروژه کامل |
| edit-plan | ۳ op واقعی: فیلتر/تیتر/پریست کپشن (اشاره §45: بعداً کامل) |

## AI Editing Agent — نقشهٔ اجرا (Milestone 6)
```
serializeProjectState(p) → context فشرده تایم‌لاین
   ↓ /api/agent (tool-calling، zod)
ops: [{op:"split", at}, {op:"setFilter", target, preset}, {op:"addText", ...}, ...]
   ↓ commands.ts (registry تایپ‌دار)
ctx.mutate گروهی + یک undo snapshot برای کل plan
   ↓ diff preview → تأیید کاربر → اجرا → verify (دوباره serialize)
```
فونداسیون آماده: `ctx.mutate` (command bus فعل)، `AiEditSheet.apply` (PoC)، preset libraries.

## امنیت (یافته‌های audit)
- کلیدها فقط سرور-side / BYO در localStorage (XSS risk → بعدها session HttpOnly)
- ⚠️ Rate limiting وجود ندارد → در Milestone 6 (middleware token-bucket)
- ⚠️ ورودی‌های base64 بدون cap سرور → cap + magic-byte check در Milestone 6
