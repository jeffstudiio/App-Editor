import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EXPLORE_CATEGORIES, type ExploreImage } from "@/lib/studio-data";

const execFileAsync = promisify(execFile);

export const maxDuration = 120;

const TTL_MS = 1000 * 60 * 30; // 30 minutes
const cache = new Map<string, { ts: number; data: ExploreImage[] }>();

// The sandbox may not allow writing to /tmp — use a project-local temp dir instead.
const TMP_DIR = path.join(process.cwd(), ".zscripts", "explore-tmp");

async function ensureTmpDir(): Promise<string> {
  await fs.mkdir(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

interface RawResult {
  original_url?: string;
  source?: string;
  original_width?: string;
  original_height?: string;
}

interface SearchResponse {
  success?: boolean;
  results?: RawResult[];
  error?: string;
}

async function resolveZaiBin(): Promise<string | null> {
  const candidates = [
    "/usr/local/bin/z-ai",
    "/usr/bin/z-ai",
    path.join(os.homedir(), ".bun", "bin", "z-ai"),
    path.join(os.homedir(), ".local", "bin", "z-ai"),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c, fs.constants.F_OK);
      return c;
    } catch {
      // keep looking
    }
  }
  try {
    const { stdout } = await execFileAsync("which", ["z-ai"], { timeout: 5000 });
    const p = stdout.trim().split("\n")[0];
    return p || null;
  } catch {
    return null;
  }
}

async function runSearch(query: string, count: number): Promise<ExploreImage[]> {
  const bin = await resolveZaiBin();
  if (!bin) throw new Error("z-ai CLI not found");

  const tmpDir = await ensureTmpDir();
  const tmpFile = path.join(tmpDir, `explore-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  try {
    const { stdout } = await execFileAsync(
      bin,
      ["image-search", "-q", query, "--count", String(count), "--gl", "us", "--no-rank", "-o", tmpFile],
      { timeout: 110_000, maxBuffer: 10 * 1024 * 1024 }
    );

    // Prefer the output file; fall back to parsing stdout (CLI logs emoji lines before JSON).
    let raw: string | null = null;
    try {
      raw = await fs.readFile(tmpFile, "utf-8");
    } catch {
      const brace = stdout.indexOf("{");
      if (brace >= 0) raw = stdout.slice(brace);
    }
    if (!raw) throw new Error("empty search output");

    const parsed = JSON.parse(raw) as SearchResponse;

    if (!parsed.success || !Array.isArray(parsed.results)) {
      throw new Error(parsed.error || "search failed");
    }

    return parsed.results
      .filter((r) => !!r.original_url)
      .map((r) => ({
        url: r.original_url as string,
        w: parseInt(r.original_width ?? "0", 10) || 800,
        h: parseInt(r.original_height ?? "0", 10) || 800,
        source: r.source || "وب",
      }));
  } finally {
    fs.unlink(tmpFile).catch(() => {});
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("category") ?? "typography";
  const q = searchParams.get("q")?.trim() ?? "";
  const offset = Math.max(0, Math.min(3, parseInt(searchParams.get("offset") ?? "0", 10) || 0));

  const category = EXPLORE_CATEGORIES.find((c) => c.id === categoryId);

  // Build the cache key and the actual query
  let key: string;
  let query: string;

  if (q) {
    key = `q:${q.toLowerCase()}`;
    query = q;
  } else if (category) {
    const queries = [category.query, ...category.moreQueries];
    query = queries[Math.min(offset, queries.length - 1)];
    key = `c:${category.id}:${offset}`;
  } else {
    return NextResponse.json({ error: "دسته نامعتبر است." }, { status: 400 });
  }

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS && hit.data.length > 0) {
    return NextResponse.json({ results: hit.data, cached: true });
  }

  try {
    const data = await runSearch(query, 18);
    if (data.length === 0) {
      return NextResponse.json(
        { results: [], error: "نتیجه‌ای پیدا نشد؛ عبارت دیگری را امتحان کن." }
      );
    }
    cache.set(key, { ts: Date.now(), data });
    return NextResponse.json({ results: data, cached: false });
  } catch (err) {
    console.error("[explore] search failed:", err);
    // Serve stale cache if available
    if (hit && hit.data.length > 0) {
      return NextResponse.json({ results: hit.data, cached: true, stale: true });
    }
    return NextResponse.json(
      { results: [], error: "جست‌وجوی تصویر در دسترس نیست. کمی بعد دوباره تلاش کن." },
      { status: 502 }
    );
  }
}
