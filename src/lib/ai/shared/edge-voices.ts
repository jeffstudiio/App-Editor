// ─────────────────────────────────────────────────────────────
// Edge TTS voices — تک‌منبع مشترک بین types ویرایشگر، provider سرور
// و پیاده‌سازی مرورگری. بدون هیچ وابستگی Node (fs/stream ممنوع)
// ─────────────────────────────────────────────────────────────

export interface EdgeVoice {
  id: string;
  name: string;
  lang: string;
  gender: "f" | "m";
}

export const EDGE_VOICES: EdgeVoice[] = [
  { id: "fa-IR-DilaraNeural", name: "دلا — زن", lang: "fa", gender: "f" },
  { id: "fa-IR-FaridNeural", name: "فرید — مرد", lang: "fa", gender: "m" },
  { id: "en-US-AriaNeural", name: "آریا — زن (آمریکایی)", lang: "en", gender: "f" },
  { id: "en-US-GuyNeural", name: "گای — مرد (آمریکایی)", lang: "en", gender: "m" },
  { id: "en-GB-SoniaNeural", name: "سونیا — زن (بریتانیایی)", lang: "en", gender: "f" },
  { id: "ar-SA-ZariyahNeural", name: "زاریه — زن", lang: "ar", gender: "f" },
  { id: "ar-SA-HamedNeural", name: "حامد — مرد", lang: "ar", gender: "m" },
  { id: "tr-TR-EmelNeural", name: "امل — زن", lang: "tr", gender: "f" },
  { id: "tr-TR-AhmetNeural", name: "احمد — مرد", lang: "tr", gender: "m" },
  { id: "zh-CN-XiaoxiaoNeural", name: "شیائوشیاو — زن", lang: "zh", gender: "f" },
  { id: "zh-CN-YunxiNeural", name: "یونشی — مرد", lang: "zh", gender: "m" },
  { id: "es-ES-ElviraNeural", name: "الویرا — زن", lang: "es", gender: "f" },
  { id: "es-ES-AlvaroNeural", name: "آلوارو — مرد", lang: "es", gender: "m" },
];

/** مجموعهٔ شناسه‌ها برای اعتبارسنجی سمت سرور/مرورگر */
export const EDGE_VOICE_IDS: Set<string> = new Set(EDGE_VOICES.map((v) => v.id));
