"use client";

// ─────────────────────────────────────────────────────────────
// بانک من — تمپلیت‌های ساخته‌شده از فایل‌های خود کاربر
// ساختار تمپلیت (JSON) و رسانه‌ها (Blob) در IndexedDB ذخیره می‌شود؛
// خروجی JSON برای انتشار روی گیت‌هاب/فضای ابری هم می‌گیرد.
// ─────────────────────────────────────────────────────────────

import type { BankTemplate } from "@/lib/template-bank/schema";

const DB_NAME = "creative-studio-bank";
const DB_VERSION = 1;
const STORE_TPL = "templates"; // BankTemplate + custom flag
const STORE_BLOB = "assets"; // key: `${tplId}:${slotId}`

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TPL)) db.createObjectStore(STORE_TPL, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_BLOB)) db.createObjectStore(STORE_BLOB, { keyPath: "key" });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error("IndexedDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => rej(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

function reqAs<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error("IndexedDB request failed"));
  });
}

export interface CustomAsset {
  slotId: string;
  blob: Blob;
  type: string;
}

/** فایل ورودی درون‌ریز — Blob خام + نام */
export interface ImportFile {
  blob: Blob;
  name: string;
}

export interface SaveCustomInput {
  template: BankTemplate;
  assets: CustomAsset[];
}

/** ذخیرهٔ تمپلیت سفارشی (id تکراری = به‌روزرسانی) */
export async function saveCustomTemplate(input: SaveCustomInput): Promise<string> {
  const db = await openDb();
  const id = input.template.id;
  const tx = db.transaction(STORE_TPL, "readwrite");
  tx.objectStore(STORE_TPL).put({ ...input.template, custom: true });
  await txDone(tx);

  // کپی بایتی همهٔ رسانه‌ها قبل از باز کردن تراکنش (تراکنش IDB نباید await میانی داشته باشد)
  const safeAssets: CustomAsset[] = [];
  for (const a of input.assets) {
    const raw = a.blob instanceof Blob ? a.blob : new Blob([a.blob as unknown as BlobPart], { type: a.type });
    safeAssets.push({ slotId: a.slotId, blob: await cloneBlob(raw, a.type), type: a.type });
  }

  const blobTx = db.transaction(STORE_BLOB, "readwrite");
  const store = blobTx.objectStore(STORE_BLOB);
  const keys: IDBValidKey[] = await reqAs(store.getAllKeys());
  for (const k of keys) {
    if (String(k).startsWith(`${id}:`)) store.delete(String(k));
  }
  for (const a of safeAssets) {
    store.put({ key: `${id}:${a.slotId}`, blob: a.blob, type: a.type });
  }
  await txDone(blobTx);
  db.close();
  return id;
}

/** کپی بایتی Blob/File — برای پایداری ذخیره‌سازی در همهٔ پلتفرم‌ها */
export async function cloneBlob(b: Blob, type?: string): Promise<Blob> {
  try {
    const buf = await Promise.race([
      b.arrayBuffer(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("read timeout")), 8000)),
    ]);
    return new Blob([buf], { type: type || b.type || "application/octet-stream" });
  } catch {
    return new Blob([b], { type: type || b.type });
  }
}

export async function listCustomTemplates(): Promise<BankTemplate[]> {
  try {
    const db = await openDb();
    const all = (await reqAs(db.transaction(STORE_TPL, "readonly").objectStore(STORE_TPL).getAll())) as any[];
    db.close();
    return (all || []).map((t) => ({ ...t, custom: true })) as BankTemplate[];
  } catch {
    return [];
  }
}

