#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "Running synthetic Cloud Sea regression QA..."

corepack pnpm --filter @photo-weather/shared test -- cloud-sea-final-regression
corepack pnpm --filter @photo-weather/scoring test -- cloud-sea-final-regression
corepack pnpm --filter @photo-weather/weather test -- cloud-sea-final-regression
corepack pnpm --filter @photo-weather/web test -- cloud-sea-final-regression-qa
node scripts/check-cloud-sea-no-hardcoded-locations.mjs

echo "Cloud Sea regression QA passed."
