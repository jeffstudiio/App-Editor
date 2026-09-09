import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const star = (cx, cy, r, color, opacity = 1) => {
  const s = r;
  const s4 = r * 0.28;
  return `<path fill="${color}" opacity="${opacity}" d="M ${cx} ${cy - s} C ${cx + s4} ${cy - s4}, ${cx + s4} ${cy - s4}, ${cx + s} ${cy} C ${cx + s4} ${cy + s4}, ${cx + s4} ${cy + s4}, ${cx} ${cy + s} C ${cx - s4} ${cy + s4}, ${cx - s4} ${cy + s4}, ${cx - s} ${cy} C ${cx - s4} ${cy - s4}, ${cx - s4} ${cy - s4}, ${cx} ${cy - s} Z"/>`;
};

const svg = (size) => {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#17131f"/>
      <stop offset="100%" stop-color="#0a0810"/>
    </linearGradient>
    <linearGradient id="spark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="55%" stop-color="#d946ef"/>
      <stop offset="100%" stop-color="#f0abfc"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="150" fill="url(#spark)" opacity="0.12"/>
  ${star(256, 236, 128, "url(#spark)")}
  ${star(368, 128, 40, "#f0abfc", 0.9)}
  ${star(140, 380, 30, "#a78bfa", 0.75)}
</svg>`;
};

const outDir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(size))).png().toFile(path.join(outDir, `icon-${size}.png`));
  console.log(`icon-${size}.png written`);
}
