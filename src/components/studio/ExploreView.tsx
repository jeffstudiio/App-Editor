"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Heart, X, Copy, Download, ImageOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { hostingMode } from "@/lib/ai/client/gateway";
import { EXPLORE_CATEGORIES, type ExploreImage } from "@/lib/studio-data";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const SAVED_KEY = "studio-explore-saved";

export function ExploreView() {
  const [categoryId, setCategoryId] = useState<string>(EXPLORE_CATEGORIES[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<{ category: string; q: string; offset: number }>({
    category: EXPLORE_CATEGORIES[0].id,
    q: "",
    offset: 0,
  });
  const [results, setResults] = useState<Record<string, ExploreImage[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExploreImage | null>(null);
  const [saved, setSaved] = useState<ExploreImage[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  const keyOf = (category: string, q: string, offset: number) => q ? `q:${q}` : `c:${category}:${offset}`;

  // Load saved from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  const fetchImages = useCallback(async (category: string, q: string, offset: number, force = false) => {
    const key = keyOf(category, q, offset);
    if (!force && results[key]?.length) {
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      else {
        params.set("category", category);
        if (offset) params.set("offset", String(offset));
      }
      const mode = await hostingMode();
      if (mode === "static") {
        throw new Error("کشف تصویر به سرور نیاز دارد و در نسخهٔ استاتیک در دسترس نیست — بقیهٔ ابزارها فعال‌اند");
      }
      const res = await fetch(`/api/explore?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "خطا در دریافت تصاویر");
      if (data.error && (!data.results || data.results.length === 0)) throw new Error(data.error);
      setResults((prev) => ({ ...prev, [key]: data.results as ExploreImage[] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای شبکه");
    } finally {
      setLoading(false);
    }
  }, [results]);

  // Initial + reactive fetch
  useEffect(() => {
    if (showSaved) return;
    fetchImages(activeQuery.category, activeQuery.q, activeQuery.offset);
  }, [activeQuery, showSaved]);

  const selectCategory = (id: string) => {
    setCategoryId(id);
    setShowSaved(false);
    setActiveQuery({ category: id, q: "", offset: 0 });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setShowSaved(false);
    setActiveQuery((prev) => ({ category: prev.category, q, offset: 0 }));
  };

  const loadMore = () => {
    if (!activeQuery.q && activeQuery.offset < 3) {
      setActiveQuery((prev) => ({ ...prev, offset: prev.offset + 1 }));
    }
  };

  const isSaved = (img: ExploreImage) => saved.some((s) => s.url === img.url);

  const toggleSave = (img: ExploreImage) => {
    setSaved((prev) => {
      const next = isSaved(img) ? prev.filter((s) => s.url !== img.url) : [...prev, img];
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
    toast.success(isSaved(img) ? "از ذخیره‌شده‌ها حذف شد" : "ذخیره شد ❤️");
  };

  const copyLink = async (img: ExploreImage) => {
    try {
      await navigator.clipboard.writeText(img.url);
      toast.success("لینک کپی شد");
    } catch {
      toast.error("کپی لینک ممکن نشد");
    }
  };

  const currentKey = keyOf(activeQuery.category, activeQuery.q, activeQuery.offset);
  const current = showSaved ? saved : results[currentKey] ?? [];
  const canLoadMore = !activeQuery.q && activeQuery.offset < 3;

  return (
    <div className="px-4 pt-4 pb-4 mx-auto max-w-2xl">
      {/* Search */}
      <form onSubmit={submitSearch} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 focus-within:border-primary/50 transition-colors">
        <Search size={17} className="text-muted-foreground shrink-0" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="جست‌وجوی ایده و رفرنس… مثلاً پوستر مینیمال"
          className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-muted-foreground"
          aria-label="جست‌وجو در اکسپلور"
        />
        {searchQuery && (
          <button type="button" onClick={() => { setSearchQuery(""); selectCategory(categoryId); }} aria-label="پاک کردن جست‌وجو">
            <X size={15} className="text-muted-foreground" />
          </button>
        )}
      </form>

      {/* Category chips */}
      <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-0.5" role="tablist" aria-label="دسته‌بندی‌ها">
        <button
          role="tab"
          aria-selected={showSaved}
          onClick={() => setShowSaved(true)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs border transition-all ${
            showSaved ? "bg-accent/15 text-accent border-accent/40 font-bold" : "border-border bg-card text-muted-foreground"
          }`}
        >
          ❤️ ذخیره‌شده ({saved.length})
        </button>
        {EXPLORE_CATEGORIES.map((c) => {
          const active = !showSaved && c.id === categoryId;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active}
              onClick={() => selectCategory(c.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs border transition-all ${
                active
                  ? "bg-primary/15 text-primary border-primary/40 font-bold"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="mt-4">
        {loading ? (
          <div className="columns-2 sm:columns-3 gap-3 [column-fill:_balance]">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={`mb-3 rounded-xl w-full ${i % 3 === 0 ? "h-52" : i % 3 === 1 ? "h-36" : "h-44"}`} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ImageOff size={36} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground mt-3 leading-7">{error}</p>
            <button
              onClick={() => fetchImages(activeQuery.category, activeQuery.q, activeQuery.offset, true)}
              className="mt-4 flex items-center gap-1.5 text-xs text-primary border border-primary/40 rounded-full px-4 py-2 hover:bg-primary/10 transition-colors"
            >
              <RefreshCw size={13} />
              تلاش دوباره
            </button>
          </div>
        ) : current.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl">🫙</span>
            <p className="text-sm text-muted-foreground mt-3">
              {showSaved ? "هنوز چیزی ذخیره نکردی" : "نتیجه‌ای نیست"}
            </p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 gap-3">
            {current.map((img, i) => (
              <motion.button
                key={img.url + i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                onClick={() => setPreview(img)}
                className="group relative block w-full mb-3 break-inside-avoid rounded-xl overflow-hidden border border-white/5 bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img
                  src={img.url}
                  alt={showSaved ? "تصویر ذخیره‌شده" : `رفرنس از ${img.source}`}
                  loading="lazy"
                  className="w-full display-block"
                  style={{ aspectRatio: `${img.w} / ${img.h}` }}
                />
                <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/60 text-white/80 rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.source}
                </span>
              </motion.button>
            ))}
          </div>
        )}

        {/* Load more */}
        {!loading && !error && !showSaved && current.length > 0 && canLoadMore && (
          <div className="flex justify-center pb-2">
            <button
              onClick={loadMore}
              className="text-xs text-muted-foreground border border-border rounded-full px-5 py-2 hover:border-primary/40 hover:text-foreground transition-colors"
            >
              بارگذاری ایده‌های بیشتر
            </button>
          </div>
        )}
      </div>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-md bg-popover border-border p-3 top-[8%] translate-y-0 rounded-3xl" dir="rtl">
          {preview && (
            <div>
              <DialogTitle className="sr-only">پیش‌نمایش تصویر</DialogTitle>
              <img src={preview.url} alt={`پیش‌نمایش تصویر از ${preview.source}`} className="w-full max-h-[55vh] object-contain rounded-2xl bg-black/40" />
              <div className="flex items-center justify-between mt-3 px-1">
                <span className="text-[11px] text-muted-foreground">منبع: {preview.source} · {preview.w}×{preview.h}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleSave(preview)}
                    aria-label={isSaved(preview) ? "حذف از ذخیره‌شده‌ها" : "ذخیره"}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                      isSaved(preview) ? "bg-accent/20 border-accent/50 text-accent" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Heart size={15} fill={isSaved(preview) ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={() => copyLink(preview)}
                    aria-label="کپی لینک"
                    className="w-9 h-9 rounded-full border border-border text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                  >
                    <Copy size={15} />
                  </button>
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => toast("تصویر در تب جدید باز شد؛ نگه‌داشتن انگشت → Save Image")}
                    aria-label="دانلود تصویر"
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-lg shadow-fuchsia-500/20"
                  >
                    <Download size={15} />
                  </a>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AnimatePresence>{/* reserved for future banners */}</AnimatePresence>
    </div>
  );
}
