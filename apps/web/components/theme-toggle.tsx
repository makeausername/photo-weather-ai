"use client";

import { useEffect, useState } from "react";
import { cn } from "./ui";

export type EffectiveTheme = "light" | "dark";
export type ThemePreference = "system" | EffectiveTheme;

export const themeStorageKey = "photo_weather_theme";

export const themePreferenceOptions = ["system", "light", "dark"] as const;

export const themePreferenceLabels: Record<ThemePreference, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

const compactThemePreferenceLabels: Record<ThemePreference, string> = {
  system: "系统",
  light: "浅",
  dark: "深",
};

const themePreferenceChangeEvent = "photo-weather-theme-preference-change";
const systemThemeQuery = "(prefers-color-scheme: dark)";

function getThemeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  return value === "system" || value === "light" || value === "dark" ? value : "system";
}

export function readStoredThemePreference(
  storage: Pick<Storage, "getItem"> | null = getThemeStorage(),
): ThemePreference {
  try {
    return normalizeThemePreference(storage?.getItem(themeStorageKey));
  } catch {
    return "system";
  }
}

function getSystemThemeMedia(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia(systemThemeQuery);
}

export function getSystemTheme(): EffectiveTheme {
  return getSystemThemeMedia()?.matches ? "dark" : "light";
}

export function resolveEffectiveTheme(preference: ThemePreference): EffectiveTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function applyEffectiveTheme(theme: EffectiveTheme): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function applyThemePreference(preference: ThemePreference): EffectiveTheme {
  const theme = resolveEffectiveTheme(preference);
  applyEffectiveTheme(theme);
  return theme;
}

function emitThemePreferenceChange(preference: ThemePreference): void {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent === "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(themePreferenceChangeEvent, {
      detail: { preference },
    }),
  );
}

export function storeThemePreference(preference: ThemePreference): void {
  try {
    getThemeStorage()?.setItem(themeStorageKey, preference);
  } catch {
    return;
  }
}

export function applyAndStoreThemePreference(preference: ThemePreference): EffectiveTheme {
  storeThemePreference(preference);
  const theme = applyThemePreference(preference);
  emitThemePreferenceChange(preference);
  return theme;
}

export function watchThemePreference(
  preference: ThemePreference,
  onEffectiveThemeChange?: (theme: EffectiveTheme) => void,
): () => void {
  const initialTheme = applyThemePreference(preference);
  onEffectiveThemeChange?.(initialTheme);

  if (preference !== "system") {
    return () => undefined;
  }

  const media = getSystemThemeMedia();

  if (!media) {
    return () => undefined;
  }

  const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
    const nextTheme = event.matches ? "dark" : "light";
    applyEffectiveTheme(nextTheme);
    onEffectiveThemeChange?.(nextTheme);
  };

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }

  media.addListener(handleChange);
  return () => media.removeListener(handleChange);
}

function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPreference(readStoredThemePreference());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") {
      return undefined;
    }

    function handlePreferenceChange(event: Event) {
      const nextPreference = normalizeThemePreference(
        (event as CustomEvent<{ preference?: string }>).detail?.preference,
      );
      setPreference(nextPreference);
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key === themeStorageKey) {
        setPreference(normalizeThemePreference(event.newValue));
      }
    }

    window.addEventListener(themePreferenceChangeEvent, handlePreferenceChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(themePreferenceChangeEvent, handlePreferenceChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) {
      return undefined;
    }

    return watchThemePreference(preference);
  }, [mounted, preference]);

  function updatePreference(nextPreference: ThemePreference) {
    applyAndStoreThemePreference(nextPreference);
    setPreference(nextPreference);
  }

  return { preference, updatePreference };
}

export function ThemePreferenceController() {
  useThemePreference();
  return null;
}

type ThemeToggleProps = {
  readonly className?: string;
  readonly compact?: boolean;
};

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { preference, updatePreference } = useThemePreference();

  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-border bg-card shadow-sm",
        compact ? "p-0.5" : "p-1",
        className,
      )}
      role="group"
      aria-label="主题偏好"
    >
      {themePreferenceOptions.map((item) => {
        const active = preference === item;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            onClick={() => updatePreference(item)}
            className={cn(
              "rounded-md font-medium transition",
              compact ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {compact ? compactThemePreferenceLabels[item] : themePreferenceLabels[item]}
          </button>
        );
      })}
    </div>
  );
}

type ThemePreferenceMenuSectionProps = {
  readonly className?: string;
};

export function ThemePreferenceMenuSection({ className }: ThemePreferenceMenuSectionProps) {
  const { preference, updatePreference } = useThemePreference();

  return (
    <div className={cn("border-t border-border pt-1", className)}>
      <div className="px-3 py-1 text-xs font-semibold text-muted-foreground">外观</div>
      <div className="grid gap-0.5" role="group" aria-label="外观">
        {themePreferenceOptions.map((item) => {
          const active = preference === item;
          return (
            <button
              key={item}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm font-medium transition",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
              onClick={() => updatePreference(item)}
            >
              <span>{themePreferenceLabels[item]}</span>
              {active ? (
                <span className="text-xs text-primary" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
