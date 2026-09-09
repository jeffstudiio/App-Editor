// Test Persian support: TTS (fa text) and ASR (fa audio round-trip)
const BASE = "http://localhost:3000";

async function testTts(text, voice) {
  const res = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed: 1 }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, err: j.error || res.status };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: true, bytes: buf.length, b64: buf.toString("base64") };
}

async function testAsr(b64) {
  const res = await fetch(`${BASE}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_base64: b64 }),
  });
  const j = await res.json();
  return { ok: res.ok, text: j.text, err: j.error };
}

async function main() {
  const faText = "سلام، این یک آزمایش برای پشتیبانی زبان فارسی است.";
  console.log("== TTS Persian ==");
  const t1 = await testTts(faText, "tongtong");
  console.log(JSON.stringify({ ok: t1.ok, bytes: t1.bytes, err: t1.err }));

  if (t1.ok) {
    console.log("== ASR round-trip (TTS fa output -> ASR) ==");
    const a1 = await testAsr(t1.b64);
    console.log(JSON.stringify(a1));
  }

  console.log("== TTS English ==");
  const t2 = await testTts("Hello, this is a test of english support.", "jam");
  console.log(JSON.stringify({ ok: t2.ok, bytes: t2.bytes, err: t2.err }));
  if (t2.ok) {
    const a2 = await testAsr(t2.b64);
    console.log("== ASR round-trip (en) ==", JSON.stringify(a2));
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
