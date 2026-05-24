#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
CHECK_ENV_SCRIPT="${SCRIPT_DIR}/check-env-production.sh"

cd "${PROJECT_ROOT}"

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

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "未找到 .env.production，请先运行 bash scripts/install.sh"
  exit 1
fi

if ! bash "${CHECK_ENV_SCRIPT}" >/dev/null; then
  echo "生产环境配置文件格式错误，请检查 .env.production。"
  exit 1
fi

echo "Provider connection diagnostics:"
echo "No API keys or secrets will be printed."

compose ps api >/dev/null

compose exec -T api node -e '
const providers = [
  ["QWeather", "weather", "qweather"],
  ["Open-Meteo", "weather", "open_meteo"],
  ["meteoblue", "weather", "meteoblue"],
  ["Amap", "geo", "amap"],
  ["DeepSeek", "ai", "deepseek"],
];

function protect(value) {
  return String(value ?? "")
    .replace(/(apiKey|api_key|apikey|key|token|authorization|secret)(["\s:=]+)([^&\s,}"]+)/gi, "$1$2[redacted]")
    .replace(/((apikey|key|token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

async function readJsonSafe(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: protect(text) };
  }
}

async function main() {
  const baseUrl = process.env.PROVIDER_TEST_INTERNAL_API_URL || "http://127.0.0.1:4000";
  const health = await fetch(`${baseUrl}/health`).catch((error) => {
    throw new Error(`API health check failed: ${protect(error.message)}`);
  });
  if (!health.ok) {
    throw new Error(`API health check failed: HTTP ${health.status}`);
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("管理员登录凭据未配置，无法自动调用后台测试端点。");
    console.log("UI manual test is primary: /admin/providers");
    return;
  }

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await readJsonSafe(login);
  if (!login.ok || !loginBody.accessToken) {
    console.log(`Admin login failed: HTTP ${login.status}`);
    console.log("UI manual test is primary: /admin/providers");
    return;
  }

  let hardFailure = false;
  for (const [label, providerType, providerCode] of providers) {
    const response = await fetch(`${baseUrl}/admin/providers/${providerType}/${providerCode}/test-connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginBody.accessToken}`,
      },
      body: "{}",
    });
    const body = await readJsonSafe(response);
    const configured = body.connectionMode === "real" || body.mode === "real" ? "configured" : "configured-or-mock";
    const tested = response.ok && body.success !== false ? "tested" : "not-tested";
    const latency = typeof body.latencyMs === "number" ? ` ${body.latencyMs}ms` : "";
    const status = body.statusCode ? ` upstream=${body.statusCode}` : "";
    const message = protect(body.messageZh || body.message || "");
    console.log(`${label}: ${configured} / ${tested}${latency}${status} ${message}`.trim());
    if (response.status >= 500 || (response.ok && body.success === false)) {
      hardFailure = true;
    }
  }

  if (hardFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(protect(error.message));
  process.exit(1);
});
'
