#!/usr/bin/env bash
# Disposable GitHub-hosted CI only. Never run against a user's deployment.
set -Eeuo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
[[ "${GITHUB_ACTIONS:-}" == "true" && "${RUNNER_ENVIRONMENT:-}" == "github-hosted" ]] || { echo "This check requires a disposable GitHub-hosted runner." >&2; exit 1; }
[[ ! -e .env.production && ! -e deploy/certs && ! -e deploy/Caddyfile ]] || { echo "Refusing to overwrite deployment files." >&2; exit 1; }
export COMPOSE_PROJECT_NAME="free-ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
[[ "${COMPOSE_PROJECT_NAME}" =~ ^free-ci-[0-9]+-[0-9]+$ ]] || exit 1
umask 077
python3 - <<'PY'
from pathlib import Path
import base64, os, secrets
values = {
    'DOMAIN': 'weather.example.test', 'POSTGRES_DB': 'free_ci', 'POSTGRES_USER': 'free_ci',
    'POSTGRES_PASSWORD': secrets.token_hex(24), 'REDIS_PASSWORD': secrets.token_hex(24),
    'JWT_SECRET': secrets.token_hex(48), 'ADMIN_EMAIL': 'ci@example.test',
    'ADMIN_INITIAL_PASSWORD_B64': base64.b64encode(('Ci!'+secrets.token_hex(24)).encode()).decode(),
    'ADMIN_DISPLAY_NAME': 'CI',
}
text = Path('deploy/env.production.template').read_text()
for key, value in values.items():
    text = text.replace(key+'_PLACEHOLDER', value)
# Nested maintenance scripts may use sudo, which drops exported shell variables.
# Store the isolated Compose project identity in the explicit environment file too.
Path('.env.production').write_text(text+'\nCOMPOSE_PROJECT_NAME='+os.environ['COMPOSE_PROJECT_NAME']+'\n')
Path('deploy/Caddyfile').write_text(Path('deploy/Caddyfile.template').read_text().replace('DOMAIN_PLACEHOLDER', values['DOMAIN']))
PY
bash scripts/check-env-production.sh >/dev/null
set -a
. ./.env.production
set +a
mkdir -p deploy/certs deploy/calibration
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj '/CN=weather.example.test' -addext 'subjectAltName=DNS:weather.example.test' -keyout deploy/certs/origin.key -out deploy/certs/origin.pem 2>/dev/null
bash scripts/check-cloudflare.sh
compose() { docker compose --env-file .env.production -f docker-compose.prod.yml "$@"; }
cleanup() {
  local status=$?
  if [[ "${status}" -ne 0 ]]; then compose ps; compose logs --tail=60 api web caddy; fi
  # The guard above makes this a unique, disposable CI project, never production volumes.
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "${status}"
}
trap cleanup EXIT
compose config --quiet
compose build --pull api web
compose up -d --wait --wait-timeout 120 postgres redis
compose run --rm --no-deps api corepack pnpm db:migrate
compose run --rm --no-deps api corepack pnpm db:seed:free
compose run --rm --no-deps api corepack pnpm db:seed:free
VERIFY_ADMIN_PASSWORD=true bash scripts/verify-admin-bootstrap.sh
compose up -d --wait --wait-timeout 180 api web caddy
compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose exec -T api node --input-type=module <<'JS'
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
compose restart api web
compose up -d --wait --wait-timeout 180 api web
compose exec -T api node -e 'fetch("http://web:3000/api/service/site/config").then(r=>r.json()).then(v=>{if(v.name!=="CI Free Weather")process.exit(1)}).catch(()=>process.exit(1))'
echo "Linux production stack checks passed; no image published and no server deployed."
