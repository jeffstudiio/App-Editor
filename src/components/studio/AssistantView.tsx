"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Send, Trash2, LoaderCircle, Settings2, Eye, EyeOff, X, ExternalLink, Zap, Mic, Square } from "lucide-react";
import { ProviderStatusPanel } from "./ProviderStatusPanel";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PERSONAS, type PersonaId } from "@/lib/studio-data";
import { transcribeMedia } from "@/lib/video/asr-client";
import { consumeAssistantPrefill } from "@/lib/video/transfer";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ProviderCfg {
  apiKey: string;
  model: string;
}

interface AiSettings {
  provider: "default" | "openrouter" | "gemini";
  openrouter: ProviderCfg;
  gemini: ProviderCfg;
}

interface OrModel {
  id: string;
  name: string;
  context: number;
  paid?: boolean;
}

const STORAGE_PREFIX = "studio-chat:";
const AI_SETTINGS_KEY = "ai-assistant-settings";

export function AssistantView() {
  const [personaId, setPersonaId] = useState<PersonaId>("director");
  const [messagesByPersona, setMessagesByPersona] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    provider: "gemini",
    openrouter: { apiKey: "", model: "" },
    gemini: { apiKey: "", model: "" },
  });
  const [draftOrKey, setDraftOrKey] = useState("");
  const [draftGemKey, setDraftGemKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [orModels, setOrModels] = useState<OrModel[]>([]);
  const [gemModels, setGemModels] = useState<OrModel[]>([]);
  const [checkingOr, setCheckingOr] = useState(false);
  const [checkingGem, setCheckingGem] = useState(false);
  const [orError, setOrError] = useState("");
  const [gemError, setGemError] = useState("");
  const [gemServerKey, setGemServerKey] = useState(false);

  // voice chat (push-to-talk loop: mic → ASR → LLM → neural TTS)
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing" | "speaking">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const persona = PERSONAS.find((p) => p.id === personaId)!;
  const messages = messagesByPersona[personaId] ?? [];
  const activeCfg = aiSettings.provider === "default" ? null : aiSettings[aiSettings.provider];

  // Load chats from localStorage once
  useEffect(() => {
    try {
      const stored: Record<string, ChatMessage[]> = {};
      for (const p of PERSONAS) {
        const raw = localStorage.getItem(STORAGE_PREFIX + p.id);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) stored[p.id] = parsed;
        }
      }
      setMessagesByPersona(stored);
    } catch {
      // ignore corrupted storage
    }
  }, []);

  // Pre-fill from Home "دستیار تدوین" prompt bar (one-shot handoff)
  useEffect(() => {
    const pre = consumeAssistantPrefill();
    if (pre) setInput(pre);
  }, []);

  // Persist per persona
  useEffect(() => {
    if (messagesByPersona[personaId]) {
      localStorage.setItem(STORAGE_PREFIX + personaId, JSON.stringify(messagesByPersona[personaId]));
    }
  }, [messagesByPersona, personaId]);

  // Load AI provider settings (default engine vs user-owned keys) once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AI_SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const prov: AiSettings["provider"] =
          s?.provider === "openrouter" || s?.provider === "gemini" ? s.provider : "default";
        // migrate legacy flat format {provider, apiKey, model}
        const or: ProviderCfg =
          s?.openrouter?.apiKey || s?.openrouter?.model
            ? { apiKey: String(s.openrouter.apiKey ?? ""), model: String(s.openrouter.model ?? "") }
            : prov === "openrouter" && s?.apiKey
              ? { apiKey: String(s.apiKey), model: String(s.model ?? "") }
              : { apiKey: "", model: "" };
        const gem: ProviderCfg =
          s?.gemini?.apiKey || s?.gemini?.model
            ? { apiKey: String(s.gemini.apiKey ?? ""), model: String(s.gemini.model ?? "") }
            : { apiKey: "", model: "" };
        setAiSettings({ provider: prov, openrouter: or, gemini: gem });
        if (or.apiKey) setDraftOrKey(or.apiKey);
        if (gem.apiKey) setDraftGemKey(gem.apiKey);
      }
    } catch {
      // ignore corrupted storage
    }
  }, []);

  // Auto-check the Gemini engine (server-installed key or saved key) when its
  // settings section is opened, so the user sees a live status without typing a key
  useEffect(() => {
    if (settingsOpen && aiSettings.provider === "gemini" && gemModels.length === 0 && !checkingGem) {
      void checkGemini();
    }
  }, [settingsOpen, aiSettings.provider]);

  // release mic/speaker on unmount
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    },
    []
  );

  // Auto scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading, personaId]);

  const stripMd = (s: string) =>
    s
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\bhttps?:\/\/\S+/g, " ")
      .replace(/[#*_>`~\[\]|]/g, " ")
      .replace(/^\s*[-•]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();

  // speak the assistant reply with a Persian neural voice
  const speakReply = useCallback(async (content: string) => {
    const text = stripMd(content);
    if (!text) return;
    try {
      audioRef.current?.pause();
      setVoiceState("speaking");
      const res = await fetch("/api/edge-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 900), voice: "fa-IR-DilaraNeural" }),
      });
      if (!res.ok) throw new Error("tts");
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setVoiceState("idle");
      await audio.play();
    } catch {
      setVoiceState("idle");
      toast.info("پخش صدای پاسخ ناموفق بود");
    }
  }, []);

  const send = useCallback(
    async (text: string, opts?: { speak?: boolean }) => {
      const content = text.trim();
      if (!content || loading) return;

      const prov = aiSettings.provider;
      const cfg = prov === "default" ? null : aiSettings[prov];
      if (prov === "openrouter" && (!cfg?.apiKey || !cfg?.model)) {
        toast.error("تنظیمات OpenRouter ناقصه؛ کلید و مدل رو انتخاب کن");
        setSettingsOpen(true);
        return;
      }
      // Gemini runs even with an empty local config — the server has a key installed

      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const userMsg: ChatMessage = { role: "user", content };
      const history = [...(messagesByPersona[personaId] ?? []), userMsg];
      setMessagesByPersona((prev) => ({ ...prev, [personaId]: history }));
      setLoading(true);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personaId,
            messages: history,
            ...(prov === "gemini"
              ? { provider: "gemini", apiKey: cfg?.apiKey ?? "", model: cfg?.model ?? "" }
              : cfg
                ? { provider: prov, apiKey: cfg.apiKey, model: cfg.model }
                : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.content) {
          throw new Error(data?.error || "خطای نامشخص");
        }
        if (data.notice) toast.warning(data.notice);
        if (
          data.engine === "gemini" &&
          data.via &&
          data.via !== "direct" &&
          !localStorage.getItem("gemini-via-toast")
        ) {
          localStorage.setItem("gemini-via-toast", "1");
          toast.info("جمنای از مسیر واسط پاسخ داد — بدون نیاز به VPN ✅");
        }
        const aiMsg: ChatMessage = { role: "assistant", content: data.content };
        // userMsg is already in state (added optimistically before the fetch)
        setMessagesByPersona((prev) => ({
          ...prev,
          [personaId]: [...(prev[personaId] ?? []), aiMsg].slice(-40),
        }));
        if (opts?.speak) void speakReply(data.content);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ارسال پیام ناموفق بود");
        // roll back optimistic user message
        setMessagesByPersona((prev) => ({ ...prev, [personaId]: messagesByPersona[personaId] ?? [] }));
      } finally {
        setLoading(false);
      }
    },
    [loading, messagesByPersona, personaId, aiSettings, speakReply]
  );

  const checkOpenRouter = async () => {
    const key = draftOrKey.trim();
    if (!key) {
      setOrError("اول کلید رو وارد کن");
      return;
    }
    setCheckingOr(true);
    setOrError("");
    try {
      const res = await fetch("/api/openrouter/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "خطای نامشخص");
      const list: OrModel[] = Array.isArray(data.models) ? data.models : [];
      setOrModels(list);
      toast.success(`کلید معتبره — ${list.length} مدل رایگان پیدا شد`);
    } catch (e) {
      setOrError(e instanceof Error ? e.message : "خطا در دریافت مدل‌ها");
    } finally {
      setCheckingOr(false);
    }
  };

  const checkGemini = async () => {
    const key = draftGemKey.trim();
    setCheckingGem(true);
    setGemError("");
    try {
      const res = await fetch("/api/gemini/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      setGemServerKey(Boolean(data?.serverKey));
      if (!data?.ok) throw new Error(data?.error || "خطای نامشخص");
      const list: OrModel[] = Array.isArray(data.models) ? data.models : [];
      setGemModels(list);
      const viaNote = data.via && data.via !== "direct" ? " (مسیر واسط)" : "";
      // ممیزی: لیست ثابتِ جایگزین (geo-block) نباید «لایو» جشن گرفته شود — صادقانه اعلام کن
      if (data.fallback) {
        toast.warning(
          `گوگل از این سرور در دسترس نبود — لیست پیش‌فرض ثابت نشان داده شد (${list.length} مدل). اتصال/کلید را تست کن.`,
        );
      } else {
        toast.success(
          key
            ? `کلید معتبره — ${list.length} مدل Gemini پیدا شد${viaNote}`
            : `کلید سرور فعاله — ${list.length} مدل Gemini پیدا شد${viaNote}`,
        );
      }
      // auto-pick a sensible default chat model if nothing chosen yet
      setAiSettings((s) => {
        if (s.gemini.model) return s;
        const pick = list.find((m) => m.id === "gemini-3.6-flash")?.id ?? list[0]?.id ?? "";
        return pick ? { ...s, gemini: { ...s.gemini, model: pick } } : s;
      });
    } catch (e) {
      setGemError(e instanceof Error ? e.message : "خطا در دریافت مدل‌ها");
    } finally {
      setCheckingGem(false);
    }
  };

  const saveSettings = () => {
    const prov = aiSettings.provider;
    if (prov === "openrouter") {
      const key = draftOrKey.trim();
      const model = aiSettings.openrouter.model;
      if (!key || !model) {
        setOrError("برای OpenRouter هم کلید و هم مدل لازمه");
        return;
      }
      const next: AiSettings = {
        provider: "openrouter",
        openrouter: { apiKey: key, model },
        gemini: aiSettings.gemini,
      };
      setAiSettings(next);
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
    } else {
      // Gemini (or internal): empty key/model is fine — the server key covers it;
      // saved keys are kept because Retouch reuses the Gemini key
      const next: AiSettings = {
        provider: prov,
        openrouter: aiSettings.openrouter,
        gemini: { apiKey: draftGemKey.trim(), model: aiSettings.gemini.model },
      };
      setAiSettings(next);
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
    }
    toast.success("تنظیمات دستیار ذخیره شد");
    setSettingsOpen(false);
  };

  const startRecording = useCallback(async () => {
    try {
      audioRef.current?.pause();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 2000) {
          setVoiceState("idle");
          toast.info("صدایی ضبط نشد؛ دوباره امتحان کن");
          return;
        }
        setVoiceState("transcribing");
        try {
          const segs = await transcribeMedia(blob, () => {}, { maxSegments: 40 });
          const text = segs.map((s) => s.text).join(" ").trim();
          if (!text) {
            toast.info("چیزی شنیده نشد؛ نزدیک‌تر به میکروفون حرف بزن");
            setVoiceState("idle");
            return;
          }
          await send(text, { speak: true });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "تبدیل گفتار به متن ناموفق بود");
        } finally {
          setVoiceState("idle");
        }
      };
      recRef.current = mr;
      mr.start();
      setVoiceState("recording");
    } catch {
      toast.error("دسترسی به میکروفون داده نشد — از تنظیمات مرورگر اجازه بده");
      setVoiceState("idle");
    }
  }, [send]);

  const micClick = () => {
    if (voiceState === "recording") {
      const rec = recRef.current;
      if (rec && rec.state === "recording") rec.stop();
    } else if (voiceState === "idle") {
      void startRecording();
    }
  };

  const clearChat = () => {
    setMessagesByPersona((prev) => ({ ...prev, [personaId]: [] }));
    localStorage.removeItem(STORAGE_PREFIX + personaId);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-72px)] pt-3">
      {/* Persona selector */}
      <div className="px-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="انتخاب پرسونا">
          {PERSONAS.map((p) => {
            const active = p.id === personaId;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={active}
                onClick={() => setPersonaId(p.id)}
                className={`shrink-0 flex items-center gap-2 rounded-full px-3.5 py-2 border transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  active
                    ? "border-transparent text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
                style={active ? { background: `linear-gradient(120deg, ${p.color}2e, ${p.color}14)`, borderColor: `${p.color}55` } : undefined}
              >
                <span className="text-base leading-none">{p.emoji}</span>
                <span className={`text-xs ${active ? "font-bold" : ""}`}>{p.name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2 gap-2">
          <p className="text-[11px] text-muted-foreground px-1 truncate">{persona.emoji} {persona.tagline}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            {(aiSettings.provider === "gemini" || (activeCfg?.apiKey && activeCfg?.model)) && (
              <span
                className={`flex items-center gap-1 text-[10px] rounded-full px-2 py-1 max-w-[150px] border ${
                  aiSettings.provider === "gemini"
                    ? "text-emerald-300/90 border-emerald-400/30 bg-emerald-400/10"
                    : "text-amber-300/90 border-amber-400/30 bg-amber-400/10"
                }`}
                title={aiSettings.provider === "gemini" ? "موتور Gemini فعال است" : "موتور OpenRouter فعال است"}
              >
                {aiSettings.provider === "gemini" ? (
                  <span className="leading-none">💎</span>
                ) : (
                  <Zap size={10} className="shrink-0" />
                )}
                <span dir="ltr" className="truncate">
                  {aiSettings.provider === "gemini"
                    ? aiSettings.gemini.model || "Gemini"
                    : activeCfg?.model.replace(":free", "")}
                </span>
              </span>
            )}
            <button
              onClick={() => {
                setDraftOrKey(aiSettings.openrouter.apiKey);
                setDraftGemKey(aiSettings.gemini.apiKey);
                setOrError("");
                setGemError("");
                setSettingsOpen(true);
              }}
              aria-label="تنظیمات هوش مصنوعی"
              className="w-8 h-8 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors"
            >
              <Settings2 size={14} />
            </button>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
            >
              <Trash2 size={12} />
              پاک کردن
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin px-4 py-3 space-y-3" aria-live="polite">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 -mt-4">
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl mb-4"
              style={{ background: `linear-gradient(135deg, ${persona.color}30, ${persona.color}0d)`, border: `1px solid ${persona.color}40` }}
            >
              {persona.emoji}
            </div>
            <h3 className="font-bold">با {persona.name} چت کن</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-6">
              موضوعت رو بگو تا از صفر تا صد کمکت کنم.
              <br />
              یا یکی از پیشنهادهای پایین رو امتحان کن
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-7 ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-br-md"
                    : "bg-card border border-border rounded-bl-md"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="chat-md">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${d * 0.15}s` }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {persona.quickPrompts.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={loading}
              className="shrink-0 max-w-[260px] truncate text-[11px] text-muted-foreground border border-border bg-card hover:border-primary/40 hover:text-foreground rounded-full px-3 py-2 transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="px-3 pb-2 pt-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-3xl border border-border bg-card p-2 focus-within:border-primary/50 transition-colors"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={`پیامت رو به ${persona.name} بنویس…`}
            rows={1}
            className="flex-1 bg-transparent outline-none resize-none text-[13px] leading-6 px-2 py-1.5 placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={micClick}
            aria-label={voiceState === "recording" ? "پایان ضبط و ارسال" : "گفتگوی صوتی"}
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              voiceState === "recording"
                ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
                : "border border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {voiceState === "transcribing" ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : voiceState === "recording" ? (
              <Square size={14} />
            ) : (
              <Mic size={16} />
            )}
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="ارسال"
            className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg shadow-fuchsia-500/20 disabled:opacity-40 disabled:shadow-none transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {loading ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={17} className="-scale-x-100" />}
          </button>
        </form>
        {voiceState !== "idle" && (
          <p className="text-[10px] text-center text-muted-foreground mt-1.5" aria-live="polite">
            {voiceState === "recording"
              ? "🔴 در حال ضبط… دوباره بزن تا ارسال و پخش صوتی شود"
              : voiceState === "transcribing"
                ? "در حال تبدیل گفتار به متن…"
                : "در حال پخش پاسخ صوتی… 🎧"}
          </p>
        )}
      </div>

      {/* AI engine settings sheet */}
      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="تنظیمات هوش مصنوعی">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              onClick={() => setSettingsOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute bottom-0 inset-x-0 rounded-t-3xl border-t border-border bg-card max-h-[88dvh] overflow-y-auto scroll-thin overscroll-contain"
            >
              <div className="p-5 pb-9 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm">موتور هوش مصنوعی دستیار</h3>
                  <button
                    onClick={() => setSettingsOpen(false)}
                    aria-label="بستن"
                    className="w-8 h-8 rounded-full bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Provider status matrix (§34) */}
                <ProviderStatusPanel />

                {/* Provider cards */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setAiSettings((s) => ({ ...s, provider: "default" }))}
                    className={`rounded-2xl border p-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      aiSettings.provider === "default"
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-muted/30 hover:border-primary/30"
                    }`}
                  >
                    <p className="text-[12px] font-bold">🤖 داخلی</p>
                    <p className="text-[9px] text-muted-foreground mt-1 leading-4">بدون کلید</p>
                  </button>
                  <button
                    onClick={() => setAiSettings((s) => ({ ...s, provider: "openrouter" }))}
                    className={`rounded-2xl border p-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      aiSettings.provider === "openrouter"
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-muted/30 hover:border-primary/30"
                    }`}
                  >
                    <p className="text-[12px] font-bold">⚡ OpenRouter</p>
                    <p className="text-[9px] text-muted-foreground mt-1 leading-4">مدل‌های رایگان</p>
                  </button>
                  <button
                    onClick={() => setAiSettings((s) => ({ ...s, provider: "gemini" }))}
                    className={`rounded-2xl border p-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      aiSettings.provider === "gemini"
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-muted/30 hover:border-primary/30"
                    }`}
                  >
                    <p className="text-[12px] font-bold">💎 Gemini</p>
                    <p className="text-[9px] text-muted-foreground mt-1 leading-4">گوگل + نانو‌بنانا</p>
                  </button>
                </div>

                {aiSettings.provider === "openrouter" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>۱. از سایت OpenRouter یک کلید رایگان بساز:</span>
                      <a
                        href="https://openrouter.ai/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded"
                      >
                        openrouter.ai/keys
                        <ExternalLink size={11} />
                      </a>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          dir="ltr"
                          type={showKey ? "text" : "password"}
                          value={draftOrKey}
                          onChange={(e) => setDraftOrKey(e.target.value)}
                          placeholder="sk-or-v1-..."
                          autoComplete="off"
                          className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-[12px] font-mono outline-none focus:border-primary/60 placeholder:text-muted-foreground/60"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((v) => !v)}
                          aria-label={showKey ? "پنهان کردن کلید" : "نمایش کلید"}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground outline-none"
                        >
                          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={checkOpenRouter}
                        disabled={checkingOr}
                        className="shrink-0 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold px-3 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        {checkingOr ? "بررسی…" : "بررسی و دریافت مدل‌ها"}
                      </button>
                    </div>
                    {orError && <p className="text-[11px] text-destructive">{orError}</p>}

                    {orModels.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground">۲. مدل را انتخاب کن (رایگان‌ها اول، 💰 = پولی):</p>
                        <Select value={aiSettings.openrouter.model} onValueChange={(v) => setAiSettings((s) => ({ ...s, openrouter: { ...s.openrouter, model: v } }))}>
                          <SelectTrigger className="w-full text-[12px]">
                            <SelectValue placeholder="انتخاب مدل" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {orModels.map((m) => (
                              <SelectItem key={m.id} value={m.id} className="text-[12px]">
                                {m.name} · {(m.context / 1024).toFixed(0)}K{m.paid ? " · 💰" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-[11px] leading-6 text-amber-200/90">
                      <p className="font-bold mb-0.5">محدودیت نسخه رایگان</p>
                      <p>
                        حدود ۲۰ درخواست در دقیقه و ۵۰ درخواست در روز (با شارژ ۱۰ دلاری: ۱۰۰۰ در روز).
                        اگر مدل رایگان به سقف بخورد، خودکار با دستیار داخلی جواب می‌گیری.
                        مدل‌های 💰 (جمنای گوگل) با شارژ حساب کار می‌کنن و محدودیت منطقه‌ای ندارن.
                        بعضی مدل‌های رایگان هم ممکن‌اند گفتگوها را برای آموزش نگه دارند — محتوای خیلی خصوصی نفرست.
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-5">
                      کلید فقط روی همین گوشی ذخیره می‌شود و فقط برای درخواست‌های خودت به OpenRouter فرستاده می‌شود.
                    </p>
                  </div>
                )}

                {aiSettings.provider === "gemini" && (
                  <div className="space-y-3">
                    {gemServerKey && (
                      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[11px] leading-5 text-emerald-200/90">
                        ✅ کلید گوگل روی سرور اپ نصب شده — بدون وارد کردن کلید هم چت جمنای کار می‌کنه.
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>۱. کلید شخصی (اختیاری — جایگزین کلید سرور):</span>
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded"
                      >
                        aistudio.google.com/apikey
                        <ExternalLink size={11} />
                      </a>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          dir="ltr"
                          type={showKey ? "text" : "password"}
                          value={draftGemKey}
                          onChange={(e) => setDraftGemKey(e.target.value)}
                          placeholder="کلید گوگل (اختیاری)"
                          autoComplete="off"
                          className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-[12px] font-mono outline-none focus:border-primary/60 placeholder:text-muted-foreground/60"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((v) => !v)}
                          aria-label={showKey ? "پنهان کردن کلید" : "نمایش کلید"}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground outline-none"
                        >
                          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={checkGemini}
                        disabled={checkingGem}
                        className="shrink-0 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold px-3 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        {checkingGem ? "بررسی…" : "بررسی و دریافت مدل‌ها"}
                      </button>
                    </div>
                    {gemError && <p className="text-[11px] text-destructive">{gemError}</p>}

                    {gemModels.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground">۲. مدل Gemini را انتخاب کن:</p>
                        <Select value={aiSettings.gemini.model} onValueChange={(v) => setAiSettings((s) => ({ ...s, gemini: { ...s.gemini, model: v } }))}>
                          <SelectTrigger className="w-full text-[12px]">
                            <SelectValue placeholder="انتخاب مدل" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {gemModels.map((m) => (
                              <SelectItem key={m.id} value={m.id} className="text-[12px]">
                                {m.name} · {(m.context / 1000).toFixed(0)}K
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3 text-[11px] leading-6 text-emerald-200/90">
                      <p className="font-bold mb-0.5">🍌 نانو‌بنانا (تولید و ویرایش تصویر)</p>
                      <p>
                        توی استودیو «روتوش» موتور «نانو‌بنانا» رو انتخاب کن. نکته: گوگل سهمیهٔ پلن رایگانِ مدل تصویری رو صفر گذاشته — برای استفاده باید توی کنسول گوگل روی پروژه‌ات Billing فعال کنی (چند سنت برای هر تصویر). بدون Billing، موتور داخلی کار رو انجام می‌ده.
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-[11px] leading-6 text-amber-200/90">
                      <p className="font-bold mb-0.5">نکته دسترسی و سهمیه</p>
                      <p>
                        اپ خودش چند مسیر رو امتحان می‌کنه: اول اتصال مستقیم، بعد مسیر واسط — پس محدودیت منطقه‌ای گوگل معمولاً خودکار دور زده می‌شه. مدل فلش حدود ۲۰ درخواست در دقیقه سهمیه رایگان داره؛ اگر پر شد خودکار با دستیار داخلی جواب می‌گیری. درخواست‌های مسیر واسط از یک پروکسی عمومی عبور می‌کنن — محتوای خیلی خصوصی نفرست.
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-5">
                      کلید شخصی فقط روی همین گوشی ذخیره می‌شود و فقط برای درخواست‌های خودت به Google فرستاده می‌شود.
                    </p>
                  </div>
                )}

                <button
                  onClick={saveSettings}
                  className="w-full rounded-2xl bg-gradient-to-l from-violet-500 to-fuchsia-500 text-white font-bold text-[13px] py-3 shadow-lg shadow-fuchsia-500/20 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  ذخیره
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
