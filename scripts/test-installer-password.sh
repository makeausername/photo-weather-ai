#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -d "/c/Program Files/Git/usr/bin" ]]; then
  export PATH="/c/Program Files/Git/usr/bin:${PATH}"
fi

SCRIPT_DIR="$(cd -- "${BASH_SOURCE[0]%/*}" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=scripts/lib/installer-input.sh
. "${SCRIPT_DIR}/lib/installer-input.sh"

pass_count=0

pass() {
  pass_count=$((pass_count + 1))
}

fail() {
  echo "FAIL $1" >&2
  exit 1
}

expect_accepts() {
  local label="$1"
  local password="$2"

  if validate_admin_password_strength "${password}" >/dev/null 2>&1; then
    pass
    return
  fi

  fail "${label} should be accepted"
}

expect_rejects() {
  local label="$1"
  local password="$2"

  if validate_admin_password_strength "${password}" >/dev/null 2>&1; then
    fail "${label} should be rejected"
  fi

  pass
}

assert_file_not_contains() {
  local file="$1"
  local pattern="$2"

  if grep -F -- "${pattern}" "${PROJECT_ROOT}/${file}" >/dev/null 2>&1; then
    fail "${file} still contains forbidden text: ${pattern}"
  fi

  pass
}

assert_file_not_matches() {
  local file="$1"
  local pattern="$2"

  if grep -E -- "${pattern}" "${PROJECT_ROOT}/${file}" >/dev/null 2>&1; then
    fail "${file} still matches forbidden pattern: ${pattern}"
  fi

  pass
}

assert_file_contains() {
  local file="$1"
  local pattern="$2"

  if ! grep -F -- "${pattern}" "${PROJECT_ROOT}/${file}" >/dev/null 2>&1; then
    fail "${file} is missing expected text: ${pattern}"
  fi

  pass
}

expect_env_password_alias() {
  local label="$1"
  local key="$2"
  local password="$3"
  local encoded=""
  local resolved=""

  unset ADMIN_INITIAL_PASSWORD_B64 ADMIN_PASSWORD_B64 INITIAL_ADMIN_PASSWORD_B64 SUPER_ADMIN_PASSWORD_B64
  unset ADMIN_INITIAL_PASSWORD ADMIN_PASSWORD INITIAL_ADMIN_PASSWORD SUPER_ADMIN_PASSWORD

  case "${key}" in
    *B64)
      encoded="$(admin_password_to_b64 "${password}")"
      printf -v "${key}" '%s' "${encoded}"
      ;;
    *)
      printf -v "${key}" '%s' "${password}"
      ;;
  esac
  export "${key}"

  resolved="$(resolve_admin_password_from_env)" || fail "${label} should resolve"
  if [[ "${resolved}" != "${password}" ]]; then
    fail "${label} resolved the wrong password"
  fi

  pass
}

expect_accepts "broad shell symbols" 'Aa123456!@#$%^&*'
expect_accepts "brackets punctuation and pipe" 'Aa123456[]{};:,.?/|~'
expect_accepts "quotes backtick plus minus equals underscore" $'Aa123456"\'`+-=_'
expect_accepts "old whitelist removed" 'Aa123456!$^&*()[]{};:?/\|~'

expect_rejects "short password" 'Aa123!'
expect_rejects "missing uppercase" 'aa123456789!'
expect_rejects "missing lowercase" 'AA123456789!'
expect_rejects "missing digit" 'Aaabcdefghij!'
expect_rejects "missing special" 'Aa1234567890'
expect_rejects "newline control character" $'Aa123456789!\n'
expect_rejects "tab control character" $'Aa123456789!\t'

expect_env_password_alias "ADMIN_PASSWORD_B64 alias" "ADMIN_PASSWORD_B64" "AliasHorseBattery99!"
expect_env_password_alias "INITIAL_ADMIN_PASSWORD alias" "INITIAL_ADMIN_PASSWORD" "AliasHorseBattery99!"
expect_env_password_alias "SUPER_ADMIN_PASSWORD_B64 alias" "SUPER_ADMIN_PASSWORD_B64" "AliasHorseBattery99!"

for file in scripts/install.sh scripts/install-cn.sh scripts/reset-admin.sh scripts/check-login.sh; do
  assert_file_not_matches "${file}" 'read[[:space:]]+-r[[:space:]]+-s[[:space:]]+-p|read[[:space:]]+-s[[:space:]]+-p|read[[:space:]]+-rsp'
done

assert_file_not_matches "scripts/install.sh" 'validate_admin_password_for_env'
assert_file_not_matches "scripts/install.sh" 'A-Za-z0-9\._@#%[+]?[=]?-'
assert_file_not_matches "scripts/install-cn.sh" 'validate_admin_password_for_env'
assert_file_not_matches "scripts/install-cn.sh" 'A-Za-z0-9\._@#%[+]?[=]?-'
assert_file_contains "scripts/lib/installer-input.sh" "IFS= read -r -s value"
assert_file_contains "scripts/lib/installer-input.sh" "printf '\\n' >&2"

echo "OK installer password validation checks passed (${pass_count} assertions)."
