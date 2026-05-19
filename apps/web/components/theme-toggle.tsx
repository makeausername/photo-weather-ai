"use client";

import { useEffect, useState } from "react";
import { cn } from "./ui";

type Theme = "light" | "dark";

const storageKey = "photo_weather_theme";

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function getInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    const current = document.documentElement.dataset.theme;
    if (current === "dark" || current === "light") {
      return current;
    }
  }

  return "light";
}

type ThemeToggleProps = {
  readonly className?: string;
  readonly compact?: boolean;
};

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const nextTheme = stored === "dark" || stored === "light" ? stored : getInitialTheme();
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }, []);

  function updateTheme(nextTheme: Theme) {
    applyTheme(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-border bg-card shadow-sm",
        compact ? "p-0.5" : "p-1",
        className,
      )}
      role="group"
      aria-label="主题切换"
    >
      {(["light", "dark"] as const).map((item) => {
        const active = theme === item;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            onClick={() => updateTheme(item)}
            className={cn(
              "rounded-md font-medium transition",
              compact ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {item === "light" ? "浅色" : "深色"}
          </button>
        );
      })}
    </div>
  );
}
