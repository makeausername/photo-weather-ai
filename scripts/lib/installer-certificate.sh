#!/usr/bin/env bash

read_pem_block() {
  local kind="$1" destination="$2" value="" end_marker="" size=0
  ui_note "粘贴完整${kind}，包含 BEGIN / END 行；输入不回显，结束行后按回车。"
  : > "${destination}"
  while IFS= read -r -s value; do
    value="${value%$'\r'}"
    size=$((size + ${#value} + 1))
    ((size <= 262144)) || { warn "内容超过允许大小，请检查是否粘贴了正确文件。"; return 1; }
    if [[ -z "${end_marker}" ]]; then
      [[ -z "${value}" ]] && continue
      case "${kind}:${value}" in
        '证书:-----BEGIN CERTIFICATE-----') end_marker='-----END CERTIFICATE-----' ;;
        '私钥:-----BEGIN PRIVATE KEY-----') end_marker='-----END PRIVATE KEY-----' ;;
        '私钥:-----BEGIN RSA PRIVATE KEY-----') end_marker='-----END RSA PRIVATE KEY-----' ;;
        '私钥:-----BEGIN EC PRIVATE KEY-----') end_marker='-----END EC PRIVATE KEY-----' ;;
        *) warn "开头不是有效的 PEM ${kind}，已停止导入。"; return 1 ;;
      esac
    fi
    printf '%s\n' "${value}" >> "${destination}"
    if [[ "${value}" == "${end_marker}" ]]; then printf '\n' >&2; return 0; fi
  done
  warn "输入已结束，${kind}尚未完整，已停止导入。"
  return 1
}

import_origin_certificate() (
  # Stage and validate before replacing existing files; interrupted input leaves them intact.
  umask 077
  local staging choice cert_path key_path
  staging="$(mktemp -d "${PROJECT_ROOT}/deploy/.certificate.XXXXXX")" || return 1
  trap 'rm -rf -- "${staging}"' EXIT
  ui_note "在 Cloudflare → SSL/TLS → 源服务器 → 创建证书，选择 PEM 格式。"
  ui_note "证书须覆盖 ${DOMAIN}；已有有效证书也可直接导入。"
  printf '\n  1  直接粘贴证书和私钥（推荐）\n  2  从服务器现有文件导入\n\n' >&2
  choice="$(ui_input '证书导入方式' '1')" || return 1
  case "${choice}" in
    1)
      read_pem_block 证书 "${staging}/origin.pem" || return 1
      read_pem_block 私钥 "${staging}/origin.key" || return 1
      ;;
    2)
      cert_path="$(prompt_required '证书文件路径')" || return 1
      key_path="$(prompt_required '私钥文件路径')" || return 1
      [[ -r "${cert_path}" && -r "${key_path}" ]] || { warn '文件不可读，原证书未改动。'; return 1; }
      cat -- "${cert_path}" > "${staging}/origin.pem" || return 1
      cat -- "${key_path}" > "${staging}/origin.key" || return 1
      ;;
    *) warn '请输入 1 或 2。'; return 1 ;;
  esac
  if ! ORIGIN_CERT_DIR="${staging}" bash "${SCRIPT_DIR}/check-cloudflare.sh" >/dev/null 2>&1; then
    warn '证书校验失败：需匹配域名、剩余有效期至少 7 天，且使用配对的无密码私钥。原证书未改动。'
    return 1
  fi
  mkdir -p deploy/certs || return 1
  chmod 700 deploy/certs || return 1
  mv -- "${staging}/origin.pem" deploy/certs/origin.pem || return 1
  mv -- "${staging}/origin.key" deploy/certs/origin.key || return 1
  chmod 600 deploy/certs/origin.key deploy/certs/origin.pem
)

prepare_origin_certificate() {
  section 4 'Cloudflare 与证书'
  ui_note '先完成 Cloudflare 中的以下设置，安装器不会修改你的 Cloudflare 账号：'
  printf '  · 域名 A 记录指向本机公网 IP，开启橙云代理\n  · SSL/TLS 选择 Full (strict)\n  · /api/* 和 /admin* 绕过缓存，不启用全站缓存\n  · 服务器放行 80/443，保留 SSH 管理通道\n\n' >&2
  if bash "${SCRIPT_DIR}/check-cloudflare.sh" >/dev/null 2>&1; then
    ok '已有证书通过域名、有效期和私钥配对检查。'
  else
    while ! import_origin_certificate; do
      ask_yes_no '重新导入证书' 'y' || return 1
    done
    ok '证书已安全保存，无需手工编辑配置文件。'
  fi
}
