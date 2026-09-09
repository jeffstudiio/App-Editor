// اعتبارسنجی بانک تمپلیت — یتیم‌ها و ارجاع‌های شکسته
import { LOCAL_BANK } from "../src/lib/template-bank/index.ts";

let issues = 0;
for (const t of LOCAL_BANK.templates) {
  const slotIds = new Set(t.slots.map((s) => s.id));
  const textIds = new Set(t.texts.map((s) => s.id));
  const usedSlots = new Set();
  const usedTexts = new Set();
  for (const sc of t.scenes) {
    if (sc.slot) usedSlots.add(sc.slot);
    else if (t.slots.some((s) => s.kind !== "audio")) {
      // صحنهٔ بدون اسلات اشکال نیست (اینتروی متنی)، فقط گزارش نمی‌کنیم
    }
    for (const st of sc.texts ?? []) usedTexts.add(st.ref);
  }
  for (const s of t.slots) {
    if (!usedSlots.has(s.id) && s.kind !== "audio") {
      console.log(`❌ ${t.id}: اسلات «${s.id} (${s.label})» هیچ صحنه‌ای استفاده نمی‌کند`);
      issues++;
    }
  }
  for (const id of usedSlots) {
    if (!slotIds.has(id)) {
      console.log(`❌ ${t.id}: صحنه به اسلات ناموجود «${id}» ارجاع دارد`);
      issues++;
    }
  }
  for (const id of usedTexts) {
    if (!textIds.has(id)) {
      console.log(`❌ ${t.id}: صحنه به متن ناموجود «${id}» ارجاع دارد`);
      issues++;
    }
  }
  for (const sc of t.scenes) {
    if (typeof sc.d !== "number" || sc.d < 0.4) {
      console.log(`❌ ${t.id}: صحنه با مدت نامعتبر ${sc.d}`);
      issues++;
    }
  }
}
console.log(issues === 0 ? `✅ همهٔ ${LOCAL_BANK.templates.length} تمپلیت سالم` : `⚠️ ${issues} مشکل پیدا شد`);
