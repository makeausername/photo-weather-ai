#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

cd "${PROJECT_ROOT}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Missing ${COMPOSE_FILE}. Run this script from the project checkout."
  exit 1
fi

docker_cmd() {
  if command -v sudo >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
    sudo docker "$@"
  else
    docker "$@"
  fi
}

compose() {
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [[ $# -eq 0 ]]; then
  echo "Usage: bash scripts/report-sky-darkness-qa.sh <benchmark.csv|benchmark.json> [benchmark options]"
  echo "Default outputs: --format markdown --format json."
  echo "This is audit-only. It writes QA reports, not production rules."
  echo "Benchmark references are QA only: competitorBenchmark, thirdPartyReference, notGroundTruth."
  exit 2
fi

args=("$@")
if [[ "${args[0]}" != --* ]]; then
  benchmark_path="${args[0]}"
  args=("${args[@]:1}")
  if [[ "${benchmark_path}" == "${PROJECT_ROOT}"* ]]; then
    relative="${benchmark_path#${PROJECT_ROOT}/}"
    benchmark_path="/app/${relative}"
  elif [[ "${benchmark_path}" != /* ]]; then
    benchmark_path="/app/${benchmark_path}"
  fi
  args=(--input "${benchmark_path}" "${args[@]}")
fi

has_format=false
normalized_args=()
for arg in "${args[@]}"; do
  if [[ "${arg}" == "--json" ]]; then
    normalized_args+=(--format json)
    has_format=true
  else
    normalized_args+=("${arg}")
  fi
  if [[ "${arg}" == "--format" || "${arg}" == --format=* ]]; then
    has_format=true
  fi
done

if [[ "${has_format}" == "false" ]]; then
  normalized_args+=(--format markdown --format json)
fi

compose run --rm api \
  pnpm --filter @photo-weather/api exec tsx src/scripts/national-sky-darkness-benchmark.ts \
    --astro-service-url http://astro-service:4100 \
    "${normalized_args[@]}"
