"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Clapperboard, Plus, Play, Pause, Undo2, Redo2, Download, Scissors,
  Gauge, Volume2, Palette, FlipHorizontal2, ArrowLeftRight, Snowflake,
  Repeat, Trash2, Copy, Type, Music4, Captions, Sparkles, MapPin,
  Layers, Crop, Settings2, Wand2, AudioWaveform, Vibrate, LayoutTemplate,
  Smile, AudioLines, Frame, TrendingUp, SkipForward, Save, WandSparkles, Diamond,
  ClipboardCopy, ClipboardPaste, Unplug, Bot,
} from "lucide-react";
import {
  EditorEngine, analyzeStabilization, buildReverse,
} from "@/lib/video/engine";
import {
  ASPECTS, DEFAULT_CHROMA, DEFAULT_FILTER, DEFAULT_TRANSFORM,
  clipDur, clipStart, emptyProject, totalDur, uid, normalizeProject,
  type AspectId, type AudioItem, type Clip, type MediaAsset, type OverlayItem, type Project, type TextItem,
} from "@/lib/video/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { BusyState, EditorCtx, Selection } from "./ctx";
import { fmtTime } from "./ctx";
import { ClipBasicSheet, ClipLookSheet, ClipMotionSheet, TransitionSheet, ChromaSheet, AspectSheet } from "./ClipSheets";
import { MediaSheet, TextSheet, AudioSheet } from "./MediaSheets";
import { CaptionSheet, AiEditSheet, AutoVideoSheet, ExportSheet, MarkersSheet } from "./AiSheets";
import { AgentSheet } from "./AgentSheet";
import { DubbingSheet } from "./DubbingSheet";
import { TemplatesSheet } from "./TemplatesSheet";
import { StickersSheet, SfxSheet, MaskSheet, AiClipperSheet, ExtendSheet, ProjectSaveSheet } from "./MoreSheets";
import { KeyframeSheet } from "./KeyframeSheet";
import { EDIT_TEMPLATES, applyTemplateToProject } from "@/lib/video/templates";
import { consumePendingProject, consumePendingTemplate, consumePendingBank } from "@/lib/video/transfer";
import { buildProjectFromBank } from "@/lib/video/bank-apply";
import {
  saveProject as saveProjectDb,
  saveAutosave,
  loadAutosave,
  loadAutosaveAssets,
  putAutosaveBlob,
  saveClipboard,
  loadClipboard,
  loadClipboardAssets,
  putClipboardBlob,
  hasClipboard,
  type AutosaveRecord,
} from "@/lib/projects-db";
import { extractAudio } from "@/lib/video/audio-extract";
import {
  snapPoints,
  snapTime,
  trimAudioLeft,
  trimAudioRight,
  trimClipLeft,
  trimClipRight,
  trimOverlayLeft,
  trimOverlayRight,
  trimTextLeft,
  trimTextRight,
} from "@/lib/video/edit-ops";

const PX = 46; // timeline pixels per second

const PREVIEW_RES: Record<AspectId, [number, number]> = {
  "9:16": [540, 960],
  "1:1": [720, 720],
  "16:9": [960, 540],
  "4:5": [648, 810],
  "3:4": [675, 900],
};

const SHEET_TITLES: Record<string, string> = {
  media: "افزودن رسانه",
  "clip-basic": "تنظیمات کلیپ",
  "clip-look": "فیلتر و رنگ",
  "clip-motion": "چرخش و کادر",
  transition: "ترنزیشن ورودی",
  chroma: "پرده سبز (کروما)",
  text: "متن و تیتر",
  audio: "موزیک و گوینده",
  captions: "زیرنویس خودکار",
  dub: "دوبله و ترجمه صدا",
  "ai-edit": "دستیار ادیت AI",
  templates: "تمپلیت‌های آماده",
  autovid: "ویدئوساز خودکار AI",
  markers: "نشانگرها",
  export: "خروجی ویدئو",
  aspect: "ابعاد کادر",
  stickers: "استیکرها",
  sfx: "جلوه‌های صوتی",
  mask: "ماسک",
  "ai-clipper": "برش هوشمند صحنه",
  extend: "ادامه ویدئو",
  project: "ذخیره پروژه",
  "ai-agent": "عامل هوشمند تدوین",
  kf: "انیمیشن کلیدی (Keyframe)",
};

