// Test edge-tts Persian + Whisper on-device Persian transcription
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { execSync } from "child_process";
import fs from "fs";

const BASE = "http://localhost:3000";

async function asr(b64) {
  const res = await fetch(`${BASE}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_base64: b64 }),
  });
  const j = await res.json();
  return j.text ?? j.error ?? "(empty)";
}

async function main() {
  // ── 1) edge-tts Persian ──
  const tts = new MsEdgeTTS();
  await tts.setMetadata("fa-IR-DilaraNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream("سلام! این صدای فارسی طبیعی است و برای دوبله استفاده می‌شود.", { rate: 1, pitch: "+0Hz" });
  const chunks = [];
  for await (const c of audioStream) chunks.push(c);
  const mp3 = Buffer.concat(chunks);
  fs.writeFileSync("/tmp/edge_fa.mp3", mp3);
  console.log("edge-tts fa bytes:", mp3.length);
  // probe validity
  const probe = execSync(`ffmpeg -i /tmp/edge_fa.mp3 -f null - 2>&1 | grep -E "Duration|Audio" | head -2`).toString();
  console.log("probe:", probe.trim().replace(/\n/g, " | "));
  // convert to wav 16k and round-trip through cloud ASR just to confirm audio is real speech
  execSync(`ffmpeg -y -i /tmp/edge_fa.mp3 -ar 16000 -ac 1 /tmp/edge_fa.wav`, { stdio: "ignore" });
  console.log("cloud-ASR of edge fa audio (en-biased, just sanity):", await asr(fs.readFileSync("/tmp/edge_fa.wav").toString("base64")));

  // ── 2) edge-tts English round-trip (proves pipeline quality) ──
  const t2 = new MsEdgeTTS();
  await t2.setMetadata("en-US-AriaNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream: s2 } = await t2.toStream("Hello, this is a neural voice test for dubbing.");
  const c2 = [];
  for await (const c of s2) c2.push(c);
  fs.writeFileSync("/tmp/edge_en.mp3", Buffer.concat(c2));
  execSync(`ffmpeg -y -i /tmp/edge_en.mp3 -ar 16000 -ac 1 /tmp/edge_en.wav`, { stdio: "ignore" });
  console.log("cloud-ASR of edge en audio:", await asr(fs.readFileSync("/tmp/edge_en.wav").toString("base64")));
}

main().catch((e) => {
  console.error("FATAL", e?.message || e);
  process.exit(1);
});
