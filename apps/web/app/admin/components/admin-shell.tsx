"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminSessionBadge } from "./admin-session-badge";
import { usePublicSiteSettings } from "../../../components/public-site-settings";
import { useAdminHref, useAdminPreview } from "./admin-data-context";

export const adminNavigation = [
  { href: "/admin", label: "运行总览", note: "服务状态与配置" },
  { href: "/admin/providers/weather", label: "天气数据", note: "和风天气 · Open-Meteo" },
  { href: "/admin/providers/geo", label: "高德地图", note: "底图与地点服务" },
  { href: "/admin/settings", label: "网站设置", note: "基本信息" },
  { href: "/admin/calibration", label: "预报校准", note: "实况标注与回放" },
  { href: "/admin/audit", label: "操作日志", note: "配置变更与任务记录" },
] as const;
function activeModule(pathname: string, href: string) {
  const path = pathname.replace(/^\/admin-preview(?=\/|$)/, "/admin");
  return href === "/admin" ? path === href : path === href || path.startsWith(`${href}/`);
}
function Navigation({ pathname }: { readonly pathname: string }) {
  const hrefFor = useAdminHref();
  return adminNavigation.map((item) => (
    <Link
      key={item.href}
      href={hrefFor(item.href)}
      className="aw-nav-link"
      aria-current={activeModule(pathname, item.href) ? "page" : undefined}
    >
      <strong>{item.label}</strong>
      <small>{item.note}</small>
    </Link>
  ));
}
export function MobileAdminNavigation({ pathname }: { readonly pathname: string }) {
  return (
    <nav className="aw-mobile-nav" aria-label="移动端后台导航">
      <Navigation pathname={pathname} />
    </nav>
  );
}
export function AdminShell({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const { config: siteSettings } = usePublicSiteSettings();
  const preview = useAdminPreview();
  const hrefFor = useAdminHref();
  return (
    <main className="admin-workspace">
      <aside className="aw-sidebar">
        <Link href={hrefFor("/admin")} className="aw-brand">
          <img src="/brand-mark.svg" alt="" width="38" height="38" />
          <span>
            <strong>{siteSettings.name}</strong>
            <small>管理后台</small>
          </span>
        </Link>
        <nav className="aw-desktop-nav" aria-label="后台主导航">
          <Navigation pathname={pathname} />
        </nav>
        <div className="aw-sidebar-note">
          <span>免费开放 · 无需注册</span>
        </div>
      </aside>
      <section className="aw-main">
        <header className="aw-topbar">
          <div className="aw-page-heading">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="aw-header-actions">
            <Link href="/">返回网站 ↗</Link>
            {preview ? <span className="aw-preview-tag">本地预览</span> : <AdminSessionBadge />}
          </div>
        </header>
        <MobileAdminNavigation pathname={pathname} />
        <div className="aw-content">
          {preview && (
            <details className="aw-preview-notice">
              <summary>本地界面预览</summary>
              <p>当前显示示例配置；保存、连接测试和校准任务不会执行。正式后台使用管理员登录。</p>
            </details>
          )}
          {children}
        </div>
      </section>
    </main>
  );
}
