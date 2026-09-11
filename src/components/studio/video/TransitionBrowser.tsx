"use client";

// ─────────────────────────────────────────────────────────────
// Transition Browser (P1 §9-§12 مشخصات) — مرورگر بصری ترنزیشن
// چسبیده به یک «نقطهٔ تدوین» مشخص. پیش‌نمایش زنده با موتور واقعی
// روی همان دو کلیپِ کاربر رندر می‌شود (نه تصویر فیک).
// اعمال = ctx.mutate روی همان مرز — نتیجه فوراً در پیش‌نمایش اصلی دیده می‌شود.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Heart, Play, Search, Trash2, X } from "lucide-react";
import {
  TRANSITION_CARDS, TRANSITION_DUR_PRESETS, TRANSITION_EASINGS,
  clipDur, getBoundaryTransition, maxBoundaryDur, uid,
  type Project, type TimelineTransition, type TransitionDirection,
  type TransitionEasing, type TransitionType,
} from "@/lib/video/types";
import { setBoundaryTransition, removeBoundaryTransition } from "@/lib/video/edit-ops";
import { EditorEngine } from "@/lib/video/engine";
import type { EditorCtx } from "./ctx";

const CATS: { id: "basic" | "motion" | "stylish" | "beauty"; label: string }[] = [
  { id: "basic", label: "پایه" },
  { id: "motion", label: "حرکتی" },
  { id: "stylish", label: "استایلیش" },
  { id: "beauty", label: "بیوتی" },
];

const FAV_KEY = "jeff_fav_transitions";
const RECENT_KEY = "jeff_recent_transitions";

function readList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function writeList(key: string, v: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(v.slice(0, 8)));
  } catch {}
}

/** دایرهٔ کوچک: جهت بعدی */
const DIR_ORDER: TransitionDirection[] = ["left", "right", "up", "down"];
const DIR_LABEL: Record<TransitionDirection, string> = { left: "از چپ", right: "از راست", up: "از بالا", down: "از پایین" };

