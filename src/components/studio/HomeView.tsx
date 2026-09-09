"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles, Send, Clapperboard, Wand2, LayoutTemplate, Film, Brush,
  Subtitles, Palette, ChevronLeft, Trash2, Copy, Play, FolderOpen, Camera, CloudUpload,
} from "lucide-react";
import { toast } from "sonner";
import type { ViewId } from "./BottomNav";
import { setAssistantPrefill, setPendingProject, setPendingTemplate } from "@/lib/video/transfer";
import { listProjects, loadProject, deleteProject, duplicateProject, type SavedProjectMeta } from "@/lib/projects-db";

const QUICK_ACTIONS: { id: ViewId; title: string; desc: string; icon: React.ElementType; gradient: string }[] = [
  { id: "design", title: "تصویر AI", desc: "از متن به تصویر", icon: Wand2, gradient: "from-pink-500/30 to-rose-500/20" },
  { id: "vstudio", title: "ویدئوساز", desc: "سناریو → ویدئو", icon: Film, gradient: "from-[#c16a52]/30 to-[#6f2f2a]/20" },
  { id: "bank", title: "تمپلیت‌ها", desc: "بانک قالب‌های تدوین", icon: LayoutTemplate, gradient: "from-[#e0a78f]/30 to-[#9c453d]/20" },
  { id: "retouch", title: "ارتقای کیفیت", desc: "روتوش چهره و رنگ", icon: Brush, gradient: "from-amber-500/30 to-orange-500/20" },
  { id: "subtitle", title: "زیرنویس", desc: "خودکار فارسی", icon: Subtitles, gradient: "from-amber-500/30 to-[#c16a52]/20" },
  { id: "story", title: "استوری", desc: "طراح پست و استوری", icon: Palette, gradient: "from-rose-500/30 to-pink-500/20" },
];

const SUITE: { id: ViewId; title: string; desc: string; emoji: string; gradient: string }[] = [
  { id: "vstudio", title: "استودیو ویدئو AI", desc: "بگو چه می‌خواهی، ساخته می‌شود", emoji: "🎬", gradient: "from-[#9c453d] to-[#c16a52]" },
  { id: "design", title: "استودیو طراحی", desc: "تصور کن. طراحی کن.", emoji: "🎨", gradient: "from-[#6f2f2a] to-[#9c453d]" },
  { id: "bank", title: "بانک تمپلیت", desc: "جای‌گذاری رسانه + موشن آماده", emoji: "✨", gradient: "from-[#c16a52] to-[#e0a78f]" },
];

const ROADMAP = [
  { icon: Camera, label: "آواتار سخنگو (AI Character)" },
  { icon: CloudUpload, label: "همگام‌سازی ابری پروژه‌ها" },
];

