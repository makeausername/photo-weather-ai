"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Select,
  Textarea,
} from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type { JsonValue, SafeSystemSetting } from "../admin-api";

type SettingsResponse = {
  readonly settings: SafeSystemSetting[];
};

type SaveState = {
  readonly status: "idle" | "saving" | "saved" | "error";
  readonly message?: string;
};

const groupLabels: Record<string, string> = {
  site: "站点",
  locale: "本地化",
  map: "地图",
  ai: "智能解读",
  weather: "天气",
  scoring: "评分",
  storage: "存储",
  billing: "支付",
  deployment: "部署",
};

const valueTypeLabels: Record<string, string> = {
  string: "文本",
  number: "数字",
  boolean: "布尔值",
  json: "JSON",
  select: "选项",
  url: "URL",
};

const settingText: Record<string, { readonly label: string; readonly description: string }> = {
  "site.name": {
    label: "站点名称",
    description: "前台和后台显示的产品名称。",
  },
  "site.baseUrl": {
    label: "站点访问地址",
    description: "部署后用于生成链接和回调地址的公开 URL。",
  },
  "locale.defaultLanguage": {
    label: "默认语言",
    description: "产品默认使用简体中文。",
  },
  "locale.defaultTimezone": {
    label: "默认时区",
    description: "日期时间默认按北京时间显示。",
  },
  "billing.defaultCurrency": {
    label: "默认币种",
    description: "未来交易和价格默认使用人民币。",
  },
  "map.defaultProvider": {
    label: "默认地图服务商",
    description: "中国大陆默认使用高德地图。",
  },
  "map.displayCoordinateSystem": {
    label: "地图显示坐标系",
    description: "地图展示使用 GCJ-02，天气、天文和地形计算使用 WGS84。",
  },
  "ai.defaultProvider": {
    label: "默认智能解读服务商",
    description: "解读流程使用的默认服务商代码。",
  },
  "ai.defaultModel": {
    label: "默认解读模型",
    description: "解读请求使用的默认模型标识。",
  },
  "weather.primaryProvider": {
    label: "主天气服务商",
    description: "未来预报流程使用的主天气服务商代码。",
  },
  "weather.secondaryProvider": {
    label: "备用天气服务商",
    description: "未来预报流程使用的备用天气服务商代码。",
  },
  "scoring.defaultVersion": {
    label: "默认评分版本",
    description: "未来天气评分任务使用的评分规则版本。",
  },
  "storage.provider": {
    label: "存储服务商",
    description: "未来生成素材和报告使用的默认存储后端。",
  },
  "billing.enabled": {
    label: "启用支付",
    description: "预留给未来支付系统的总开关。",
  },
  "deployment.mode": {
    label: "部署模式",
    description: "用于未来安装器和后台诊断的部署方案。",
  },
};

function stringifyValue(value: JsonValue): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function parseSettingValue(valueType: string, input: string): JsonValue {
  if (valueType === "boolean") {
    if (input !== "true" && input !== "false") {
      throw new Error("布尔值请填写 true 或 false。");
    }
    return input === "true";
  }

  if (valueType === "number") {
    const value = Number(input);
    if (!Number.isFinite(value)) {
      throw new Error("请填写有效数字。");
    }
    return value;
  }

  if (valueType === "json") {
    return JSON.parse(input) as JsonValue;
  }

  return input;
}

function stateClass(status: SaveState["status"]): string {
  if (status === "error") {
    return "border-danger bg-card text-danger";
  }

  if (status === "saved") {
    return "border-success bg-card text-success";
  }

  return "border-border bg-muted text-muted-foreground";
}

