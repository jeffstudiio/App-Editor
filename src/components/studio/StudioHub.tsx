"use client";

// Studios hub — like CapCut's sidebar sections (Create with AI / More tools):
// every studio and utility lives here, reachable in one tap.

import { motion } from "framer-motion";
import {
  Sparkles, Film, Palette, Megaphone, Subtitles, Brush, LayoutTemplate, ChevronLeft, ImageIcon,
} from "lucide-react";
import type { ViewId } from "./BottomNav";

const STUDIOS: {
  id: ViewId;
  title: string;
  desc: string;
  icon: React.ElementType;
  gradient: string;
  badge?: string;
  section: string;
}[] = [
  {
    id: "bank",
    title: "بانک تمپلیت‌ها",
    desc: "بانک کامل تدوین با جای‌گذاری رسانه و موشن‌های آماده",
    icon: LayoutTemplate,
    gradient: "from-[#c16a52]/30 to-[#9c453d]/25",
    badge: "پرتکرار",
    section: "ساخت سریع",
  },
  {
    id: "vstudio",
    title: "ویدئوساز AI",
    desc: "سناریو می‌دهی، ویدئوی کامل با تصویر و گوینده تحویل می‌گیری",
    icon: Film,
    gradient: "from-[#e0a78f]/25 to-[#c16a52]/25",
    section: "ساخت سریع",
  },
  {
    id: "design",
    title: "استودیو طراحی",
    desc: "تصور کن. طراحی کن. — تصویر AI، پوستر برند و کیت مارکتینگ",
    icon: Palette,
    gradient: "from-pink-500/25 to-rose-500/25",
    badge: "جدید",
    section: "ساخت سریع",
  },
  {
    id: "subtitle",
    title: "زیرنویس‌ساز حرفه‌ای",
    desc: "استایل کامل، تشخیص گفتار و خروجی PNG شفاف + SRT",
    icon: Subtitles,
    gradient: "from-amber-500/25 to-[#c16a52]/25",
    section: "ابزارها",
  },
  {
    id: "story",
    title: "استودیو استوری و پست",
    desc: "طراح گرافیکی با فونت فارسی و خروجی PNG باکیفیت",
    icon: ImageIcon,
    gradient: "from-rose-500/25 to-orange-500/25",
    section: "ابزارها",
  },
  {
    id: "retouch",
    title: "روتوش و پوست",
    desc: "نرمی پوست، رنگ و نور دستی + ارتقای هوشمند چهره با AI",
    icon: Brush,
    gradient: "from-amber-500/25 to-orange-500/25",
    section: "ابزارها",
  },
];

export function StudioHub({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const sections = ["ساخت سریع", "ابزارها"];
  return (
    <div className="px-4 pt-5 pb-8 mx-auto max-w-lg space-y-5">
      <header className="flex items-center gap-2.5 pt-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c16a52] to-[#9c453d] flex items-center justify-center shadow-lg shadow-[#c16a52]/25">
          <Sparkles className="text-[#faf7f5]" size={20} />
        </div>
        <div>
          <h1 className="font-display text-xl leading-none mt-1">استودیوها</h1>
          <p className="text-[11px] text-muted-foreground mt-1">همه‌ی ابزارهای خلاق در یک‌جا</p>
        </div>
      </header>

      {sections.map((sec) => (
        <section key={sec} className="space-y-2.5">
          <h2 className="text-[11px] font-bold text-muted-foreground px-1">{sec}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STUDIOS.filter((s) => s.section === sec).map((tool, i) => {
              const Icon = tool.icon;
              return (
                <motion.button
                  key={tool.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onNavigate(tool.id)}
                  className="group text-start rounded-2xl border border-border bg-card p-4 hover:border-primary/40 active:border-primary/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <div className="flex items-center justify-between">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${tool.gradient} border border-white/5 flex items-center justify-center`}>
                      <Icon size={21} className="text-primary" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {tool.badge && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                          {tool.badge}
                        </span>
                      )}
                      <ChevronLeft size={18} className="text-muted-foreground group-hover:text-primary group-hover:-translate-x-0.5 transition-all" />
                    </div>
                  </div>
                  <h3 className="font-bold text-[15px] mt-3">{tool.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-6">{tool.desc}</p>
                </motion.button>
              );
            })}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-bold text-sm">💡 مسیر پیشنهادی</h3>
        <p className="text-xs text-muted-foreground mt-2 leading-6">
          اول از «گالری تمپلیت‌ها» یک قالب انتخاب کن، بعد در «تدوین» رسانه‌ها را اضافه کن؛ زیرنویس و گوینده خودکار می‌نشینند و در آخر خروجی ۱۰۸۰p می‌گیری — همه بدون خروج از اپ.
        </p>
      </section>
    </div>
  );
}
