"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  SwitchRow,
  Textarea,
} from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type { JsonValue, MockConnectionTestResult, SafeProviderConfig } from "../admin-api";

type ProvidersResponse = {
  readonly providers: SafeProviderConfig[];
};

type AdminProvidersClientProps = {
  readonly providerType?: string;
};

type RowState = {
  readonly status: "idle" | "saving" | "saved" | "testing" | "error";
  readonly message?: string;
};

const providerTypeLabels: Record<string, string> = {
  ai: "AI 服务商",
  weather: "天气服务商",
  geo: "地理服务商",
  terrain: "地形服务商",
  storage: "存储服务商",
  billing: "支付服务商",
  sms: "短信服务商",
};

const providerDisplayLabels: Record<string, string> = {
  "ai:deepseek": "DeepSeek",
  "weather:qweather": "和风天气",
  "weather:open_meteo": "Open-Meteo",
  "geo:amap": "高德地图",
  "storage:local_storage": "本地存储",
  "storage:aliyun_oss": "阿里云 OSS",
  "storage:tencent_cos": "腾讯云 COS",
  "storage:s3_compatible": "S3 兼容存储",
};

const providerTabs = [
  { href: "/admin/providers", label: "全部" },
  { href: "/admin/providers/weather", label: "天气" },
  { href: "/admin/providers/geo", label: "地图" },
  { href: "/admin/providers/ai", label: "AI" },
  { href: "/admin/providers/storage", label: "存储" },
] as const;

function stringifyJson(value: JsonValue | null): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObject(input: string): Record<string, JsonValue> {
  const parsed = JSON.parse(input) as JsonValue;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("请填写 JSON 对象。");
  }

  return parsed as Record<string, JsonValue>;
}

function providerName(provider: SafeProviderConfig): string {
  return (
    providerDisplayLabels[`${provider.providerType}:${provider.providerCode}`] ||
    provider.displayName ||
    "未命名服务商"
  );
}

function stateClass(status: RowState["status"]): string {
  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "saved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "testing" || status === "saving") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function ProviderStatus({ provider }: { readonly provider: SafeProviderConfig }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={provider.enabled ? "success" : "muted"}>
        {provider.enabled ? "已启用" : "未启用"}
      </Badge>
      <Badge variant="muted">优先级 {provider.priority}</Badge>
      <Badge variant="muted">{providerTypeLabels[provider.providerType] ?? "其他服务商"}</Badge>
    </div>
  );
}

