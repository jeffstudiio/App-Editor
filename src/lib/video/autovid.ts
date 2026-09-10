// Shared auto-video pipeline: script → scene breakdown → AI images →
// karaoke captions → neural TTS per scene. Used by the standalone
// Video Studio view (prompt-first, like desktop "Video Studio").

import {
  DEFAULT_CHROMA, DEFAULT_FILTER, DEFAULT_TRANSFORM, emptyProject, uid,
  type AspectId, type Clip, type MediaAsset, type Project, type TextItem,
} from "./types";
import { captionTextItem } from "@/components/studio/video/caption-utils";

export interface AutoVidScene {
  text: string;
  imagePrompt: string;
  dur: number;
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

function makeImageClip(asset: MediaAsset, dur: number, name: string, index: number): Clip {
  return {
    id: uid("cl"),
    kind: "image",
    assetId: asset.id,
    name: `${name} ${index + 1}`,
    in: 0,
    out: dur,
    speed: 1,
    transform: { ...DEFAULT_TRANSFORM },
    filter: { ...DEFAULT_FILTER },
    chroma: { ...DEFAULT_CHROMA },
    volume: 0,
    muted: true,
    fadeIn: 0,
    fadeOut: 0,
    srcDur: dur,
    srcW: asset.width || 1080,
    srcH: asset.height || 1920,
  };
}

export type AutoVidProgress = (opts: { phase: "script" | "image" | "tts" | "done"; done: number; total: number; label: string }) => void;

export interface AutoVidOptions {
  script: string;
  sceneCount: number;
  tone: string;
  aspect: AspectId;
  withTts: boolean;
  voice?: string;
  onProgress?: AutoVidProgress;
}

export interface AutoVidResult {
  project: Project;
  assets: MediaAsset[];
  title: string | null;
}

export async function buildAutoVideo(opts: AutoVidOptions): Promise<AutoVidResult> {
  const prog = opts.onProgress ?? (() => {});
  prog({ phase: "script", done: 0, total: 1, label: "AI در حال دکوپاژ سناریو…" });
  const res = await fetch("/api/script-scenes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script: opts.script, sceneCount: opts.sceneCount, tone: opts.tone }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "خطا در ساخت صحنه‌ها");
  const scenes: AutoVidScene[] = j.scenes;
  const title: string | null = j.title ?? null;

  const project = emptyProject(opts.aspect);
  const assets: MediaAsset[] = [];

  const imgSize =
    opts.aspect === "16:9" ? "1344x768" : opts.aspect === "1:1" ? "1024x1024" : "768x1344";

  if (title) {
    project.texts.push({
      ...captionTextItem(title, 0, 2.5),
      isCaption: false,
      karaoke: false,
      font: "Lalezar",
      weight: 400,
      size: 86,
      strokeW: 10,
      animIn: "pop",
      y: 0.3,
    } as TextItem);
  }

  let t0 = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    prog({ phase: "image", done: i, total: scenes.length, label: `ساخت تصویر صحنه ${i + 1} از ${scenes.length}…` });
    let asset: MediaAsset | null = null;
    try {
      const ir = await fetch("/api/image-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: sc.imagePrompt, size: imgSize }),
      });
      const ij = await ir.json();
      if (ir.ok && ij.image_base64) {
        const blob = b64ToBlob(ij.image_base64, "image/png");
        const url = URL.createObjectURL(blob);
        asset = {
          id: uid("as"),
          type: "image",
          url,
          name: `scene-${i + 1}.png`,
          duration: 0,
          width: 1024,
          height: 1024,
        };
        assets.push(asset);
      }
    } catch {
      // image optional
    }
    if (asset) project.clips.push(makeImageClip(asset, sc.dur, "صحنه", i));
    project.texts.push(captionTextItem(sc.text, t0, t0 + sc.dur));

    if (opts.withTts && sc.text.trim()) {
      prog({ phase: "tts", done: i, total: scenes.length, label: `گوینده صحنه ${i + 1}…` });
      try {
        const tr = await fetch("/api/edge-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sc.text, voice: opts.voice || "fa-IR-DilaraNeural", rate: 1 }),
        });
        if (tr.ok) {
          const blob = await tr.blob();
          const url = URL.createObjectURL(blob);
          // probe duration
          const dur = await new Promise<number>((r) => {
            const a = document.createElement("audio");
            a.preload = "metadata";
            a.src = url;
            a.onloadedmetadata = () => r(isFinite(a.duration) ? a.duration : 0);
            a.onerror = () => r(0);
          });
          const a: MediaAsset = {
            id: uid("as"),
            type: "audio",
            url,
            name: `گوینده ${i + 1}.mp3`,
            duration: dur,
            width: 0,
            height: 0,
          };
          assets.push(a);
          project.audios.push({
            id: uid("au"),
            assetId: a.id,
            name: `گوینده ${i + 1}`,
            start: t0,
            in: 0,
            out: dur || sc.dur,
            srcDur: dur || sc.dur,
            volume: 1,
            fadeIn: 0.1,
            fadeOut: 0.2,
            effect: "none",
            duckCaptions: false,
            fromTts: true,
          });
        }
      } catch {
        // TTS optional
      }
    }
    t0 += sc.dur;
  }
  prog({ phase: "done", done: 1, total: 1, label: "آماده شد" });
  return { project, assets, title };
}
