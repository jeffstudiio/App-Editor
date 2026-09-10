// IndexedDB persistence for editor projects — like desktop CapCut "Projects".
// Stores the project JSON plus every referenced media file (as Blob) and a
// cover thumbnail, so a project can be re-opened even after a full reload.

const DB_NAME = "creative-studio-projects";
const DB_VERSION = 2;
const STORE_META = "projects"; // {id, name, createdAt, updatedAt, aspect, thumb, clips, ...project}
const STORE_BLOBS = "blobs"; // {key: `${projectId}:${assetId}`, blob, type}
const STORE_AUTOSAVE = "autosave"; // {slot, projectId, name, project, savedAt, assetIds}

/** نسخهٔ اسکیمای Project — برای مایگریشن آینده (normalizeProject در types.ts) */
export const PROJECT_SCHEMA_VERSION = 2;

export interface SavedProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  aspect: string;
  thumb: string | null; // dataURL (small jpeg)
  clipCount: number;
  duration: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) db.createObjectStore(STORE_AUTOSAVE, { keyPath: "slot" });
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

export interface SaveProjectInput {
  id: string | null; // null = new
  name: string;
  project: unknown; // Project JSON
  thumb: string | null;
  assets: { id: string; blob: Blob; type: string }[]; // referenced assets only
  aspect: string;
  clipCount: number;
  duration: number;
}

