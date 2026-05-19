"use client";

import { useEffect, useMemo, useState } from "react";
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

const providerTypeLabels: Record<string, string> = {
  ai: "AI 服务商",
  weather: "天气服务商",
  geo: "地理服务商",
  terrain: "地形服务商",
  storage: "存储服务商",
  billing: "支付服务商",
  sms: "短信服务商",
};

function ProviderStatus({ provider }: { readonly provider: SafeProviderConfig }) {
  return (
    <div className="adminPillRow">
      <span className={provider.enabled ? "adminPill success" : "adminPill"}>
        {provider.enabled ? "已启用" : "未启用"}
      </span>
      <span className="adminPill">优先级 {provider.priority}</span>
      <span className="adminPill">
        {providerTypeLabels[provider.providerType] ?? provider.providerType}
      </span>
      <span className="adminPill">{provider.providerCode}</span>
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
        [provider.id]: { status: "saved", message: result.message },
      }));
    } catch (error) {
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "error", message: (error as Error).message },
      }));
    }
  }

  return (
    <div className="adminStack">
      {loadState.message ? (
        <div className={`adminInlineStatus ${loadState.status}`}>{loadState.message}</div>
      ) : null}
      {Object.entries(groupedProviders).map(([group, groupProviders]) => (
        <section key={group} className="adminSection">
          <div className="adminSectionHeader">
            <h2>{providerTypeLabels[group] ?? group}</h2>
            <span>{groupProviders.length} 个服务商</span>
          </div>
          <div className="providerGrid">
            {groupProviders.map((provider) => (
              <article key={provider.id} className="providerCard">
                <div className="providerHeader">
                  <div>
                    <h3>{provider.displayName}</h3>
                    <p>{provider.providerCode}</p>
                  </div>
                  <label className="toggleRow">
                    <input
                      type="checkbox"
                      checked={enabledDrafts[provider.id] ?? provider.enabled}
                      onChange={(event) =>
                        setEnabledDrafts((current) => ({
                          ...current,
                          [provider.id]: event.target.checked,
                        }))
                      }
                    />
                    启用
                  </label>
                </div>
                <ProviderStatus provider={provider} />
                <label className="fieldLabel">
                  优先级
                  <input
                    type="number"
                    value={priorityDrafts[provider.id] ?? provider.priority}
                    onChange={(event) =>
                      setPriorityDrafts((current) => ({
                        ...current,
                        [provider.id]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="fieldLabel">
                  配置 JSON
                  <textarea
                    value={configDrafts[provider.id] ?? "{}"}
                    onChange={(event) =>
                      setConfigDrafts((current) => ({
                        ...current,
                        [provider.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="fieldLabel">
                  密钥 JSON
                  <textarea
                    placeholder='{"apiKey":"新的密钥值"}'
                    value={secretDrafts[provider.id] ?? ""}
                    onChange={(event) =>
                      setSecretDrafts((current) => ({
                        ...current,
                        [provider.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="maskedSecrets">
                  <span>已脱敏密钥</span>
                  <code>{stringifyJson(provider.maskedSecretJson)}</code>
                </div>
                <div className="adminActions">
                  <button type="button" onClick={() => void saveProvider(provider)}>
                    保存
                  </button>
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => void testProvider(provider)}
                  >
                    本地测试
                  </button>
                </div>
                {stateByProvider[provider.id]?.message ? (
                  <div className={`adminInlineStatus ${stateByProvider[provider.id]?.status}`}>
                    {stateByProvider[provider.id]?.message}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
