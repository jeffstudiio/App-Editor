"use client";

// Templates gallery — browsable categories + search + stats cards,
// mirroring the desktop CapCut templates tab. Tapping a card opens a
// detail sheet and "start with this template" hands off to the editor.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { ViewId } from "./BottomNav";
import { Search, Play, BadgeCheck, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  GALLERY_CATEGORIES,
  galleryItems,
  galleryItemById,
  type GalleryItem,
} from "@/lib/video/gallery-templates";
import { setPendingTemplate } from "@/lib/video/transfer";
import { toast } from "sonner";

export function TemplatesGallery({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [cat, setCat] = useState("foryou");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<GalleryItem | null>(null);

  const items = useMemo(() => galleryItems(cat, q), [cat, q]);

  const start = (item: GalleryItem) => {
    setPendingTemplate({ templateId: item.recipe.id });
    setDetail(null);
    toast.success(`قالب «${item.recipe.name}» انتخاب شد — در ادیتور منتظر توئه`, {
      description: "فقط رسانه‌ها را اضافه کن",
    });
    onNavigate("video");
  };

  return (
    <div className="px-4 pt-5 pb-6 mx-auto max-w-lg space-y-4">
      <header className="flex items-center gap-2.5 pt-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c16a52] to-[#9c453d] flex items-center justify-center shadow-lg shadow-[#c16a52]/20">
          <Sparkles className="text-white" size={20} />
        </div>
        <div>
          <h1 className="font-display text-xl leading-none mt-1">گالری تمپلیت‌ها</h1>
          <p className="text-[11px] text-muted-foreground mt-1">دستورهای تدوین آماده — یک تپ، استایل کامل</p>
        </div>
      </header>

      {/* search */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی تمپلیت… (مثلاً محصول، سینمایی، عاشقانه)"
          className="w-full h-11 rounded-2xl bg-secondary/70 border border-border ps-9 pe-3 text-sm outline-none focus:border-primary/60 transition-colors"
        />
      </div>

      {/* duration/filter hint row like CapCut */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="px-2 py-1 rounded-lg bg-secondary/60 border border-border">همه مدت‌ها</span>
        <span className="px-2 py-1 rounded-lg bg-secondary/60 border border-border">رایگان</span>
        <span className="ms-auto">{items.length} تمپلیت</span>
      </div>

      {/* categories */}
      <div className="overflow-x-auto scroll-thin -mx-1 px-1">
        <div className="flex items-center gap-1.5 w-max pb-1">
          {GALLERY_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                cat === c.id
                  ? "border-primary bg-primary/15 text-primary font-bold"
                  : "border-border bg-secondary/50 text-muted-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* masonry-ish grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((it, i) => {
          return (
            <motion.button
              key={it.recipe.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(0.3, i * 0.03) }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setDetail(it)}
              className={`text-start rounded-2xl overflow-hidden border border-border bg-card relative ${
                i % 5 === 0 ? "row-span-2" : ""
              }`}
            >
              <div className={`relative ${i % 5 === 0 ? "aspect-[3/4]" : "aspect-[4/5]"} bg-gradient-to-br ${it.entry.art.from} ${it.entry.art.to} flex items-center justify-center`}>
                <span className={i % 5 === 0 ? "text-7xl drop-shadow-lg" : "text-5xl drop-shadow"}>{it.entry.art.emoji}</span>
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                {it.entry.featured && (
                  <span className="absolute top-2 start-2 text-[9px] px-1.5 py-0.5 rounded-full bg-black/50 text-amber-300 border border-amber-300/40 flex items-center gap-1">
                    <BadgeCheck size={10} /> ویژه
                  </span>
                )}
                <span className="absolute top-2 end-2 text-[9px] px-1.5 py-0.5 rounded-full bg-black/50 text-white/90">
                  {it.recipe.aspect}
                </span>
                <div className="absolute bottom-2 inset-x-2">
                  <div className="text-[13px] font-bold text-white truncate">{it.recipe.emoji} {it.recipe.name}</div>
                  <div className="flex items-center gap-2 text-[9px] text-white/75 mt-0.5">
                    <span>🎧 {it.recipe.musicMood}</span>
                    <span className="ms-auto">{it.entry.estDur}</span>
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {items.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10">تمپلیتی با این جستجو پیدا نشد.</p>
      )}

      {/* detail sheet */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] overflow-y-auto scroll-thin overscroll-contain bg-[#12101c] border-white/10">
          <SheetHeader dir="rtl" className="pb-1">
            <SheetTitle className="font-display text-base">
              {detail?.recipe.emoji} {detail?.recipe.name}
            </SheetTitle>
          </SheetHeader>
          {detail && (
            <div dir="rtl" className="px-4 pb-10 space-y-4">
              <div className={`relative h-40 rounded-2xl bg-gradient-to-br ${detail.entry.art.from} ${detail.entry.art.to} flex items-center justify-center overflow-hidden`}>
                <span className="text-7xl drop-shadow-lg">{detail.entry.art.emoji}</span>
                {detail.entry.featured && (
                  <span className="absolute top-3 start-3 text-[10px] px-2 py-0.5 rounded-full bg-black/50 text-amber-300 border border-amber-300/40">⭐ ویژه</span>
                )}
              </div>
              <p className="text-sm leading-7">{detail.recipe.desc}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-secondary/50 border border-border p-2.5">ابعاد: <b>{detail.recipe.aspect}</b></div>
                <div className="rounded-xl bg-secondary/50 border border-border p-2.5">مدت حدودی: <b>{detail.entry.estDur}</b></div>
                <div className="rounded-xl bg-secondary/50 border border-border p-2.5">ترنزیشن: <b>{detail.recipe.transition ? detail.recipe.transition.type : "بدون"}</b></div>
                <div className="rounded-xl bg-secondary/50 border border-border p-2.5">حس موزیک: <b className="text-[11px]">{detail.recipe.musicMood}</b></div>
              </div>
              {detail.recipe.title && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
                  🏷️ تیتر آماده: <b>{detail.recipe.title}</b>
                </div>
              )}
              <div>
                <h4 className="text-xs font-bold text-accent mb-2">نکات تدوین این قالب</h4>
                <ul className="text-xs leading-6 list-disc ps-4 space-y-1 text-muted-foreground">
                  {detail.recipe.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
              <Button className="w-full gap-2" onClick={() => start(detail)}>
                <Play size={16} /> شروع تدوین با این قالب
              </Button>
              <p className="text-[11px] text-muted-foreground leading-5">
                بعد از باز شدن ادیتور، از دکمه «رسانه» ویدئو یا عکس‌هایت را اضافه کن؛ ابعاد، فیلتر، ترنزیشن، تمپلیت زیرنویس و تیتر خودکار اعمال می‌شوند.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