/** رسانه‌های ذخیره‌شدهٔ یک تمپلیت به شکل objectURL برای پخش‌کننده */
export async function loadCustomAssets(tplId: string): Promise<Record<string, { url: string; name: string }>> {
  const out: Record<string, { url: string; name: string }> = {};
  try {
    const db = await openDb();
    const store = db.transaction(STORE_BLOB, "readonly").objectStore(STORE_BLOB);
    const keys: IDBValidKey[] = await reqAs(store.getAllKeys());
    for (const k of keys) {
      const key = String(k);
      if (!key.startsWith(`${tplId}:`)) continue;
      const rec = (await reqAs(store.get(key))) as { blob: Blob; type?: string };
      const slotId = key.slice(tplId.length + 1);
      out[slotId] = { url: URL.createObjectURL(rec.blob), name: "فایل من" };
    }
    db.close();
  } catch {
    // ignore
  }
  return out;
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_TPL, "readwrite");
  tx.objectStore(STORE_TPL).delete(id);
  await txDone(tx);
  const blobTx = db.transaction(STORE_BLOB, "readwrite");
  const store = blobTx.objectStore(STORE_BLOB);
  const keys: IDBValidKey[] = await reqAs(store.getAllKeys());
  for (const k of keys) {
    if (String(k).startsWith(`${id}:`)) store.delete(String(k));
  }
  await txDone(blobTx);
  db.close();
}

/** ساخت تمپلیت اسلایدشویی از چند رسانه — موشن و ترنزیشن خودکار */
export function buildSlideshowTemplate(opts: {
  name: string;
  files: ImportFile[];
  music?: ImportFile | null;
  sceneDur: number;
  title?: string;
  subtitle?: string;
}): { template: BankTemplate; assets: CustomAsset[] } {
  const MO = ["kenburnsIn", "panL", "panR", "dollyIn", "zoomPulse", "kenburnsOut", "panD"];
  const TR = ["zoomPunch", "fade", "slideL", "whipR", "wipeUpTr", "dipBlack"];
  const GRA: [string, string][] = [
    ["#c16a52", "#9c453d"],
    ["#3a322e", "#c16a52"],
    ["#9c453d", "#e0a78f"],
    ["#262020", "#6f2f2a"],
    ["#e0a78f", "#c16a52"],
  ];
  const id = `my_${Date.now().toString(36)}`;
  const slots: BankTemplate["slots"] = opts.files.map((f, i) => ({
    id: `m${i + 1}`,
    kind: (f.blob.type.startsWith("video/") ? "video" : "image") as "video" | "image",
    label: `رسانهٔ ${toFa(i + 1)}`,
  }));
  if (opts.music) slots.push({ id: `m${opts.files.length + 1}`, kind: "audio", label: "موزیک من" });
  const musSlotId = opts.music ? `m${opts.files.length + 1}` : undefined;

  const texts: BankTemplate["texts"] = [];
  if (opts.title) texts.push({ id: "t1", sample: opts.title, size: "lg", y: 0.16 });
  if (opts.subtitle) texts.push({ id: "t2", sample: opts.subtitle, size: "sm", y: 0.86 });

  const scenes: BankTemplate["scenes"] = opts.files.map((_, i) => {
    const scene: BankTemplate["scenes"][number] = {
      d: opts.sceneDur,
      slot: `m${i + 1}`,
      motion: MO[i % MO.length],
      out: i === opts.files.length - 1 ? "dipBlack" : TR[i % TR.length],
      fx: i % 3 === 0 ? ["vignette"] : undefined,
    };
    if (opts.title && i === 0) scene.texts = [{ ref: "t1", anim: "fadeUp", at: 0.3, dur: 0.7, y: 0.16 }];
    if (opts.subtitle && i === opts.files.length - 1) {
      scene.texts = [...(scene.texts ?? []), { ref: "t2", anim: "popIn", at: 0.4, dur: 0.6, y: 0.86 }];
    }
    return scene;
  });

  const template: BankTemplate = {
    id,
    name: opts.name || "تمپلیت من",
    en: "MY TEMPLATE",
    cat: "slideshow",
    tags: ["ساخت خودم"],
    aspect: "9:16",
    desc: "تمپلیت ساخته‌شده از رسانه‌های خودم",
    slots,
    texts,
    scenes,
    art: { from: GRA[0][0], to: GRA[0][1], emoji: "🎬" },
    custom: true,
  };
  const assets: CustomAsset[] = opts.files.map((f, i) => ({ slotId: `m${i + 1}`, blob: f.blob, type: f.blob.type }));
  if (opts.music && musSlotId) assets.push({ slotId: musSlotId, blob: opts.music.blob, type: opts.music.blob.type });
  return { template, assets };
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
function toFa(n: number): string {
  return String(n)
    .split("")
    .map((d) => FA_DIGITS[Number(d)] ?? d)
    .join("");
}
