# Architecture — Current & Target

## Current (as-built)

```
src/app/page.tsx (SPA هش‌محور، ۱۲ ویو، RTL)
├── Views (components/studio/*)
│   ├── HomeView ─────────── پروژه‌ها + پرامپت → دستیار
│   ├── VideoView ────────── ادیتور اصلی (canvas + WebAudio + MediaRecorder)
│   │   └── Sheets: Media/Clip/Look/Motion/Transition/Chroma/Text/Audio/
│   │        Captions/Dub/AiEdit/Templates/AutoVideo/Markers/Export/
│   │        Stickers/Sfx/Mask/AiClipper/Extend/Save/Keyframe
│   ├── TemplateBankView ─── بانک ۸۷ قالبی + Player + ImportSheet
│   ├── TemplatesGallery ─── ۳۰ دستور ویرایش (apply روی پروژه)
│   ├── StoryView ────────── طراح استوری (PNG export)
│   ├── DesignStudioView ─── تصویر AI + کیت برند
│   ├── RetouchView ──────── روتوش canvas + AI enhance
│   ├── SubtitleView ─────── ASR + SRT/PNG
│   ├── VideoStudioView ──── ویدئوساز AI (autovid)
│   ├── AssistantView ────── چت/صدای AI
│   └── ExploreView ──────── جستجوی تصویر
├── Engines (lib/video/*): engine, filters, keyframes, sfx, templates,
│   bank-apply, asr-client, ai-clipper, autovid, gemini-client/image, transfer
├── Data (lib/*): types.ts (Project model), projects-db (IDB v2: projects+blobs+autosave),
│   custom-bank (IDB bank), template-bank/* (87 قالب)
└── API (app/api/*): assistant, image-gen, image-edit, transcribe, edge-tts,
    tts, translate, script-scenes, edit-plan, explore, gemini/models, openrouter/models
```

**State**: React per-view + `transfer.ts` (هندآف بین ویوها) + ۷ کلید localStorage + ۲ دیتابیس IndexedDB.
**قانون**: هیچ کلید API در کد کلاینت نیست؛ OpenRouter BYO از UI، Gemini BYO یا env سرور.

## Target (طبق Specification §5)

```
Presentation  → Dashboard / ProjectManager / VideoEditor / ImageEditor /
                StoryStudio / TemplateBrowser / AssetLibrary / AIAssistant / ExportCenter
Application   → ProjectEngine ✅(v1) / TimelineEngine 🔶(drag+ripple v1) /
                MotionEngine ✅(keyframe v1، graph بعدی) / AudioEngine 🔶 /
                CaptionEngine 🔶(SRT+burn؛ word-timing بعدی) / ImageEngine 🔶 /
                TemplateEngine ✅ / AssetEngine ❌ / AIAgent 🔶 / RenderEngine 🔶
Infrastructure→ IDB (projects/autosave/bank/assets) / API routes / AI providers / Workers ❌
```

## اصول تغییرناپذیر
1. **UI جدا از منطق**: هر قابلیت جدید = lib خالص + اتصال نازک UI (مثل keyframes.ts)
2. **No Fake Features (§82)**: هر دکمه باید واقعاً اجرا کند یا نباشد
3. **Backward compat (§75)**: هر تغییر Project schema → `normalizeProject` + bump `PROJECT_SCHEMA_VERSION`
4. **Mobile-first اما موتور مشترک**: همان engine در بیلد گوشی (استاتیک) و سرور
5. **Commit per milestone (§85)** + build/typecheck/test قبل از push (§86)
