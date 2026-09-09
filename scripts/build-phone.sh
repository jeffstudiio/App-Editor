#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# بیلد نسخهٔ گوشی (استاتیک) برای میزبانی GitHub Pages
# خروجی: out/ — آمادهٔ پوش gh-pages
# استفاده:  GH_TOKEN=xxx scripts/build-phone.sh [owner] [repo]
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

OWNER="${1:-jeffstudiio}"
REPO="${2:-App-Editor}"
BP="/${REPO}"

echo "── ۱/۴ کنار رفتن API Routes (استاتیک Route Handler داینامیک ندارد)"
if [ -d src/app/api ]; then
  rm -rf .api-stash
  mv src/app/api .api-stash
fi
restore() { if [ -d .api-stash ]; then mv .api-stash src/app/api; fi }
trap restore EXIT

echo "── ۲/۴ next build (export + basePath ${BP})"
rm -rf out
PHONE_BUILD=1 NEXT_PUBLIC_BASE_PATH="$BP" npx next build

echo "── ۳/۴ ترمیم مسیرهای /fonts و /bank-media داخل CSS"
find out/_next -name '*.css' -exec sed -i "s|url(/fonts/|url(${BP}/fonts/|g; s|url(/bank-media/|url(${BP}/bank-media/|g; s|url(/icons/|url(${BP}/icons/|g" {} +

echo "── ۴/۴ .nojekyll"
touch out/.nojekyll

echo "OK: out/ آماده است ($(du -sh out | cut -f1))"
