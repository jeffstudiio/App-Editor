// Shared editor context passed to all sheets/panels of VideoView
import type { MediaAsset, Project, TextItem } from "@/lib/video/types";

export type SelType = "clip" | "overlay" | "text" | "audio";

export interface Selection {
  type: SelType;
  id: string;
}

export interface BusyState {
  label: string;
  progress?: number; // 0..1 (undefined = indeterminate)
  cancel?: () => void;
}

export interface EditorCtx {
  project: Project;
  time: number;
  mutate: (fn: (p: Project) => void) => void;
  selection: Selection | null;
  select: (sel: Selection | null) => void;
  assets: Map<string, MediaAsset>;
  addAsset: (a: MediaAsset) => void;
  importFile: (file: File) => Promise<MediaAsset | null>;
  seek: (t: number) => void;
  toast: (msg: string, type?: "success" | "error" | "info") => void;
  closeSheet: () => void;
  setBusy: (b: BusyState | null) => void;
  addClipFromAsset: (a: MediaAsset) => void;
  addOverlayFromAsset: (a: MediaAsset) => void;
  addAudioFromAsset: (a: MediaAsset, at?: number) => void;
  addTextItem: (partial?: Partial<TextItem>) => string;
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}
