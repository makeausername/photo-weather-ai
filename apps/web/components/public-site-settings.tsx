"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { defaultPublicSiteConfig, type PublicSiteConfig } from "@photo-weather/shared";
import { publicApiFetch } from "./api-client";

const Context = createContext({ config: defaultPublicSiteConfig, refresh: async () => {} });
export const usePublicSiteSettings = () => useContext(Context);
export function PublicSiteSettings({ initial, children }: { initial: PublicSiteConfig; children: ReactNode }) {
  const [config, setConfig] = useState(initial);
  const pathname = usePathname();
  const refresh = useCallback(async () => {
    try { setConfig(await publicApiFetch<PublicSiteConfig>("/site/config", { cache: "no-store" })); }
    catch { /* Keep the last loaded public settings while offline. */ }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener("focus", update);
    window.addEventListener("site-settings-updated", update);
    return () => { window.removeEventListener("focus", update); window.removeEventListener("site-settings-updated", update); };
  }, [pathname, refresh]);
  useEffect(() => {
    document.documentElement.lang = config.language;
    document.title = `${config.name} - 风光摄影出行判断工具`;
  }, [config.name, config.language]);
  return <Context.Provider value={{ config, refresh }}>{children}</Context.Provider>;
}
