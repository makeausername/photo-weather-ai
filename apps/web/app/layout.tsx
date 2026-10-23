import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "./free-weather.css";
import "./admin-workspace.css";
import { PublicFrame } from "../components/public-frame";
import { PublicSiteSettings } from "../components/public-site-settings";
import { readPublicSiteConfig } from "../lib/public-site-config";

export async function generateMetadata(): Promise<Metadata> {
  const config = await readPublicSiteConfig();
  return {
  metadataBase: new URL(config.baseUrl),
  title: `${config.name} - 风光摄影出行判断工具`,
  description: "面向风光摄影出行的地点、天气窗口与风险判断工具。",
  keywords: ["风光摄影", "天气判断", "云海", "朝霞", "晚霞", "星空", "银河", "摄影出行"],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: config.name,
    title: `${config.name} - 风光摄影出行判断工具`,
    description: "输入拍摄地点，生成出行判断、最佳窗口、优先题材和主要风险。",
    url: config.baseUrl,
  },
  twitter: {
    card: "summary",
    title: `${config.name} - 风光摄影出行判断工具`,
    description: "面向风光摄影出行的地点、天气窗口与风险判断工具。",
  },
  icons: {
    icon: "/favicon.svg",
  },
  };
}

type RootLayoutProps = {
  readonly children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const config = await readPublicSiteConfig();
  return (
    <html lang={config.language} data-theme="light" suppressHydrationWarning>
      <body>
        <PublicSiteSettings initial={config}><PublicFrame>{children}</PublicFrame></PublicSiteSettings>
      </body>
    </html>
  );
}
