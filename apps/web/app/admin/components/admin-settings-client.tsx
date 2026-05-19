"use client";

import { useEffect, useMemo, useState } from "react";
import { adminApiFetch } from "../admin-api";
import type { JsonValue, SafeSystemSetting } from "../admin-api";

type SettingsResponse = {
  readonly settings: SafeSystemSetting[];
};

type SaveState = {
  readonly status: "idle" | "saving" | "saved" | "error";
  readonly message?: string;
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

function StatusPill({ children }: { readonly children: string }) {
  return <span className="adminPill">{children}</span>;
}

const groupLabels: Record<string, string> = {
  site: "站点",
  locale: "本地化",
  map: "地图",
  ai: "AI",
  weather: "天气",
  scoring: "评分",
  storage: "存储",
  billing: "支付",
  deployment: "部署",
};

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

  return (
    <div className="adminStack">
      {loadState.message ? (
        <div className={`adminInlineStatus ${loadState.status}`}>{loadState.message}</div>
      ) : null}
      {Object.entries(groupedSettings).map(([group, groupSettings]) => (
        <section key={group} className="adminSection">
          <div className="adminSectionHeader">
            <h2>{groupLabels[group] ?? group}</h2>
            <span>{groupSettings.length} 项设置</span>
          </div>
          <div className="settingsTable">
            {groupSettings.map((setting) => (
              <article key={setting.key} className="settingsRow">
                <div className="settingsMeta">
                  <h3>{setting.label}</h3>
                  <p>{setting.description ?? setting.key}</p>
                  <div className="adminPillRow">
                    <StatusPill>{setting.key}</StatusPill>
                    <StatusPill>{setting.valueType}</StatusPill>
                    <StatusPill>{setting.isPublic ? "公开" : "服务端"}</StatusPill>
                    <StatusPill>{setting.isSecret ? "密钥" : "普通"}</StatusPill>
                    <StatusPill>{setting.isEditable ? "可编辑" : "锁定"}</StatusPill>
                  </div>
                </div>
                <div className="settingsEditor">
                  <textarea
                    value={editValues[setting.key] ?? ""}
                    disabled={!setting.isEditable}
                    aria-label={`${setting.key} 的配置值`}
                    onChange={(event) =>
                      setEditValues((current) => ({
                        ...current,
                        [setting.key]: event.target.value,
                      }))
                    }
                  />
                  <div className="adminActions">
                    <button
                      type="button"
                      disabled={
                        !setting.isEditable || statusByKey[setting.key]?.status === "saving"
                      }
                      onClick={() => void saveSetting(setting)}
                    >
                      保存
                    </button>
                    {statusByKey[setting.key]?.message ? (
                      <span className={`adminInlineStatus ${statusByKey[setting.key]?.status}`}>
                        {statusByKey[setting.key]?.message}
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
