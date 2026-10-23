"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, Table } from "../../../components/ui";
import type { AdminAuditLog, SafeProviderConfig } from "../admin-api";
import { useAdminHref, useAdminPreview, useAdminRequest } from "./admin-data-context";
function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}
export function AdminDashboardClient() {
  const request = useAdminRequest();
  const preview = useAdminPreview();
  const hrefFor = useAdminHref();
  const [state, setState] = useState<{
    loaded: boolean;
    settingsOk: boolean;
    providers: SafeProviderConfig[];
    providersOk: boolean;
    auditLogs: AdminAuditLog[];
    auditOk: boolean;
  }>({
    loaded: false,
    settingsOk: false,
    providers: [],
    providersOk: false,
    auditLogs: [],
    auditOk: false,
  });
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      request<{ settings: unknown[] }>("/admin/settings"),
      request<{ providers: SafeProviderConfig[] }>("/admin/providers"),
      request<{ logs: AdminAuditLog[] }>("/admin/audit-logs?limit=5"),
    ]).then(([settings, providers, audit]) => {
      if (!cancelled)
        setState({
          loaded: true,
          settingsOk: settings.status === "fulfilled",
          providersOk: providers.status === "fulfilled",
          providers: providers.status === "fulfilled" ? providers.value.providers : [],
          auditOk: audit.status === "fulfilled",
          auditLogs: audit.status === "fulfilled" ? audit.value.logs : [],
        });
    });
    return () => {
      cancelled = true;
    };
  }, [request]);
  const weather = state.providers.filter(
    (p) => p.providerType === "weather" && ["qweather", "open_meteo"].includes(p.providerCode),
  );
  const amap = state.providers.find((p) => p.providerType === "geo" && p.providerCode === "amap");
  const metrics = [
    {
      title: "后台连接",
      value: !state.loaded
        ? "读取中"
        : preview
          ? "示例预览"
          : state.settingsOk
            ? "已连接"
            : "读取失败",
      note: preview ? "当前显示示例配置" : "配置接口与管理员权限",
    },
    {
      title: "天气数据源",
      value: state.providersOk
        ? `${weather.filter((p) => p.enabled).length} / ${weather.length}`
        : "—",
      note: "已启用 / 已读取的天气服务",
    },
    {
      title: "高德地图",
      value: state.providersOk ? (amap ? (amap.enabled ? "已启用" : "未启用") : "未配置") : "—",
      note: "仅配置开关，连接结果请单独测试",
    },
  ];
  return (
    <div className="grid gap-5">
      {state.loaded && (!state.settingsOk || !state.providersOk || !state.auditOk) && (
        <div role="status" className="aw-preview-notice">
          部分数据读取失败，请检查服务连接与管理员权限。
        </div>
      )}
      <div className="aw-overview-metrics">
        {metrics.map((item) => (
          <Card key={item.title} className="p-4">
            <p className="text-xs text-muted-foreground">{item.title}</p>
            <p className="my-2 text-xl font-semibold tracking-tight">{item.value}</p>
            <p className="text-[11px] leading-5 text-muted-foreground">{item.note}</p>
          </Card>
        ))}
      </div>
      <div className="aw-dashboard-services">
        <Card className="p-4">
          <div className="aw-section-title">
            <div>
              <h2>服务状态</h2>
              <p>启用状态不代表连接成功，请在配置页测试。</p>
            </div>
            <Link className="aw-text-link" href={hrefFor("/admin/providers/weather")}>
              天气配置 →
            </Link>
          </div>
          {[
            {
              code: "qweather",
              name: "和风天气",
              note: "天气预报、实况与预警",
              href: "/admin/providers/weather",
            },
            {
              code: "open_meteo",
              name: "Open-Meteo",
              note: "多模型天气与海拔数据",
              href: "/admin/providers/weather",
            },
            {
              code: "amap",
              name: "高德地图",
              note: "地图底图、坐标与地点服务",
              href: "/admin/providers/geo",
            },
          ].map((item) => {
            const provider = state.providers.find((p) => p.providerCode === item.code);
            return (
              <div className="aw-service-row" key={item.code}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.note}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={provider?.enabled ? "success" : "muted"}>
                    {!state.providersOk ? "未读取" : provider?.enabled ? "已启用" : "待配置"}
                  </Badge>
                  <Link className="aw-text-link" href={hrefFor(item.href)}>
                    配置
                  </Link>
                </div>
              </div>
            );
          })}
        </Card>
        <Card className="p-4">
          <div className="aw-section-title">
            <div>
              <h2>开始配置</h2>
              <p>接入数据后，即可检查前台预报。</p>
            </div>
          </div>
          <div className="aw-setup-list">
            {[
              [
                "/admin/providers/weather",
                "连接天气数据",
                "配置和风天气与 Open-Meteo，保存后测试连接。",
              ],
              [
                "/admin/providers/geo",
                "配置高德地图",
                "填写 Web 服务和地图 JS 凭据，核对域名白名单。",
              ],
              ["/", "检查前台效果", "核对霞光、星空、云海地图和天气页面。"],
            ].map(([href, title, note]) => (
              <Link key={href} href={hrefFor(href!)}>
                <span>
                  <strong>{title}</strong>
                  <small>{note}</small>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="aw-section-title mb-0 border-b border-border px-5 py-4">
          <div>
            <h2>最近操作</h2>
            <p>配置变更与后台任务记录。</p>
          </div>
          <Link className="aw-text-link" href={hrefFor("/admin/audit")}>
            查看全部 →
          </Link>
        </div>
        {state.auditLogs.length > 0 ? (
          <Table>
            <thead className="bg-muted text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">时间</th>
                <th className="px-3 py-2.5">操作</th>
                <th className="px-3 py-2.5">对象</th>
                <th className="px-3 py-2.5">操作者</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-2.5 text-card-foreground">{formatDate(log.createdAt)}</td>
                  <td className="px-3 py-2.5 font-medium">{log.actionLabel}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <span className="font-medium text-card-foreground">{log.targetLabel}</span>
                    {log.targetSummary ? (
                      <span className="block text-xs">{log.targetSummary}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{log.actorLabel}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="aw-empty">
            {!state.loaded
              ? "正在读取操作记录…"
              : preview
                ? "预览暂无操作记录"
                : state.auditOk
                  ? "暂无操作记录，保存配置后会显示在这里。"
                  : "日志读取失败"}
          </div>
        )}
      </Card>
    </div>
  );
}
