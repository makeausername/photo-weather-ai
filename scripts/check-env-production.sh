#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"

mask_value() {
  local value="${1-}"
  if [[ -z "${value}" ]]; then
    printf '(empty)'
  else
    printf '***'
  fi
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

status=0
line_no=0
while IFS= read -r line || [[ -n "${line}" ]]; do
  line_no=$((line_no + 1))
  line="${line%$'\r'}"

  if [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]]; then
    continue
  fi

  if [[ "${line}" != *=* ]]; then
    echo "第 ${line_no} 行格式错误：缺少 ="
    status=1
    continue
  fi

  key="${line%%=*}"
  value="${line#*=}"
  if [[ -z "${key}" || ! "${key}" =~ ^[A-Z0-9_]+$ ]]; then
    echo "第 ${line_no} 行变量名无效：${key:-<empty>}"
    status=1
    continue
  fi

  printf '%s=%s\n' "${key}" "$(mask_value "${value}")"
done < "${ENV_FILE}"

exit "${status}"
