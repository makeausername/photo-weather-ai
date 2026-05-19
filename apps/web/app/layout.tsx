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

const themeScript = `
(function() {
  try {
    var storedTheme = window.localStorage.getItem("photo_weather_theme");
    var theme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
