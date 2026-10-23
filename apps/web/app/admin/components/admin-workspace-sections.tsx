import { Card } from "../../../components/ui";

export function AdminHostingNote() {
  return (
    <Card className="aw-hosting-note">
      <h2>域名与 CDN</h2>
      <p>域名解析、HTTPS 和缓存规则在 Cloudflare 控制台管理。</p>
      <p>天气和地图凭据在对应服务页配置；后台不需要填写 Cloudflare 密钥。</p>
      <a
        className="aw-text-link"
        href="https://dash.cloudflare.com/"
        target="_blank"
        rel="noreferrer"
      >
        打开 Cloudflare 控制台 ↗
      </a>
    </Card>
  );
}
