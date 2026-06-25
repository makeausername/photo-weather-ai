import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemePreferenceController } from "../components/theme-toggle";
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
  var storageKey = "photo_weather_theme";
  var systemThemeQuery = "(prefers-color-scheme: dark)";

  function getSystemTheme() {
    if (typeof window.matchMedia === "function" && window.matchMedia(systemThemeQuery).matches) {
      return "dark";
    }

    return "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  try {
    var storedTheme = window.localStorage.getItem(storageKey);
    var preference =
      storedTheme === "system" || storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : "system";
    var theme = preference === "system" ? getSystemTheme() : preference;
    applyTheme(theme);
  } catch (error) {
    applyTheme("light");
  }
})();
`;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemePreferenceController />
        {children}
      </body>
    </html>
  );
}
