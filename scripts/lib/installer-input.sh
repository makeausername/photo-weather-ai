#!/usr/bin/env bash

ADMIN_PASSWORD_MIN_LENGTH="${ADMIN_PASSWORD_MIN_LENGTH:-12}"
ADMIN_PASSWORD_STRENGTH_MESSAGE="管理员密码至少 12 位，需包含大小写字母、数字和特殊字符；支持常见强密码符号。"
ADMIN_PASSWORD_CONTROL_MESSAGE="管理员密码不能包含换行或控制字符。"
ADMIN_PASSWORD_MISMATCH_MESSAGE="两次输入的管理员密码不一致，请重新输入。"
ADMIN_PASSWORD_EMPTY_MESSAGE="管理员密码不能为空。"

installer_warn() {
  local message="$1"
  if declare -F warn >/dev/null 2>&1; then
    warn "${message}"
  else
    printf 'WARNING %s\n' "${message}" >&2
  fi
}

read_secret() {
  local prompt="$1"
  local value=""
  local status=0
  local previous_int_trap

  previous_int_trap="$(trap -p INT || true)"
  trap 'printf "\n" >&2; exit 130' INT

  printf '%s' "${prompt}" >&2
  IFS= read -r -s value || status=$?
  printf '\n' >&2

  if [[ -n "${previous_int_trap}" ]]; then
    eval "${previous_int_trap}"
  else
    trap - INT
  fi

  if [[ "${status}" -ne 0 ]]; then
    return "${status}"
  fi

  printf '%s' "${value}"
}

prompt_secret() {
  local label="$1"
  read_secret "${label}: "
}

admin_password_has_control_chars() {
  local value="$1"
  [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* || "${value}" =~ [[:cntrl:]] ]]
}

validate_admin_password_strength() {
  local password="${1-}"

  if [[ -z "${password}" ]]; then
    installer_warn "${ADMIN_PASSWORD_EMPTY_MESSAGE}"
    return 1
  fi

  if admin_password_has_control_chars "${password}"; then
    installer_warn "${ADMIN_PASSWORD_CONTROL_MESSAGE}"
    return 1
  fi

  if [[ "${#password}" -lt "${ADMIN_PASSWORD_MIN_LENGTH}" ||
    ! "${password}" =~ [a-z] ||
    ! "${password}" =~ [A-Z] ||
    ! "${password}" =~ [0-9] ||
    "${password}" != *[!A-Za-z0-9]* ]]; then
    installer_warn "${ADMIN_PASSWORD_STRENGTH_MESSAGE}"
    return 1
  fi
}

prompt_password_twice() {
  local password_label="${1:-请输入管理员密码}"
  local confirm_label="${2:-请再次输入管理员密码}"
  local password=""
  local confirm_password=""

  while true; do
    password="$(read_secret "${password_label}: ")"
    confirm_password="$(read_secret "${confirm_label}: ")"

    if [[ "${password}" != "${confirm_password}" ]]; then
      installer_warn "${ADMIN_PASSWORD_MISMATCH_MESSAGE}"
      continue
    fi

    if ! validate_admin_password_strength "${password}"; then
      continue
    fi

    printf '%s' "${password}"
    return 0
  done
}

admin_password_to_b64() {
  local password="$1"

  if command -v base64 >/dev/null 2>&1; then
    printf '%s' "${password}" | base64 | tr -d '\r\n'
    return
  fi

  if command -v openssl >/dev/null 2>&1; then
    printf '%s' "${password}" | openssl base64 -A | tr -d '\r\n'
    return
  fi

  installer_warn "当前系统缺少 base64 或 openssl，无法安全写入管理员初始密码。"
  return 1
}

decode_base64_secret() {
  local encoded="$1"
  local decoded=""

  if command -v base64 >/dev/null 2>&1; then
    if decoded="$(printf '%s' "${encoded}" | base64 --decode 2>/dev/null)"; then
      printf '%s' "${decoded}"
      return
    fi
    if decoded="$(printf '%s' "${encoded}" | base64 -d 2>/dev/null)"; then
      printf '%s' "${decoded}"
      return
    fi
    if decoded="$(printf '%s' "${encoded}" | base64 -D 2>/dev/null)"; then
      printf '%s' "${decoded}"
      return
    fi
  fi

  if command -v openssl >/dev/null 2>&1; then
    if decoded="$(printf '%s' "${encoded}" | openssl base64 -d -A 2>/dev/null)"; then
      printf '%s' "${decoded}"
      return
    fi
  fi

  return 1
}

resolve_admin_password_from_env() {
  if [[ -n "${ADMIN_INITIAL_PASSWORD_B64:-}" ]]; then
    decode_base64_secret "${ADMIN_INITIAL_PASSWORD_B64}"
    return
  fi

  if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
    printf '%s' "${ADMIN_PASSWORD}"
    return
  fi

  if [[ -n "${ADMIN_INITIAL_PASSWORD:-}" ]]; then
    printf '%s' "${ADMIN_INITIAL_PASSWORD}"
    return
  fi

  return 1
}

prepare_admin_password_b64_from_env() {
  local password

  password="$(resolve_admin_password_from_env)" || return 1
  validate_admin_password_strength "${password}" || return 1
  ADMIN_PASSWORD="${password}"
  ADMIN_INITIAL_PASSWORD_B64="$(admin_password_to_b64 "${password}")"
  export ADMIN_INITIAL_PASSWORD_B64
}

