"use client";
import { useAdminRequest } from "./admin-data-context";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Select,
  Textarea,
} from "../../../components/ui";
import type { JsonValue, SafeSystemSetting } from "../admin-api";
import {
  AdminActionToast,
  type AdminActionFeedback,
  type AdminActionFeedbackInput,
} from "./admin-action-feedback";

type SettingsResponse = {
  readonly settings: SafeSystemSetting[];
};

type SaveState = {
  readonly status: "idle" | "saving" | "saved" | "error";
  readonly message?: string;
};

const groupLabels: Record<string, string> = { site: "基本信息", locale: "地区与语言" };
const settingText: Record<string, { readonly label: string; readonly description: string }> = {
  "site.name": { label: "网站名称", description: "本站的名称。" },
  "site.baseUrl": { label: "网站地址", description: "网站对外访问的完整地址，包含 https://。" },
  "locale.defaultLanguage": { label: "默认语言", description: "当前界面支持简体中文，请填写 zh-CN。" },
  "locale.defaultTimezone": { label: "默认时区", description: "用于前台预报日期与时间显示，北京时间为 Asia/Shanghai。" },
};

export function selectWebsiteSettings(settings: readonly SafeSystemSetting[]) {
  return Object.keys(settingText).flatMap((key) => {
    const setting = settings.find((item) => item.key === key);
    return setting ? [setting] : [];
  });
}

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

function settingDisplayName(setting: SafeSystemSetting): string {
  return (settingText[setting.key]?.label ?? setting.label) || setting.key;
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
  const adminApiFetch = useAdminRequest();
  const [settings, setSettings] = useState<SafeSystemSetting[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [statusByKey, setStatusByKey] = useState<Record<string, SaveState>>({});
  const [loadState, setLoadState] = useState<SaveState>({ status: "idle" });
  const [actionToast, setActionToast] = useState<AdminActionFeedback | null>(null);
  const actionToastId = useRef(0);

  function showActionToast(feedback: AdminActionFeedbackInput) {
    actionToastId.current += 1;
    setActionToast({ id: actionToastId.current, ...feedback });
  }

  async function loadSettings() {
    setLoadState({ status: "saving", message: "正在加载系统设置..." });
    try {
      const response = await adminApiFetch<SettingsResponse>("/admin/settings");
      const visibleSettings = selectWebsiteSettings(response.settings);
      setSettings(visibleSettings);
      setEditValues(
        Object.fromEntries(
          visibleSettings.map((setting) => [setting.key, stringifyValue(setting.valueJson)]),
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
    const settingName = settingDisplayName(setting);
    setStatusByKey((current) => ({
      ...current,
      [setting.key]: { status: "saving", message: "正在保存..." },
    }));
    showActionToast({
      variant: "saving",
      title: "保存系统设置",
      message: `正在保存「${settingName}」...`,
    });

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
      window.dispatchEvent(new Event("site-settings-updated"));
      setEditValues((current) => ({
        ...current,
        [setting.key]: stringifyValue(response.setting.valueJson),
      }));
      setStatusByKey((current) => ({
        ...current,
        [setting.key]: { status: "saved", message: "已保存。" },
      }));
      showActionToast({
        variant: "success",
        title: "保存系统设置",
        message: `「${settingName}」已保存。`,
      });
    } catch (error) {
      const message = (error as Error).message;
      setStatusByKey((current) => ({
        ...current,
        [setting.key]: { status: "error", message },
      }));
      showActionToast({
        variant: "error",
        title: "保存系统设置",
        message: `「${settingName}」保存失败：${message}`,
      });
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
      <AdminActionToast feedback={actionToast} onDismiss={() => setActionToast(null)} />
      {loadState.message && loadState.status !== "saved" ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${stateClass(loadState.status)}`}>
          {loadState.message}
        </div>
      ) : null}

      <div className="grid min-w-0 max-w-full gap-4" data-admin-settings-groups="sections">
        {Object.entries(groupedSettings).map(([group, groupSettings]) => (
          <Card key={group} className="min-w-0 max-w-full overflow-hidden">
            <div className="aw-card-heading">
              <h2>{groupLabels[group] ?? "基本信息"}</h2>
            </div>
            <div className="divide-y divide-border">
              {groupSettings.map((setting) => {
                const text = settingText[setting.key] ?? {
                  label: setting.label || setting.key,
                  description: setting.description ?? setting.key,
                };
                const saveState = statusByKey[setting.key];

                return (
                  <article key={setting.key} className="aw-setting-row">
                    <div className="grid content-start gap-3">
                      <div>
                        <h3 className="font-bold text-foreground">{text.label}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {text.description}
                        </p>
                      </div>
                      {!setting.isEditable && (
                        <span className="text-xs text-muted-foreground">只读</span>
                      )}
                    </div>

                    <div className="aw-setting-control">
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
                        <FormField label="配置值" className="aw-setting-field">
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
                        <FormField label="配置值" className="aw-setting-field">
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
                            !setting.isEditable ||
                            statusByKey[setting.key]?.status === "saving" ||
                            editValues[setting.key] === stringifyValue(setting.valueJson)
                          }
                          onClick={() => void saveSetting(setting)}
                        >
                          {statusByKey[setting.key]?.status === "saving" ? "保存中..." : "保存"}
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
    </div>
  );
}
