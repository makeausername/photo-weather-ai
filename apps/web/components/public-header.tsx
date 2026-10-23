"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WeatherGlyph, type WeatherGlyphName } from "./weather-glyph";
import { usePublicSiteSettings } from "./public-site-settings";
const links: { href: string; label: string; icon: WeatherGlyphName }[] = [
  { href: "/", label: "朝霞晚霞", icon: "sunset" },
  { href: "/astro", label: "星空", icon: "stars" },
  { href: "/map", label: "云海地图", icon: "map" },
  { href: "/weather", label: "天气", icon: "cloud" },
];
export const publicHeaderNavLabels = links.map((link) => link.label);
export const publicHeaderActionLabels = [] as const;
export function PublicHeader() {
  const { config } = usePublicSiteSettings();
  const pathname = usePathname();
  const active = pathname === "/glow" ? "/" : pathname === "/cloud-sea" ? "/map" : pathname;
  return (
    <header className="pw-header">
      <Link className="pw-brand" href="/">
        <WeatherGlyph name="sunrise" />
        <span>
          {config.name}<small>等一场好光，赴一场山海</small>
        </span>
      </Link>
      <nav className="pw-navigation" aria-label="主要导航">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active === link.href ? "page" : undefined}
          >
            <WeatherGlyph name={link.icon} />
            {link.label}
          </Link>
        ))}
      </nav>
      <span className="pw-free">无需注册 · 完全免费</span>
    </header>
  );
}
