"use client";

// ─────────────────────────────────────────────────────────────
// پخش‌کنندهٔ تمپلیت — تایم‌لاین DOM-based با جای‌گذاری رسانهٔ کاربر
// رسانه‌های اسلات‌شده (تصویر/ویدئو) جای گرادیان نشسته و موشن‌ها
// از بانک موشن اجرا می‌شوند. موزیک اسلات‌شده هم‌گام پخش می‌شود.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { BankTemplate, Scene } from "@/lib/template-bank/schema";
import { getMediaMotion, getTextMotion, getTransMotion } from "@/lib/template-bank/motions";

export interface SlotMedia {
  url: string;
  name: string;
}

const SIZE_CQW: Record<string, number> = { sm: 4.2, md: 6.6, lg: 9.6, xl: 13 };
const TEXT_COLOR = "#f1e9e4";

interface SceneBound {
  scene: Scene;
  start: number;
  end: number;
}

export function TemplatePlayer({
  template,
  media,
  texts,
  className,
}: {
  template: BankTemplate;
  media: Record<string, SlotMedia | undefined>;
  texts: Record<string, string>;
  className?: string;
}) {
  const bounds = useMemo<SceneBound[]>(
    () =>
      template.scenes.map((scene, i) => {
        const start = template.scenes.slice(0, i).reduce((a, s) => a + s.d, 0);
        return { scene, start, end: start + scene.d };
      }),
    [template],
  );
  const total = bounds.length ? bounds[bounds.length - 1].end : 0;

  const [playing, setPlaying] = useState(true);
  const [mutedFx, setMutedFx] = useState(false); // موزیک اسلات‌شده
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());

  const audioSlot = useMemo(
    () => template.slots.find((s) => s.kind === "audio"),
    [template],
  );
  const audioUrl = audioSlot ? (media[audioSlot.id]?.url ?? audioSlot.url) : undefined;

  // clock loop
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastRef.current) / 1000);
      lastRef.current = now;
      let nt = tRef.current + dt;
      if (nt >= total) {
        nt = 0;
        videoRefs.current.forEach((v) => {
          try {
            v.currentTime = 0;
            v.play().catch(() => {});
          } catch {}
        });
        if (audioRef.current) audioRef.current.currentTime = 0;
      }
      tRef.current = nt;
      setT(nt);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, total]);

  // audio sync
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing && !mutedFx) {
      if (Math.abs(a.currentTime - tRef.current) > 0.4) a.currentTime = tRef.current;
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [playing, mutedFx, audioUrl, Math.floor(t) === 0]);

  // pause videos when player paused
  useEffect(() => {
    videoRefs.current.forEach((v) => {
      if (playing) v.play().catch(() => {});
      else v.pause();
    });
  }, [playing, t]);

  const activeIdx = useMemo(() => {
    for (let i = 0; i < bounds.length; i++) {
      if (t >= bounds[i].start && t < bounds[i].end) return i;
    }
    return 0;
  }, [bounds, t]);

  const seek = useCallback(
    (nt: number) => {
      const clamped = Math.min(total - 0.01, Math.max(0, nt));
      tRef.current = clamped;
      setT(clamped);
      videoRefs.current.forEach((v) => {
        try {
          v.currentTime = 0;
        } catch {}
      });
    },
    [total],
  );

  const restart = () => {
    seek(0);
    setPlaying(true);
  };

  // active scene transition state
  const cur = bounds[activeIdx];
  const next = bounds[activeIdx + 1];
  const trans = getTransMotion(cur?.scene.out ?? "cut");
  const trDur = trans.dur;
  const localT = cur ? t - cur.start : 0;
  const sceneP = cur ? localT / cur.scene.d : 0;
  const inOutWindow = cur ? cur.scene.d - localT < trDur : false;
  const trP = inOutWindow && trDur > 0 ? (localT - (cur.scene.d - trDur)) / trDur : 0;
  const nextInWindow =
    next && trans.inCss && !inOutWindow && localT < trDur; // حالت ورود در ابتدای صحنهٔ فعال
  const nextOnTop = Boolean(trans.nextOnTop && inOutWindow);

  const slotFor = (s: Scene | undefined) => {
    if (!s?.slot) return undefined;
    const slot = template.slots.find((x) => x.id === s.slot);
    // اول رسانهٔ انتخابی کاربر، بعد رسانهٔ پیش‌فرض اسلات (بستهٔ ابری/پیش‌فرض بانک)
    const url = media[s.slot]?.url ?? slot?.url;
    return { slot, url };
  };

  const isVideoUrl = (url?: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url ?? "");

  const registerVideo = (key: string) => (el: HTMLVideoElement | null) => {
    if (el) {
      videoRefs.current.set(key, el);
      el.play().catch(() => {});
    } else videoRefs.current.delete(key);
  };

  const renderScene = (b: SceneBound, isNext: boolean) => {
    const { scene } = b;
    const info = slotFor(scene);
    const art = scene.art ?? [template.art.from, template.art.to];
    const emoji = scene.emoji ?? template.art.emoji;

    // موشن رسانه
    const mediaMotion = getMediaMotion(scene.motion);
    const p = b === cur ? sceneP : nextInWindow ? (t - b.start) / scene.d : (t - b.start) / scene.d;
    const mStyle = mediaMotion.css(p);

    // ورود صحنهٔ بعد در پنجرهٔ ترنزیشن
    let wrapStyle: React.CSSProperties = {};
    if (b === cur && inOutWindow) wrapStyle = trans.outCss(trP) as React.CSSProperties;
    if (isNext && nextInWindow) wrapStyle = trans.inCss!((t - b.start) / trDur) as React.CSSProperties;
    if (isNext && inOutWindow) wrapStyle = trans.inCss ? (trans.inCss(0) as React.CSSProperties) : {};

    return (
      <div
        key={`${b.start}-${isNext ? "n" : "c"}`}
        className="absolute inset-0 overflow-hidden"
        style={{ zIndex: isNext ? (nextOnTop ? 30 : 10) : 20, ...wrapStyle }}
      >
        {/* رسانه یا جایگرین — تشخیص ویدئو با نوع اسلات یا پسوند url (پیش‌فرض بانک mp4 است) */}
        {info?.url && (info.slot?.kind === "video" || isVideoUrl(info.url)) ? (
          <video
            ref={registerVideo(`v-${b.start}`)}
            src={info.url}
            muted
            loop
            playsInline
            autoPlay
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            style={mStyle}
          />
        ) : info?.url ? (
          <img
            src={info.url}
            alt={info.slot?.label ?? ""}
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            style={mStyle}
            draggable={false}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center will-change-transform"
            style={{ background: `linear-gradient(150deg, ${art[0]}, ${art[1]})`, ...mStyle }}
          >
            <div className="flex flex-col items-center gap-1 select-none">
              <span className="text-[18cqw] opacity-80 leading-none">{emoji}</span>
              {info?.slot && (
                <span className="text-[3.4cqw] font-medium opacity-70">{info.slot.label}</span>
              )}
            </div>
          </div>
        )}

        {/* FX overlays */}
        {scene.fx?.includes("grain") && (
          <div
            className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-[0.16]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.9'/%3E%3C/svg%3E\")",
            }}
          />
        )}
        {scene.fx?.includes("vignette") && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(75% 75% at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%)" }}
          />
        )}
        {scene.fx?.includes("leak") && (
          <div
            className="pointer-events-none absolute inset-0 mix-blend-screen opacity-60"
            style={{
              background:
                "linear-gradient(115deg, transparent 45%, rgba(224,167,143,.5) 78%, rgba(193,106,82,.55) 100%)",
            }}
          />
        )}
        {scene.fx?.includes("scan") && (
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{ background: "repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, transparent 1px 4px)" }}
          />
        )}
        {scene.fx?.includes("letterbox") && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[7%] bg-black" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[7%] bg-black" />
          </>
        )}

        {/* متن‌ها */}
        {scene.texts?.map((st) => {
          const slot = template.texts.find((x) => x.id === st.ref);
          if (!slot) return null;
          const value = (texts[slot.id] ?? slot.sample) || "";
          if (!value) return null;
          const anim = getTextMotion(st.anim);
          const at = st.at ?? 0.2;
          const dur = st.dur ?? anim.defDur;
          const tp = (t - b.start - at) / dur;
          const aStyle = tp <= 0 ? (anim.id === "fadeIn" ? { opacity: 0 } : { opacity: 0 }) : anim.css(Math.min(1, tp));
          const y = st.y ?? slot.y ?? 0.5;
          return (
            <div
              key={st.ref + String(b.start)}
              className="absolute inset-x-[6%] text-center font-extrabold leading-[1.5]"
              style={{
                top: `${y * 100}%`,
                transform: `translateY(-50%)`,
                fontSize: `${SIZE_CQW[slot.size] ?? 6.6}cqw`,
                color: slot.accent ?? TEXT_COLOR,
                textShadow: "0 2px 14px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.4)",
                ...(aStyle as React.CSSProperties),
              }}
            >
              {value}
            </div>
          );
        })}
      </div>
    );
  };

  // overlay ترنزیشن‌های سیاه/سفید/فلش
  let overlay: React.CSSProperties | null = null;
  if (inOutWindow && ["dipBlack", "dropBlack"].includes(trans.id)) {
    overlay = { background: "#000", opacity: Math.min(1, Math.sin(Math.min(1, trP) * Math.PI) * 1.4) };
  } else if (inOutWindow && trans.id === "dipWhite") {
    overlay = { background: "#faf7f5", opacity: Math.min(1, Math.sin(Math.min(1, trP) * Math.PI) * 1.4) };
  } else if (inOutWindow && trans.id === "flashTr") {
    overlay = { background: "#fff", opacity: Math.sin(Math.min(1, trP) * Math.PI) };
  } else if (inOutWindow && trans.id === "filmBurnTr") {
    overlay = {
      background: "radial-gradient(60% 60% at 50% 50%, rgba(255,220,160,.9), rgba(224,120,60,.75) 60%, transparent 90%)",
      opacity: Math.sin(Math.min(1, trP) * Math.PI),
      mixBlendMode: "screen",
    };
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className={className}>
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black select-none"
        style={{ aspectRatio: template.aspect.replace(":", "/"), containerType: "size" }}
      >
        {/* صحنهٔ بعدی (زیر/روی فعال) */}
        {next && renderScene(next, true)}
        {/* صحنهٔ فعال */}
        {cur && renderScene(cur, false)}
        {/* overlay ترنزیشن */}
        {overlay && <div className="pointer-events-none absolute inset-0 z-40" style={overlay} />}

        {/* دکمه‌های شیشه‌ای */}
        <div className="absolute bottom-2 inset-x-2 z-50 flex items-center gap-2 rounded-xl bg-black/45 px-2 py-1.5 backdrop-blur-sm">
          <button
            aria-label={playing ? "توقف" : "پخش"}
            onClick={() => setPlaying((v) => !v)}
            className="rounded-lg p-1.5 text-white hover:bg-white/15"
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button aria-label="از اول" onClick={restart} className="rounded-lg p-1.5 text-white hover:bg-white/15">
            <RotateCcw size={15} />
          </button>
          {audioUrl && (
            <button
              aria-label={mutedFx ? "پخش موزیک" : "بی‌صدا"}
              onClick={() => setMutedFx((v) => !v)}
              className="rounded-lg p-1.5 text-white hover:bg-white/15"
            >
              {mutedFx ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}
          <input
            type="range"
            min={0}
            max={Math.max(0.1, total - 0.05)}
            step={0.05}
            value={t}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="زمان"
            className="h-1 flex-1 accent-[#c16a52]"
          />
          <span className="text-[10px] text-white/80 tabular-nums" dir="ltr">
            {fmt(t)} / {fmt(total)}
          </span>
        </div>
      </div>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />}
    </div>
  );
}
