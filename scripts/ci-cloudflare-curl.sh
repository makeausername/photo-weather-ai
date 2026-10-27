#!/usr/bin/env bash
# CI-only transport: a disposable local peer emulates a trusted Cloudflare edge.
# The real Caddy allowlist, certificate verification and HTTP routes stay enabled.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted ]] || exit 1
target="${!#}"
case "${target}" in
  https://weather.example.test|https://weather.example.test/api/service/health) ;;
  *) exec /usr/bin/curl "$@" ;;
esac
compose() { docker compose --env-file .env.production -f docker-compose.prod.yml "$@"; }
container="$(compose ps -q caddy)"
network="${COMPOSE_PROJECT_NAME:?}-edge"
if ! docker inspect --format '{{json .NetworkSettings.Networks}}' "${container}" | grep -q "\"${network}\""; then
  docker network connect --ip 173.245.48.2 "${network}" "${container}"
fi
image="$(compose images -q api | head -n 1)"
docker run --rm --network "${network}" --ip 173.245.48.10 \
  -v "${PWD}/.runtime/ci-cert/origin.pem:/ci-ca.pem:ro" \
  -e CI_TARGET="${target}" --entrypoint node "${image}" -e '
const https=require("node:https"), fs=require("node:fs");
const url=new URL(process.env.CI_TARGET);
const req=https.get({hostname:"173.245.48.2",servername:url.hostname,port:443,path:url.pathname,
  headers:{host:url.hostname},ca:fs.readFileSync("/ci-ca.pem"),timeout:15000}, res=>{
  res.pipe(process.stdout); res.on("end",()=>{if(res.statusCode!==200)process.exitCode=1});
});
req.on("timeout",()=>req.destroy(new Error("timeout")));
req.on("error",e=>{console.error(e.message);process.exitCode=1});'
