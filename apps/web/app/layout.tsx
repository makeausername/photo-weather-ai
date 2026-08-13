import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://zhuguangweather.com"),
  title: "逐光天气 - 风光摄影出行判断工具",
  description: "面向风光摄影出行的地点、天气窗口与风险判断工具。",
  keywords: ["风光摄影", "天气判断", "云海", "朝霞", "晚霞", "星空", "银河", "摄影出行"],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "逐光天气",
    title: "逐光天气 - 风光摄影出行判断工具",
    description: "输入拍摄地点，生成出行判断、最佳窗口、优先题材和主要风险。",
    url: "https://zhuguangweather.com",
  },
  twitter: {
    card: "summary",
    title: "逐光天气 - 风光摄影出行判断工具",
    description: "面向风光摄影出行的地点、天气窗口与风险判断工具。",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

type RootLayoutProps = {
  readonly children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