export function TransitionBrowser({
  ctx,
  boundary,
  onBoundaryClear,
}: {
  ctx: EditorCtx;
  boundary: { leftId: string; rightId: string } | null;
  onBoundaryClear?: () => void;
}) {
  const p = ctx.project;
  const existing = boundary ? getBoundaryTransition(p, boundary.leftId, boundary.rightId) : undefined;

  const [draft, setDraft] = useState<{
    type: TransitionType;
    dur: number;
    direction?: TransitionDirection;
    easing: TransitionEasing;
    intensity?: number;
    tint?: "warm" | "gold" | "cool";
    preset?: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setFavs(readList(FAV_KEY));
    setRecent(readList(RECENT_KEY));
  }, []);

  // وقتی مرز عوض می‌شود، درفت از وضعیت فعلی مرز ساخته می‌شود
  useEffect(() => {
    if (!boundary) return setDraft(null);
    const ex = getBoundaryTransition(ctx.project, boundary.leftId, boundary.rightId);
    setDraft(
      ex
        ? { type: ex.type, dur: ex.dur, direction: ex.direction, easing: ex.easing ?? "smooth", intensity: ex.intensity, tint: ex.tint, preset: ex.preset }
        : { type: "fade", dur: 0.5, direction: "left", easing: "smooth" }
    );
    setPlaying(false);
  }, [boundary?.leftId, boundary?.rightId]);

  const leftClip = boundary ? p.clips.find((c) => c.id === boundary.leftId) : undefined;
  const rightClip = boundary ? p.clips.find((c) => c.id === boundary.rightId) : undefined;
  const maxDur = leftClip && rightClip ? maxBoundaryDur(clipDur(leftClip), clipDur(rightClip)) : 1.5;

  // ── اعمال روی مرز واقعی (منبع حقیقت = تایم‌لاین) ──
  const applySpec = (spec: NonNullable<typeof draft>) => {
    if (!boundary) return;
    ctx.mutate((proj) => {
      setBoundaryTransition(proj, boundary.leftId, boundary.rightId, spec, () => uid("tr"));
    });
    // بلافاصله وسطِ ترنزیشن دیده شود (§9 گام ۹)
    const li = ctx.project.clips.findIndex((c) => c.id === boundary.leftId);
    let st = 0;
    for (let k = 0; k < li; k++) st += clipDur(ctx.project.clips[k]);
    ctx.seek(st + Math.max(0.02, spec.dur * 0.5));
    if (spec.preset) {
      const next = [spec.preset, ...readList(RECENT_KEY).filter((x) => x !== spec.preset)];
      writeList(RECENT_KEY, next);
      setRecent(next);
    }
  };

  const remove = () => {
    if (!boundary) return;
    ctx.mutate((proj) => {
      removeBoundaryTransition(proj, boundary.leftId, boundary.rightId);
    });
    ctx.toast("ترنزیشن این مرز حذف شد — بقیهٔ مرزها دست‌نخورده", "success");
  };

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {}
    setFavs(next);
  };

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return TRANSITION_CARDS;
    return TRANSITION_CARDS.filter((c) => c.name.includes(q) || c.desc.includes(q) || c.type.includes(q.toLowerCase()));
  }, [query]);

  if (!boundary || !draft) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        یک نقطهٔ تدوین (مرز بین دو کلیپ) را از تایم‌لاین انتخاب کن.
      </p>
    );
  }

  const card = TRANSITION_CARDS.find((c) => (draft.preset ?? draft.type) === c.id);
  const dirSupported = !!card?.dir;
  const recentCards = recent.map((id) => TRANSITION_CARDS.find((c) => c.id === id)).filter(Boolean) as typeof TRANSITION_CARDS;

  return (
    <div className="space-y-3">
      {/* پیش‌نمایش زندهٔ واقعی — موتور همان دو کلیپ را می‌چرخاند */}
      <TransitionLoopPreview
        ctx={ctx}
        boundary={boundary}
        draft={draft}
        playing={playing}
        onTogglePlay={() => {
          setPlaying((v) => !v);
          if (!playing) {
            const li = ctx.project.clips.findIndex((c) => c.id === boundary.leftId);
            let st = 0;
            for (let k = 0; k < li; k++) st += clipDur(ctx.project.clips[k]);
            ctx.seek(st);
          }
        }}
      />

      {/* جست‌وجو */}
      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی ترنزیشن…"
          className="w-full h-9 rounded-xl bg-secondary/70 border border-border text-xs px-9 outline-none focus:border-primary/60"
        />
      </div>

      {/* اخیراً استفاده‌شده */}
      {recentCards.length > 0 && !query && (
        <section className="space-y-1.5">
          <SectionHead>اخیراً استفاده‌شده</SectionHead>
          <div className="flex gap-2 overflow-x-auto scroll-thin pb-1">
            {recentCards.map((c) => (
              <MiniCard key={`r-${c.id}`} card={c} active={(draft.preset ?? draft.type) === c.id} onTap={() => tap(c)} />
            ))}
          </div>
        </section>
      )}

      {/* دسته‌ها */}
      {CATS.map((cat) => {
        const cards = filtered.filter((c) => c.cat === cat.id);
        if (!cards.length) return null;
        return (
          <section key={cat.id} className="space-y-1.5">
            <SectionHead>{cat.label}</SectionHead>
            <div className="grid grid-cols-4 gap-2">
              {cards.map((c) => (
                <Card
                  key={c.id}
                  card={c}
                  active={(draft.preset ?? draft.type) === c.id}
                  fav={favs.includes(c.id)}
                  onFav={() => toggleFav(c.id)}
                  onTap={() => tap(c)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* مدت (§12) — محدود به طول کلیپ‌های همسایه */}
      <section className="space-y-2">
        <SectionHead>مدت — سقف مجاز {maxDur.toFixed(2)}s</SectionHead>
        <div className="flex flex-wrap gap-1.5">
          {TRANSITION_DUR_PRESETS.map((d) => (
            <button
              key={d}
              disabled={d > maxDur}
              onClick={() => setDraftWith({ dur: d })}
              className={`text-xs px-3 py-1.5 rounded-lg border ${Math.abs(draft.dur - d) < 0.026 ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"} disabled:opacity-30`}
            >
              {d}s
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0.1}
          max={maxDur}
          step={0.05}
          value={Math.min(draft.dur, maxDur)}
          onChange={(e) => setDraftWith({ dur: Number(e.target.value) })}
          onMouseUp={() => applySpec({ ...draft, dur: Math.min(draft.dur, maxDur) })}
          onTouchEnd={() => applySpec({ ...draft, dur: Math.min(draft.dur, maxDur) })}
          className="w-full accent-violet-500"
          dir="ltr"
        />
      </section>

      {/* جهت */}
      {dirSupported && (
        <section className="space-y-2">
          <SectionHead>جهت</SectionHead>
          <div className="grid grid-cols-4 gap-1.5">
            {DIR_ORDER.map((d) => (
              <button
                key={d}
                onClick={() => setDraftWith({ direction: d })}
                className={`text-xs py-1.5 rounded-lg border ${draft.direction === d ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}
              >
                {DIR_LABEL[d]}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* منحنی سرعت */}
      <section className="space-y-2">
        <SectionHead>نرمی حرکت</SectionHead>
        <div className="grid grid-cols-3 gap-1.5">
          {TRANSITION_EASINGS.map((e) => (
            <button
              key={e.id}
              onClick={() => setDraftWith({ easing: e.id })}
              className={`text-xs py-1.5 rounded-lg border ${draft.easing === e.id ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/60"}`}
            >
              {e.name}
            </button>
          ))}
        </div>
      </section>

      {/* حذف */}
      {existing && (
        <button
          onClick={remove}
          className="w-full flex items-center justify-center gap-2 text-sm py-2.5 rounded-xl border border-red-500/30 text-red-300 bg-red-500/10"
        >
          <Trash2 size={15} /> حذف ترنزیشن این مرز
        </button>
      )}
      {onBoundaryClear && (
        <button onClick={onBoundaryClear} className="w-full text-xs text-muted-foreground py-1">
          بستن و بازگشت به ابزارهای کلیپ
        </button>
      )}
    </div>
  );

  function tap(c: (typeof TRANSITION_CARDS)[number]) {
    if (!draft) return;
    const spec = {
      type: c.type as TransitionType,
      dur: Math.min(c.dur, maxDur),
      direction: (c.dir ? (draft.direction ?? "left") : undefined) as TransitionDirection | undefined,
      easing: (c.patch?.easing ?? "smooth") as TransitionEasing,
      intensity: c.patch?.intensity,
      tint: c.patch?.tint,
      preset: c.id,
    };
    setDraft(spec);
    applySpec(spec);
  }

  function setDraftWith(patch: Partial<NonNullable<typeof draft>>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    applySpec(next);
  }
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-bold text-accent">{children}</h4>;
}

function Card({
  card, active, fav, onFav, onTap,
}: {
  card: (typeof TRANSITION_CARDS)[number];
  active: boolean;
  fav: boolean;
  onFav: () => void;
  onTap: () => void;
}) {
  return (
    <div className={`relative rounded-xl border p-1.5 text-center space-y-1 ${active ? "border-primary bg-primary/10" : "border-border bg-secondary/50"}`}>
      <button onClick={onTap} className="w-full space-y-1">
        <Thumb card={card} />
        <div className="text-[10px] leading-3 text-white/90">{card.name}</div>
      </button>
      <button
        onClick={onFav}
        aria-label="علاقه‌مندی"
        className={`absolute top-0.5 left-0.5 p-0.5 ${fav ? "text-rose-400" : "text-white/25"}`}
      >
        <Heart size={10} fill={fav ? "currentColor" : "none"} />
      </button>
      {active && <Check size={11} className="absolute top-0.5 right-0.5 text-primary" />}
    </div>
  );
}

function MiniCard({ card, active, onTap }: { card: (typeof TRANSITION_CARDS)[number]; active: boolean; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className={`shrink-0 w-[74px] rounded-xl border p-1.5 text-center space-y-1 ${active ? "border-primary bg-primary/10" : "border-border bg-secondary/50"}`}
    >
      <Thumb card={card} />
      <div className="text-[10px] text-white/90">{card.name}</div>
    </button>
  );
}

/** بندانگشتی استایلیزهٔ هر خانواده — نمایشِ ایدهٔ بصری؛ نتیجهٔ واقعی در پیش‌نمایش زنده بالا دیده می‌شود */
function Thumb({ card }: { card: (typeof TRANSITION_CARDS)[number] }) {
  const base = "h-10 rounded-lg overflow-hidden relative bg-gradient-to-br from-[#2a2440] to-[#191527]";
  const half = <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-br from-orange-400/80 to-rose-500/80" />;
  switch (card.type) {
    case "fade":
      return <div className={base}><div className="absolute inset-0 bg-gradient-to-br from-orange-400/70 to-rose-500/70 opacity-50" style={{ clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)" }} /></div>;
    case "dipBlack":
      return <div className={base}><div className="absolute inset-0 bg-black/80" style={{ clipPath: "circle(38% at 50% 50%)" }} /></div>;
    case "dipWhite":
      return <div className={base}><div className="absolute inset-0 bg-white/85" style={{ clipPath: "circle(38% at 50% 50%)" }} /></div>;
    case "slide":
      return <div className={base}>{half}<div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-br from-sky-400/80 to-violet-500/80" style={{ transform: "translateX(-55%)" }} /></div>;
    case "push":
      return <div className={base}>{half}<div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-br from-sky-400/80 to-violet-500/80" style={{ transform: "translateX(-18%)", opacity: 0.9 }} /></div>;
    case "zoom":
      return <div className={base}><div className="absolute inset-2 rounded bg-gradient-to-br from-orange-400/80 to-rose-500/80" style={{ transform: "scale(.72)" }} /></div>;
    case "blur":
      return <div className={base}><div className="absolute inset-0 bg-gradient-to-br from-orange-400/70 to-rose-500/70 blur-[6px] scale-110" /></div>;
    case "wipe":
      return <div className={base}>{half}<div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent to-white/30" /></div>;
    case "flash":
      return <div className={base}><div className="absolute inset-0 bg-white/90" style={{ clipPath: "circle(30% at 50% 50%)" }} /></div>;
    case "spin":
      return <div className={base}><div className="absolute inset-2 rounded bg-gradient-to-br from-orange-400/80 to-violet-500/80" style={{ transform: "rotate(28deg) scale(.7)" }} /></div>;
    case "glitch":
      return (
        <div className={base}>
          <div className="absolute inset-x-0 top-1 h-2 bg-rose-500/80 -translate-x-2" />
          <div className="absolute inset-x-0 top-5 h-2 bg-sky-400/80 translate-x-2" />
          <div className="absolute inset-x-0 top-8 h-2 bg-white/60 -translate-x-1" />
        </div>
      );
    case "lightLeak":
      return <div className={base}><div className="absolute inset-0" style={{ background: "linear-gradient(100deg, transparent 25%, rgba(255,214,150,.95) 50%, transparent 75%)" }} /></div>;
    default:
      return <div className={base} />;
  }
}

/**
 * پیش‌نمایش زندهٔ واقعی: یک موتور کوچک روی همان پروژه/رسانه‌ها،
 * پیرامون مرز به‌صورت حلقه‌ای رندر می‌کند — با درفت فعلی (قبل از اعمال نهایی هم واقعی).
 */
function TransitionLoopPreview({
  ctx, boundary, draft, playing, onTogglePlay,
}: {
  ctx: EditorCtx;
  boundary: { leftId: string; rightId: string };
  draft: { type: TransitionType; dur: number; direction?: TransitionDirection; easing?: TransitionEasing; intensity?: number; tint?: "warm" | "gold" | "cool"; preset?: string };
  playing: boolean;
  onTogglePlay: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EditorEngine | null>(null);
  const rafRef = useRef<number>(0);

  // پروژهٔ پیش‌نمایش: همان پروژه + ترنزیشنِ درفت روی همین مرز
  const previewProject = useMemo<Project>(() => {
    const clone = JSON.parse(JSON.stringify(ctx.project)) as Project;
    const li = clone.clips.findIndex((c) => c.id === boundary.leftId);
    if (li < 0 || li + 1 >= clone.clips.length) return clone;
    const spec: TimelineTransition = {
      id: "preview",
      leftClipId: boundary.leftId,
      rightClipId: boundary.rightId,
      type: draft.type,
      dur: draft.dur,
      direction: draft.direction,
      easing: draft.easing,
      intensity: draft.intensity,
      tint: draft.tint,
      preset: draft.preset,
    };
    clone.transitions = clone.transitions.filter((t) => !(t.leftClipId === boundary.leftId && t.rightClipId === boundary.rightId));
    clone.transitions.push(spec);
    return clone;
  }, [ctx.project, boundary, draft]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new EditorEngine(previewProject);
    engine.attach(canvas);
    engine.setProject(previewProject, ctx.assets);
    engineRef.current = engine;

    // موقعیت مرز در پروژهٔ پیش‌نمایش
    const li = previewProject.clips.findIndex((c) => c.id === boundary.leftId);
    let bStart = 0;
    for (let k = 0; k < li; k++) bStart += clipDur(previewProject.clips[k]);
    const bEnd = bStart + clipDur(previewProject.clips[li]);
    const d = Math.max(0.1, draft.dur);
    const from = Math.max(0, bStart - d * 0.4);
    const to = Math.min(bEnd + d * 0.1, bStart + d * 1.15 + 0.2);
    const span = Math.max(0.4, to - from);

    let start = performance.now();
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const t = from + ((ts - start) / 1000) % span;
      engine.seek(t);
    };
    if (playing) {
      start = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    } else {
      // فریمِ میانیِ ترنزیشن
      engine.seek(bStart + d * 0.5);
    }
    return () => {
      cancelAnimationFrame(rafRef.current);
      engine.detach();
      engineRef.current = null;
    };
  }, [previewProject, playing, boundary, draft.dur]);

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black/40 p-2">
      <div className="relative w-[84px] shrink-0">
        <canvas ref={canvasRef} width={180} height={320} className="w-[84px] rounded-lg ring-1 ring-white/15" />
        <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-black/20 pointer-events-none" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs font-bold">
          پیش‌نمایش واقعی مرز انتخاب‌شده
        </p>
        <p className="text-[10px] text-muted-foreground leading-4">
          همین دو کلیپ خودت با تنظیم فعلی — قبل از اعمال نهایی هم دقیق است.
        </p>
        <button
          onClick={onTogglePlay}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-primary/40 text-primary bg-primary/10"
        >
          {playing ? <><X size={11} /> توقف حلقه</> : <><Play size={11} /> پخش حلقه</>}
        </button>
      </div>
    </div>
  );
}
