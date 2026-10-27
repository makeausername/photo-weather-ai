#!/usr/bin/env bash
set -Eeuo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"
if [[ -z "${DOMAIN:-}" || ! "${DOMAIN}" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9]$ ]]; then
  echo "请先加载有效 DOMAIN。" >&2; exit 1
fi
cert_dir="${ORIGIN_CERT_DIR:-deploy/certs}"
for item in deploy/Caddyfile deploy/cloudflare.caddy "${cert_dir}/origin.pem" "${cert_dir}/origin.key"; do
  if [[ ! -s "${item}" ]]; then echo "缺少 ${item}，请按免费版上线文档准备 Cloudflare Origin CA 证书。" >&2; exit 1; fi
done
command -v openssl >/dev/null || { echo "缺少 openssl，无法检查源站证书。" >&2; exit 1; }
openssl x509 -in "${cert_dir}/origin.pem" -noout -checkend 604800 >/dev/null
openssl x509 -in "${cert_dir}/origin.pem" -noout -checkhost "${DOMAIN}" >/dev/null
cert_key="$(openssl x509 -in "${cert_dir}/origin.pem" -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256)"
private_key="$(openssl pkey -in "${cert_dir}/origin.key" -passin pass: -pubout -outform DER | openssl dgst -sha256)"
[[ "${cert_key}" == "${private_key}" ]] || { echo "源站证书和私钥不匹配。" >&2; exit 1; }
chmod 700 "${cert_dir}"
chmod 600 "${cert_dir}/origin.key"
echo "Cloudflare 源站证书域名、有效期及密钥匹配检查通过。"
