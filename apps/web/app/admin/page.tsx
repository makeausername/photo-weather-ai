import Link from "next/link";
import { AdminShell } from "./components/admin-shell";

const adminEntryPoints = [
  {
    href: "/admin/settings",
    title: "系统设置",
    description: "维护站点、默认语言、地图、天气、存储和部署基础配置。",
  },
  {
    href: "/admin/providers",
    title: "服务商配置",
    description: "管理 DeepSeek、和风天气、Open-Meteo、高德地图和存储服务商占位配置。",
  },
  {
    href: "/admin/locations",
    title: "地点与机位",
    description: "维护中国大陆风光摄影地点、机位、坐标、海拔、交通和安全备注。",
  },
  {
    href: "/admin/audit",
    title: "审计日志",
    description: "查看后台配置和资料维护操作记录，敏感信息已脱敏。",
  },
] as const;

export default function AdminPage() {
  return (
    <AdminShell title="控制台" description="自托管风光摄影天气系统的基础运营后台。">
      <div className="adminOverviewGrid">
        {adminEntryPoints.map((entry) => (
          <Link key={entry.href} href={entry.href} className="adminOverviewItem">
            <span>{entry.title}</span>
            <p>{entry.description}</p>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
