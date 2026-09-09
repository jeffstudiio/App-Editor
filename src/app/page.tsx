"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BottomNav, type ViewId } from "@/components/studio/BottomNav";
import { HomeView } from "@/components/studio/HomeView";
import { StudioHub } from "@/components/studio/StudioHub";
import { AssistantView } from "@/components/studio/AssistantView";
import { ExploreView } from "@/components/studio/ExploreView";
import { SubtitleView } from "@/components/studio/SubtitleView";
import { StoryView } from "@/components/studio/StoryView";
import { VideoView } from "@/components/studio/video/VideoView";
import { RetouchView } from "@/components/studio/RetouchView";
import { TemplatesGallery } from "@/components/studio/TemplatesGallery";
import { TemplateBankView } from "@/components/studio/TemplateBankView";
import { VideoStudioView } from "@/components/studio/VideoStudioView";
import { DesignStudioView } from "@/components/studio/DesignStudioView";
import { withBase } from "@/lib/base-path";

const VIEW_TITLES: Record<ViewId, string> = {
  home: "خانه",
  video: "استودیو ویدئو",
  assistant: "دستیار هنری",
  explore: "اکسپلور",
  subtitle: "زیرنویس‌ساز",
  story: "استودیو",
  retouch: "روتوش",
  studios: "استودیوها",
  templates: "گالری تمپلیت‌ها",
  bank: "بانک تمپلیت‌ها",
  vstudio: "ویدئوساز AI",
  design: "استودیو طراحی",
};

export default function Page() {
  const [view, setView] = useState<ViewId>("home");

  // Register service worker for PWA installability
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(withBase("/sw.js")).catch(() => {
        // installability is progressive enhancement
      });
    }
  }, []);

  // Deep-link via hash so users can return to a tool
  useEffect(() => {
    const applyHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h in VIEW_TITLES) setView(h as ViewId);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const navigate = (v: ViewId) => {
    setView(v);
    if (window.history.replaceState) {
      // «./» تا زیر‌مسیر میزبانی (مثل GitHub Pages) هم درست بماند
      window.history.replaceState(null, "", v === "home" ? "./" : `#${v}`);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-app-glow flex flex-col">
      <main className="flex-1 pb-[76px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {view === "home" && <HomeView onNavigate={navigate} />}
            {view === "studios" && <StudioHub onNavigate={navigate} />}
            {view === "video" && <VideoView />}
            {view === "templates" && <TemplatesGallery onNavigate={navigate} />}
            {view === "bank" && <TemplateBankView onNavigate={navigate} />}
            {view === "vstudio" && <VideoStudioView onNavigate={navigate} />}
            {view === "design" && <DesignStudioView onNavigate={navigate} />}
            {view === "assistant" && <AssistantView />}
            {view === "explore" && <ExploreView />}
            {view === "subtitle" && <SubtitleView />}
            {view === "story" && <StoryView />}
            {view === "retouch" && <RetouchView />}
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav value={view} onChange={navigate} />
    </div>
  );
}
