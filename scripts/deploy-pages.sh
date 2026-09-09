#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# دیپلوی out/ روی شاخهٔ gh-pages همان ریپو
# استفاده:  GH_TOKEN=xxx scripts/deploy-pages.sh [owner] [repo]
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

OWNER="${1:-jeffstudiio}"
REPO="${2:-App-Editor}"
TOKEN="${GH_TOKEN:?GH_TOKEN خالی است}"

[ -f out/index.html ] || { echo "خروجی out/ نیست؛ اول scripts/build-phone.sh را اجرا کن"; exit 1; }

rm -rf out/.git
cd out
git init -q -b gh-pages
git config user.email "${OWNER}@users.noreply.github.com"
git config user.name "${OWNER}"
git add -A
git commit -qm "deploy: نسخهٔ گوشی — $(date -u +%Y-%m-%dT%H:%MZ)"
git remote add origin "https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git"
git push -qf origin gh-pages

echo "OK: gh-pages پوش شد → https://${OWNER}.github.io/${REPO}/"
