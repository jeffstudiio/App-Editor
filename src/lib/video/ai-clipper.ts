// AI Clipper — audio-energy scene analysis for the editor.
// 1) splitPoints: quiet troughs → good places to cut the clip into scenes
// 2) goldenMoments: highest-energy windows → the most engaging moments
// Works on the clip's own audio track (no external service needed).

export interface SplitSuggestion {
  t: number; // source-time seconds (within the asset)
  kind: "quiet" | "beat";
}

export interface GoldenMoment {
  start: number; // source-time
  end: number;
  score: number; // 0..1
}

export interface ClipAnalysis {
  duration: number;
  splits: SplitSuggestion[];
  golden: GoldenMoment[];
}

export async function analyzeClipScenes(
  blob: Blob,
  range: { in: number; out: number },
  opts?: { maxSplits?: number; topMoments?: number; onProgress?: (p: number) => void }
): Promise<ClipAnalysis> {
  const ab = await blob.arrayBuffer();
  const ac = new AudioContext();
  try {
    const audio = await ac.decodeAudioData(ab);
    const ch = audio.getChannelData(0);
    const sr = audio.sampleRate;
    const hop = Math.floor(sr * 0.05); // 20 fps envelope
    const n = Math.floor(ch.length / hop);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const off = i * hop;
      const end = Math.min(ch.length, off + hop);
      for (let j = off; j < end; j++) s += ch[j] * ch[j];
      env[i] = Math.sqrt(s / Math.max(1, end - off));
    }
    let maxE = 0.000001;
    for (let i = 0; i < n; i++) maxE = Math.max(maxE, env[i]);

    const inF = Math.floor(range.in / (hop / sr));
    const outF = Math.min(n - 1, Math.floor(range.out / (hop / sr)));
    const span = Math.max(1, outF - inF);

    // quiet troughs: local minima under 30% mean with 0.6s gap
    const mean = env.reduce((a, v, i) => (i >= inF && i <= outF ? a + v : a), 0) / span;
    const splits: SplitSuggestion[] = [];
    const minGap = Math.floor(0.6 / (hop / sr));
    let last = -1e9;
    for (let i = inF + Math.floor(minGap / 2); i < outF - Math.floor(minGap / 2); i++) {
      const v = env[i];
      if (v < mean * 0.45 && v <= env[i - 1] && v <= env[i + 1]) {
        if (i - last < minGap) continue;
        last = i;
        splits.push({ t: (i * hop) / sr, kind: "quiet" });
      }
      if (opts?.onProgress && i % 5000 === 0) opts.onProgress((i - inF) / span);
    }
    // keep best maxSplits by weakness
    const maxSplits = opts?.maxSplits ?? 6;
    splits.sort((a, b) => env[Math.floor(a.t / (hop / sr))] - env[Math.floor(b.t / (hop / sr))]);
    const chosen = splits.slice(0, maxSplits).sort((a, b) => a.t - b.t);

    // golden moments: top-energy 2.5s windows
    const topMoments = opts?.topMoments ?? 3;
    const winF = Math.floor(2.5 / (hop / sr));
    const scores: { i: number; s: number }[] = [];
    const step = Math.max(1, Math.floor(winF / 3));
    for (let i = inF; i + winF < outF; i += step) {
      let s = 0;
      for (let j = i; j < i + winF; j += 2) s += env[j];
      scores.push({ i, s });
    }
    scores.sort((a, b) => b.s - a.s);
    const golden: GoldenMoment[] = [];
    for (const c of scores) {
      const start = (c.i * hop) / sr;
      const end = ((c.i + winF) * hop) / sr;
      if (golden.some((g) => Math.abs(g.start - start) < 2)) continue;
      golden.push({ start, end, score: Math.min(1, c.s / (scores[0]?.s || 1)) });
      if (golden.length >= topMoments) break;
    }
    opts?.onProgress?.(1);
    return { duration: audio.duration, splits: chosen, golden };
  } finally {
    void ac.close();
  }
}

export function fmtMoment(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
