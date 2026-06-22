#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
INSTALLER_INPUT_LIB="${SCRIPT_DIR}/lib/installer-input.sh"
REQUIRED_ADMIN_PERMISSION_CODES=(
  admin.manage
  settings.manage
  providers.manage
  users.manage
  audit.read
  usage.read
)

cd "${PROJECT_ROOT}"

# shellcheck source=scripts/lib/installer-input.sh
. "${INSTALLER_INPUT_LIB}"

ok() {
  printf 'OK %s\n' "$1"
}

warn() {
  printf 'WARNING %s\n' "$1"
}

fail() {
  printf 'FAILED %s\n' "$1" >&2
  exit 1
}

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

docker_cmd() {
  if [[ -n "${SUDO}" ]]; then
    sudo docker "$@"
  else
    docker "$@"
  fi
}

compose() {
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

run_psql() {
  compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -At "$@"
}

table_exists() {
  local table_name="$1"
  run_psql -c "SELECT CASE WHEN to_regclass('public.${table_name}') IS NULL THEN '0' ELSE '1' END;"
}

require_table() {
  local table_name="$1"
  if [[ "$(table_exists "${table_name}")" != "1" ]]; then
    fail "public.${table_name} table is missing."
  fi
  ok "public.${table_name} table exists."
}

if [[ ! -f "${ENV_FILE}" ]]; then
  fail "Missing .env.production. Run bash scripts/install.sh first."
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  fail "Missing docker-compose.prod.yml. Run this script from the project checkout."
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

if [[ -z "${ADMIN_EMAIL:-}" ]]; then
  ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-}"
fi

if [[ -z "${ADMIN_EMAIL:-}" ]]; then
  fail "ADMIN_EMAIL is not configured."
fi

require_table "users"
require_table "roles"
require_table "user_roles"

ADMIN_USER_ID="$(run_psql -v admin_email="${ADMIN_EMAIL}" -c "SELECT id FROM public.users WHERE lower(email) = lower(:'admin_email') LIMIT 1;")"
if [[ -z "${ADMIN_USER_ID}" ]]; then
  fail "Admin user is missing."
fi
ok "Admin user exists."

ADMIN_ROLE_ID="$(run_psql -c "SELECT id FROM public.roles WHERE code = 'admin' LIMIT 1;")"
if [[ -z "${ADMIN_ROLE_ID}" ]]; then
  fail "Admin role with code admin is missing."
fi
ok "Admin role with code admin exists."

USER_ROLE_COUNT="$(
  run_psql \
    -v admin_user_id="${ADMIN_USER_ID}" \
    -v admin_role_id="${ADMIN_ROLE_ID}" \
    -c "SELECT COUNT(*) FROM public.user_roles WHERE user_id = :'admin_user_id' AND role_id = :'admin_role_id';"
)"
if [[ "${USER_ROLE_COUNT}" != "1" ]]; then
  fail "Admin user is not bound to the admin role."
fi
ok "Admin user is bound to the admin role."

if [[ "$(table_exists "permissions")" == "1" ]]; then
  require_table "role_permissions"
  PERMISSION_COUNT="$(run_psql -c "SELECT COUNT(*) FROM public.permissions;")"
  if [[ "${PERMISSION_COUNT}" == "0" ]]; then
    warn "Permission table exists but is empty; admin role has no permissions to bind."
  else
    ADMIN_ROLE_PERMISSION_COUNT="$(
      run_psql \
        -v admin_role_id="${ADMIN_ROLE_ID}" \
        -c "SELECT COUNT(DISTINCT permission_id) FROM public.role_permissions WHERE role_id = :'admin_role_id';"
    )"
    if [[ "${ADMIN_ROLE_PERMISSION_COUNT}" -lt "${PERMISSION_COUNT}" ]]; then
      fail "Admin role is missing permission bindings."
    fi
    for permission_code in "${REQUIRED_ADMIN_PERMISSION_CODES[@]}"; do
      PERMISSION_EXISTS="$(
        run_psql \
          -v permission_code="${permission_code}" \
          -c "SELECT COUNT(*) FROM public.permissions WHERE code = :'permission_code';"
      )"
      if [[ "${PERMISSION_EXISTS}" == "0" ]]; then
        continue
      fi

      PERMISSION_BOUND="$(
        run_psql \
          -v admin_role_id="${ADMIN_ROLE_ID}" \
          -v permission_code="${permission_code}" \
          -c "SELECT COUNT(*)
                FROM public.role_permissions rp
                JOIN public.permissions p ON p.id = rp.permission_id
               WHERE rp.role_id = :'admin_role_id'
                 AND p.code = :'permission_code';"
      )"
      if [[ "${PERMISSION_BOUND}" == "0" ]]; then
        fail "Admin role is missing required permission ${permission_code}."
      fi
    done
    ok "Admin role permission bindings are present."
  fi
else
  warn "Permission tables are not present; skipped role permission verification."
fi

export ADMIN_EMAIL
if prepare_admin_password_b64_from_env; then
  if compose run --rm \
    -e ADMIN_EMAIL \
    -e ADMIN_INITIAL_PASSWORD_B64 \
    api pnpm --filter @photo-weather/api verify-admin-auth; then
    ok "Backend auth endpoint recognizes the admin role."
  else
    fail "Backend auth endpoint did not recognize the admin role."
  fi
else
  warn "Admin password is not available; skipped auth endpoint login verification."
fi

ok "Admin bootstrap verification completed."
