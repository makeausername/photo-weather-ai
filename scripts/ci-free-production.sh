#!/usr/bin/env bash
# Disposable GitHub-hosted CI only. Never run against a user's deployment.
set -Eeuo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
[[ "${GITHUB_ACTIONS:-}" == "true" && "${RUNNER_ENVIRONMENT:-}" == "github-hosted" ]] || { echo "This check requires a disposable GitHub-hosted runner." >&2; exit 1; }
[[ ! -e .env.production && ! -e deploy/certs && ! -e deploy/Caddyfile ]] || { echo "Refusing to overwrite deployment files." >&2; exit 1; }
export COMPOSE_PROJECT_NAME="free-ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
[[ "${COMPOSE_PROJECT_NAME}" =~ ^free-ci-[0-9]+-[0-9]+$ ]] || exit 1
umask 077
mkdir -p .runtime/ci-cert .runtime/ci-bin
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj '/CN=weather.example.test' -addext 'subjectAltName=DNS:weather.example.test' -keyout .runtime/ci-cert/origin.key -out .runtime/ci-cert/origin.pem 2>/dev/null
compose() { docker compose --env-file .env.production -f docker-compose.prod.yml "$@"; }
cleanup() {
  local status=$?
  if [[ "${status}" -ne 0 && -f .env.production ]]; then compose ps; compose logs --tail=60 api web caddy; fi
  # Only this unique disposable CI project is removed, never production volumes.
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker network rm "${COMPOSE_PROJECT_NAME}-edge" >/dev/null 2>&1 || true
  exit "${status}"
}
trap cleanup EXIT
docker network create --subnet 173.245.48.0/24 "${COMPOSE_PROJECT_NAME}-edge" >/dev/null
cp scripts/ci-cloudflare-curl.sh .runtime/ci-bin/curl
chmod +x .runtime/ci-bin/curl
export PATH="${PWD}/.runtime/ci-bin:${PATH}"
python3 scripts/ci-installer-wizard.py
set -a
. ./.env.production
set +a
VERIFY_ADMIN_PASSWORD=true bash scripts/verify-admin-bootstrap.sh
compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose exec -T -w /app/packages/db api node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
try {
  assert.equal(await db.billingProduct.count(),0);
  assert.equal(await db.paymentOrder.count(),0);
  assert.equal(await db.user.count(),1);
  assert.equal(await db.providerConfig.count(),3);
  const base='http://web:3000/api/service';
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:process.env.ADMIN_EMAIL,password:Buffer.from(process.env.ADMIN_INITIAL_PASSWORD_B64,'base64').toString()})});
  assert.equal(login.status,200);
  assert.equal(login.headers.get('cache-control'),'no-store');
  const {accessToken}=await login.json(); assert.ok(accessToken);
  const saved=await fetch(base+'/admin/settings/site.name',{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer '+accessToken},body:JSON.stringify({valueJson:'CI Free Weather'})});
  assert.equal(saved.status,200);
  assert.equal((await (await fetch(base+'/site/config')).json()).name,'CI Free Weather');
  assert.equal((await fetch(base+'/admin/settings')).status,401);
  for(const route of ['/','/astro','/map','/weather','/admin/login']) {
    const page=await fetch('http://web:3000'+route); assert.equal(page.status,200,route); assert.ok((await page.text()).includes('CI Free Weather'),route);
  }
  assert.equal((await fetch(base+'/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,410);
  console.log('Production containers: initialization, admin auth, persistence, public config and page smoke checks passed.');
} finally {await db.$disconnect();}
JS
bash scripts/backup.sh
dump="$(find backups -name postgres.dump -type f -print -quit)"
[[ -s "${dump}" ]] || { echo "Database backup missing" >&2; exit 1; }
# Resume after initial-password removal must preserve the existing administrator and settings.
python3 - <<'PY'
from pathlib import Path
import re
p=Path('.env.production')
p.write_text(re.sub(r'^ADMIN_INITIAL_PASSWORD_B64=.*$', 'ADMIN_INITIAL_PASSWORD_B64=', p.read_text(), flags=re.M))
PY
unset ADMIN_INITIAL_PASSWORD_B64
bash scripts/resume-install.sh
# Test update's no-Git archive path, retaining the same isolated Compose volumes.
mkdir -p .runtime/update-checkout
git archive HEAD | tar -x -C .runtime/update-checkout
cp .env.production .runtime/update-checkout/
mkdir -p .runtime/update-checkout/deploy/certs
cp deploy/certs/origin.* .runtime/update-checkout/deploy/certs/
mkdir -p .runtime/update-checkout/.runtime/ci-cert
cp .runtime/ci-cert/origin.pem .runtime/update-checkout/.runtime/ci-cert/
(cd .runtime/update-checkout && bash scripts/update.sh)
compose exec -T api node -e 'fetch("http://web:3000/api/service/site/config").then(r=>r.json()).then(v=>{if(v.name!=="CI Free Weather")process.exit(1)}).catch(()=>process.exit(1))'
echo "Linux production stack checks passed; no image published and no server deployed."