export function AdminSettingsClient() {
  const [settings, setSettings] = useState<SafeSystemSetting[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [statusByKey, setStatusByKey] = useState<Record<string, SaveState>>({});
  const [loadState, setLoadState] = useState<SaveState>({ status: "idle" });

  async function loadSettings() {
    setLoadState({ status: "saving", message: "正在加载系统设置..." });
    try {
      const response = await adminApiFetch<SettingsResponse>("/admin/settings");
      setSettings(response.settings);
      setEditValues(
        Object.fromEntries(
          response.settings.map((setting) => [setting.key, stringifyValue(setting.valueJson)]),
        ),
      );
      setLoadState({ status: "saved", message: "系统设置已加载。" });
    } catch (error) {
      setLoadState({ status: "error", message: (error as Error).message });
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const groupedSettings = useMemo(() => {
    return settings.reduce<Record<string, SafeSystemSetting[]>>((groups, setting) => {
      const groupSettings = groups[setting.group] ?? [];
      groupSettings.push(setting);
      groups[setting.group] = groupSettings;
      return groups;
    }, {});
  }, [settings]);

  async function saveSetting(setting: SafeSystemSetting) {
    setStatusByKey((current) => ({
      ...current,
      [setting.key]: { status: "saving", message: "正在保存..." },
    }));

    try {
      const valueJson = parseSettingValue(setting.valueType, editValues[setting.key] ?? "");
      const response = await adminApiFetch<{ readonly setting: SafeSystemSetting }>(
        `/admin/settings/${encodeURIComponent(setting.key)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ valueJson }),
        },
      );
      setSettings((current) =>
        current.map((item) => (item.key === setting.key ? response.setting : item)),
      );
      setStatusByKey((current) => ({
        ...current,
        [setting.key]: { status: "saved", message: "已保存。" },
      }));
    } catch (error) {
      setStatusByKey((current) => ({
        ...current,
        [setting.key]: { status: "error", message: (error as Error).message },
      }));
    }
  }

  if (settings.length === 0 && loadState.status === "error") {
    return (
      <Card>
        <EmptyState
          title="无法加载系统设置"
          description={loadState.message ?? "请确认后台 API 已启动，并且当前账号拥有系统设置权限。"}
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {loadState.message ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${stateClass(loadState.status)}`}>
          {loadState.message}
        </div>
      ) : null}

      {Object.entries(groupedSettings).map(([group, groupSettings]) => (
        <Card key={group} className="overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">{groupLabels[group] ?? "其他设置"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{groupSettings.length} 项设置</p>
            </div>
            <Badge variant="muted">系统参数</Badge>
          </div>

          <div className="divide-y divide-border">
            {groupSettings.map((setting) => {
              const text = settingText[setting.key] ?? {
                label: setting.label || setting.key,
                description: setting.description ?? setting.key,
              };
              const saveState = statusByKey[setting.key];

              return (
                <article key={setting.key} className="grid gap-5 p-5 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="grid content-start gap-3">
                    <div>
                      <h3 className="font-bold text-foreground">{text.label}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="muted">{setting.key}</Badge>
                      <Badge variant="muted">{valueTypeLabels[setting.valueType] ?? "文本"}</Badge>
                      <Badge variant={setting.isPublic ? "success" : "muted"}>
                        {setting.isPublic ? "公开" : "服务端"}
                      </Badge>
                      {setting.isSecret ? <Badge variant="warning">密钥</Badge> : null}
                      <Badge variant={setting.isEditable ? "default" : "muted"}>
                        {setting.isEditable ? "可编辑" : "锁定"}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {setting.valueType === "json" ? (
                      <details className="rounded-lg border border-border bg-muted p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-card-foreground">
                          高级配置
                        </summary>
                        <FormField label="配置值" className="mt-4">
                          <Textarea
                            value={editValues[setting.key] ?? ""}
                            disabled={!setting.isEditable}
                            aria-label={`${text.label} 的配置值`}
                            onChange={(event) =>
                              setEditValues((current) => ({
                                ...current,
                                [setting.key]: event.target.value,
                              }))
                            }
                          />
                        </FormField>
                      </details>
                    ) : setting.valueType === "boolean" ? (
                      <FormField label="配置值">
                        <Select
                          value={editValues[setting.key] ?? "false"}
                          disabled={!setting.isEditable}
                          aria-label={`${text.label} 的配置值`}
                          onChange={(event) =>
                            setEditValues((current) => ({
                              ...current,
                              [setting.key]: event.target.value,
                            }))
                          }
                        >
                          <option value="true">启用</option>
                          <option value="false">停用</option>
                        </Select>
                      </FormField>
                    ) : (
                      <FormField label="配置值">
                        <Input
                          type={setting.valueType === "url" ? "url" : "text"}
                          inputMode={setting.valueType === "number" ? "decimal" : undefined}
                          value={editValues[setting.key] ?? ""}
                          disabled={!setting.isEditable}
                          aria-label={`${text.label} 的配置值`}
                          onChange={(event) =>
                            setEditValues((current) => ({
                              ...current,
                              [setting.key]: event.target.value,
                            }))
                          }
                        />
                      </FormField>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        disabled={
                          !setting.isEditable || statusByKey[setting.key]?.status === "saving"
                        }
                        onClick={() => void saveSetting(setting)}
                      >
                        保存
                      </Button>
                      {saveState?.message ? (
                        <span
                          className={`rounded-lg border px-3 py-2 text-sm ${stateClass(saveState.status)}`}
                        >
                          {saveState.message}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
