// هلپرهای فشرده برای نوشتن دادهٔ تمپلیت‌ها
import type { BankTemplate, MediaSlot, Scene, SceneText, TextSlot } from "../schema";

export const sc = (d: number, motion: string, rest: Partial<Scene> = {}): Scene => ({ d, motion, ...rest });
export const tx = (ref: string, anim: string, at = 0.2, dur?: number, y?: number): SceneText => ({
  ref, anim, at, dur, y,
});
export const img = (id: string, label: string): MediaSlot => ({ id, kind: "image", label });
export const vid = (id: string, label: string): MediaSlot => ({ id, kind: "video", label });
export const aud = (id: string, label: string): MediaSlot => ({ id, kind: "audio", label });
export const txt = (id: string, sample: string, size: TextSlot["size"] = "md", y = 0.5, accent?: string): TextSlot => ({
  id, sample, size, y, accent,
});
export const tpl = (t: BankTemplate): BankTemplate => t;
