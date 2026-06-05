#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

export PHOTO_WEATHER_INSTALL_MODE="${PHOTO_WEATHER_INSTALL_MODE:-cn}"
export INSTALL_REGION="${INSTALL_REGION:-cn}"
export DOCKER_INSTALL_METHOD="${DOCKER_INSTALL_METHOD:-ubuntu}"
export APT_MIRROR="${APT_MIRROR:-https://mirrors.tuna.tsinghua.edu.cn/ubuntu}"
export PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"
export DOCKER_REGISTRY_MIRRORS="${DOCKER_REGISTRY_MIRRORS:-https://docker.1ms.run,https://docker.m.daocloud.io,https://dockerproxy.com,https://mirror.baidubce.com}"

exec bash "${SCRIPT_DIR}/install.sh" "$@"
