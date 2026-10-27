#!/usr/bin/env bash
# Shared by install, resume and update. Callers provide compose() and SCRIPT_DIR.

ensure_host_dependencies() {
  local command missing=() privilege=()
  for command in python3 openssl curl git; do
    command -v "${command}" >/dev/null 2>&1 || missing+=("${command}")
  done
  [[ "${#missing[@]}" -gt 0 ]] || return 0
  printf '需要安装系统工具：%s\n' "${missing[*]}"
  command -v apt-get >/dev/null 2>&1 || { echo "请安装 Python 3、OpenSSL、curl 和 Git 后重试。" >&2; return 1; }
  if [[ "$(id -u)" -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 || { echo "请使用 root 或可用 sudo 的账号安装。" >&2; return 1; }
    privilege=(sudo)
  fi
  "${privilege[@]}" env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 update || return 1
  "${privilege[@]}" env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y python3 openssl curl git ca-certificates || return 1
  for command in python3 openssl curl git; do command -v "${command}" >/dev/null || return 1; done
}

verify_public_https() {
  local attempt body
  for attempt in 1 2 3; do
    if curl -fsS --connect-timeout 5 --max-time 15 "https://${DOMAIN}" >/dev/null 2>&1 &&
       body="$(curl -fsS --connect-timeout 5 --max-time 15 "https://${DOMAIN}/api/service/health" 2>/dev/null)" &&
       printf '%s' "${body}" | python3 -c 'import json,sys; data=json.load(sys.stdin); sys.exit(0 if data.get("status")=="ok" else 1)' 2>/dev/null; then
      printf 'HTTPS 首页与 API 健康检查通过：https://%s\n' "${DOMAIN}"
      return 0
    fi
    if [[ "${attempt}" -lt 3 ]]; then
      printf '公网验证尚未通过，正在重试（%s/3）…\n' "${attempt}" >&2
      sleep 3
    fi
  done
  echo "容器已启动，但公网访问尚未验证通过，未完成上线。" >&2
  echo "请检查 Cloudflare 橙云、Full (strict)、域名解析、证书和 80/443 端口。" >&2
  echo "修正后运行 bash scripts/resume-install.sh；不要删除数据库或重新初始化。" >&2
  return 1
}
