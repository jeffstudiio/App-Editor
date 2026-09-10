// ─────────────────────────────────────────────────────────────
// Model registry — تک منبع حقیقت برای نام مدل‌ها
// (قبلاً در ۵ نقطه هاردکد بود — §39 audit debt)
// ─────────────────────────────────────────────────────────────

export const MODELS = {
  geminiText: "gemini-3.6-flash",
  geminiImage: "gemini-3.1-flash-image",
  groqText: "llama-3.3-70b-versatile",
  hfChat: "meta-llama/Llama-3.1-8B-Instruct",
  hfEmbed: "intfloat/multilingual-e5-large",
  jinaEmbed: "jina-embeddings-v3",
} as const;

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
export const HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";
export const HF_WHOAMI_URL = "https://huggingface.co/api/whoami-v2";
export const JINA_EMBED_URL = "https://api.jina.ai/v1/embeddings";
