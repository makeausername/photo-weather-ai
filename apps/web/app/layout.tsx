import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "逐光天气 - 风光摄影出行判断工具",
  description: "面向风光摄影出行的地点、天气窗口与风险判断工具。",
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
