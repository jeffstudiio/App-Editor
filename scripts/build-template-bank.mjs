// انتشار بانک تمپلیت به JSON — برای میزبانی روی GitHub / فضای ابری
// اجرا:  bun scripts/build-template-bank.mjs
// خروجی: public/template-bank/index.json + یک فایل per-category
// خروجی را روی ریپوی گیت‌هاب بگذار و آدرس raw/jsDelivr آن را در اپ
// (بانک تمپلیت → منبع ابری) وارد کن تا از آنجا خوانده شود.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BANK_CATEGORIES } from "../src/lib/template-bank/schema.ts";
import { LOCAL_BANK, BANK_VERSION } from "../src/lib/template-bank/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "template-bank");
mkdirSync(outDir, { recursive: true });

const manifest = {
  version: BANK_VERSION,
  updatedAt: new Date().toISOString().slice(0, 10),
  count: LOCAL_BANK.templates.length,
  templates: LOCAL_BANK.templates,
};

writeFileSync(join(outDir, "index.json"), JSON.stringify(manifest, null, 1), "utf-8");

for (const cat of BANK_CATEGORIES) {
  const list = LOCAL_BANK.templates.filter((t) => t.cat === cat.id);
  writeFileSync(
    join(outDir, `${cat.id}.json`),
    JSON.stringify({ version: BANK_VERSION, count: list.length, templates: list }, null, 1),
    "utf-8",
  );
}

console.log(`✅ template-bank published: ${manifest.count} templates → public/template-bank/`);
