import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAndStoreThemePreference,
  applyThemePreference,
  readStoredThemePreference,
  themeStorageKey,
  watchThemePreference,
} from "../components/theme-toggle";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("theme preference behavior", () => {
  it("defaults to system when localStorage is empty", () => {
    const browser = installThemeBrowser({ systemDark: true });

    expect(readStoredThemePreference()).toBe("system");
    expect(applyThemePreference(readStoredThemePreference())).toBe("dark");
    expect(browser.documentElement.dataset.theme).toBe("dark");
    expect(browser.documentElement.style.colorScheme).toBe("dark");
  });

  it("defaults invalid stored values to system", () => {
    const browser = installThemeBrowser({ storedTheme: "blue", systemDark: false });

    expect(readStoredThemePreference()).toBe("system");
    expect(applyThemePreference(readStoredThemePreference())).toBe("light");
    expect(browser.documentElement.dataset.theme).toBe("light");
    expect(browser.documentElement.style.colorScheme).toBe("light");
  });

  it("applies the current dark system preference", () => {
    const browser = installThemeBrowser({ storedTheme: "system", systemDark: true });

    expect(applyThemePreference(readStoredThemePreference())).toBe("dark");
    expect(browser.documentElement.dataset.theme).toBe("dark");
    expect(browser.documentElement.style.colorScheme).toBe("dark");
  });

  it("applies the current light system preference", () => {
    const browser = installThemeBrowser({ storedTheme: "system", systemDark: false });

    expect(applyThemePreference(readStoredThemePreference())).toBe("light");
    expect(browser.documentElement.dataset.theme).toBe("light");
    expect(browser.documentElement.style.colorScheme).toBe("light");
  });

  it("applies a manual light preference", () => {
    const browser = installThemeBrowser({ storedTheme: "light", systemDark: true });

    expect(applyThemePreference(readStoredThemePreference())).toBe("light");
    expect(browser.documentElement.dataset.theme).toBe("light");
    expect(browser.documentElement.style.colorScheme).toBe("light");
  });

  it("applies a manual dark preference", () => {
    const browser = installThemeBrowser({ storedTheme: "dark", systemDark: false });

    expect(applyThemePreference(readStoredThemePreference())).toBe("dark");
    expect(browser.documentElement.dataset.theme).toBe("dark");
    expect(browser.documentElement.style.colorScheme).toBe("dark");
  });

  it("stores the selected theme preference instead of the effective system theme", () => {
    const browser = installThemeBrowser({ systemDark: true });

    expect(applyAndStoreThemePreference("system")).toBe("dark");
    expect(browser.localStorage.getItem(themeStorageKey)).toBe("system");
    expect(browser.documentElement.dataset.theme).toBe("dark");

    expect(applyAndStoreThemePreference("light")).toBe("light");
    expect(browser.localStorage.getItem(themeStorageKey)).toBe("light");
    expect(browser.documentElement.dataset.theme).toBe("light");

    expect(applyAndStoreThemePreference("dark")).toBe("dark");
    expect(browser.localStorage.getItem(themeStorageKey)).toBe("dark");
    expect(browser.documentElement.dataset.theme).toBe("dark");
  });

  it("updates automatically when system preference changes in system mode", () => {
    const browser = installThemeBrowser({ storedTheme: "system", systemDark: false });
    const cleanup = watchThemePreference(readStoredThemePreference());

    expect(browser.documentElement.dataset.theme).toBe("light");

    browser.setSystemDark(true);
    expect(browser.documentElement.dataset.theme).toBe("dark");
    expect(browser.documentElement.style.colorScheme).toBe("dark");

    cleanup();
    browser.setSystemDark(false);
    expect(browser.documentElement.dataset.theme).toBe("dark");
  });
});

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function installThemeBrowser({
  storedTheme,
  systemDark = false,
}: {
  readonly storedTheme?: string;
  readonly systemDark?: boolean;
}) {
  const localStorage = createLocalStorageMock();
  const documentElement = {
    dataset: {} as Record<string, string>,
    style: {} as { colorScheme?: string },
  };
  const listeners = new Set<(event: Pick<MediaQueryListEvent, "matches">) => void>();
  let mediaMatches = systemDark;
  const mediaQueryList = {
    get matches() {
      return mediaMatches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      if (event === "change") {
        listeners.add(listener as unknown as (event: Pick<MediaQueryListEvent, "matches">) => void);
      }
    }),
    removeEventListener: vi.fn((event: string, listener: EventListener) => {
      if (event === "change") {
        listeners.delete(
          listener as unknown as (event: Pick<MediaQueryListEvent, "matches">) => void,
        );
      }
    }),
    addListener: vi.fn((listener: (event: Pick<MediaQueryListEvent, "matches">) => void) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: (event: Pick<MediaQueryListEvent, "matches">) => void) => {
      listeners.delete(listener);
    }),
  };

  if (storedTheme !== undefined) {
    localStorage.setItem(themeStorageKey, storedTheme);
  }

  vi.stubGlobal("document", { documentElement });
  vi.stubGlobal("window", {
    localStorage,
    matchMedia: vi.fn(() => mediaQueryList),
  });

  return {
    documentElement,
    localStorage,
    setSystemDark(nextSystemDark: boolean) {
      mediaMatches = nextSystemDark;
      for (const listener of listeners) {
        listener({ matches: mediaMatches });
      }
    },
  };
}
