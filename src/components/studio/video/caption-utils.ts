// Shared caption helpers used by CaptionSheet / DubbingSheet
import { uid, type TextItem } from "@/lib/video/types";
import { SUBTITLE_PRESETS, type SubtitlePreset } from "@/lib/studio-data";

export function presetToCaptionPatch(pr: SubtitlePreset): Partial<TextItem> {
  return {
    font: pr.style.fontFamily === "Lalezar" ? "Lalezar" : "Vazirmatn",
    weight: pr.style.fontWeight,
    size: pr.style.fontSize,
    color: pr.style.color,
    strokeColor: pr.style.strokeColor,
    strokeW: pr.style.strokeWidth,
    bgColor: pr.style.bgColor,
    bgOpacity: pr.style.bgOpacity,
    shadow: pr.style.shadow,
    gradient: pr.style.gradient,
    y: pr.style.yPercent / 100,
  };
}

export function captionTextItem(
  text: string,
  start: number,
  end: number,
  words?: { w: string; start: number; end: number }[]
): TextItem {
  const base = presetToCaptionPatch(SUBTITLE_PRESETS[0]);
  return {
    id: uid("tx"),
    text,
    start,
    end,
    x: 0.5,
    accent: "#facc15",
    animIn: "fade",
    animOut: "none",
    rotate: 0,
    opacity: 1,
    karaoke: true,
    isCaption: true,
    ...(words && words.length ? { words } : {}),
    ...base,
  } as TextItem;
}
