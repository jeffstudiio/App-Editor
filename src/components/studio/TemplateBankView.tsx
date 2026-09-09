"use client";

// ─────────────────────────────────────────────────────────────
// بانک تمپلیت — مرور، جستجو، پیش‌نمایش زنده، جای‌گذاری رسانه
// (تصویر / ویدئو / موزیک) و ارسال به تدوین.
// منبع بانک: محلی یا JSON روی GitHub / فضای ابری (قابل تعویض).
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CloudDownload, Film, FolderPlus, ImageIcon, ImagePlus, LayoutTemplate, Music, Music4,
  Play, Search, ServerCog, Trash2, Video, X, PencilLine, Clapperboard, Download,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ViewId } from "@/components/studio/BottomNav";
import {
  BANK_CATEGORIES, getSavedBankUrl, loadBank, saveBankUrl, searchBank,
  templateDuration, templateSlotCount,
} from "@/lib/template-bank";
import type { BankTemplate, CategoryId } from "@/lib/template-bank/schema";
import { setPendingBank } from "@/lib/video/transfer";
import { TemplatePlayer, type SlotMedia } from "./template-bank/Player";
import { ImportSheet, downloadCustomJson } from "./template-bank/ImportSheet";
import { deleteCustomTemplate, listCustomTemplates, loadCustomAssets } from "@/lib/custom-bank";
import { withDefaults } from "@/lib/template-bank/defaults";
import { withBase } from "@/lib/base-path";

const FA_DURATION = (s: number) => {
  const v = Math.round(s);
  return `${v.toLocaleString("fa-IR")} ثانیه`;
};

const VID_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/**
 * کاور واقعی کارت — مثل کپ‌کات:
 * اسلات‌ها بعد از withDefaults رسانهٔ پیش‌فرض دارند (پس‌زمینهٔ سینتی‌شده بانک)
 * پس هر قالبی که رسانه دارد، کاور واقعی نشان می‌دهد:
 *  - پس‌زمینه‌های خود بانک → پوستر سبک (فریم اول) در گرید + ویدئوی زنده در نوار ویژه
 *  - رسانهٔ خارجی (بستهٔ ابری) → خود رسانه به‌عنوان پوستر
 */
function coverOf(t: BankTemplate): { poster: string | null; video: string | null } {
  const url =
    t.slots.find((s) => s.kind !== "audio" && s.url)?.url ??
    t.slots.find((s) => s.url)?.url ??
    null;
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return { poster: null, video: null };
  const m = url.match(/\/bank-media\/bg\/([a-z0-9-]+)\.mp4/i);
  if (m) return { poster: withBase(`/bank-media/posters/${m[1]}.jpg`), video: url };
  if (VID_RE.test(url)) return { poster: null, video: url };
  return { poster: url, video: null };
}

