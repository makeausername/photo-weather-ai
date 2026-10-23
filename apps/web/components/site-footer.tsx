"use client";
import Link from "next/link";
import { usePublicSiteSettings } from "./public-site-settings";
import { siteConfig } from "../site-config";
export function SiteFooter() {
  const { config } = usePublicSiteSettings();
  return (
    <footer id="site-footer" className="pw-footer" aria-label={`${config.name}页脚`}>
      <span>{config.name} · 免费开放，无广告、无订阅</span>
      <span>
        天气数据：
        <a href="https://www.qweather.com/" target="_blank" rel="noreferrer">
          和风天气
        </a>{" "}
        /{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        · 地名：GeoNames
      </span>
      <nav aria-label="网站说明">
        <Link href="/help">使用说明</Link>
        <Link href="/privacy">隐私</Link>
        <Link href="/terms">条款</Link>
        <Link href="/disclaimer">预报说明</Link>
        <a href={siteConfig.legal.icpUrl} target="_blank" rel="noreferrer">
          {siteConfig.legal.icpNumber}
        </a>
      </nav>
    </footer>
  );
}