export function HomeView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState<SavedProjectMeta[]>([]);

  const refresh = () => {
    listProjects().then((ps) => setProjects(ps.slice(0, 6))).catch(() => {});
  };
  useEffect(refresh, []);

  const sendPrompt = () => {
    const t = prompt.trim();
    if (!t) return;
    setAssistantPrefill(t);
    setPrompt("");
    onNavigate("assistant");
  };

  const openProject = async (meta: SavedProjectMeta) => {
    try {
      const loaded = await loadProject(meta.id);
      if (!loaded) throw new Error("پیدا نشد");
      const proj = loaded.project as {
        audios?: { assetId: string; srcDur?: number }[];
        clips?: { assetId: string; srcDur?: number }[];
      };
      const assets = loaded.assets.map((a) => {
        const type = a.type.startsWith("video") ? "video" : a.type.startsWith("audio") ? "audio" : "image";
        let duration = 0;
        if (type === "audio") duration = proj.audios?.find((x) => x.assetId === a.id)?.srcDur ?? 0;
        if (type === "video") duration = proj.clips?.find((x) => x.assetId === a.id)?.srcDur ?? 10;
        return {
          id: a.id,
          type: type as "video" | "audio" | "image",
          url: URL.createObjectURL(a.blob),
          name: `${meta.name}-${a.id.slice(-4)}`,
          duration,
          width: 1080,
          height: 1920,
        };
      });
      // durations re-probe lazily by engine; set rough ones for audio/video from project JSON asset meta is not stored — acceptable defaults
      setPendingProject({ project: loaded.project, assets, name: loaded.meta.name });
      toast.success(`پروژه «${loaded.meta.name}» باز شد`);
      onNavigate("video");
    } catch {
      toast.error("باز کردن پروژه ناموفق بود");
    }
  };

  const removeProject = async (id: string) => {
    await deleteProject(id);
    toast.success("پروژه حذف شد");
    refresh();
  };

  const dupProject = async (id: string) => {
    await duplicateProject(id);
    toast.success("کپی ساخته شد");
    refresh();
  };

  return (
    <div className="px-4 pt-6 pb-4 mx-auto max-w-lg space-y-5">
      {/* Header */}
      <header className="flex items-center gap-3 pt-2">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#c16a52] to-[#9c453d] flex items-center justify-center shadow-lg shadow-[#c16a52]/25">
          <Sparkles className="text-[#faf7f5]" size={24} />
        </div>
        <div>
          <h1 className="font-display text-2xl text-foreground leading-none mt-1">استودیو خلاق</h1>
          <p className="text-xs text-muted-foreground mt-1.5">سوپراستودیوی شخصی تو؛ کامل‌تر از همیشه</p>
        </div>
      </header>

      {/* EditPilot-style prompt bar */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-primary/25 bg-gradient-to-br from-[#9c453d]/25 via-[#262020] to-[#6f2f2a]/20 p-4 space-y-3"
      >
        <div className="flex items-center gap-1.5 text-[10px] text-primary">
          <Sparkles size={12} /> دستیار تدوین
        </div>
        <h2 className="font-display text-lg leading-relaxed">
          امروز چطور کمکت کنم <span className="text-gradient">تدوین کنی؟</span>
        </h2>
        <div className="flex items-center gap-2 rounded-2xl bg-black/40 border border-white/10 px-3 py-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendPrompt()}
            placeholder="چیزی که می‌خواهی را توصیف کن… مثلاً ریلز کافه با حال‌وهوای شب"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={sendPrompt}
            aria-label="ارسال به دستیار"
            className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <Send size={15} className="-scale-x-100" />
          </button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["یه ریلز محصول بچین", "زیرنویس ویدئوم رو بساز", "پوستر برندم رو طراحی کن"].map((s) => (
            <button
              key={s}
              onClick={() => { setAssistantPrefill(s); onNavigate("assistant"); }}
              className="text-[10px] px-2.5 py-1.5 rounded-full border border-border bg-secondary/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </motion.section>

      {/* Quick actions (horizontal scroll like CapCut home) */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-bold text-muted-foreground px-1">شروع سریع</h3>
        <div className="overflow-x-auto scroll-thin -mx-1 px-1">
          <div className="flex items-stretch gap-2.5 w-max">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => onNavigate(a.id)}
                  className={`w-[104px] shrink-0 rounded-2xl border border-border bg-gradient-to-br ${a.gradient} p-3 text-start active:scale-[0.97] transition-transform`}
                >
                  <div className="w-9 h-9 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center">
                    <Icon size={17} className="text-white" />
                  </div>
                  <div className="text-[12px] font-bold text-white mt-2.5">{a.title}</div>
                  <div className="text-[9px] text-white/70 mt-0.5">{a.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI creative suite */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-bold text-muted-foreground px-1">مجموعه خلاق AI</h3>
        <div className="grid gap-2.5">
          {SUITE.map((s, i) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onNavigate(s.id)}
              className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r ${s.gradient} p-4 text-start group`}
            >
              <div className="absolute -left-6 -bottom-8 text-[86px] opacity-25 group-hover:scale-110 transition-transform select-none">
                {s.emoji}
              </div>
              <div className="relative">
                <h4 className="font-display text-lg text-white">{s.title}</h4>
                <p className="text-[11px] text-white/85 mt-1">{s.desc}</p>
                <span className="inline-flex items-center gap-1 text-[10px] text-white mt-2.5 bg-black/25 rounded-full px-2.5 py-1">
                  باز کن <ChevronLeft size={11} />
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Projects (desktop-like) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-muted-foreground">پروژه‌های من</h3>
          <button
            onClick={() => onNavigate("video")}
            className="text-[11px] text-primary flex items-center gap-1"
          >
            <Clapperboard size={12} /> ادیتور جدید
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <FolderOpen size={22} className="mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground mt-2 leading-6">
              هنوز پروژه‌ای ذخیره نکردی. در ادیتور دکمه سبز «ذخیره پروژه» را بزن تا با همه‌ی رسانه‌ها اینجا برگردد.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {projects.map((p) => (
              <div key={p.id} className="rounded-2xl overflow-hidden border border-border bg-card group">
                <button onClick={() => openProject(p)} className="block w-full text-start">
                  <div className="relative aspect-video bg-secondary">
                    {p.thumb ? (
                      <img src={p.thumb} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Film size={22} />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-9 h-9 rounded-full bg-white/90 text-black flex items-center justify-center">
                        <Play size={15} className="mr-0.5" />
                      </span>
                    </div>
                    <span className="absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white/90">
                      {Math.round(p.duration)} ثانیه • {p.clipCount} کلیپ
                    </span>
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-bold truncate">{p.name}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {new Date(p.updatedAt).toLocaleDateString("fa-IR")} • {p.aspect}
                    </div>
                  </div>
                </button>
                <div className="flex border-t border-border">
                  <button
                    onClick={() => dupProject(p.id)}
                    className="flex-1 py-1.5 text-[10px] text-muted-foreground flex items-center justify-center gap-1 hover:text-foreground"
                    aria-label="کپی پروژه"
                  >
                    <Copy size={11} /> کپی
                  </button>
                  <button
                    onClick={() => removeProject(p.id)}
                    className="flex-1 py-1.5 text-[10px] text-red-300/80 flex items-center justify-center gap-1 border-s border-border hover:text-red-300"
                    aria-label="حذف پروژه"
                  >
                    <Trash2 size={11} /> حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Roadmap */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">در نسخه‌های بعدی</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25">به‌زودی</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {ROADMAP.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="flex items-center gap-2 rounded-xl bg-secondary/60 border border-border px-3 py-2.5">
                <Icon size={16} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">{r.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* PWA install hint */}
      <InstallHint />
    </div>
  );
}

function InstallHint() {
  return (
    <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-[#9c453d]/20 to-transparent p-4">
      <div className="flex items-center gap-2">
        <MonitorSmartphone />
        <h3 className="font-bold text-sm">نصب روی گوشی (یا تبدیل به APK)</h3>
      </div>
      <ol className="text-xs text-muted-foreground mt-2.5 space-y-1.5 leading-6 list-decimal ps-5">
        <li>لینک اپ را با کروم گوشی باز کن</li>
        <li>از منوی سه‌نقطه، «Add to Home screen» را بزن</li>
        <li>تمام! مثل یک اپ واقعی تمام‌صفحه باز می‌شود</li>
      </ol>
      <p className="text-[10px] text-muted-foreground mt-2 leading-5">
        همین اپ PWA با ابزارهایی مثل PWABuilder قابل تبدیل به APK برای نصب مستقیم است.
      </p>
    </section>
  );
}

function MonitorSmartphone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <rect width="14" height="8" x="5" y="2" rx="2" />
      <rect width="8" height="12" x="8" y="10" rx="1" />
    </svg>
  );
}