export function VideoView() {
  const [project, setProject] = useState<Project>(emptyProject());
  const assetsRef = useRef<Map<string, MediaAsset>>(new Map());
  const [assetsTick, setAssetsTick] = useState(0);
  const engineRef = useRef<EditorEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const thumbsOp = useRef<Set<string>>(new Set());

  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  const suppressClick = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const [undoTick, setUndoTick] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [saving, setSaving] = useState(false);
  const [clipHasContent, setClipHasContent] = useState(false);

  // engine lifecycle
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new EditorEngine(emptyProject());
    engineRef.current = engine;
    engine.attach(canvasRef.current);
    const off = engine.onTick((t, p) => {
      setTime(t);
      setPlaying(p);
    });
    return () => {
      off();
      engine.detach();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setProject(project, assetsRef.current);
  }, [project, assetsTick]);

  // one-time handoff: pending template / pending project / bank template from other views
  useEffect(() => {
    hasClipboard().then(setClipHasContent).catch(() => {});
    const pb = consumePendingBank();
    if (pb) {
      buildProjectFromBank(pb)
        .then((res) => {
          for (const a of res.assets) assetsRef.current.set(a.id, a);
          setAssetsTick((t) => t + 1);
          setProject(res.project);
          setProjectName(res.name);
          const empty = res.project.clips.filter((c) => c.name.startsWith("جایگرین")).length;
          toast.success(
            empty > 0
              ? `تمپلیت «${res.name}» ساخته شد — ${empty.toLocaleString("fa-IR")} اسلات خالی با جایگرین پر شد`
              : `تمپلیت «${res.name}» آماده شد`,
          );
        })
        .catch((err) => {
          console.error("bank-apply failed:", err);
          toast.error("ساخت پروژه از تمپلیت ناموفق بود");
        });
    }
    const tpl = consumePendingTemplate();
    if (tpl) {
      const t = EDIT_TEMPLATES.find((x) => x.id === tpl.templateId);
      if (t) {
        setProject((prev) => {
          const next = JSON.parse(JSON.stringify(prev)) as Project;
          applyTemplateToProject(next, t);
          return next;
        });
        toast.success(`قالب «${t.name}» آماده شد — حالا از «رسانه» ویدئو/عکس اضافه کن`);
      }
    }
    const pp = consumePendingProject();
    if (pp) {
      for (const a of pp.assets) assetsRef.current.set(a.id, a);
      setAssetsTick((t) => t + 1);
      setProject(normalizeProject(pp.project));
      setProjectName(pp.name);
      toast.success(`پروژه «${pp.name}» بارگذاری شد`);
    }
    // بازیابی پیش‌نویسِ ذخیره‌نشدهٔ جلسهٔ قبل (crash recovery) — فقط اگر هندآفی نبود
    if (!pb && !tpl && !pp) {
      loadAutosave()
        .then((rec) => {
          if (!rec?.project) return;
          const r = rec.project as { clips?: unknown[]; overlays?: unknown[]; texts?: unknown[]; audios?: unknown[] };
          const count = (r.clips?.length ?? 0) + (r.overlays?.length ?? 0) + (r.texts?.length ?? 0) + (r.audios?.length ?? 0);
          if (count === 0) return;
          toast("پیش‌نویس ذخیره‌نشده از جلسهٔ قبل پیدا شد 💾", {
            description: new Date(rec.savedAt).toLocaleString("fa-IR"),
            action: { label: "بازیابی", onClick: () => void restoreAutosave(rec) },
            duration: 15000,
          });
        })
        .catch(() => {});
    }
  }, []);

  // ── mutation + history ──
  const mutate = useCallback((fn: (p: Project) => void) => {
    setProject((prev) => {
      pastRef.current.push(JSON.stringify(prev));
      if (pastRef.current.length > 60) pastRef.current.shift();
      futureRef.current = [];
      const next = JSON.parse(JSON.stringify(prev)) as Project;
      fn(next);
      return next;
    });
    setUndoTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    setProject((prev) => {
      const snap = pastRef.current.pop();
      if (!snap) return prev;
      futureRef.current.push(JSON.stringify(prev));
      return JSON.parse(snap) as Project;
    });
    setUndoTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    setProject((prev) => {
      const snap = futureRef.current.pop();
      if (!snap) return prev;
      pastRef.current.push(JSON.stringify(prev));
      return JSON.parse(snap) as Project;
    });
    setUndoTick((t) => t + 1);
  }, []);

  // ── autosave (crash recovery) ──
  const projRef = useRef(project);
  projRef.current = project;
  const autosaveAssetsRef = useRef<Set<string>>(new Set());
  const autosaveBusyRef = useRef(false);

  const restoreAutosave = useCallback(async (rec: AutosaveRecord) => {
    try {
      const assets = await loadAutosaveAssets();
      for (const a of assets) {
        const type = a.type.startsWith("video") ? "video" : a.type.startsWith("audio") ? "audio" : "image";
        assetsRef.current.set(a.id, {
          id: a.id,
          type: type as MediaAsset["type"],
          url: URL.createObjectURL(a.blob),
          name: `asset-${a.id.slice(-4)}`,
          duration: 0,
          width: 1080,
          height: 1920,
        });
        autosaveAssetsRef.current.add(a.id);
      }
      setAssetsTick((t) => t + 1);
      setProject(normalizeProject(rec.project));
      setProjectId(rec.projectId);
      setProjectName(rec.name || "پیش‌نویس بازیابی‌شده");
      toast.success("پیش‌نویس جلسهٔ قبل بازیابی شد ✅");
    } catch {
      toast.error("بازیابی پیش‌نویس ناموفق بود");
    }
  }, []);

  const runAutosave = useCallback(async () => {
    if (autosaveBusyRef.current) return;
    autosaveBusyRef.current = true;
    try {
      const p = projRef.current;
      const ids = new Set<string>();
      for (const c of p.clips) ids.add(c.assetId);
      for (const o of p.overlays) ids.add(o.assetId);
      for (const a of p.audios) ids.add(a.assetId);
      // فقط بولب‌های جدید ذخیره می‌شوند — بولب‌های قبلی در IDB مانده‌اند
      for (const id of ids) {
        if (autosaveAssetsRef.current.has(id)) continue;
        const asset = assetsRef.current.get(id);
        if (!asset) continue;
        try {
          const blob = await (await fetch(asset.url)).blob();
          await putAutosaveBlob(id, blob, blob.type || "application/octet-stream");
          autosaveAssetsRef.current.add(id);
        } catch {
          // asset فعلاً غیرقابل‌خواندن — JSON بدون آن هم ذخیره می‌شود
        }
      }
      await saveAutosave({
        projectId,
        name: projectName || "پیش‌نویس",
        project: p,
        savedAt: Date.now(),
        assetIds: [...ids],
      });
    } catch {
      // autosave هرگز نباید UI را اذیت کند
    } finally {
      autosaveBusyRef.current = false;
    }
  }, [projectId, projectName]);

  // دیبانس ۲.۵ ثانیه‌ای — پخش (تغییر time هر فریم) تایمر را ریست می‌کند
  useEffect(() => {
    if (busy) return;
    const p = projRef.current;
    const empty = !p.clips.length && !p.overlays.length && !p.texts.length && !p.audios.length;
    if (empty) return;
    const h = setTimeout(() => {
      void runAutosave();
    }, 2500);
    return () => clearTimeout(h);
  });

  // ── assets ──
  const addAsset = useCallback((a: MediaAsset) => {
    assetsRef.current.set(a.id, a);
    setAssetsTick((t) => t + 1);
  }, []);

  const importFile = useCallback(
    async (file: File): Promise<MediaAsset | null> => {
      const kind: MediaAsset["type"] | null = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("image/")
            ? "image"
            : null;
      if (!kind) {
        toast.error("فرمت فایل پشتیبانی نمی‌شود (ویدئو، عکس یا صدا)");
        return null;
      }
      const url = URL.createObjectURL(file);
      try {
        if (kind === "image") {
          const img = new Image();
          img.src = url;
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej(new Error("bad image"));
          });
          const asset: MediaAsset = { id: uid("as"), type: "image", url, name: file.name, duration: 0, width: img.naturalWidth, height: img.naturalHeight };
          addAsset(asset);
          return asset;
        }
        const dur = kind === "video" ? await probeVideoDuration(url) : await probeAudioDuration(url);
        const dims =
          kind === "video"
            ? await new Promise<{ w: number; h: number }>((res) => {
                const v = document.createElement("video");
                v.preload = "metadata";
                v.src = url;
                v.onloadedmetadata = () => res({ w: v.videoWidth || 1080, h: v.videoHeight || 1920 });
                v.onerror = () => res({ w: 1080, h: 1920 });
              })
            : { w: 0, h: 0 };
        const asset: MediaAsset = { id: uid("as"), type: kind, url, name: file.name, duration: dur, width: dims.w, height: dims.h };
        addAsset(asset);
        return asset;
      } catch {
        toast.error("خواندن فایل ناموفق بود");
        URL.revokeObjectURL(url);
        return null;
      }
    },
    [addAsset]
  );

  // ── transport ──
  const seek = useCallback((t: number) => {
    engineRef.current?.seek(t);
    setTime(t);
  }, []);

  const togglePlay = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.playing) e.pause();
    else e.play();
  }, []);

  // ── entity creators ──
  const makeClip = useCallback((a: MediaAsset): Clip => {
    const isVideo = a.type === "video";
    return {
      id: uid("cl"),
      kind: isVideo ? "video" : "image",
      assetId: a.id,
      name: a.name.replace(/\.[^.]+$/, "").slice(0, 24) || (isVideo ? "کلیپ" : "عکس"),
      in: 0,
      out: isVideo ? Math.max(0.5, Math.min(a.duration || 10, 3600)) : 4,
      speed: 1,
      transform: { ...DEFAULT_TRANSFORM },
      filter: { ...DEFAULT_FILTER },
      chroma: { ...DEFAULT_CHROMA },
      volume: 1,
      muted: !isVideo,
      fadeIn: 0,
      fadeOut: 0,
      transitionIn: { type: "none", dur: 0.4 },
      srcDur: isVideo ? a.duration || 10 : 4,
      srcW: a.width || 1080,
      srcH: a.height || 1920,
    };
  }, []);

  const addClipFromAsset = useCallback(
    (a: MediaAsset) => {
      if (a.type === "audio") return;
      mutate((p) => p.clips.push(makeClip(a)));
      toast.success(a.type === "video" ? "کلیپ به تایم‌لاین اضافه شد" : "عکس به تایم‌لاین اضافه شد");
    },
    [makeClip, mutate]
  );

  const addOverlayFromAsset = useCallback(
    (a: MediaAsset) => {
      if (a.type === "audio") return;
      mutate((p) =>
        p.overlays.push({
          id: uid("ov"),
          kind: a.type === "video" ? "video" : "image",
          assetId: a.id,
          name: a.name.replace(/\.[^.]+$/, "").slice(0, 24),
          start: time,
          dur: a.type === "video" ? Math.min(a.duration || 4, 30) : 4,
          srcIn: 0,
          srcDur: a.duration || 4,
          transform: { ...DEFAULT_TRANSFORM, scale: 0.5, y: 0.25 },
          filter: { ...DEFAULT_FILTER },
          chroma: { ...DEFAULT_CHROMA },
        })
      );
      toast.success("لایه رویی اضافه شد (بالا-وسط کادر)");
    },
    [mutate, time]
  );

  const addAudioFromAsset = useCallback(
    (a: MediaAsset, at?: number) => {
      if (a.type !== "audio") return;
      mutate((p) =>
        p.audios.push({
          id: uid("au"),
          assetId: a.id,
          name: a.name.replace(/\.[^.]+$/, "").slice(0, 24),
          start: at ?? time,
          in: 0,
          out: a.duration || 10,
          srcDur: a.duration || 10,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          effect: "none",
          duckCaptions: false,
        })
      );
      toast.success("صدا به تایم‌لاین اضافه شد");
    },
    [mutate, time]
  );

  const addTextItem = useCallback(
    (partial?: Partial<TextItem>): string => {
      const id = uid("tx");
      mutate((p) =>
        p.texts.push({
          id,
          text: "متن تو",
          start: time,
          end: time + 3,
          x: 0.5,
          y: 0.5,
          font: "Vazirmatn",
          weight: 900,
          size: 64,
          color: "#ffffff",
          accent: "#facc15",
          strokeColor: "#000000",
          strokeW: 8,
          bgColor: "#000000",
          bgOpacity: 0,
          shadow: true,
          gradient: false,
          animIn: "pop",
          animOut: "fade",
          rotate: 0,
          opacity: 1,
          karaoke: false,
          ...partial,
        })
      );
      return id;
    },
    [mutate, time]
  );

  // ── clip actions ──
  const selectedClip = selection?.type === "clip" ? project.clips.find((c) => c.id === selection.id) ?? null : null;
  const selectedOverlay = selection?.type === "overlay" ? project.overlays.find((o) => o.id === selection.id) ?? null : null;
  const selectedText = selection?.type === "text" ? project.texts.find((t) => t.id === selection.id) ?? null : null;
  const selectedAudio = selection?.type === "audio" ? project.audios.find((a) => a.id === selection.id) ?? null : null;

  const splitSelected = useCallback(() => {
    if (!selectedClip) return toast.error("اول یک کلیپ را انتخاب کن");
    if (selectedClip.reverse) return toast.error("کلیپ معکوس قابل برش نیست");
    const st = clipStart(project, selectedClip.id);
    const local = time - st;
    if (local <= 0.12 || local >= clipDur(selectedClip) - 0.12)
      return toast.error("نشانگر باید داخل کلیپ انتخاب‌شده باشد");
    const srcSplit = selectedClip.in + local * selectedClip.speed;
    mutate((p) => {
      const idx = p.clips.findIndex((c) => c.id === selectedClip.id);
      if (idx < 0) return;
      const orig = p.clips[idx];
      const a: Clip = { ...orig, out: srcSplit, transitionIn: { type: "none", dur: 0.3 } };
      const b: Clip = { ...orig, id: uid("cl"), in: srcSplit, fadeIn: 0 };
      p.clips.splice(idx, 1, a, b);
    });
    toast.success("کلیپ برش خورد ✂️");
  }, [mutate, project, selectedClip, time]);

  const freezeSelected = useCallback(async () => {
    if (!selectedClip) return toast.error("اول یک کلیپ ویدئویی انتخاب کن");
    const asset = assetsRef.current.get(selectedClip.assetId);
    if (!asset || asset.type !== "video") return toast.error("فریز فقط برای ویدئو است");
    setBusy({ label: "ثبت فریز فریم…" });
    try {
      const srcTime = selectedClip.in + Math.max(0, time - clipStart(project, selectedClip.id)) * selectedClip.speed;
      const canvas = await EditorEngine.grabFrame(asset.url, srcTime, 720);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("no blob");
      const asset2 = await importFile(new File([blob], "freeze.jpg", { type: "image/jpeg" }));
      if (!asset2) throw new Error("no asset");
      mutate((p) => {
        const idx = p.clips.findIndex((c) => c.id === selectedClip.id);
        p.clips.splice(idx + 1, 0, {
          id: uid("cl"),
          kind: "image",
          assetId: asset2.id,
          name: "فریز فریم",
          in: 0,
          out: 2.5,
          speed: 1,
          transform: { ...DEFAULT_TRANSFORM },
          filter: { ...DEFAULT_FILTER },
          chroma: { ...DEFAULT_CHROMA },
          volume: 0,
          muted: true,
          fadeIn: 0,
          fadeOut: 0,
          transitionIn: { type: "fade", dur: 0.25 },
          srcDur: 2.5,
          srcW: canvas.width,
          srcH: canvas.height,
        });
      });
      toast.success("فریز فریم بعد از کلیپ اضافه شد ❄️");
    } catch {
      toast.error("فریز فریم ناموفق بود");
    } finally {
      setBusy(null);
    }
  }, [importFile, mutate, project, selectedClip, time]);

  const reverseSelected = useCallback(async () => {
    if (!selectedClip) return toast.error("اول یک کلیپ ویدئویی انتخاب کن");
    if (selectedClip.reverse) return toast.error("این کلیپ قبلاً معکوس شده");
    const asset = assetsRef.current.get(selectedClip.assetId);
    if (!asset || asset.type !== "video") return toast.error("معکوس فقط برای ویدئو است");
    const dur = selectedClip.out - selectedClip.in;
    if (dur > 10) toast.info("بخش ۱۰ ثانیه اول معکوس می‌شود");
    setBusy({ label: "ساخت نسخه معکوس…", progress: 0 });
    try {
      const { frames, fps } = await buildReverse(asset.url, selectedClip.in, selectedClip.out, 12, (pr) =>
        setBusy({ label: "ساخت نسخه معکوس…", progress: pr })
      );
      mutate((p) => {
        const c = p.clips.find((x) => x.id === selectedClip.id);
        if (c) c.reverse = { frames, fps };
      });
      toast.success("کلیپ معکوس شد 🔁");
    } catch {
      toast.error("معکوس‌سازی ناموفق بود");
    } finally {
      setBusy(null);
    }
  }, [mutate, selectedClip]);

  const stabilizeSelected = useCallback(async () => {
    if (!selectedClip) return toast.error("اول یک کلیپ انتخاب کن");
    if (selectedClip.kind !== "video" || selectedClip.reverse)
      return toast.error("لرزش‌گیر فقط برای کلیپ ویدئویی عادی است");
    const asset = assetsRef.current.get(selectedClip.assetId);
    if (!asset) return toast.error("فایل ویدئو پیدا نشد");
    // toggle off
    if (selectedClip.stab) {
      mutate((p) => {
        const c = p.clips.find((x) => x.id === selectedClip.id);
        if (c) c.stab = undefined;
      });
      toast.info("لرزش‌گیر خاموش شد");
      return;
    }
    if (selectedClip.out - selectedClip.in > 120)
      return toast.error("لرزش‌گیر برای کلیپ‌های زیر ۲ دقیقه است؛ اول تریم کن");
    setBusy({ label: "تحلیل لرزش دوربین…", progress: 0 });
    try {
      const stab = await analyzeStabilization(asset.url, selectedClip.in, selectedClip.out, (pr) =>
        setBusy({ label: "تحلیل لرزش دوربین…", progress: pr })
      );
      mutate((p) => {
        const c = p.clips.find((x) => x.id === selectedClip.id);
        if (c) c.stab = { ...stab, speed: c.speed };
      });
      toast.success(`لرزش‌گیر هوشمند فعال شد 🧲 (زوم ${Math.round(stab.zoom * 100)}٪ برای پوشش لبه‌ها)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تحلیل لرزش ناموفق بود");
    } finally {
      setBusy(null);
    }
  }, [mutate, selectedClip]);

  const duplicateSelected = useCallback(() => {
    if (!selection) return;
    mutate((p) => {
      if (selection.type === "clip") {
        const idx = p.clips.findIndex((c) => c.id === selection.id);
        // فریم‌های معکوس (blob URL) بین کلیپ‌ها به‌اشتراک گذاشته نمی‌شوند تا آزادسازی حافظه سالم بماند
        if (idx >= 0) p.clips.splice(idx + 1, 0, { ...p.clips[idx], id: uid("cl"), reverse: undefined });
      } else if (selection.type === "text") {
        const idx = p.texts.findIndex((t) => t.id === selection.id);
        if (idx >= 0) p.texts.splice(idx + 1, 0, { ...p.texts[idx], id: uid("tx") });
      } else if (selection.type === "audio") {
        const idx = p.audios.findIndex((a) => a.id === selection.id);
        if (idx >= 0) p.audios.splice(idx + 1, 0, { ...p.audios[idx], id: uid("au") });
      } else if (selection.type === "overlay") {
        const idx = p.overlays.findIndex((o) => o.id === selection.id);
        if (idx >= 0) p.overlays.splice(idx + 1, 0, { ...p.overlays[idx], id: uid("ov") });
      }
    });
    toast.success("کپی شد");
  }, [mutate, selection]);

  const deleteSelected = useCallback(() => {
    if (!selection) return;
    mutate((p) => {
      if (selection.type === "clip") {
        const idx = p.clips.findIndex((c) => c.id === selection.id);
        if (idx >= 0) {
          const rev = p.clips[idx].reverse;
          if (rev) for (const u of rev.frames) URL.revokeObjectURL(u); // فیکس نشتی objectURL فریم‌های معکوس
          const removed = clipDur(p.clips[idx]);
          const removedStart = clipStart(p, selection.id);
          const removedEnd = removedStart + removed;
          p.clips = p.clips.filter((c) => c.id !== selection.id);
          // ripple واقعی: لایه‌هایی که بعد از کلیپِ حذف‌شده شروع می‌شوند، به‌اندازهٔ همان حفره جلو می‌آیند
          for (const o of p.overlays) if (o.start >= removedEnd - 1e-6) o.start = Math.max(0, o.start - removed);
          for (const t of p.texts) {
            if (t.start >= removedEnd - 1e-6) {
              t.start = Math.max(0, t.start - removed);
              t.end = Math.max(t.start + 0.1, t.end - removed);
            }
          }
          for (const a of p.audios) if (a.start >= removedEnd - 1e-6) a.start = Math.max(0, a.start - removed);
        }
      }
      if (selection.type === "text") p.texts = p.texts.filter((t) => t.id !== selection.id);
      if (selection.type === "audio") p.audios = p.audios.filter((a) => a.id !== selection.id);
      if (selection.type === "overlay") p.overlays = p.overlays.filter((o) => o.id !== selection.id);
    });
    setSelection(null);
    toast.success("حذف شد");
  }, [mutate, selection]);

  const addMarker = useCallback(() => {
    mutate((p) => p.markers.push({ id: uid("mk"), t: time, label: "" }));
    toast.success(`نشانگر روی ${fmtTime(time)} ثبت شد 📍`);
  }, [mutate, time]);

  // ── clipboard واقعی (IDB) — کپی/چسباندن حتی بین پروژه‌ها ──
  const copySelectedToClipboard = useCallback(async () => {
    if (!selection) return toast.error("اول یک آیتم را انتخاب کن");
    try {
      let item: unknown = null;
      let name = "";
      const assetIds: string[] = [];
      if (selection.type === "clip") {
        const c = project.clips.find((x) => x.id === selection.id);
        if (!c) return;
        const { reverse: _rev, ...rest } = c; // فریم‌های معکوس blob URL هستند — قابل انتقال نیستند
        item = rest;
        name = c.name;
        assetIds.push(c.assetId);
      } else if (selection.type === "overlay") {
        const o = project.overlays.find((x) => x.id === selection.id);
        if (!o) return;
        item = o;
        name = o.name;
        assetIds.push(o.assetId);
      } else if (selection.type === "text") {
        const t = project.texts.find((x) => x.id === selection.id);
        if (!t) return;
        item = t;
        name = t.text.slice(0, 12);
      } else {
        const a = project.audios.find((x) => x.id === selection.id);
        if (!a) return;
        item = a;
        name = a.name;
        assetIds.push(a.assetId);
      }
      for (const id of assetIds) {
        const asset = assetsRef.current.get(id);
        if (!asset) continue;
        const blob = await (await fetch(asset.url)).blob();
        await putClipboardBlob(id, blob, blob.type || "application/octet-stream");
      }
      await saveClipboard({ kind: selection.type, item, name, savedAt: Date.now(), assetIds });
      setClipHasContent(true);
      toast.success("رونوشت در کلیپ‌بورد ذخیره شد — حتی در پروژهٔ دیگر قابل چسباندن است");
    } catch {
      toast.error("کپی در کلیپ‌بورد ناموفق بود");
    }
  }, [project, selection]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const rec = await loadClipboard();
      if (!rec) return toast.error("کلیپ‌بورد خالی است");
      const blobs = await loadClipboardAssets();
      const idMap = new Map<string, string>();
      for (const b of blobs) {
        if (assetsRef.current.has(b.id)) {
          idMap.set(b.id, b.id);
          continue;
        }
        const f = new File([b.blob], `paste-${b.id.slice(-4)}`, { type: b.type });
        const asset = await importFile(f);
        if (asset) idMap.set(b.id, asset.id);
      }
      const item = JSON.parse(JSON.stringify(rec.item)) as Record<string, unknown> & { assetId?: string };
      const remapped = item.assetId ? (idMap.get(item.assetId) ?? item.assetId) : undefined;
      mutate((p) => {
        if (rec.kind === "clip") {
          p.clips.push({ ...(item as unknown as Clip), id: uid("cl"), assetId: remapped ?? "", reverse: undefined } as Clip);
        } else if (rec.kind === "overlay") {
          p.overlays.push({ ...(item as unknown as OverlayItem), id: uid("ov"), assetId: remapped ?? "", start: Math.max(0, timeRef.current) } as OverlayItem);
        } else if (rec.kind === "text") {
          const len = Math.max(0.3, (item.end as number) - (item.start as number));
          p.texts.push({ ...(item as unknown as TextItem), id: uid("tx"), start: Math.max(0, timeRef.current), end: Math.max(0, timeRef.current) + len } as TextItem);
        } else {
          p.audios.push({ ...(item as unknown as AudioItem), id: uid("au"), assetId: remapped ?? "", start: Math.max(0, timeRef.current) } as AudioItem);
        }
      });
      toast.success(`«${rec.name}» چسبانده شد`);
    } catch {
      toast.error("چسباندن ناموفق بود");
    }
  }, [importFile, mutate]);

  // ── detach audio واقعی (decode → offline render → WAV) ──
  const detachAudioSelected = useCallback(async () => {
    if (!selectedClip) return toast.error("اول یک کلیپ انتخاب کن");
    if (selectedClip.kind !== "video") return toast.error("جدا کردن صدا فقط برای کلیپ ویدئویی است");
    const asset = assetsRef.current.get(selectedClip.assetId);
    if (!asset) return toast.error("فایل ویدئو پیدا نشد");
    setBusy({ label: "جدا کردن صدا…", progress: 0 });
    try {
      const { blob, duration } = await extractAudio(
        asset.url, selectedClip.in, selectedClip.out, selectedClip.speed,
        (pr) => setBusy({ label: "جدا کردن صدا…", progress: pr })
      );
      const file = new File([blob], "detached.wav", { type: "audio/wav" });
      const audioAsset = await importFile(file);
      if (!audioAsset) throw new Error("no asset");
      const st = clipStart(project, selectedClip.id);
      mutate((p) => {
        const c = p.clips.find((x) => x.id === selectedClip.id);
        if (!c) return;
        c.muted = true;
        p.audios.push({
          id: uid("au"),
          assetId: audioAsset.id,
          name: `${c.name} (صدا)`.slice(0, 24),
          start: st,
          in: 0,
          out: duration,
          srcDur: duration,
          volume: c.volume,
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
          effect: "none",
          duckCaptions: false,
        });
      });
      toast.success("صدا جدا شد — تراک مستقل، با volume/fade خودش 🎙️");
    } catch {
      toast.error("جدا کردن صدا ناموفق بود");
    } finally {
      setBusy(null);
    }
  }, [importFile, mutate, project, selectedClip]);

  // ── keyboard shortcuts (§67 مشخصات) ──
  const shortcutsRef = useRef({ togglePlay, splitSelected, deleteSelected, duplicateSelected, undo, redo, seek, setSheet, selection, copySelectedToClipboard, pasteFromClipboard });
  shortcutsRef.current = { togglePlay, splitSelected, deleteSelected, duplicateSelected, undo, redo, seek, setSheet, selection, copySelectedToClipboard, pasteFromClipboard };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = shortcutsRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        s.setSheet(null);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void s.copySelectedToClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void s.pasteFromClipboard();
        return;
      }
      if (mod) return;
      if (e.code === "Space") {
        e.preventDefault();
        s.togglePlay();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.deleteSelected();
        return;
      }
      if (e.key === "s" || e.key === "S") {
        s.splitSelected();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        s.seek(timeRef.current + 1);
        return;
      }
      if (e.key === "-") {
        s.seek(Math.max(0, timeRef.current - 1));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        s.seek(timeRef.current + (e.shiftKey ? 1 : 1 / 15));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.seek(Math.max(0, timeRef.current - (e.shiftKey ? 1 : 1 / 15)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── drag & reorder (NLE-grade) ──
  // کلیپ اصلی: درگ افقی = جابه‌جایی ترتیب | لایه‌ها: درگ افقی = جابه‌جایی start
  interface TrimOrig {
    in: number; out: number; start: number; end: number; dur: number;
    srcIn: number; speed: number; srcDur: number; isVideo: boolean; isImage: boolean;
  }
  const [drag, setDrag] = useState<
    | { kind: "clip"; id: string; startX: number; dx: number; moved: boolean }
    | { kind: "overlay" | "text" | "audio"; id: string; startX: number; dx: number; origStart: number; moved: boolean }
    | { kind: "trim"; edge: "l" | "r"; target: "clip" | "overlay" | "text" | "audio"; id: string; startX: number; dx: number; moved: boolean; orig: TrimOrig }
    | null
  >(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const onItemPointerDown = useCallback(
    (
      e: React.PointerEvent,
      item: { kind: "clip" | "overlay" | "text" | "audio"; id: string; origStart?: number }
    ) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const base = { startX: e.clientX, dx: 0, moved: false };
      setDrag(
        item.kind === "clip"
          ? { kind: "clip", id: item.id, ...base }
          : { kind: item.kind, id: item.id, origStart: item.origStart ?? 0, ...base }
      );
    },
    []
  );

  const onItemPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 6) return; // آستانهٔ تپ vs درگ
    setDrag({ ...d, dx, moved: true });
  }, []);

  const onItemPointerUp = useCallback(() => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || !d.moved) return;
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 300);
    if (d.kind === "trim") {
      const dt = d.dx / PX;
      const o = d.orig;
      // لایه‌ها به مرزهای همسایه اسنپ می‌شوند؛ تراک اصلی مغناطیسی است و اسنپ نمی‌خواهد
      const pts = d.target === "clip" ? [] : snapPoints(snapCtx(), timeRef.current, d.id);
      mutate((p) => {
        if (d.target === "clip") {
          const c = p.clips.find((x) => x.id === d.id);
          if (!c || c.reverse) return;
          if (d.edge === "l") {
            const r = trimClipLeft({ in: o.in, out: o.out, speed: o.speed }, dt);
            c.in = r.in;
          } else {
            const r = trimClipRight({ in: o.in, out: o.out, speed: o.speed, srcDur: o.srcDur, isImage: o.isImage }, dt);
            c.out = r.out;
          }
        } else if (d.target === "overlay") {
          const ov = p.overlays.find((x) => x.id === d.id);
          if (!ov) return;
          if (d.edge === "l") {
            const s = snapTime(o.start + dt, pts);
            const r = trimOverlayLeft({ start: o.start, dur: o.dur, srcIn: o.srcIn, srcDur: o.srcDur, isVideo: o.isVideo }, s - o.start);
            ov.start = r.start;
            ov.dur = r.dur;
            if (ov.kind === "video") ov.srcIn = Math.max(0, r.srcIn);
          } else {
            const end0 = o.start + o.dur;
            const e = snapTime(end0 + dt, pts);
            ov.dur = trimOverlayRight({ dur: o.dur, srcIn: ov.kind === "video" ? o.srcIn : 0, srcDur: o.srcDur, isVideo: o.isVideo }, e - end0).dur;
          }
        } else if (d.target === "text") {
          const t = p.texts.find((x) => x.id === d.id);
          if (!t) return;
          if (d.edge === "l") {
            const s = snapTime(o.start + dt, pts);
            t.start = trimTextLeft({ start: o.start, end: o.end }, s - o.start).start;
          } else {
            const e = snapTime(o.end + dt, pts);
            t.end = trimTextRight({ start: o.start, end: o.end }, e - o.end).end;
          }
        } else if (d.target === "audio") {
          const a = p.audios.find((x) => x.id === d.id);
          if (!a) return;
          if (d.edge === "l") {
            const s = snapTime(o.start + dt, pts);
            const r = trimAudioLeft({ start: o.start, in: o.in, out: o.out }, s - o.start);
            a.start = r.start;
            a.in = r.in;
          } else {
            const end0 = o.start + (o.out - o.in);
            const e = snapTime(end0 + dt, pts);
            a.out = trimAudioRight({ in: o.in, out: o.out, srcDur: o.srcDur }, e - end0).out;
          }
        }
      });
      return;
    }
    if (d.kind === "clip") {
      mutate((p) => {
        const from = p.clips.findIndex((c) => c.id === d.id);
        if (from < 0) return;
        const w = Math.max(30, clipDur(p.clips[from]) * PX);
        let steps = Math.round(d.dx / w);
        if (steps === 0 && Math.abs(d.dx) > 18) steps = d.dx > 0 ? 1 : -1; // درگ کوتاه = یک جایگاه
        const to = Math.max(0, Math.min(p.clips.length - 1, from + steps));
        if (to === from) return;
        const [c] = p.clips.splice(from, 1);
        p.clips.splice(to, 0, c);
      });
      return;
    }
    // لایه‌ها: جابه‌جایی زمانی با اسنپ مغناطیسی (پلی‌هد، صفر، مرز کلیپ‌ها و لایه‌ها)
    let dt = d.dx / PX;
    const orig = (d as { origStart: number }).origStart;
    let next = Math.max(0, orig + dt);
    next = snapTime(next, snapPoints(snapCtx(), timeRef.current, d.id));
    if (next < 0.12) next = 0;
    next = Math.round(next * 20) / 20; // گام ۰.۰۵s
    mutate((p) => {
      if (d.kind === "overlay") {
        const o = p.overlays.find((x) => x.id === d.id);
        if (o) o.start = next;
      } else if (d.kind === "text") {
        const t = p.texts.find((x) => x.id === d.id);
        if (t) {
          const len = t.end - t.start;
          t.start = next;
          t.end = next + len;
        }
      } else if (d.kind === "audio") {
        const a = p.audios.find((x) => x.id === d.id);
        if (a) a.start = next;
      }
    });
  }, [mutate, project, timeRef]);

  // ── trim handles (دستگیره‌های تریم) ──
  const onTrimPointerDown = useCallback(
    (
      e: React.PointerEvent,
      edge: "l" | "r",
      target: "clip" | "overlay" | "text" | "audio",
      id: string,
      orig: TrimOrig
    ) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setDrag({ kind: "trim", edge, target, id, startX: e.clientX, dx: 0, moved: false, orig });
    },
    []
  );

  const onTrimPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.kind !== "trim") return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 6) return; // آستانهٔ تپ vs درگ
    setDrag({ ...d, dx, moved: true });
  }, []);

  const onTrimPointerUp = useCallback(() => onItemPointerUp(), [onItemPointerUp]);

  // زمینهٔ اسنپ: مرزها باید از ترتیب کلیپ‌ها محاسبه شوند (clips خودشان start ندارند)
  const snapCtx = useCallback(() => {
    const p = project;
    let acc = 0;
    const clips = p.clips.map((c) => {
      const s = acc;
      acc += clipDur(c);
      return { id: c.id, start: s, end: acc };
    });
    return {
      clips,
      overlays: p.overlays.map((o) => ({ id: o.id, start: o.start, end: o.start + o.dur })),
      texts: p.texts.map((t) => ({ id: t.id, start: t.start, end: t.end })),
      audios: p.audios.map((a) => ({ id: a.id, start: a.start, end: a.start + (a.out - a.in) })),
      markers: p.markers,
    };
  }, [project]);

  const trimHandle = (
    edge: "l" | "r",
    target: "clip" | "overlay" | "text" | "audio",
    id: string,
    orig: TrimOrig
  ) => (
    <span
      onPointerDown={(e) => onTrimPointerDown(e, edge, target, id, orig)}
      onPointerMove={onTrimPointerMove}
      onPointerUp={onTrimPointerUp}
      className={`absolute top-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center ${edge === "l" ? "left-0" : "right-0"}`}
      style={{ touchAction: "none" }}
    >
      <span
        className={`h-2/3 w-1.5 rounded-full bg-white/85 shadow-md ${
          drag?.kind === "trim" && drag.id === id && drag.edge === edge && drag.moved ? "h-3/4 bg-accent" : ""
        }`}
      />
    </span>
  );

  // ── project persistence (IndexedDB) ──
  const saveToDb = useCallback(
    async (name: string) => {
      setSaving(true);
      try {
        const ids = new Set<string>();
        for (const c of project.clips) ids.add(c.assetId);
        for (const o of project.overlays) ids.add(o.assetId);
        for (const a of project.audios) ids.add(a.assetId);
        const assets: { id: string; blob: Blob; type: string }[] = [];
        for (const id of ids) {
          const a = assetsRef.current.get(id);
          if (!a) continue;
          try {
            const blob = await (await fetch(a.url)).blob();
            assets.push({ id, blob, type: blob.type || "application/octet-stream" });
          } catch {
            // skip unreadable asset
          }
        }
        let thumb: string | null = null;
        try {
          thumb = canvasRef.current?.toDataURL("image/jpeg", 0.55) ?? null;
        } catch {}
        const id = await saveProjectDb({
          id: projectId,
          name,
          project,
          thumb,
          assets,
          aspect: project.aspect,
          clipCount: project.clips.length,
          duration: totalDur(project),
        });
        setProjectId(id);
        setProjectName(name);
        setSheet(null);
        toast.success("پروژه ذخیره شد — از «پروژه‌های من» در خانه بازش کن 💾");
      } catch {
        toast.error("ذخیره پروژه ناموفق بود");
      } finally {
        setSaving(false);
      }
    },
    [project, projectId]
  );

  const toggleEnhance = useCallback(() => {
    if (!selectedClip) return toast.error("اول یک کلیپ انتخاب کن");
    mutate((p) => {
      const c = p.clips.find((x) => x.id === selectedClip.id);
      if (c) c.enhance = !c.enhance;
    });
    toast.success(selectedClip.enhance ? "ارتقای کیفیت خاموش شد" : "ارتقای کیفیت فعال شد ✨ (وضوح و رنگ)");
  }, [mutate, selectedClip]);

  // ── thumbnails ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const c of project.clips) {
        if (thumbs[c.id] || thumbsOp.current.has(c.id)) continue;
        thumbsOp.current.add(c.id);
        try {
          if (c.reverse && c.reverse.frames.length) {
            if (!cancelled) setThumbs((t) => ({ ...t, [c.id]: c.reverse!.frames[Math.floor(c.reverse!.frames.length / 2)] }));
          } else if (c.kind === "image") {
            const url = assetsRef.current.get(c.assetId)?.url;
            if (url && !cancelled) setThumbs((t) => ({ ...t, [c.id]: url }));
          } else {
            const asset = assetsRef.current.get(c.assetId);
            if (asset) {
              const canvas = await EditorEngine.grabFrame(asset.url, c.in + 0.2, 120);
              const url = canvas.toDataURL("image/jpeg", 0.6);
              if (!cancelled) setThumbs((t) => ({ ...t, [c.id]: url }));
            }
          }
        } catch {
          // thumbnail is cosmetic
        } finally {
          thumbsOp.current.delete(c.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.clips, thumbs]);

  // auto-scroll timeline while playing
  useEffect(() => {
    if (!playing || !tlRef.current) return;
    const el = tlRef.current;
    const x = time * PX;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) {
      el.scrollTo({ left: Math.max(0, x - el.clientWidth * 0.35), behavior: "smooth" });
    }
  }, [time, playing]);

  // ── scrubbing ──
  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = tlRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      seek(Math.max(0, Math.min(totalDur(project), x / PX)));
    },
    [project, seek]
  );

  const tapInfo = useRef<{ t: number; x: number } | null>(null);

  const onTlPointerDown = (e: React.PointerEvent) => {
    scrubbing.current = true;
    tapInfo.current = { t: performance.now(), x: e.clientX };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromPointer(e.clientX);
  };
  const onTlPointerMove = (e: React.PointerEvent) => {
    if (scrubbing.current) seekFromPointer(e.clientX);
  };
  const onTlPointerUp = (e?: React.PointerEvent) => {
    // simple short tap on empty timeline area = deselect (back to main tools)
    if (e && tapInfo.current) {
      const dt = performance.now() - tapInfo.current.t;
      const dx = Math.abs(e.clientX - tapInfo.current.x);
      if (dt < 350 && dx < 10) setSelection(null);
    }
    tapInfo.current = null;
    scrubbing.current = false;
  };

  // ── ctx for sheets ──
  const toastWrap = useCallback((msg: string, type?: "success" | "error" | "info") => {
    if (type === "success") toast.success(msg);
    else if (type === "error") toast.error(msg);
    else toast.info(msg);
  }, []);

  const ctx: EditorCtx = useMemo(
    () => ({
      project,
      time,
      mutate,
      selection,
      select: setSelection,
      assets: assetsRef.current,
      addAsset,
      importFile,
      seek,
      toast: toastWrap,
      closeSheet: () => setSheet(null),
      setBusy,
      addClipFromAsset,
      addOverlayFromAsset,
      addAudioFromAsset,
      addTextItem,
    }),
    [project, time, mutate, selection, addAsset, importFile, seek, toastWrap, addClipFromAsset, addOverlayFromAsset, addAudioFromAsset, addTextItem]
  );

  const total = totalDur(project);
  const hasContent = project.clips.length > 0 || project.overlays.length > 0 || project.texts.length > 0;
  const [pw, ph] = PREVIEW_RES[project.aspect];

  // ── toolbar config ──
  const isLastClip = !!selectedClip && project.clips[project.clips.length - 1]?.id === selectedClip.id;
  const mainTools = [
    { icon: Plus, label: "رسانه", onClick: () => setSheet("media") },
    ...(clipHasContent ? [{ icon: ClipboardPaste, label: "چسباندن", onClick: () => void pasteFromClipboard() }] : []),
    { icon: Type, label: "متن", onClick: () => { const id = addTextItem(); setSelection({ type: "text", id }); setSheet("text"); } },
    { icon: Smile, label: "استیکر", onClick: () => setSheet("stickers") },
    { icon: Music4, label: "موزیک/TTS", onClick: () => setSheet("audio") },
    { icon: AudioLines, label: "جلوه صوتی", onClick: () => setSheet("sfx") },
    { icon: Captions, label: "زیرنویس AI", onClick: () => setSheet("captions") },
    { icon: AudioWaveform, label: "دوبله/ترجمه", onClick: () => setSheet("dub"), accent: true } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
    { icon: Layers, label: "لایه رویی", onClick: () => setSheet("media"), accent: true } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
    { icon: Wand2, label: "ویدئوساز AI", onClick: () => setSheet("autovid") },
    { icon: Sparkles, label: "دستیار ادیت", onClick: () => setSheet("ai-edit") },
    { icon: Bot, label: "عامل تدوین", onClick: () => setSheet("ai-agent"), accent: true } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
    { icon: WandSparkles, label: "برش AI", onClick: () => setSheet("ai-clipper") },
    { icon: LayoutTemplate, label: "تمپلیت‌ها", onClick: () => setSheet("templates") },
    { icon: MapPin, label: "نشانگر", onClick: addMarker },
  ];

  const clipTools = selectedClip
    ? [
        { icon: Scissors, label: "برش", onClick: splitSelected },
        { icon: Settings2, label: "سرعت/صدا", onClick: () => setSheet("clip-basic") },
        { icon: Crop, label: "تریم", onClick: () => setSheet("clip-basic") },
        { icon: Vibrate, label: selectedClip.stab ? "بی‌لرزش ✓" : "لرزش‌گیر", onClick: stabilizeSelected, accent: !!selectedClip.stab } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
        { icon: Palette, label: "فیلتر", onClick: () => setSheet("clip-look") },
        { icon: TrendingUp, label: selectedClip.enhance ? "کیفیت+ ✓" : "کیفیت+", onClick: toggleEnhance, accent: !!selectedClip.enhance } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
        { icon: Frame, label: selectedClip.mask?.shape && selectedClip.mask.shape !== "none" ? "ماسک ✓" : "ماسک", onClick: () => setSheet("mask"), accent: !!(selectedClip.mask && selectedClip.mask.shape !== "none") } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
        { icon: Diamond, label: selectedClip.kf ? "کی‌فریم ✓" : "کی‌فریم", onClick: () => setSheet("kf"), accent: !!selectedClip.kf } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
        { icon: FlipHorizontal2, label: "چرخش", onClick: () => setSheet("clip-motion") },
        { icon: ArrowLeftRight, label: "ترنزیشن", onClick: () => setSheet("transition") },
        { icon: Layers, label: "کروما", onClick: () => setSheet("chroma") },
        { icon: SkipForward, label: "ادامه", onClick: () => setSheet("extend"), accent: isLastClip } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
        { icon: Snowflake, label: "فریز", onClick: freezeSelected },
        { icon: Repeat, label: "معکوس", onClick: reverseSelected },
        { icon: Unplug, label: "جدا صدا", onClick: () => void detachAudioSelected() },
        { icon: ClipboardCopy, label: "رونوشت", onClick: () => void copySelectedToClipboard() },
        { icon: Copy, label: "تکرار", onClick: duplicateSelected },
        { icon: Trash2, label: "حذف", onClick: deleteSelected, danger: true },
      ]
    : selectedOverlay
      ? [
          { icon: Settings2, label: "زمان", onClick: () => setSheet("clip-basic") },
          { icon: Palette, label: "فیلتر", onClick: () => setSheet("clip-look") },
          { icon: Frame, label: "ماسک", onClick: () => setSheet("mask") },
          { icon: Diamond, label: selectedOverlay?.kf ? "کی‌فریم ✓" : "کی‌فریم", onClick: () => setSheet("kf"), accent: !!selectedOverlay?.kf } as { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean },
          { icon: FlipHorizontal2, label: "چرخش", onClick: () => setSheet("clip-motion") },
          { icon: Layers, label: "کروما", onClick: () => setSheet("chroma") },
          { icon: ClipboardCopy, label: "رونوشت", onClick: () => void copySelectedToClipboard() },
          { icon: Copy, label: "تکرار", onClick: duplicateSelected },
          { icon: Trash2, label: "حذف", onClick: deleteSelected, danger: true },
        ]
      : selectedText
        ? [
            { icon: Type, label: "ویرایش", onClick: () => setSheet("text") },
            { icon: ClipboardCopy, label: "رونوشت", onClick: () => void copySelectedToClipboard() },
            { icon: Copy, label: "تکرار", onClick: duplicateSelected },
            { icon: Trash2, label: "حذف", onClick: deleteSelected, danger: true },
          ]
        : selectedAudio
          ? [
              { icon: Volume2, label: "صدا", onClick: () => setSheet("audio") },
              { icon: Gauge, label: "افکت", onClick: () => setSheet("audio") },
              { icon: ClipboardCopy, label: "رونوشت", onClick: () => void copySelectedToClipboard() },
              { icon: Copy, label: "تکرار", onClick: duplicateSelected },
              { icon: Trash2, label: "حذف", onClick: deleteSelected, danger: true },
            ]
          : mainTools;

  return (
    <div className="flex flex-col h-[calc(100dvh-76px)] max-w-lg mx-auto" dir="ltr">
      {/* top bar */}
      <div dir="rtl" className="flex items-center justify-between gap-2 px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Clapperboard size={20} className="text-primary" />
          <h1 className="font-display text-lg">استودیو ویدئو</h1>
        </div>
        <div className="flex items-center gap-1">
          {projectName && (
            <button
              onClick={() => setSheet("project")}
              className="text-[10px] px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary max-w-[90px] truncate"
              title="ذخیره دوباره پروژه"
            >
              💾 {projectName}
            </button>
          )}
          <button
            onClick={() => setSheet("aspect")}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-secondary border border-border"
          >
            {ASPECTS.find((a) => a.id === project.aspect)?.name}
          </button>
          <button onClick={undo} disabled={pastRef.current.length === 0} aria-label="واگرد" className="p-2 rounded-lg disabled:opacity-30">
            <Undo2 size={18} />
          </button>
          <button onClick={redo} disabled={futureRef.current.length === 0} aria-label="بازانجام" className="p-2 rounded-lg disabled:opacity-30">
            <Redo2 size={18} />
          </button>
          <button
            onClick={() => setSheet("project")}
            aria-label="ذخیره پروژه"
            title="ذخیره پروژه روی دستگاه"
            className="p-2 rounded-lg text-emerald-300 border border-emerald-400/25 bg-emerald-400/10"
          >
            <Save size={16} />
          </button>
          <Button size="sm" className="h-8 rounded-lg text-xs" onClick={() => setSheet("export")} disabled={total <= 0}>
            <Download size={15} className="ml-1" />
            خروجی
          </Button>
        </div>
      </div>
      <span className="hidden">{undoTick}</span>

      {/* preview */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 bg-black/40">
        <canvas
          ref={canvasRef}
          width={pw}
          height={ph}
          onClick={togglePlay}
          className="max-w-full max-h-full rounded-xl shadow-2xl shadow-black/50 ring-1 ring-white/10 cursor-pointer"
        />
      </div>

      {/* transport */}
      <div dir="rtl" className="flex items-center justify-center gap-3 py-2">
        <button
          onClick={togglePlay}
          aria-label={playing ? "توقف" : "پخش"}
          className="w-11 h-11 rounded-full bg-primary/15 border border-primary/40 text-primary flex items-center justify-center"
        >
          {playing ? <Pause size={20} /> : <Play size={20} className="mr-0.5" />}
        </button>
        <div className="text-xs text-muted-foreground font-mono" dir="ltr">
          {fmtTime(time)} / {fmtTime(total)}
        </div>
      </div>

      {/* toolbar — horizontally scrollable when features overflow */}
      <div dir="rtl" className="relative px-2 pb-1">
        <div className="overflow-x-auto scroll-thin pb-1 -mb-1">
          <div className="flex items-center gap-1.5 w-max">
            {clipTools.map((t) => {
              const Icon = t.icon as React.ElementType;
              return (
                <button
                  key={t.label}
                  onClick={t.onClick}
                  className={`flex flex-col items-center gap-1 min-w-[58px] px-2 py-1.5 rounded-xl border text-[10px] transition-colors ${
                    (t as { danger?: boolean }).danger
                      ? "border-red-500/30 text-red-300 bg-red-500/10"
                      : (t as { accent?: boolean }).accent
                        ? "border-accent/40 text-accent bg-accent/10"
                        : "border-border bg-secondary/70"
                  }`}
                >
                  <Icon size={18} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* scroll hint gradients */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-[#0a0a12] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-[#0a0a12] to-transparent" />
      </div>

      {/* timeline */}
      <div
        ref={tlRef}
        dir="ltr"
        className="overflow-x-auto no-scrollbar border-t border-white/[0.06] bg-black/30 px-0"
        onPointerDown={onTlPointerDown}
        onPointerMove={onTlPointerMove}
        onPointerUp={onTlPointerUp}
        onPointerLeave={() => onTlPointerUp()}
      >
        <div className="relative py-2" style={{ width: Math.max(400, total * PX + 80) }}>
          {/* ruler */}
          <div className="relative h-5 border-b border-white/10 mb-1">
            {Array.from({ length: Math.ceil(total) + 1 }).map((_, s) => (
              <div key={s} className="absolute top-0 h-full flex items-end" style={{ left: s * PX }}>
                <div className="w-px h-2 bg-white/25" />
                {s % 5 === 0 && (
                  <span className="absolute left-1 -top-0.5 text-[9px] text-muted-foreground font-mono">{s}s</span>
                )}
              </div>
            ))}
            {project.markers.map((m) => (
              <button
                key={m.id}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  seek(m.t);
                }}
                title="نشانگر — کلیک: پرش / نگه‌داشتن برای حذف"
                className="absolute -top-0.5 w-3 h-3 rotate-45 bg-accent rounded-[2px] border border-black/40 z-10"
                style={{ left: m.t * PX - 6 }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  mutate((p) => (p.markers = p.markers.filter((x) => x.id !== m.id)));
                }}
              />
            ))}
          </div>

          {/* main track */}
          <div className="relative h-12 mb-1">
            {project.clips.map((c) => {
              const st = clipStart(project, c.id);
              const sel = selection?.type === "clip" && selection.id === c.id;
              const thumb = thumbs[c.id];
              const isDragging = drag?.kind === "clip" && drag.id === c.id && drag.moved;
              const tOrig: TrimOrig = {
                in: c.in, out: c.out, start: st, end: st + clipDur(c), dur: clipDur(c),
                srcIn: c.in, speed: c.speed, srcDur: c.srcDur, isVideo: c.kind === "video", isImage: c.kind === "image",
              };
              return (
                <button
                  key={c.id}
                  style={{
                    left: st * PX,
                    width: Math.max(30, clipDur(c) * PX - 2),
                    touchAction: "none",
                    ...(isDragging ? { transform: `translateX(${(drag as { dx: number }).dx}px)`, zIndex: 50, opacity: 0.85 } : null),
                  }}
                  onPointerDown={(e) => onItemPointerDown(e, { kind: "clip", id: c.id })}
                  onPointerMove={onItemPointerMove}
                  onPointerUp={onItemPointerUp}
                  onClick={() => {
                    if (suppressClick.current) return;
                    setSelection({ type: "clip", id: c.id });
                    seek(st + 0.05);
                  }}
                  className={`absolute top-0 h-full rounded-lg overflow-hidden border text-left ${isDragging ? "border-primary shadow-xl shadow-black/50" : ""} ${sel ? "border-primary ring-2 ring-primary/50" : "border-white/15"}`}
                >
                  {thumb ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-80"
                      style={{ backgroundImage: `url(${thumb})` }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-secondary" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1 text-[9px] text-white truncate">{c.name}</div>
                  {sel && !c.reverse && trimHandle("l", "clip", c.id, tOrig)}
                  {sel && !c.reverse && trimHandle("r", "clip", c.id, tOrig)}
                  {c.speed !== 1 && <span className="absolute top-0.5 right-1 text-[9px] bg-black/60 text-accent rounded px-1">{c.speed}x</span>}
                  {c.reverse && <span className="absolute top-0.5 left-1 text-[9px] bg-black/60 text-white rounded px-1">🔁</span>}
                </button>
              );
            })}
            {project.clips.length === 0 && (
              <div className="absolute inset-x-2 top-1 h-10 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-[10px] text-muted-foreground">
                تایم‌لاین اصلی — از «رسانه» ویدئو یا عکس اضافه کن
              </div>
            )}
          </div>

          {/* overlay track */}
          <div className="relative h-9 mb-1">
            {project.overlays.map((o) => {
              const sel = selection?.type === "overlay" && selection.id === o.id;
              const url = assetsRef.current.get(o.assetId)?.url;
              const isDragging = drag?.kind === "overlay" && drag.id === o.id && drag.moved;
              return (
                <button
                  key={o.id}
                  style={{
                    left: o.start * PX,
                    width: Math.max(26, o.dur * PX - 2),
                    touchAction: "none",
                    ...(isDragging ? { transform: `translateX(${(drag as { dx: number }).dx}px)`, zIndex: 50, opacity: 0.85 } : null),
                  }}
                  onPointerDown={(e) => onItemPointerDown(e, { kind: "overlay", id: o.id, origStart: o.start })}
                  onPointerMove={onItemPointerMove}
                  onPointerUp={onItemPointerUp}
                  onClick={() => {
                    if (suppressClick.current) return;
                    setSelection({ type: "overlay", id: o.id });
                    seek(o.start + 0.05);
                  }}
                  className={`absolute top-0 h-full rounded-lg overflow-hidden border ${isDragging ? "border-accent shadow-xl shadow-black/50" : ""} ${sel ? "border-accent ring-2 ring-accent/50" : "border-white/15"}`}
                >
                  {url && o.kind === "image" && (
                    <div className="absolute inset-0 bg-cover bg-center opacity-70" style={{ backgroundImage: `url(${url})` }} />
                  )}
                  <div className="absolute inset-0 bg-[#c16a52]/30 flex items-center px-1.5 text-[9px] text-white truncate">
                    🖼 {o.name}
                  </div>
                  {sel && trimHandle("l", "overlay", o.id, { in: 0, out: 0, start: o.start, end: o.start + o.dur, dur: o.dur, srcIn: o.srcIn, speed: 1, srcDur: o.srcDur, isVideo: o.kind === "video", isImage: o.kind === "image" })}
                  {sel && trimHandle("r", "overlay", o.id, { in: 0, out: 0, start: o.start, end: o.start + o.dur, dur: o.dur, srcIn: o.srcIn, speed: 1, srcDur: o.srcDur, isVideo: o.kind === "video", isImage: o.kind === "image" })}
                </button>
              );
            })}
          </div>

          {/* text track */}
          <div className="relative h-7 mb-1">
            {project.texts.map((t) => {
              const sel = selection?.type === "text" && selection.id === t.id;
              const isDragging = drag?.kind === "text" && drag.id === t.id && drag.moved;
              return (
                <button
                  key={t.id}
                  style={{
                    left: t.start * PX,
                    width: Math.max(24, (t.end - t.start) * PX - 2),
                    background: t.isCaption ? "rgba(139,92,246,0.28)" : "rgba(59,130,246,0.25)",
                    touchAction: "none",
                    ...(isDragging ? { transform: `translateX(${(drag as { dx: number }).dx}px)`, zIndex: 50, opacity: 0.85 } : null),
                  }}
                  onPointerDown={(e) => onItemPointerDown(e, { kind: "text", id: t.id, origStart: t.start })}
                  onPointerMove={onItemPointerMove}
                  onPointerUp={onItemPointerUp}
                  onClick={() => {
                    if (suppressClick.current) return;
                    setSelection({ type: "text", id: t.id });
                    seek(t.start + 0.05);
                  }}
                  className={`absolute top-0 h-full rounded-md border px-1.5 text-[9px] truncate text-left ${isDragging ? "border-primary shadow-lg shadow-black/50" : ""} ${sel ? "border-primary ring-2 ring-primary/50" : "border-white/15"}`}
                >
                  {t.isCaption ? "💬 " : "T "}
                  {t.text}
                  {sel && trimHandle("l", "text", t.id, { in: 0, out: 0, start: t.start, end: t.end, dur: t.end - t.start, srcIn: 0, speed: 1, srcDur: 0, isVideo: false, isImage: false })}
                  {sel && trimHandle("r", "text", t.id, { in: 0, out: 0, start: t.start, end: t.end, dur: t.end - t.start, srcIn: 0, speed: 1, srcDur: 0, isVideo: false, isImage: false })}
                </button>
              );
            })}
          </div>

          {/* audio track */}
          <div className="relative h-9">
            {project.audios.map((a) => {
              const sel = selection?.type === "audio" && selection.id === a.id;
              const isDragging = drag?.kind === "audio" && drag.id === a.id && drag.moved;
              return (
                <button
                  key={a.id}
                  style={{
                    left: a.start * PX,
                    width: Math.max(26, (a.out - a.in) * PX - 2),
                    background: "linear-gradient(90deg, rgba(16,185,129,0.35), rgba(16,185,129,0.15))",
                    touchAction: "none",
                    ...(isDragging ? { transform: `translateX(${(drag as { dx: number }).dx}px)`, zIndex: 50, opacity: 0.85 } : null),
                  }}
                  onPointerDown={(e) => onItemPointerDown(e, { kind: "audio", id: a.id, origStart: a.start })}
                  onPointerMove={onItemPointerMove}
                  onPointerUp={onItemPointerUp}
                  onClick={() => {
                    if (suppressClick.current) return;
                    setSelection({ type: "audio", id: a.id });
                    seek(a.start + 0.05);
                  }}
                  className={`absolute top-0 h-full rounded-lg border overflow-hidden ${isDragging ? "border-emerald-400 shadow-xl shadow-black/50" : ""} ${sel ? "border-emerald-400 ring-2 ring-emerald-400/50" : "border-white/15"}`}
                >
                  <div className="absolute inset-0 flex items-center px-1.5 text-[9px] text-white truncate">
                    🎵 {a.name}
                  </div>
                  {sel && trimHandle("l", "audio", a.id, { in: a.in, out: a.out, start: a.start, end: a.start + (a.out - a.in), dur: a.out - a.in, srcIn: 0, speed: 1, srcDur: a.srcDur, isVideo: false, isImage: false })}
                  {sel && trimHandle("r", "audio", a.id, { in: a.in, out: a.out, start: a.start, end: a.start + (a.out - a.in), dur: a.out - a.in, srcIn: 0, speed: 1, srcDur: a.srcDur, isVideo: false, isImage: false })}
                </button>
              );
            })}
          </div>

          {/* playhead */}
          <div className="absolute top-1 bottom-1 w-0.5 bg-red-400 z-20 pointer-events-none" style={{ left: time * PX }}>
            <div className="w-2.5 h-2.5 -ml-1 rounded-full bg-red-400" />
          </div>
        </div>
      </div>

      {/* empty-state helper */}
      {!hasContent && (
        <div dir="rtl" className="px-4 py-2 text-center text-[11px] text-muted-foreground">
          💡 نکته: اول ویدئو اضافه کن، بعد روی کلیپ بزن تا ابزارهای برش، سرعت، فیلتر و… ظاهر شوند.
        </div>
      )}

      {/* busy overlay */}
      {busy && (
        <div dir="rtl" className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 rounded-full border-3 border-primary/30 border-t-primary animate-spin" />
          <p className="text-sm font-bold">{busy.label}</p>
          {typeof busy.progress === "number" && (
            <div className="w-56 h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-gradient-to-l from-primary to-accent transition-all" style={{ width: `${Math.round(busy.progress * 100)}%` }} />
            </div>
          )}
          {busy.cancel && (
            <Button variant="outline" size="sm" onClick={busy.cancel}>
              لغو
            </Button>
          )}
        </div>
      )}

      {/* sheets */}
      <Sheet open={!!sheet} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[88dvh] overflow-y-auto scroll-thin overscroll-contain bg-[#12101c] border-white/10">
          <SheetHeader dir="rtl" className="pb-1">
            <SheetTitle className="font-display text-base">{SHEET_TITLES[sheet ?? ""]}</SheetTitle>
          </SheetHeader>
          <div dir="rtl" className="px-4 pb-10">
            {sheet === "media" && <MediaSheet ctx={ctx} />}
            {sheet === "aspect" && <AspectSheet ctx={ctx} />}
            {sheet === "clip-basic" && <ClipBasicSheet ctx={ctx} />}
            {sheet === "clip-look" && <ClipLookSheet ctx={ctx} />}
            {sheet === "clip-motion" && <ClipMotionSheet ctx={ctx} />}
            {sheet === "transition" && <TransitionSheet ctx={ctx} />}
            {sheet === "chroma" && <ChromaSheet ctx={ctx} />}
            {sheet === "text" && <TextSheet ctx={ctx} />}
            {sheet === "audio" && <AudioSheet ctx={ctx} />}
            {sheet === "captions" && <CaptionSheet ctx={ctx} />}
            {sheet === "dub" && <DubbingSheet ctx={ctx} />}
            {sheet === "ai-edit" && <AiEditSheet ctx={ctx} />}
            {sheet === "ai-agent" && <AgentSheet ctx={ctx} />}
            {sheet === "templates" && <TemplatesSheet ctx={ctx} />}
            {sheet === "autovid" && <AutoVideoSheet ctx={ctx} />}
            {sheet === "markers" && <MarkersSheet ctx={ctx} />}
            {sheet === "export" && <ExportSheet ctx={ctx} engine={engineRef.current} />}
            {sheet === "stickers" && <StickersSheet ctx={ctx} />}
            {sheet === "sfx" && <SfxSheet ctx={ctx} />}
            {sheet === "mask" && <MaskSheet ctx={ctx} />}
            {sheet === "kf" && <KeyframeSheet ctx={ctx} />}
            {sheet === "ai-clipper" && <AiClipperSheet ctx={ctx} />}
            {sheet === "extend" && <ExtendSheet ctx={ctx} />}
            {sheet === "project" && (
              <ProjectSaveSheet ctx={ctx} projectId={projectId} projectName={projectName} saving={saving} onSave={saveToDb} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

async function probeVideoDuration(url: string): Promise<number> {
  return new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () => {
      if (isFinite(v.duration) && v.duration > 0) return res(v.duration);
      // webm streams often report Infinity — force a seek to reveal duration
      v.currentTime = 1e6;
      v.ontimeupdate = () => {
        v.ontimeupdate = null;
        const d = isFinite(v.duration) ? v.duration : 0;
        res(d);
      };
      setTimeout(() => res(isFinite(v.duration) ? v.duration : 0), 3000);
    };
    v.onerror = () => res(0);
  });
}

async function probeAudioDuration(url: string): Promise<number> {
  return new Promise((res) => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.src = url;
    a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => res(0);
  });
}