export function TemplateBankView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [templates, setTemplates] = useState<BankTemplate[]>([]);
  const [source, setSource] = useState<"local" | "remote">("local");
  const [sourceUrl, setSourceUrl] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<CategoryId | "all" | "mine">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<BankTemplate | null>(null);
  const [media, setMedia] = useState<Record<string, SlotMedia | undefined>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [showSource, setShowSource] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [customList, setCustomList] = useState<BankTemplate[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const quickRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<string | null>(null);

  useEffect(() => {
    loadBank().then((b) => {
      setTemplates(b.manifest.templates);
      setSource(b.source);
      setSourceUrl(b.url ?? "");
      setDraftUrl(getSavedBankUrl());
      setLoading(false);
    });
    listCustomTemplates().then((l) => setCustomList(l.map(withDefaults)));
  }, []);

  const allTemplates = useMemo(() => [...customList, ...templates], [customList, templates]);
  const list = useMemo(
    () => searchBank(cat === "mine" ? customList : allTemplates.filter((t) => cat === "all" || t.cat === cat), q),
    [allTemplates, customList, cat, q],
  );
  const featured = useMemo(() => templates.filter((t) => t.featured).slice(0, 6), [templates]);

  const refreshCustom = () => listCustomTemplates().then((l) => setCustomList(l.map(withDefaults)));

  const openTemplate = async (t: BankTemplate) => {
    setSelected(t);
    setMedia({});
    setTexts({});
    if (t.custom) {
      const assets = await loadCustomAssets(t.id);
      const mapped: Record<string, SlotMedia | undefined> = {};
      for (const [k, v] of Object.entries(assets)) mapped[k] = v;
      setMedia(mapped);
    }
  };

  const pickSlot = (slotId: string, accept: string) => {
    pendingSlotRef.current = slotId;
    if (fileRef.current) {
      fileRef.current.accept = accept;
      fileRef.current.click();
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    let slotId = pendingSlotRef.current;
    // fallback: اگر رفرش اسلات گم شده، اولین اسلات خالیِ هم‌نوع فایل
    if (f && !slotId && selected) {
      const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "image";
      const found =
        selected.slots.find((s) => s.kind === kind && !media[s.id])?.id ??
        selected.slots.find((s) => s.kind === kind)?.id;
      if (found) slotId = found;
    }
    if (f && slotId) {
      setMedia((m) => ({ ...m, [slotId]: { url: URL.createObjectURL(f), name: f.name } }));
      toast.success("رسانه جای‌گذاری شد");
    }
    e.target.value = "";
    pendingSlotRef.current = null;
  };

  const clearSlot = (slotId: string) => setMedia((m) => ({ ...m, [slotId]: undefined }));

  /** پرکردن سریع: چند فایل → پخش خودکار روی اسلات‌ها به ترتیب */
  const onQuickFill = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!selected || list.length === 0) return;
    const next = { ...media };
    let si = 0;
    const audFile = list.find((f) => f.type.startsWith("audio/"));
    for (const f of list) {
      if (f.type.startsWith("audio/")) continue;
      while (si < selected.slots.length && (selected.slots[si].kind === "audio" || next[selected.slots[si].id])) si++;
      if (si >= selected.slots.length) break;
      next[selected.slots[si].id] = { url: URL.createObjectURL(f), name: f.name };
      si++;
    }
    if (audFile) {
      const aSlot = selected.slots.find((s) => s.kind === "audio");
      if (aSlot) next[aSlot.id] = { url: URL.createObjectURL(audFile), name: audFile.name };
    }
    setMedia(next);
    toast.success("رسانه‌ها به ترتیب جای‌گذاری شدند");
  };

  const sendToEditor = () => {
    if (!selected) return;
    const filled = templateSlotCount(selected, "image") + templateSlotCount(selected, "video");
    const done = selected.slots.filter((s) => s.kind !== "audio" && (media[s.id]?.url || s.url)).length;
    if (filled > 0 && done === 0) {
      toast.error("حداقل یک رسانه (تصویر/ویدئو) جای‌گذاری کن");
      return;
    }
    setPendingBank({ template: selected, media, texts });
    setSelected(null);
    toast.success("تمپلیت به تدوین منتقل شد");
    onNavigate("video");
  };

  const removeCustom = async (t: BankTemplate) => {
    await deleteCustomTemplate(t.id);
    setSelected(null);
    refreshCustom();
    toast.success("از بانک من حذف شد");
  };

  const applySource = async () => {
    const url = draftUrl.trim();
    saveBankUrl(url);
    setLoading(true);
    const b = await loadBank();
    setTemplates(b.manifest.templates);
    setSource(b.source);
    setSourceUrl(b.url ?? "");
    setLoading(false);
    toast[b.source === "remote" ? "success" : "info"](
      b.source === "remote" ? `${b.manifest.count.toLocaleString("fa-IR")} تمپلیت از منبع ابری` : "به منبع محلی برگشت",
    );
  };

  const slotIcon = (kind: string) => (kind === "video" ? Video : kind === "audio" ? Music : ImageIcon);

  return (
    <div className="px-4 pt-5 pb-8 mx-auto max-w-lg space-y-4">
      <input ref={fileRef} type="file" onChange={onFile} className="hidden" />

      {/* Header — Jeff-style architectural */}
      <header className="pt-1">
        <p className="label-track text-[9px] text-primary mb-1.5">TEMPLATE BANK</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c16a52] to-[#9c453d] flex items-center justify-center shadow-lg shadow-[#c16a52]/25">
              <LayoutTemplate className="text-[#faf7f5]" size={20} />
            </div>
            <div>
              <h1 className="font-display text-xl leading-none mt-0.5">بانک تمپلیت‌ها</h1>
              <p className="text-[11px] text-muted-foreground mt-1">
                {loading ? "در حال بارگیری…" : `${templates.length.toLocaleString("fa-IR")} قالب آماده با جای‌گذاری رسانه`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setImportOpen(true)}
            aria-label="افزودن تمپلیت از فایل‌های من"
            className="flex items-center gap-1 rounded-full border border-[#c16a52]/50 bg-[#c16a52]/15 px-2.5 py-1.5 text-[10px] text-[#e0a78f] transition-colors"
          >
            <FolderPlus size={12} /> بانک من
          </button>
          <button
            onClick={() => setShowSource((v) => !v)}
            aria-label="منبع بانک"
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10px] transition-colors ${
              source === "remote"
                ? "border-[#c16a52]/50 bg-[#c16a52]/15 text-[#e0a78f]"
                : "border-border bg-secondary text-muted-foreground"
            }`}
          >
            {source === "remote" ? <CloudDownload size={12} /> : <ServerCog size={12} />}
            {source === "remote" ? "ابری" : "محلی"}
          </button>
        </div>
      </header>

      {/* منبع ابری (GitHub/Cloud) */}
      {showSource && (
        <section className="rounded-2xl border border-border bg-card p-3 space-y-2">
          <p className="text-xs font-bold">منبع بانک روی فضای ابری</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            فایل <code className="text-[#e0a78f]">template-bank/index.json</code> را روی گیت‌هاب یا هر فضای ابری
            بگذار و آدرس مستقیم JSON را این‌جا بده؛ بانک از همان‌جا خوانده می‌شود.
          </p>
          <div className="flex gap-2">
            <Input
              dir="ltr"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/…/index.json"
              className="h-9 text-xs"
            />
            <Button size="sm" className="h-9 px-3" onClick={applySource}>
              ذخیره
            </Button>
          </div>
          {sourceUrl && <p className="text-[10px] text-muted-foreground truncate" dir="ltr">فعال: {sourceUrl}</p>}
        </section>
      )}

      {/* جستجو */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجو در بانک… (نام، تگ، توضیح)"
          className="h-10 pr-9 text-sm rounded-xl"
        />
      </div>

      {/* دسته‌ها */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
        {([
          ["all", "همه", "✨"],
          ["mine", `بانک من (${customList.length})`, "👤"],
          ...BANK_CATEGORIES.map((c) => [c.id, c.label, c.emoji]),
        ] as const).map(
          ([id, label, emoji]) => (
            <button
              key={id}
              onClick={() => setCat(id as CategoryId | "all" | "mine")}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors ${
                cat === id
                  ? "border-[#c16a52] bg-[#c16a52]/20 text-[#e0a78f] font-bold"
                  : "border-border bg-secondary/60 text-muted-foreground"
              }`}
            >
              {emoji} {label}
            </button>
          ),
        )}
      </div>

      {/* پیشنهاد ویژه */}
      {cat === "all" && !q && featured.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold text-muted-foreground px-1">پرطرفدارهای بانک</h2>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            {featured.map((t) => {
              const cover = coverOf(t);
              return (
                <button
                  key={t.id}
                  onClick={() => openTemplate(t)}
                  className="shrink-0 w-28 rounded-xl overflow-hidden border border-border bg-card text-right"
                >
                  <div
                    className="relative h-24 flex items-center justify-center text-3xl"
                    style={{ background: `linear-gradient(150deg, ${t.art.from}, ${t.art.to})` }}
                  >
                    {cover.video ? (
                      <video
                        src={cover.video}
                        muted
                        loop
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : cover.poster ? (
                      <img src={cover.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    ) : null}
                    {(cover.video || cover.poster) && (
                      <span className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    )}
                    {cover.video || cover.poster ? (
                      <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm border border-white/25">
                        <Play size={13} className="text-white fill-white -mr-px" />
                      </span>
                    ) : (
                      <span className="relative z-10">{t.art.emoji}</span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-bold truncate">{t.name}</p>
                    <p className="label-track text-[7px] text-muted-foreground mt-0.5">{t.en}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* گرید */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-[4/5] rounded-xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">چیزی پیدا نشد؛ عبارت دیگری امتحان کن</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((t, i) => {
            const cover = coverOf(t);
            return (
              <motion.button
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(0.02 * i, 0.3) }}
                whileTap={{ scale: 0.97 }}
                onClick={() => openTemplate(t)}
                className="rounded-xl overflow-hidden border border-border bg-card text-right"
              >
                <div
                  className="relative aspect-[4/5] flex items-center justify-center"
                  style={{ background: `linear-gradient(150deg, ${t.art.from}, ${t.art.to})` }}
                >
                  {cover.poster ? (
                    <img src={cover.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  ) : null}
                  {cover.poster ? (
                    <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-black/25" />
                  ) : null}
                  {cover.poster ? (
                    <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm border border-white/25">
                      <Play size={18} className="text-white fill-white -mr-px" />
                    </span>
                  ) : (
                    <span className="relative z-10 text-5xl drop-shadow-lg">{t.art.emoji}</span>
                  )}
                  {t.custom ? (
                  <span className="absolute top-2 right-2 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[9px] text-[#e0a78f]">
                    مال من
                  </span>
                ) : t.featured ? (
                  <span className="absolute top-2 right-2 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[9px] text-[#e0a78f]">
                    ویژه
                  </span>
                ) : null}
                <span className="absolute bottom-2 left-2 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[9px] text-white/90" dir="ltr">
                  {templateDuration(t).toFixed(0)}s
                </span>
                <span className="absolute bottom-2 right-2 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[9px] text-white/90">
                  {t.scenes.length.toLocaleString("fa-IR")} صحنه
                </span>
                </div>
                <div className="p-2.5">
                  <p className="text-[13px] font-bold truncate">{t.name}</p>
                  <p className="label-track text-[7px] text-muted-foreground mt-0.5 truncate">{t.en}</p>
                  <div className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                    <ImageIcon size={10} /> {templateSlotCount(t, "image").toLocaleString("fa-IR")}
                    <Video size={10} className="mr-1" /> {templateSlotCount(t, "video").toLocaleString("fa-IR")}
                    <Music4 size={10} className="mr-1" /> {templateSlotCount(t, "audio").toLocaleString("fa-IR")}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* شیت افزودن از فایل‌های من */}
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} onSaved={refreshCustom} />

      {/* شیت جزئیات + پخش + جای‌گذاری */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        {selected && (
          <SheetContent side="bottom" className="z-[60] max-h-[92dvh] overflow-y-auto scroll-thin rounded-t-3xl border-border bg-[#262020]">
            <SheetHeader dir="rtl" className="text-right">
              <SheetTitle className="flex items-center justify-between">
                <span className="font-display text-lg">{selected.name}</span>
                <span className="label-track text-[8px] text-muted-foreground">{selected.en}</span>
              </SheetTitle>
            </SheetHeader>

            <div className="px-4 pb-6 space-y-4 -mt-2">
              <TemplatePlayer template={selected} media={media} texts={texts} />

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {selected.desc} — دسته:{" "}
                {BANK_CATEGORIES.find((c) => c.id === selected.cat)?.label}
                {selected.bpm ? ` • ضرب پیشنهادی ${selected.bpm.toLocaleString("fa-IR")} BPM` : ""}
              </p>

              {/* جای‌گذاری رسانه */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <ImagePlus size={13} className="text-[#c16a52]" /> جای‌گذاری رسانه
                  </h3>
                  <button
                    onClick={() => quickRef.current?.click()}
                    className="rounded-full border border-[#c16a52]/40 bg-[#c16a52]/10 px-2.5 py-1 text-[10px] text-[#e0a78f]"
                  >
                    ⚡️ پرکردن سریع از گالری
                  </button>
                </div>
                <input ref={quickRef} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={onQuickFill} />
                {selected.slots.map((slot) => {
                  const Icon = slotIcon(slot.kind);
                  const cur = media[slot.id];
                  const accept = slot.kind === "video" ? "video/*" : slot.kind === "audio" ? "audio/*" : "image/*";
                  const hasDefault = !cur && !!slot.url;
                  return (
                    <div key={slot.id} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-2">
                      <div className="w-9 h-9 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden shrink-0">
                        {cur && (slot.kind === "image" || !/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(cur.url)) ? (
                          <img src={cur.url} alt="" className="h-full w-full object-cover" />
                        ) : cur ? (
                          <Video size={15} className="text-[#e0a78f]" />
                        ) : (
                          <Icon size={15} className={hasDefault ? "text-[#e0a78f]" : "text-muted-foreground"} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold truncate">
                          {slot.label}
                          {hasDefault && <span className="mr-1.5 rounded-full bg-[#c16a52]/15 px-1.5 py-0.5 text-[8px] text-[#e0a78f] align-middle">پیش‌فرض ✓</span>}
                        </p>
                        <p className="text-[9px] text-muted-foreground truncate" dir="ltr">
                          {cur ? cur.name : hasDefault ? "پیش‌فرض بانک — برای تعویض انتخاب کن" : slot.kind === "audio" ? "فایل موزیک" : "فایل رسانه"}
                        </p>
                      </div>
                      {cur ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => clearSlot(slot.id)} aria-label="حذف">
                          <Trash2 size={14} />
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="sm" className="h-8 text-[11px]" onClick={() => pickSlot(slot.id, accept)}>
                        انتخاب
                      </Button>
                    </div>
                  );
                })}
              </section>

              {/* متن‌ها */}
              {selected.texts.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <PencilLine size={13} className="text-[#c16a52]" /> متن‌های تمپلیت
                  </h3>
                  {selected.texts.map((ts) => (
                    <div key={ts.id} className="flex items-center gap-2">
                      <Input
                        value={texts[ts.id] ?? ts.sample}
                        onChange={(e) => setTexts((s) => ({ ...s, [ts.id]: e.target.value }))}
                        className="h-9 text-xs"
                        placeholder={ts.sample}
                      />
                      {(texts[ts.id] ?? ts.sample) !== ts.sample && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground"
                          onClick={() => setTexts((s) => ({ ...s, [ts.id]: "" }))}
                          aria-label="بازگردانی متن"
                        >
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* CTA */}
              <div className="flex gap-2 pt-1">
                <Button className="flex-1 h-11 bg-[#c16a52] hover:bg-[#9c453d] text-[#faf7f5] font-bold gap-2" onClick={sendToEditor}>
                  <Clapperboard size={16} /> ساخت پروژه در تدوین
                </Button>
                <Button
                  variant="secondary"
                  className="h-11"
                  onClick={() => {
                    toast.info("نکته: موشن‌های پیش‌نمایش در تدوین به ترنزیشن و فیلتر متناظر تبدیل می‌شوند");
                  }}
                  aria-label="اطلاعات"
                >
                  <Film size={16} />
                </Button>
              </div>

              {/* اکشن‌های تمپلیت سفارشی (بانک من) */}
              {selected.custom && (
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1 h-10 gap-2 text-xs" onClick={() => downloadCustomJson(selected)}>
                    <Download size={14} /> خروجی JSON (گیت‌هاب)
                  </Button>
                  <Button variant="secondary" className="h-10 gap-2 text-xs text-destructive" onClick={() => removeCustom(selected)}>
                    <Trash2 size={14} /> حذف
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
