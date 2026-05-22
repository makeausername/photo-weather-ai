"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProviderFieldPreset } from "../../../../../packages/shared/src/provider-fields";
import type { ProviderFieldDefinition } from "../../../../../packages/shared/src/provider-fields";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Select,
  SwitchRow,
  Textarea,
} from "../../../components/ui";
import { adminApiFetch, createProviderConnectionTestRequestInit } from "../admin-api";
import type { JsonValue, MockConnectionTestResult, SafeProviderConfig } from "../admin-api";

type ProvidersResponse = {
  readonly providers: SafeProviderConfig[];
  readonly realDevCallFlags?: RealDevCallFlags;
};

type AdminProvidersClientProps = {
  readonly providerType?: string;
};

type RowState = {
  readonly status: "idle" | "saving" | "saved" | "testing" | "error";
  readonly message?: string;
};

type FieldDrafts = Record<string, Record<string, string>>;
type ClearSecretDrafts = Record<string, Record<string, boolean>>;

type RealDevCallFlags = {
  readonly amap: boolean;
  readonly deepseek: boolean;
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

function isJsonObject(value: JsonValue | null | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyJson(value: JsonValue | null): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObject(input: string): Record<string, JsonValue> {
  const parsed = JSON.parse(input) as JsonValue;
  if (!isJsonObject(parsed)) {
    throw new Error("请填写 JSON 对象。");
  }

  return parsed;
}

function readJsonField(value: JsonValue | null | undefined, key: string): JsonValue | undefined {
  return isJsonObject(value) ? value[key] : undefined;
}

function fieldValueToInput(value: JsonValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function fieldDefaultToInput(field: ProviderFieldDefinition): string {
  return fieldValueToInput(field.defaultValue as JsonValue | undefined);
}

function readBooleanJson(value: JsonValue | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

function parseConfigFieldValue(
  field: ProviderFieldDefinition,
  value: string | undefined,
): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (field.control === "boolean") {
    return value === "true";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return field.defaultValue === undefined ? undefined : (field.defaultValue as JsonValue);
  }

  if (field.control === "number") {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${field.label} 必须是有效数字。`);
    }

    return parsed;
  }

  return trimmed;
}

function providerName(provider: SafeProviderConfig): string {
  return (
    providerDisplayLabels[`${provider.providerType}:${provider.providerCode}`] ||
    provider.displayName ||
    "未命名服务商"
  );
}

function getPresetFields(
  provider: SafeProviderConfig,
  target: "configJson" | "secretJson",
): readonly ProviderFieldDefinition[] {
  return (
    getProviderFieldPreset(provider.providerCode)?.fields.filter(
      (field) => field.target === target,
    ) ?? []
  );
}

function getNormalPresetFields(
  provider: SafeProviderConfig,
  target: "configJson" | "secretJson",
): readonly ProviderFieldDefinition[] {
  return getPresetFields(provider, target).filter((field) => !field.advanced);
}

function getAdvancedPresetFields(provider: SafeProviderConfig): readonly ProviderFieldDefinition[] {
  return getPresetFields(provider, "configJson").filter((field) => field.advanced);
}

function createConfigFieldDraft(provider: SafeProviderConfig): Record<string, string> {
  const configJson = isJsonObject(provider.configJson) ? provider.configJson : {};

  return Object.fromEntries(
    getPresetFields(provider, "configJson").map((field) => {
      const value =
        field.key === "basePath" && provider.providerCode === "local_storage"
          ? configJson.basePath ?? configJson.rootPath
          : configJson[field.key];

      return [
        field.key,
        value === undefined ? fieldDefaultToInput(field) : fieldValueToInput(value),
      ];
    }),
  );
}

function createConfigFieldDrafts(providers: readonly SafeProviderConfig[]): FieldDrafts {
  return Object.fromEntries(
    providers.map((provider) => [provider.id, createConfigFieldDraft(provider)]),
  );
}

function createEmptyFieldDrafts(providers: readonly SafeProviderConfig[]): FieldDrafts {
  return Object.fromEntries(providers.map((provider) => [provider.id, {}]));
}

function hasSavedSecret(provider: SafeProviderConfig, key: string): boolean {
  const value = readJsonField(provider.maskedSecretJson, key);
  return value !== undefined && value !== null && value !== "";
}

function maskedSecretLabel(provider: SafeProviderConfig, key: string): string {
  const value = readJsonField(provider.maskedSecretJson, key);
  if (value === undefined || value === null || value === "") {
    return "未保存";
  }

  return fieldValueToInput(value);
}

function listMaskedSecrets(provider: SafeProviderConfig): readonly [string, string][] {
  if (!isJsonObject(provider.maskedSecretJson)) {
    return [];
  }

  return Object.entries(provider.maskedSecretJson).map(([key, value]) => [
    key,
    fieldValueToInput(value),
  ]);
}

function stateClass(status: RowState["status"]): string {
  if (status === "error") {
    return "border-danger bg-card text-danger";
  }

  if (status === "saved") {
    return "border-success bg-card text-success";
  }

  if (status === "testing" || status === "saving") {
    return "border-primary bg-secondary text-secondary-foreground";
  }

  return "border-border bg-muted text-muted-foreground";
}

function getRealDevCallFlagKey(provider: SafeProviderConfig): keyof RealDevCallFlags | null {
  if (provider.providerType === "geo" && provider.providerCode === "amap") {
    return "amap";
  }

  if (provider.providerType === "ai" && provider.providerCode === "deepseek") {
    return "deepseek";
  }

  return null;
}

function isRealDevCallEnabled(provider: SafeProviderConfig, flags: RealDevCallFlags): boolean {
  const key = getRealDevCallFlagKey(provider);
  if (key) {
    return flags[key];
  }

  return readBooleanJson(readJsonField(provider.configJson, "realCallEnabled")) ?? false;
}

function readConfiguredRealCallEnabled(provider: SafeProviderConfig): boolean | undefined {
  return readBooleanJson(readJsonField(provider.configJson, "realCallEnabled"));
}

function primarySecretField(provider: SafeProviderConfig): ProviderFieldDefinition | undefined {
  return getPresetFields(provider, "secretJson")[0];
}

function providerHasSecret(provider: SafeProviderConfig): boolean | null {
  const secretField = primarySecretField(provider);
  return secretField ? hasSavedSecret(provider, secretField.key) : null;
}

function providerTestModeLabel(provider: SafeProviderConfig, realEnabled: boolean): string {
  if (realEnabled) {
    return "真实服务";
  }
  if (provider.providerType === "weather") {
    return "样例数据";
  }
  return "本地模拟";
}

function ProviderStatus({
  provider,
  flags,
}: {
  readonly provider: SafeProviderConfig;
  readonly flags: RealDevCallFlags;
}) {
  const realEnabled = isRealDevCallEnabled(provider, flags);
  const hasSecret = providerHasSecret(provider);

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted p-3 text-xs">
      <div className="flex flex-wrap gap-2">
        <Badge variant={provider.enabled ? "success" : "muted"}>
          服务状态：{provider.enabled ? "已启用" : "未启用"}
        </Badge>
        <Badge variant={realEnabled ? "warning" : "muted"}>
          真实调用：{realEnabled ? "已启用" : "未启用"}
        </Badge>
        <Badge variant={hasSecret === null ? "muted" : hasSecret ? "success" : "warning"}>
          密钥状态：{hasSecret === null ? "不需要" : hasSecret ? "已保存" : "未保存"}
        </Badge>
        <Badge variant={realEnabled ? "warning" : "muted"}>
          测试模式：{providerTestModeLabel(provider, realEnabled)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="muted">优先级 {provider.priority}</Badge>
        <Badge variant="muted">{providerTypeLabels[provider.providerType] ?? "其他服务商"}</Badge>
      </div>
    </div>
  );
}

function RealDevCallNotice({
  provider,
  flags,
}: {
  readonly provider: SafeProviderConfig;
  readonly flags: RealDevCallFlags;
}) {
  const key = getRealDevCallFlagKey(provider);
  if (!key) {
    return null;
  }

  const enabled = flags[key];
  const configured = readConfiguredRealCallEnabled(provider);

  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-card-foreground">真实调用：</span>
        <Badge variant={enabled ? "warning" : "muted"}>{enabled ? "已启用" : "未启用"}</Badge>
        {configured === undefined ? <Badge variant="muted">使用环境兜底</Badge> : null}
      </div>
      <p className="mt-1 text-xs leading-5">
        {enabled
          ? "当前将请求真实服务，请确认 Key 有效且注意调用费用。"
          : "当前测试连接为本地模拟，不会请求外部服务。"}
      </p>
    </div>
  );
}

function SavedSecretSummary({ provider }: { readonly provider: SafeProviderConfig }) {
  const maskedSecrets = listMaskedSecrets(provider);

  return (
    <div className="rounded-lg border border-border bg-muted p-3">
      <p className="text-sm font-semibold text-card-foreground">已保存密钥</p>
      {maskedSecrets.length > 0 ? (
        <dl className="mt-3 grid gap-2 text-xs leading-5">
          {maskedSecrets.map(([key, value]) => (
            <div key={key} className="grid gap-1 sm:grid-cols-[140px_1fr]">
              <dt className="font-semibold text-muted-foreground">{key}</dt>
              <dd className="break-all text-card-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          暂无已保存密钥。请在密钥配置中填写后保存。
        </p>
      )}
    </div>
  );
}

export function AdminProvidersClient({ providerType }: AdminProvidersClientProps) {
  const [providers, setProviders] = useState<SafeProviderConfig[]>([]);
  const [configDrafts, setConfigDrafts] = useState<Record<string, string>>({});
  const [configFieldDrafts, setConfigFieldDrafts] = useState<FieldDrafts>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [secretFieldDrafts, setSecretFieldDrafts] = useState<FieldDrafts>({});
  const [clearSecretDrafts, setClearSecretDrafts] = useState<ClearSecretDrafts>({});
  const [secretVisibility, setSecretVisibility] = useState<Record<string, Record<string, boolean>>>(
    {},
  );
  const [enabledDrafts, setEnabledDrafts] = useState<Record<string, boolean>>({});
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, number>>({});
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [stateByProvider, setStateByProvider] = useState<Record<string, RowState>>({});
  const [loadState, setLoadState] = useState<RowState>({ status: "idle" });
  const [realDevCallFlags, setRealDevCallFlags] = useState<RealDevCallFlags>({
    amap: false,
    deepseek: false,
  });

  const path = providerType
    ? `/admin/providers?providerType=${encodeURIComponent(providerType)}`
    : "/admin/providers";

  async function loadProviders() {
    setLoadState({ status: "saving", message: "正在加载服务商配置..." });
    try {
      const response = await adminApiFetch<ProvidersResponse>(path);
      setProviders(response.providers);
      setRealDevCallFlags(response.realDevCallFlags ?? { amap: false, deepseek: false });
      setConfigDrafts(
        Object.fromEntries(
          response.providers.map((provider) => [provider.id, stringifyJson(provider.configJson)]),
        ),
      );
      setConfigFieldDrafts(createConfigFieldDrafts(response.providers));
      setSecretDrafts(Object.fromEntries(response.providers.map((provider) => [provider.id, ""])));
      setSecretFieldDrafts(createEmptyFieldDrafts(response.providers));
      setClearSecretDrafts(
        Object.fromEntries(response.providers.map((provider) => [provider.id, {}])),
      );
      setSecretVisibility(
        Object.fromEntries(response.providers.map((provider) => [provider.id, {}])),
      );
      setEnabledDrafts(
        Object.fromEntries(response.providers.map((provider) => [provider.id, provider.enabled])),
      );
      setPriorityDrafts(
        Object.fromEntries(response.providers.map((provider) => [provider.id, provider.priority])),
      );
      setExpandedProviders({});
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
      const configJson = parseJsonObject(configDrafts[provider.id] ?? "{}");
      for (const field of getPresetFields(provider, "configJson")) {
        const value = configFieldDrafts[provider.id]?.[field.key];
        if (value !== undefined) {
          const parsedValue = parseConfigFieldValue(field, value);
          if (parsedValue !== undefined) {
            configJson[field.key] = parsedValue;
          }
        }
      }

      const payload: Record<string, unknown> = {
        enabled: enabledDrafts[provider.id] ?? provider.enabled,
        priority: priorityDrafts[provider.id] ?? provider.priority,
        configJson,
      };

      const secretJson: Record<string, JsonValue> = {};
      const secretDraft = secretDrafts[provider.id]?.trim();
      if (secretDraft) {
        Object.assign(secretJson, parseJsonObject(secretDraft));
      }

      for (const field of getPresetFields(provider, "secretJson")) {
        const value = secretFieldDrafts[provider.id]?.[field.key]?.trim();
        if (value) {
          secretJson[field.key] = value;
        }
      }

      const clearSecretKeys = Object.entries(clearSecretDrafts[provider.id] ?? {})
        .filter(([, shouldClear]) => shouldClear)
        .map(([key]) => key);

      if (Object.keys(secretJson).length > 0) {
        payload.secretJson = secretJson;
      }

      if (clearSecretKeys.length > 0) {
        payload.clearSecretKeys = clearSecretKeys;
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
      const realFlagKey = getRealDevCallFlagKey(response.provider);
      const configuredRealCall = readConfiguredRealCallEnabled(response.provider);
      if (realFlagKey && configuredRealCall !== undefined) {
        setRealDevCallFlags((current) => ({
          ...current,
          [realFlagKey]: configuredRealCall,
        }));
      }
      setConfigDrafts((current) => ({
        ...current,
        [provider.id]: stringifyJson(response.provider.configJson),
      }));
      setConfigFieldDrafts((current) => ({
        ...current,
        [provider.id]: createConfigFieldDraft(response.provider),
      }));
      setSecretDrafts((current) => ({
        ...current,
        [provider.id]: "",
      }));
      setSecretFieldDrafts((current) => ({
        ...current,
        [provider.id]: {},
      }));
      setClearSecretDrafts((current) => ({
        ...current,
        [provider.id]: {},
      }));
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "saved", message: "配置已保存" },
      }));
    } catch (error) {
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "error", message: (error as Error).message },
      }));
    }
  }

  async function testProvider(provider: SafeProviderConfig) {
    const realEnabled = isRealDevCallEnabled(provider, realDevCallFlags);
    setStateByProvider((current) => ({
      ...current,
      [provider.id]: {
        status: "testing",
        message: realEnabled ? "正在请求真实服务..." : "正在执行本地模拟测试...",
      },
    }));

    try {
      const result = await adminApiFetch<MockConnectionTestResult>(
        `/admin/providers/${provider.providerType}/${provider.providerCode}/test-connection`,
        createProviderConnectionTestRequestInit(),
      );
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "saved", message: result.message || "测试连接成功。" },
      }));
    } catch (error) {
      setStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "error", message: (error as Error).message },
      }));
    }
  }

  function toggleProviderEditor(providerId: string) {
    setExpandedProviders((current) => ({
      ...current,
      [providerId]: !current[providerId],
    }));
  }

  function updateConfigField(providerId: string, key: string, value: string) {
    setConfigFieldDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? {}),
        [key]: value,
      },
    }));
  }

  function updateSecretField(providerId: string, key: string, value: string) {
    setSecretFieldDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? {}),
        [key]: value,
      },
    }));
  }

  function renderConfigField(provider: SafeProviderConfig, field: ProviderFieldDefinition) {
    const value = configFieldDrafts[provider.id]?.[field.key] ?? fieldDefaultToInput(field);

    if (field.control === "boolean") {
      return (
        <SwitchRow
          key={field.key}
          label={field.label}
          description={field.helpText}
          checked={value === "true"}
          onChange={(checked) => updateConfigField(provider.id, field.key, String(checked))}
        />
      );
    }

    if (field.control === "select") {
      return (
        <FormField key={field.key} label={field.label} hint={field.helpText}>
          <Select
            value={value}
            onChange={(event) => updateConfigField(provider.id, field.key, event.target.value)}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
      );
    }

    return (
      <FormField key={field.key} label={field.label} hint={field.helpText}>
        <Input
          type={field.control === "number" ? "number" : "text"}
          value={value}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => updateConfigField(provider.id, field.key, event.target.value)}
        />
      </FormField>
    );
  }

  function toggleSecretVisibility(providerId: string, key: string) {
    setSecretVisibility((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? {}),
        [key]: !(current[providerId]?.[key] ?? false),
      },
    }));
  }

  function toggleClearSecret(providerId: string, key: string) {
    setClearSecretDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? {}),
        [key]: !(current[providerId]?.[key] ?? false),
      },
    }));
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
        {providerTabs.map((tab) => {
          const active =
            (!providerType && tab.href === "/admin/providers") ||
            (providerType ? tab.href.endsWith(`/${providerType}`) : false);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "border-primary bg-secondary text-secondary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary hover:bg-secondary hover:text-primary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {loadState.message ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${stateClass(loadState.status)}`}>
          {loadState.message}
        </div>
      ) : null}

      {Object.entries(groupedProviders).map(([group, groupProviders]) => (
        <Card key={group} className="overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">{providerTypeLabels[group] ?? "其他服务商"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{groupProviders.length} 个服务商</p>
            </div>
            <Badge variant="muted">高德和 DeepSeek 可在此显式启用真实调用</Badge>
          </div>

          <div className="grid gap-4 p-5 xl:grid-cols-2">
            {groupProviders.map((provider) => {
              const preset = getProviderFieldPreset(provider.providerCode);
              const configFields = getNormalPresetFields(provider, "configJson");
              const advancedConfigFields = getAdvancedPresetFields(provider);
              const secretFields = getPresetFields(provider, "secretJson");
              const state = stateByProvider[provider.id];
              const isExpanded = expandedProviders[provider.id] ?? false;

              return (
                <article
                  key={provider.id}
                  className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold">{providerName(provider)}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        代码：{provider.providerCode}
                      </p>
                    </div>
                    <ProviderStatus provider={provider} flags={realDevCallFlags} />
                  </div>

                  {preset?.helpText ? (
                    <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground">
                      {preset.helpText}
                    </p>
                  ) : null}

                  <RealDevCallNotice provider={provider} flags={realDevCallFlags} />

                  <SavedSecretSummary provider={provider} />

                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" onClick={() => toggleProviderEditor(provider.id)}>
                      {isExpanded ? "收起配置" : "编辑配置"}
                    </Button>
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

                  {isExpanded ? (
                    <div className="grid gap-5 rounded-lg border border-border bg-muted p-4">
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

                      <section className="grid gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-card-foreground">基础配置</h4>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            用于服务商地址、模型、Bucket、Region 等非密钥配置。
                          </p>
                        </div>
                        {configFields.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {configFields.map((field) => renderConfigField(provider, field))}
                          </div>
                        ) : (
                          <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                            该服务商暂无预设基础配置项，可在高级配置中补充 JSON。
                          </p>
                        )}
                      </section>

                      <section className="grid gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-card-foreground">密钥配置</h4>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            密钥不会回填原文；留空则保持现有密钥不变。保存后仅显示脱敏结果。
                          </p>
                        </div>
                        {secretFields.length > 0 ? (
                          <div className="grid gap-3">
                            {secretFields.map((field) => {
                              const visible = secretVisibility[provider.id]?.[field.key] ?? false;
                              const clearSelected =
                                clearSecretDrafts[provider.id]?.[field.key] ?? false;
                              const saved = hasSavedSecret(provider, field.key);

                              return (
                                <FormField
                                  key={field.key}
                                  label={field.label}
                                  hint={
                                    <span>
                                      {field.helpText ? `${field.helpText} ` : ""}
                                      已保存：{maskedSecretLabel(provider, field.key)}
                                    </span>
                                  }
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <Input
                                      type={field.password && !visible ? "password" : "text"}
                                      value={secretFieldDrafts[provider.id]?.[field.key] ?? ""}
                                      placeholder={field.placeholder ?? "留空则保持现有密钥不变"}
                                      disabled={clearSelected}
                                      onChange={(event) =>
                                        updateSecretField(
                                          provider.id,
                                          field.key,
                                          event.target.value,
                                        )
                                      }
                                    />
                                    {field.password ? (
                                      <Button
                                        variant="secondary"
                                        onClick={() =>
                                          toggleSecretVisibility(provider.id, field.key)
                                        }
                                      >
                                        {visible ? "隐藏" : "显示"}
                                      </Button>
                                    ) : null}
                                    {saved ? (
                                      <Button
                                        variant={clearSelected ? "danger" : "secondary"}
                                        onClick={() => toggleClearSecret(provider.id, field.key)}
                                      >
                                        {clearSelected ? "取消清除" : "清除"}
                                      </Button>
                                    ) : null}
                                  </div>
                                </FormField>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                            该服务商暂无预设密钥项。
                          </p>
                        )}
                      </section>

                      <details className="rounded-lg border border-border bg-card p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-card-foreground">
                          高级配置
                        </summary>
                        <div className="mt-4 grid gap-4">
                          {advancedConfigFields.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {advancedConfigFields.map((field) =>
                                renderConfigField(provider, field),
                              )}
                            </div>
                          ) : null}

                          <FormField label="基础配置 JSON">
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

                          <FormField
                            label="额外密钥 JSON"
                            hint="仅填写要新增或更新的密钥字段；留空表示不更新密钥。"
                          >
                            <Textarea
                              placeholder="留空则保持现有密钥不变"
                              value={secretDrafts[provider.id] ?? ""}
                              onChange={(event) =>
                                setSecretDrafts((current) => ({
                                  ...current,
                                  [provider.id]: event.target.value,
                                }))
                              }
                            />
                          </FormField>
                        </div>
                      </details>

                      <div className="flex flex-wrap justify-end gap-3">
                        <Button
                          variant="secondary"
                          onClick={() => toggleProviderEditor(provider.id)}
                        >
                          取消
                        </Button>
                        <Button onClick={() => void saveProvider(provider)}>保存配置</Button>
                      </div>
                    </div>
                  ) : null}
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
