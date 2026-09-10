"use client";

// ─────────────────────────────────────────────────────────────
// افزودن تمپلیت از فایل‌های خود کاربر («بانک من»)
// چند عکس/ویدئو + موزیک اختیاری → تمپلیت اسلایدشویی موشن‌دار
// در IndexedDB ذخیره می‌شود و مثل بقیهٔ بانک پخش/جای‌گذاری/تدوین دارد.
// خروجی JSON هم برای انتشار ساختار روی گیت‌هاب می‌دهد.
// ─────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, Upload } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildSlideshowTemplate, saveCustomTemplate, type ImportFile } from "@/lib/custom-bank";
import type { BankTemplate } from "@/lib/template-bank/schema";

const FA = (n: number) => n.toLocaleString("fa-IR");

export function ImportSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [music, setMusic] = useState<ImportFile | null>(null);
  const [dur, setDur] = useState(2.2);
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef<HTMLInputElement | null>(null);
  const musicRef = useRef<HTMLInputElement | null>(null);

  /** فایل را همان لحظهٔ انتخاب به Blob خام کپی می‌کنیم تا ذخیره‌سازی همیشه پایدار بماند */
  const toImportFile = async (f: File): Promise<ImportFile | null> => {
    try {
      const buf = await Promise.race([
        f.arrayBuffer(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
      ]);
      return { blob: new Blob([buf], { type: f.type || "application/octet-stream" }), name: f.name };
    } catch {
      return { blob: new Blob([f], { type: f.type }), name: f.name };
    }
  };

  const reset = () => {
    setName("");
    setTitle("");
    setSubtitle("");
    setFiles([]);
    setMusic(null);
    setDur(2.2);
  };

  const save = async () => {
    if (files.length === 0) {
      toast.error("حداقل یک عکس یا ویدئو انتخاب کن");
      return;
    }
    setBusy(true);
    try {
      const { template, assets } = buildSlideshowTemplate({
        name: name.trim() || "تمپلیت من",
        files,
        music,
        sceneDur: dur,
        title: title.trim() || undefined,
        subtitle: subtitle.trim() || undefined,
      });
      await saveCustomTemplate({ template, assets });
      toast.success(`«${template.name}» به بانک من اضافه شد`);
      reset();
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("ذخیره‌سازی ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="z-[60] max-h-[92dvh] overflow-y-auto scroll-thin rounded-t-3xl border-border bg-[#262020]">
        <SheetHeader dir="rtl" className="text-right">
          <SheetTitle className="flex items-center gap-2 font-display text-lg">
            <FolderPlus size={18} className="text-[#e0a78f]" /> افزودن تمپلیت از فایل‌های من
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6 -mt-1 space-y-3.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            چند عکس/ویدئو و یک موزیک انتخاب کن؛ خودش صحنه‌بندی و موشن می‌چیند و یک تمپلیت قابل‌پخش
            می‌سازد که مثل بقیهٔ بانک به تدوین منتقل می‌شود. فقط فایل‌هایی اضافه کن که حق استفاده‌شان را داری.
          </p>

          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="نام تمپلیت (مثلاً: معرفی کافه‌ام)" className="h-10 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="تیتر اول صحنه" className="h-9 text-xs" />
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="متن آخر صحنه" className="h-9 text-xs" />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1 h-11 gap-2 text-xs" onClick={() => mediaRef.current?.click()}>
              <Upload size={14} /> رسانه‌ها {files.length > 0 && `(${FA(files.length)})`}
            </Button>
            <Button variant="secondary" className="flex-1 h-11 gap-2 text-xs" onClick={() => musicRef.current?.click()}>
              <Upload size={14} /> {music ? "موزیک ✓" : "موزیک (اختیاری)"}
            </Button>
          </div>
          <input
            ref={mediaRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              const converted = await Promise.all(list.map(toImportFile));
              const ok = converted.filter((x): x is ImportFile => !!x && x.blob.size > 0);
              if (ok.length) setFiles((f) => [...f, ...ok].slice(0, 12));
            }}
          />
          <input
            ref={musicRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setMusic(await toImportFile(f));
            }}
          />

          {files.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {files.map((f, i) => (
                <div key={i} className="shrink-0 w-16 h-16 rounded-lg border border-border bg-black/30 overflow-hidden relative">
                  {f.blob.type.startsWith("video/") ? (
                    <video src={URL.createObjectURL(f.blob)} muted className="h-full w-full object-cover" />
                  ) : (
                    <img src={URL.createObjectURL(f.blob)} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                    className="absolute top-0.5 left-0.5 rounded-full bg-black/60 text-white text-[9px] w-4 h-4 leading-4"
                    aria-label="حذف"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="text-[11px] text-muted-foreground">مدت هر صحنه: {FA(Math.round(dur * 10) / 10)} ثانیه</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.2}
              value={dur}
              onChange={(e) => setDur(Number(e.target.value))}
              className="w-full accent-[#c16a52]"
              aria-label="مدت صحنه"
            />
          </label>

          <Button
            disabled={busy}
            className="w-full h-11 bg-[#c16a52] hover:bg-[#9c453d] text-[#faf7f5] font-bold"
            onClick={save}
          >
            {busy ? "در حال ذخیره…" : "ساخت و افزودن به بانک من"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** خروجی JSON ساختار تمپلیت‌های سفارشی — برای انتشار روی گیت‌هاب */
export function downloadCustomJson(t: BankTemplate) {
  const blob = new Blob([JSON.stringify(t, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${t.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast.info("ساختار تمپلیت دانلود شد؛ رسانه‌ها را جداگانه در ریپو آپلود کن");
}

export type { BankTemplate };
