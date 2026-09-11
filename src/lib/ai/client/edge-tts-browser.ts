// ─────────────────────────────────────────────────────────────
// Edge TTS در مرورگر — پیاده‌سازی واقعی پروتکل WebSocket مایکروسافت
// (همان موتور msedge-tts سمت سرور، این‌بار مستقیم در مرورگر)
// بدون کلید، بدون سرور — روی میزبانی استاتیک هم کار می‌کند.
//Sec-MS-GEC از crypto.subtle (SHA-256) ساخته می‌شود؛ WebGL/Node لازم نیست.
// ─────────────────────────────────────────────────────────────

import { AIError, isAbortError } from "../core/ai-errors";
import { EDGE_VOICE_IDS as EDGE_VOICES_SET } from "../shared/edge-voices";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_HOST =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const GEC_VERSION = "1-130.0.2849.68";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/** توکن Sec-MS-GEC — SHA-256(ticks ثبت‌شده در سبد ۵ دقیقه‌ای + توکن) */
export async function secMsGec(nowMs: number = Date.now()): Promise<string> {
  const WIN_EPOCH_OFFSET = 11_644_473_600; // ثانیه بین 1601-01-01 و 1970-01-01
  const sec = Math.floor(nowMs / 1000) + WIN_EPOCH_OFFSET;
  const bucket = Math.floor(sec / 300) * 300; // سبد ۵ دقیقه‌ای
  const ticks = BigInt(bucket) * BigInt(10000000); // بازهٔ ۱۰۰ نانوثانیه‌ای ویندوز
  const data = new TextEncoder().encode(`${ticks}${TRUSTED_CLIENT_TOKEN}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** پیام SSML — خروجی برای تست ذخیره‌شده جدا شده است */
export function buildSsmlMessage(text: string, voice: string, ratePct: string, requestId: string, timestamp: string): string {
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'><prosody pitch='+0Hz' rate='${ratePct}' volume='+0%'>${safe}</prosody></voice></speak>`;
  return (
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${timestamp}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml
  );
}

export function rateToPct(speed: number): string {
  const rateNum = Math.max(0.5, Math.min(2, speed || 1));
  const abs = Math.abs(Math.round((rateNum - 1) * 100));
  return `${rateNum >= 1 ? "+" : "-"}${abs}%`;
}

function uuidNoDash(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  // فالبک ساده — کافی برای شناسهٔ اتصال
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

interface SynthOptions {
  text: string;
  voice: string;
  rate?: number;
  timeoutMs?: number;
}

/** یک نشست کامل سنتز — چند تلاش با توکن تازه (خطای ۴۰۳ = انحراف ساعت) */
export async function edgeTtsBrowser(opts: SynthOptions): Promise<ArrayBuffer> {
  const text = String(opts.text ?? "").slice(0, 1200);
  if (!text.trim()) throw new AIError("invalid_input", { detail: "متن خالی" });
  const voice = EDGE_VOICES_SET.has(opts.voice ?? "") ? opts.voice! : "fa-IR-DilaraNeural";
  const ratePct = rateToPct(opts.rate ?? 1);
  const timeoutMs = opts.timeoutMs ?? 30_000;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const audio = await synthOnce(text, voice, ratePct, timeoutMs);
      return audio;
    } catch (err) {
      lastErr = err;
      if (isAbortError(err)) throw new AIError("timeout");
      await new Promise((r) => setTimeout(r, 600)); // مکث کوتاه قبل از تلاش دوباره
    }
  }
  throw new AIError("unavailable", {
    detail: lastErr instanceof Error ? lastErr.message : "سرویس Edge TTS پاسخ نداد",
  });
}

async function synthOnce(text: string, voice: string, ratePct: string, timeoutMs: number): Promise<ArrayBuffer> {
  const gec = await secMsGec();
  const connectionId = uuidNoDash();
  const url =
    `${WSS_HOST}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${GEC_VERSION}&connectionId=${connectionId}`;

  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const chunks: ArrayBuffer[] = [];
  let settled = false;
  let turnStarted = false;

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error("timeout"));
      }
    }, timeoutMs);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      if (total < 100) {
        reject(new Error("صدای خالی از سرویس"));
        return;
      }
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(new Uint8Array(c), off);
        off += c.byteLength;
      }
      resolve(out.buffer);
    };

    ws.onopen = () => {
      const timestamp = new Date().toString();
      const config =
        `X-Timestamp:${timestamp}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "true" },
                outputFormat: OUTPUT_FORMAT,
              },
            },
          },
        });
      ws.send(config);
      ws.send(buildSsmlMessage(text, voice, ratePct, uuidNoDash(), timestamp));
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") {
        if (ev.data.includes("Path:turn.end")) finish();
        return;
      }
      // فریم باینری: ۲ بایت اول = طول هدر (big-endian)، بقیه صدا
      if (ev.data instanceof ArrayBuffer && ev.data.byteLength > 2) {
        const view = new DataView(ev.data);
        const headerLen = view.getUint16(0, false);
        if (ev.data.byteLength > 2 + headerLen) {
          chunks.push(ev.data.slice(2 + headerLen));
        }
      }
    };

    ws.onerror = () => {
      // اگر turn شروع نشده بود، احتمالاً توکن/دسترسی — برای تلاش دوباره رد شو
      if (!settled && !turnStarted) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("اتصال به سرویس گفتار برقرار نشد"));
      }
    };

    ws.onclose = () => {
      if (!settled) {
        if (chunks.length) finish();
        else {
          settled = true;
          clearTimeout(timer);
          reject(new Error("اتصال قبل از دریافت صدا بسته شد"));
        }
      }
    };

    // turn.start علامت‌گذاری می‌کند که اتصال سالم است (onerror را تغییر رفتار بده)
    const origOnMessage = ws.onmessage;
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string" && ev.data.includes("Path:turn.start")) turnStarted = true;
      origOnMessage.call(ws, ev);
    };
  });
}

/** خروجی استاندارد Blob برای مصرف کلاینت */
export async function edgeTtsBlob(text: string, voice: string, rate = 1): Promise<Blob> {
  const buf = await edgeTtsBrowser({ text, voice, rate });
  return new Blob([buf], { type: "audio/mpeg" });
}
