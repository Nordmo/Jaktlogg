#!/bin/bash
# Alle sjekker, billigst først. Stopper ved første feil. Samme kommando lokalt og i CI.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n▶ %s\n' "$1"; }

step "Prosjektregler"
node scripts/repo-rules.js

step "Lint (ESLint)"
npx eslint .

step "Hemmeligheter (gitleaks)"
if ! command -v gitleaks >/dev/null; then
  echo "gitleaks mangler. Installer med: brew install gitleaks" >&2; exit 1
fi
gitleaks git --no-banner --redact .
gitleaks dir --no-banner --redact .

step "Sårbarheter i avhengigheter (npm audit)"
npm audit --audit-level=high

step "Ende-til-ende (Playwright)"
npx playwright test

printf '\n✔ Alle sjekker er grønne\n'
