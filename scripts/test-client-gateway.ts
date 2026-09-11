// ─────────────────────────────────────────────────────────────
// تست گیت‌وی AI کلاینت — بخش‌های خالص قابل‌تست + رفتار صادقانهٔ استاتیک
// اجرا: npx tsx scripts/test-client-gateway.ts
// ─────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { secMsGec, buildSsmlMessage, rateToPct } from "../src/lib/ai/client/edge-tts-browser";
import {
  extractJsonObject,
  sanitizeScenes,
  applyTranslateBatch,
  translateSystemPrompt,
  EDIT_PLAN_SYSTEM,
  SCRIPT_SCENES_SYSTEM,
} from "../src/lib/ai/shared/prompts";
import { aiPlan } from "../src/lib/ai/client/gateway";

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

// ── 1) Sec-MS-GEC — تطبیق با محاسبهٔ مستقل node:crypto ──
async function testSecMsGec() {
  console.log("Sec-MS-GEC token (browser edge-tts):");
  const now = Date.UTC(2026, 8, 11, 9, 30, 0); // زمان ثابت
  const WIN_EPOCH = 11_644_473_600;
  const sec = Math.floor(now / 1000) + WIN_EPOCH;
  const bucket = Math.floor(sec / 300) * 300;
  const ticks = BigInt(bucket) * BigInt(10_000_000);
  const expected = createHash("sha256")
    .update(`${ticks}6A5AA1D4EAFF4E9FB37E23D68491D6F4`)
    .digest("hex")
    .toUpperCase();
  const got = await secMsGec(now);
  ok(got === expected, "توکن = SHA-256(ticks+token) با حروف بزرگ", `got=${got} want=${expected}`);
  ok(/^[0-9A-F]{64}$/.test(got), "فرمت hex ۶۴ کاراکتری");

  // زمان دیگر → سبد دیگر ولی همان قاعده
  const now2 = Date.UTC(2026, 8, 11, 9, 34, 59); // همان سبد ۵ دقیقه‌ای
  const got2 = await secMsGec(now2);
  ok(got2 === expected, "دو زمان در یک سبد ۵ دقیقه‌ای → توکن برابر");

  const now3 = Date.UTC(2026, 8, 11, 9, 35, 1); // سبد بعدی
  const got3 = await secMsGec(now3);
  ok(got3 !== expected, "سبد بعدی → توکن متفاوت");
}

// ── 2) SSML builder ──
function testSsml() {
  console.log("SSML message builder:");
  const msg = buildSsmlMessage('سلام & <عزیز>', "fa-IR-DilaraNeural", "+0%", "a".repeat(32), "Mon Sep 11 2026");
  ok(msg.startsWith("X-RequestId:"), "هدر X-RequestId");
  ok(msg.includes("Content-Type:application/ssml+xml"), "هدر ssml+xml");
  ok(msg.includes("Path:ssml"), "Path:ssml");
  ok(msg.includes("\r\n\r\n"), "جداکنندهٔ هدر/بدنه CRLF CRLF");
  ok(msg.includes("<voice name='fa-IR-DilaraNeural'>"), "voice درست");
  ok(msg.includes("سلام &amp; &lt;عزیز&gt;"), "escape کردن XML");
  ok(!msg.includes("<عزیز>"), "بدنهٔ خام تزریق نشده");
  ok(rateToPct(0.5) === "-50%" && rateToPct(1) === "+0%" && rateToPct(2) === "+100%" && rateToPct(5) === "+100%", "clamp نرخ گفتار");
}

// ── 3) shared prompts/parsers ──
function testPrompts() {
  console.log("Shared prompts + parsers:");
  ok(EDIT_PLAN_SYSTEM.includes("دستیار ادیت") && SCRIPT_SCENES_SYSTEM.includes("ویدئوساز خودکار"), "پرامپت‌های مشترک موجود");
  ok(translateSystemPrompt("translate", "en").includes("انگلیسی") && translateSystemPrompt("fix", "fa").includes("ویراستار"), "پرامپت ترجمه/اصلاح");

  const obj = extractJsonObject('متن اضافه {"title":"x","scenes":[]} پایانی');
  ok(!!obj && (obj as { title?: string }).title === "x", "extractJsonObject از متن markdown-دار");
  ok(extractJsonObject("بدون JSON") === null, "بدون JSON → null");

  const sc = sanitizeScenes({ title: "t".repeat(100), scenes: [{ text: "a", imagePrompt: "b", dur: 99 }, { text: "c", imagePrompt: "d" }] });
  ok(!!sc && sc.title.length === 80 && sc.scenes[0].dur === 6 && sc.scenes[1].dur === 4, "sanitizeScenes: clamp عنوان و مدت");
  ok(sanitizeScenes({ title: "t", scenes: [] }) === null, "بدون صحنه → null");

  // applyTranslateBatch
  const segs = ["این متن اولیه است", "hello world"];
  const raw = JSON.stringify([
    { i: 0, text: "این متن اولیه است." },
    { i: 1, text: "سلام دنیا" },
  ]);
  const out = applyTranslateBatch(segs, raw, "translate", "fa");
  ok(!!out && out[0] === "این متن اولیه است." && out[1] === "سلام دنیا", "اعمال ترجمه/اصلاح معتبر (≤۴۰٪ تغییر)");
  // انحراف شدید فارسی → حفظ اصل
  const raw2 = JSON.stringify([{ i: 0, text: "این یک بازنویسی کاملاً متفاوت با کلمات جدید است" }]);
  const out2 = applyTranslateBatch(["سلام دنیا"], raw2, "translate", "fa");
  ok(!!out2 && out2[0] === "سلام دنیا", "گارد انحراف: بازنویسی >۴۰٪ رد می‌شود");
  ok(applyTranslateBatch(segs, "بدون آرایه", "translate", "fa") === null, "خروجی بد → null");
  // ترجمهٔ واقعی en→fa مجاز است (منبع غیرفارسی)
  const out3 = applyTranslateBatch(["hello"], JSON.stringify([{ i: 0, text: "سلام" }]), "translate", "fa");
  ok(!!out3 && out3[0] === "سلام", "ترجمهٔ غیرفارسی → فارسی مجاز");
}

// ── 4) aiPlan در محیط بدون سرور (Node = مثل استاتیک) → خطای صادقانهٔ فارسی ──
async function testStaticHonesty() {
  console.log("Static-mode honesty (no server, no keys):");
  const res = await aiPlan({ instruction: "یک ریلز لوکس بساز", snapshot: {} });
  ok(typeof res.error === "string" && res.error.length > 5, "بدون کلید → پیام خطای فارسی قابل‌فهم", JSON.stringify(res));
  ok(!/\s4\d\d\s|Unexpected token|SyntaxError/i.test(res.error ?? ""), "خطای خام (۴۰۴/HTML) به کاربر نشان داده نمی‌شود");
}

async function main() {
  console.log("═══ test-client-gateway ═══");
  await testSecMsGec();
  testSsml();
  testPrompts();
  await testStaticHonesty();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