export async function saveProject(input: SaveProjectInput): Promise<string> {
  const db = await openDb();
  const id = input.id || `prj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const metaTx = db.transaction(STORE_META, "readwrite");
  const metaStore = metaTx.objectStore(STORE_META);
  let prevCreatedAt = now;
  try {
    const prev = (await reqAs(metaStore.get(id))) as { createdAt?: number } | undefined;
    if (prev?.createdAt) prevCreatedAt = prev.createdAt;
  } catch {
    // new project
  }
  metaStore.put({
    id,
    name: input.name,
    createdAt: prevCreatedAt,
    updatedAt: now,
    aspect: input.aspect,
    thumb: input.thumb,
    project: input.project,
    clipCount: input.clipCount,
    duration: input.duration,
  });
  await txDone(metaTx);

  // rewrite blobs for this project (drop stale ones)
  const blobTx = db.transaction(STORE_BLOBS, "readwrite");
  const blobStore = blobTx.objectStore(STORE_BLOBS);
  const keys: IDBValidKey[] = await reqAs(blobStore.getAllKeys());
  for (const k of keys) {
    if (String(k).startsWith(`${id}:`)) blobStore.delete(k);
  }
  for (const a of input.assets) {
    blobStore.put({ key: `${id}:${a.id}`, blob: a.blob, type: a.type });
  }
  await txDone(blobTx);
  db.close();
  return id;
}

export async function listProjects(): Promise<SavedProjectMeta[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readonly");
  const all = (await reqAs(tx.objectStore(STORE_META).getAll())) as any[];
  db.close();
  return (all || [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      aspect: p.aspect,
      thumb: p.thumb ?? null,
      clipCount: p.clipCount ?? 0,
      duration: p.duration ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<{
  meta: SavedProjectMeta;
  project: any;
  assets: { id: string; blob: Blob; type: string }[];
} | null> {
  const db = await openDb();
  const rec = (await reqAs(db.transaction(STORE_META, "readonly").objectStore(STORE_META).get(id))) as any;
  if (!rec) {
    db.close();
    return null;
  }
  const blobTx = db.transaction(STORE_BLOBS, "readonly");
  const store = blobTx.objectStore(STORE_BLOBS);
  const keys: IDBValidKey[] = await reqAs(store.getAllKeys());
  const assets: { id: string; blob: Blob; type: string }[] = [];
  for (const k of keys) {
    const key = String(k);
    if (!key.startsWith(`${id}:`)) continue;
    const rec2 = (await reqAs(store.get(k))) as { blob: Blob; type?: string };
    assets.push({ id: key.slice(id.length + 1), blob: rec2.blob, type: rec2.type || "application/octet-stream" });
  }
  db.close();
  return {
    meta: {
      id: rec.id,
      name: rec.name,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      aspect: rec.aspect,
      thumb: rec.thumb ?? null,
      clipCount: rec.clipCount ?? 0,
      duration: rec.duration ?? 0,
    },
    project: rec.project,
    assets,
  };
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readwrite");
  tx.objectStore(STORE_META).delete(id);
  await txDone(tx);
  const blobTx = db.transaction(STORE_BLOBS, "readwrite");
  const store = blobTx.objectStore(STORE_BLOBS);
  const keys: IDBValidKey[] = await reqAs(store.getAllKeys());
  for (const k of keys) {
    if (String(k).startsWith(`${id}:`)) store.delete(k);
  }
  await txDone(blobTx);
  db.close();
}

export async function duplicateProject(id: string): Promise<string | null> {
  const loaded = await loadProject(id);
  if (!loaded) return null;
  return saveProject({
    id: null,
    name: `${loaded.meta.name} (کپی)`,
    project: loaded.project,
    thumb: loaded.meta.thumb,
    assets: loaded.assets.map((a) => ({ id: a.id, blob: a.blob, type: a.type })),
    aspect: loaded.meta.aspect,
    clipCount: loaded.meta.clipCount,
    duration: loaded.meta.duration,
  });
}

/** تغییر نام فقط متادیتا — بدون بازنویسی بولب‌ها */
export async function renameProject(id: string, name: string): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readwrite");
  const store = tx.objectStore(STORE_META);
  const rec = (await reqAs(store.get(id) as IDBRequest<any>)) as any;
  if (!rec) {
    db.close();
    return false;
  }
  rec.name = name;
  rec.updatedAt = Date.now();
  store.put(rec);
  await txDone(tx);
  db.close();
  return true;
}

// ── Autosave (crash recovery) — یک اسلات «پیش‌نویس» برای آخرین جلسهٔ ویرایش ──

export interface AutosaveRecord {
  slot: string;
  projectId: string | null;
  name: string;
  project: unknown;
  savedAt: number;
  assetIds: string[];
}

const AUTOSAVE_SLOT = "draft";
const AUTO_BLOB_PREFIX = "auto:";

export async function saveAutosave(rec: Omit<AutosaveRecord, "slot">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_AUTOSAVE, "readwrite");
  tx.objectStore(STORE_AUTOSAVE).put({ ...rec, slot: AUTOSAVE_SLOT });
  await txDone(tx);
  db.close();
}

export async function loadAutosave(): Promise<AutosaveRecord | null> {
  const db = await openDb();
  const rec = (await reqAs(
    db.transaction(STORE_AUTOSAVE, "readonly").objectStore(STORE_AUTOSAVE).get(AUTOSAVE_SLOT) as IDBRequest<any>
  )) as AutosaveRecord | undefined;
  db.close();
  return rec ?? null;
}

export async function clearAutosave(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_AUTOSAVE, "readwrite");
  tx.objectStore(STORE_AUTOSAVE).delete(AUTOSAVE_SLOT);
  const blobTx = db.transaction(STORE_BLOBS, "readwrite");
  const store = blobTx.objectStore(STORE_BLOBS);
  const keys: IDBValidKey[] = await reqAs(store.getAllKeys());
  for (const k of keys) if (String(k).startsWith(AUTO_BLOB_PREFIX)) store.delete(k);
  await txDone(tx);
  await txDone(blobTx);
  db.close();
}

export async function putAutosaveBlob(assetId: string, blob: Blob, type: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_BLOBS, "readwrite");
  tx.objectStore(STORE_BLOBS).put({ key: `${AUTO_BLOB_PREFIX}${assetId}`, blob, type });
  await txDone(tx);
  db.close();
}

export async function loadAutosaveAssets(): Promise<{ id: string; blob: Blob; type: string }[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_BLOBS, "readonly");
  const store = tx.objectStore(STORE_BLOBS);
  const keys: IDBValidKey[] = await reqAs(store.getAllKeys());
  const out: { id: string; blob: Blob; type: string }[] = [];
  for (const k of keys) {
    const key = String(k);
    if (!key.startsWith(AUTO_BLOB_PREFIX)) continue;
    const rec = (await reqAs(store.get(k))) as { blob: Blob; type?: string };
    out.push({ id: key.slice(AUTO_BLOB_PREFIX.length), blob: rec.blob, type: rec.type || "application/octet-stream" });
  }
  db.close();
  return out;
}
