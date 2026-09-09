// Test ASR with real Persian audio (espeak-ng generated) + all TTS voices round-trip
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

async function ttsB64(text, voice) {
  const res = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed: 1 }),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

function isPersian(t) {
  return /[\u0600-\u06FF]/.test(t);
}

async function main() {
  // 1) espeak-ng real Persian sample -> 16k mono wav
  execSync(
    `espeak-ng -v fa -s 150 -w /tmp/fa_test.wav "سلام این یک آزمایش پشتیبانی زبان فارسی برای زیرنویس خودکار است"`,
    { stdio: "inherit" }
  );
  // convert to 16k mono pcm wav
  execSync(`ffmpeg -y -i /tmp/fa_test.wav -ar 16000 -ac 1 /tmp/fa_test16.wav`, { stdio: "inherit" });
  const faB64 = fs.readFileSync("/tmp/fa_test16.wav").toString("base64");
  console.log("== ASR on real Persian speech (espeak fa) ==");
  console.log(await asr(faB64));

  // 2) all TTS voices with Persian sentence -> ASR round-trip
  const voices = ["tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo"];
  const sentence = "امروز هوا خیلی خوب است و ما به پارک می‌رویم.";
  console.log("\n== TTS voice round-trip for Persian ==");
  for (const v of voices) {
    const b64 = await ttsB64(sentence, v);
    if (!b64) {
      console.log(`${v}: TTS FAILED`);
      continue;
    }
    const t = await asr(b64);
    console.log(`${v}: ${JSON.stringify(t)} ${isPersian(t) ? "✅fa" : "❌"}`);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
