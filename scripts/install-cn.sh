#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

export PHOTO_WEATHER_INSTALL_MODE="${PHOTO_WEATHER_INSTALL_MODE:-cn}"

exec bash "${SCRIPT_DIR}/install.sh" "$@"

