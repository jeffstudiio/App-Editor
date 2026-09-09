"use client";

import { Home, Sparkles, Compass, Clapperboard, LayoutGrid } from "lucide-react";
import { motion } from "framer-motion";

export type ViewId =
  | "home"
  | "video"
  | "studios"
  | "explore"
  | "assistant"
  | "templates"
  | "bank"
  | "vstudio"
  | "design"
  | "subtitle"
  | "story"
  | "retouch";

const NAV_ITEMS: { id: ViewId; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "خانه", icon: Home },
  { id: "video", label: "تدوین", icon: Clapperboard },
  { id: "studios", label: "استودیو", icon: LayoutGrid },
  { id: "explore", label: "کاوش", icon: Compass },
  { id: "assistant", label: "دستیار", icon: Sparkles },
];

export function BottomNav({ value, onChange }: { value: ViewId; onChange: (v: ViewId) => void }) {
  const active = NAV_ITEMS.find((i) => i.id === value) ? value : ("studios" as ViewId);
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed bottom-0 inset-x-0 z-50 glass border-t border-white/[0.06]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
    >
      <div className="mx-auto flex items-stretch justify-around max-w-lg px-1 pt-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className="relative flex flex-col items-center justify-center gap-0.5 min-h-[52px] min-w-[48px] px-1.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors"
            >
              {isActive && (
                <motion.span
                  layoutId="nav-pill"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  className="absolute inset-0 rounded-xl bg-gradient-to-b from-primary/20 to-accent/10 border border-primary/25"
                />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2.4 : 2}
                className={`relative transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
              />
              <span
                className={`relative text-[9px] leading-none transition-colors ${
                  isActive ? "text-foreground font-bold" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