export function AdminProvidersClient({ providerType }: AdminProvidersClientProps) {
  const [providers, setProviders] = useState<SafeProviderConfig[]>([]);
  const [configDrafts, setConfigDrafts] = useState<Record<string, string>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [enabledDrafts, setEnabledDrafts] = useState<Record<string, boolean>>({});
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, number>>({});
  const [stateByProvider, setStateByProvider] = useState<Record<string, RowState>>({});
  const [loadState, setLoadState] = useState<RowState>({ status: "idle" });

  const path = providerType
    ? `/admin/providers?providerType=${encodeURIComponent(providerType)}`
    : "/admin/providers";

  async function loadProviders() {
    setLoadState({ status: "saving", message: "正在加载服务商配置..." });
    try {
      const response = await adminApiFetch<ProvidersResponse>(path);
      setProviders(response.providers);
      setConfigDrafts(
        Object.fromEntries(
          response.providers.map((provider) => [provider.id, stringifyJson(provider.configJson)]),
        ),
      );
      setSecretDrafts(Object.fromEntries(response.providers.map((provider) => [provider.id, ""])));
      setEnabledDrafts(
        Object.fromEntries(response.providers.map((provider) => [provider.id, provider.enabled])),
      );
      setPriorityDrafts(
        Object.fromEntries(response.providers.map((provider) => [provider.id, provider.priority])),
      );
      setLoadState({ status: "saved", message: "服务商配置已加载。" });
    } catch (error) {
      setLoadState({ status: "error", message: (error as Error).message });
    }
  }

  useEffect(() => {
    void loadProviders();
  }, [path]);

  const groupedProviders = useMemo(() => {
    return providers.reduce<Record<string, SafeProviderConfig[]>>((groups, provider) => {
      const groupProviders = groups[provider.providerType] ?? [];
      groupProviders.push(provider);
      groups[provider.providerType] = groupProviders;
      return groups;
    }, {});
  }, [providers]);

  async function saveProvider(provider: SafeProviderConfig) {
    setStateByProvider((current) => ({
      ...current,
      [provider.id]: { status: "saving", message: "正在保存..." },
    }));

    try {
      const payload: Record<string, unknown> = {
        enabled: enabledDrafts[provider.id] ?? provider.enabled,
        priority: priorityDrafts[provider.id] ?? provider.priority,
        configJson: parseJsonObject(configDrafts[provider.id] ?? "{}"),
      };
      const secretDraft = secretDrafts[provider.id]?.trim();
      if (secretDraft) {
        payload.secretJson = parseJsonObject(secretDraft);
      }

      const response = await adminApiFetch<{ readonly provider: SafeProviderConfig }>(
        `/admin/providers/${provider.providerType}/${provider.providerCode}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
      setProviders((current) =>
        current.map((item) => (item.id === provider.id ? response.provider : item)),
      );
      setSecretDrafts((current) => ({
        ...current,
        [provider.id]: "",
      }));
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "saved", message: "已保存。" },
      }));
    } catch (error) {
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "error", message: (error as Error).message },
      }));
    }
  }

  async function testProvider(provider: SafeProviderConfig) {
    setStateByProvider((current) => ({
      ...current,
      [provider.id]: { status: "testing", message: "正在执行本地模拟测试..." },
    }));

    try {
      const result = await adminApiFetch<MockConnectionTestResult>(
        `/admin/providers/${provider.providerType}/${provider.providerCode}/test-connection`,
        { method: "POST" },
      );
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "saved", message: result.message || "测试通过。" },
      }));
    } catch (error) {
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "error", message: (error as Error).message },
      }));
    }
  }

  if (providers.length === 0 && loadState.status === "error") {
    return (
      <Card>
        <EmptyState
          title="无法加载服务商配置"
          description={
            loadState.message ?? "请确认后台 API 已启动，并且当前账号拥有服务商配置权限。"
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {providerTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="whitespace-nowrap rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-primary"
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {loadState.message ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${stateClass(loadState.status)}`}>
          {loadState.message}
        </div>
      ) : null}

      {Object.entries(groupedProviders).map(([group, groupProviders]) => (
        <Card key={group} className="overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">{providerTypeLabels[group] ?? "其他服务商"}</h2>
              <p className="mt-1 text-sm text-muted">{groupProviders.length} 个服务商</p>
            </div>
            <Badge variant="muted">不会调用真实外部服务</Badge>
          </div>

          <div className="grid gap-4 p-5 xl:grid-cols-2">
            {groupProviders.map((provider) => {
              const state = stateByProvider[provider.id];

              return (
                <article
                  key={provider.id}
                  className="grid gap-4 rounded-xl border border-border bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold">{providerName(provider)}</h3>
                      <p className="mt-1 text-sm text-muted">代码：{provider.providerCode}</p>
                    </div>
                    <ProviderStatus provider={provider} />
                  </div>

                  <SwitchRow
                    label="启用该服务商"
                    description="仅保存配置开关，不触发真实连接。"
                    checked={enabledDrafts[provider.id] ?? provider.enabled}
                    onChange={(checked) =>
                      setEnabledDrafts((current) => ({
                        ...current,
                        [provider.id]: checked,
                      }))
                    }
                  />

                  <FormField label="优先级">
                    <Input
                      type="number"
                      value={priorityDrafts[provider.id] ?? provider.priority}
                      onChange={(event) =>
                        setPriorityDrafts((current) => ({
                          ...current,
                          [provider.id]: Number(event.target.value),
                        }))
                      }
                    />
                  </FormField>

                  <FormField label="配置 JSON">
                    <Textarea
                      value={configDrafts[provider.id] ?? "{}"}
                      onChange={(event) =>
                        setConfigDrafts((current) => ({
                          ...current,
                          [provider.id]: event.target.value,
                        }))
                      }
                    />
                  </FormField>

                  <FormField label="密钥 JSON" hint="留空表示不更新密钥；保存后只显示脱敏结果。">
                    <Textarea
                      placeholder='{"apiKey":"新的密钥值"}'
                      value={secretDrafts[provider.id] ?? ""}
                      onChange={(event) =>
                        setSecretDrafts((current) => ({
                          ...current,
                          [provider.id]: event.target.value,
                        }))
                      }
                    />
                  </FormField>

                  <div className="rounded-lg border border-border bg-white p-3">
                    <p className="text-sm font-semibold text-slate-700">已脱敏密钥</p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted">
                      {stringifyJson(provider.maskedSecretJson)}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => void saveProvider(provider)}>保存</Button>
                    <Button variant="secondary" onClick={() => void testProvider(provider)}>
                      测试连接
                    </Button>
                    {state?.message ? (
                      <span
                        className={`rounded-lg border px-3 py-2 text-sm ${stateClass(state.status)}`}
                      >
                        {state.message}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </Card>
      ))}

      {providers.length === 0 && loadState.status !== "saving" ? (
        <Card>
          <EmptyState title="暂无服务商配置" description="初始化数据写入后会显示在这里。" />
        </Card>
      ) : null}
    </div>
  );
}
