#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -d "/c/Program Files/Git/usr/bin" ]]; then
  export PATH="/c/Program Files/Git/usr/bin:${PATH}"
fi

SCRIPT_DIR="$(cd -- "${BASH_SOURCE[0]%/*}" && pwd)"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

expect_file_contains() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq -- "${expected}" "${file}"; then
    fail "${file} does not contain: ${expected}"
  fi
}

expect_file_contains "${SCRIPT_DIR}/install.sh" 'cn|china) INSTALL_REGION="cn"'
expect_file_contains "${SCRIPT_DIR}/install.sh" 'offical) DOCKER_INSTALL_METHOD="official"'
expect_file_contains "${SCRIPT_DIR}/install.sh" 'APT_MIRROR="${APT_MIRROR%/}"'
expect_file_contains "${SCRIPT_DIR}/install.sh" '[[ "${args}" == *"unattended-upgrade-shutdown --wait-for-signal"* ]]'
if grep -Fq -- "pgrep -x unattended-upgr" "${SCRIPT_DIR}/install.sh"; then
  fail "unattended-upgr must not be treated as a blocking pgrep match"
fi
expect_file_contains "${SCRIPT_DIR}/install-cn.sh" 'export INSTALL_REGION="${INSTALL_REGION:-cn}"'
expect_file_contains "${SCRIPT_DIR}/install-cn.sh" 'export DOCKER_INSTALL_METHOD="${DOCKER_INSTALL_METHOD:-ubuntu}"'
expect_file_contains "${SCRIPT_DIR}/install-cn.sh" "https://docker.1ms.run"
expect_file_contains "${SCRIPT_DIR}/install.sh" "official Docker repository failed: Docker apt GPG download"
expect_file_contains "${SCRIPT_DIR}/install.sh" "falling back to Ubuntu docker.io + Compose v2 packages"
expect_file_contains "${SCRIPT_DIR}/install.sh" 'if ! docker_install_needed; then'
expect_file_contains "${SCRIPT_DIR}/install.sh" "Docker already installed; skipping Docker installation."
expect_file_contains "${SCRIPT_DIR}/install.sh" "Back up Docker daemon.json"
expect_file_contains "${SCRIPT_DIR}/install.sh" 'run_logged "Back up Docker daemon.json" run_sudo cp "${daemon_json}" "${backup_path}"'
expect_file_contains "${SCRIPT_DIR}/install.sh" '"registry-mirrors"'

echo "installer bootstrap tests passed"
