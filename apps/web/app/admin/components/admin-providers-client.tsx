"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDeepSeekModeRuntimeDefaults,
  getProviderFieldPreset,
  normalizeDeepSeekAnalysisMode,
  type ProviderFieldDefinition,
} from "../../../../../packages/shared/src/provider-fields";
import type { JsonValue, MockConnectionTestResult, SafeProviderConfig } from "../admin-api";
import { adminApiFetch, createProviderConnectionTestRequestInit } from "../admin-api";
import { Badge, Button, EmptyState, FormField, Input, Select, cn } from "../../../components/ui";
import {
  isProviderSaveDisabled,
  isProviderTestDisabled,
  providerSaveButtonLabel,
  providerSaveErrorMessage,
  providerSaveSuccessMessage,
  providerTestButtonLabel,
  providerTestErrorMessage,
  providerTestSuccessMessage,
  type ProviderSaveFeedbackState,
} from "./provider-save-feedback";

type ProvidersResponse = {
  readonly providers: SafeProviderConfig[];
  readonly realDevCallFlags?: RealDevCallFlags;
};

type AdminProvidersClientProps = {
  readonly providerType?: string;
};

type ProviderGroupKey = "geo" | "weather" | "ai";
type ProviderKey =
  | "geo:amap"
  | "weather:qweather"
  | "weather:open_meteo"
  | "weather:meteoblue"
  | "ai:deepseek";
type RowState = ProviderSaveFeedbackState;
type FieldDrafts = Record<string, Record<string, string>>;
type ClearSecretDrafts = Record<string, Record<string, boolean>>;
type TestResultDrafts = Record<string, MockConnectionTestResult | undefined>;

type RealDevCallFlags = {
  readonly amap: boolean;
  readonly deepseek: boolean;
  readonly qweather: boolean;
  readonly openMeteo: boolean;
  readonly meteoblue: boolean;
};

type ProviderMeta = {
  readonly key: ProviderKey;
  readonly group: ProviderGroupKey;
  readonly displayName: string;
  readonly purpose: string;
  readonly capabilities: readonly string[];
  readonly requiredConfigKeys: readonly string[];
};

const defaultRealDevCallFlags: RealDevCallFlags = {
  amap: false,
  deepseek: false,
  qweather: false,
  openMeteo: false,
  meteoblue: false,
};

const providerOrder: readonly ProviderKey[] = [
  "geo:amap",
  "weather:qweather",
  "weather:open_meteo",
  "weather:meteoblue",
  "ai:deepseek",
];

const providerGroups = [
  {
    key: "geo",
    title: "地图与地理服务",
    description: "管理地点搜索、地理编码和坐标转换能力，密钥仅在服务端调用时使用。",
  },
  {
    key: "weather",
    title: "天气数据源",
    description: "管理真实天气测试和后续多源对照。保存配置不会触发外部请求。",
  },
  {
    key: "ai",
    title: "智能解读",
    description: "管理结果说明和文案生成能力，不参与天气、天文、地形或评分计算。",
  },
] as const satisfies readonly {
  readonly key: ProviderGroupKey;
  readonly title: string;
  readonly description: string;
}[];

const providerMeta: Record<ProviderKey, ProviderMeta> = {
  "geo:amap": {
    key: "geo:amap",
    group: "geo",
    displayName: "高德地图",
    purpose: "用于地点搜索、地理编码和坐标转换。",
    capabilities: ["地点搜索", "地理编码", "坐标转换"],
    requiredConfigKeys: [],
  },
  "weather:qweather": {
    key: "weather:qweather",
    group: "weather",
    displayName: "和风天气",
    purpose: "中国大陆主天气源，用于实况、逐小时预报、预警和空气质量。",
    capabilities: ["实时天气", "逐小时预报", "空气质量", "天气预警", "能见度"],
    requiredConfigKeys: ["apiHost", "language", "unit"],
  },
  "weather:open_meteo": {
    key: "weather:open_meteo",
    group: "weather",
    displayName: "Open-Meteo",
    purpose: "用于云层分层、露点、能见度和多模型交叉验证。",
    capabilities: ["逐小时预报", "云层分层", "能见度", "露点", "多模型交叉验证"],
    requiredConfigKeys: ["mode", "customerEndpoint"],
  },
  "weather:meteoblue": {
    key: "weather:meteoblue",
    group: "weather",
    displayName: "meteoblue",
    purpose: "meteoblue 可作为专业增强天气源，用于 Forecast API 真实测试和后续多源融合。",
    capabilities: ["Forecast API", "云层增强", "专业预报", "商业精度提升"],
    requiredConfigKeys: ["baseUrl", "packages"],
  },
  "ai:deepseek": {
    key: "ai:deepseek",
    group: "ai",
    displayName: "DeepSeek",
    purpose: "用于智能解读、文案生成和结果说明，不改写确定性评分。",
    capabilities: ["智能解读", "文案生成", "结果说明"],
    requiredConfigKeys: ["model"],
  },
};

const advancedHiddenKeys = new Set(["realCallEnabled", "analysisMode", "model"]);

function isJsonObject(value: JsonValue | null | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonField(value: JsonValue | null | undefined, key: string): JsonValue | undefined {
  return isJsonObject(value) ? value[key] : undefined;
}

function readStringJson(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
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
    return field.defaultValue === undefined ? "" : (field.defaultValue as JsonValue);
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

function providerIdentityKey(provider: SafeProviderConfig): string {
  return `${provider.providerType}:${provider.providerCode}`;
}

function isManagedProviderKey(key: string): key is ProviderKey {
  return Object.prototype.hasOwnProperty.call(providerMeta, key);
}

function getManagedProviderKey(provider: SafeProviderConfig): ProviderKey | null {
  const key = providerIdentityKey(provider);
  return isManagedProviderKey(key) ? key : null;
}

function getMeta(provider: SafeProviderConfig): ProviderMeta | null {
  const key = getManagedProviderKey(provider);
  return key ? providerMeta[key] : null;
}

function providerName(provider: SafeProviderConfig): string {
  return getMeta(provider)?.displayName ?? provider.displayName ?? "服务商";
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

function getFieldByKey(
  provider: SafeProviderConfig,
  key: string,
): ProviderFieldDefinition | undefined {
  return getPresetFields(provider, "configJson").find((field) => field.key === key);
}

function getRequiredConfigFields(provider: SafeProviderConfig): readonly ProviderFieldDefinition[] {
  const meta = getMeta(provider);
  if (!meta) {
    return [];
  }

  return meta.requiredConfigKeys
    .map((key) => getFieldByKey(provider, key))
    .filter((field): field is ProviderFieldDefinition => Boolean(field));
}

function getAdvancedConfigFields(provider: SafeProviderConfig): readonly ProviderFieldDefinition[] {
  const mainKeys = new Set(getMeta(provider)?.requiredConfigKeys ?? []);
  return getPresetFields(provider, "configJson").filter(
    (field) => !mainKeys.has(field.key) && !advancedHiddenKeys.has(field.key),
  );
}

function primarySecretField(provider: SafeProviderConfig): ProviderFieldDefinition | undefined {
  return getPresetFields(provider, "secretJson")[0];
}

function hasSavedSecret(provider: SafeProviderConfig, key: string): boolean {
  const value = readJsonField(provider.maskedSecretJson, key);
  return value !== undefined && value !== null && value !== "";
}

function maskedSecretLabel(provider: SafeProviderConfig, key: string): string {
  const value = readJsonField(provider.maskedSecretJson, key);
  return value === undefined || value === null || value === ""
    ? "未保存"
    : fieldValueToInput(value);
}

function createConfigFieldDraft(provider: SafeProviderConfig): Record<string, string> {
  const configJson = isJsonObject(provider.configJson) ? provider.configJson : {};
  const deepSeekMode =
    provider.providerCode === "deepseek"
      ? normalizeDeepSeekAnalysisMode(
          readStringJson(configJson.analysisMode),
          readStringJson(configJson.model) ?? readStringJson(configJson.defaultModel),
        )
      : null;
  const deepSeekDefaults = deepSeekMode ? getDeepSeekModeRuntimeDefaults(deepSeekMode) : null;

  return Object.fromEntries(
    getPresetFields(provider, "configJson").map((field) => {
      const value = configJson[field.key];
      if (provider.providerCode === "deepseek") {
        if (field.key === "analysisMode") {
          return [field.key, deepSeekMode ?? "fast"];
        }
        if ((field.key === "model" || field.key === "defaultModel") && value === undefined) {
          return [field.key, deepSeekDefaults?.model ?? "deepseek-v4-flash"];
        }
        if (deepSeekDefaults && field.key === "maxTokens" && value === undefined) {
          return [field.key, String(deepSeekDefaults.maxTokens)];
        }
        if (deepSeekDefaults && field.key === "thinkingEnabled" && value === undefined) {
          return [field.key, String(deepSeekDefaults.thinkingEnabled)];
        }
        if (deepSeekDefaults && field.key === "reasoningEffort" && value === undefined) {
          return [field.key, deepSeekDefaults.reasoningEffort];
        }
      }

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

function createClearSecretDrafts(providers: readonly SafeProviderConfig[]): ClearSecretDrafts {
  return Object.fromEntries(providers.map((provider) => [provider.id, {}]));
}

function createEnabledDrafts(providers: readonly SafeProviderConfig[]): Record<string, boolean> {
  return Object.fromEntries(providers.map((provider) => [provider.id, provider.enabled]));
}

function createPriorityDrafts(providers: readonly SafeProviderConfig[]): Record<string, number> {
  return Object.fromEntries(providers.map((provider) => [provider.id, provider.priority]));
}

function stateClass(status: RowState["status"]): string {
  if (status === "error") {
    return "border-danger bg-card text-danger";
  }

  if (status === "saved") {
    return "border-success bg-card text-success";
  }

  if (status === "testing" || status === "saving") {
    return "border-info bg-card text-info";
  }

  return "border-border bg-card text-muted-foreground";
}

function getRealDevCallFlagKey(provider: SafeProviderConfig): keyof RealDevCallFlags | null {
  if (provider.providerType === "geo" && provider.providerCode === "amap") {
    return "amap";
  }

  if (provider.providerType === "ai" && provider.providerCode === "deepseek") {
    return "deepseek";
  }

  if (provider.providerType === "weather" && provider.providerCode === "qweather") {
    return "qweather";
  }

  if (provider.providerType === "weather" && provider.providerCode === "open_meteo") {
    return "openMeteo";
  }

  if (provider.providerType === "weather" && provider.providerCode === "meteoblue") {
    return "meteoblue";
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

function isOpenMeteoProvider(provider: SafeProviderConfig): boolean {
  return provider.providerType === "weather" && provider.providerCode === "open_meteo";
}

function openMeteoMode(provider: SafeProviderConfig): "free" | "customer" {
  return readStringJson(readJsonField(provider.configJson, "mode")) === "customer"
    ? "customer"
    : "free";
}

function secretStatusLabel(provider: SafeProviderConfig): string {
  const secretField = primarySecretField(provider);
  if (!secretField) {
    return "可选";
  }

  if (isOpenMeteoProvider(provider) && openMeteoMode(provider) === "free") {
    return hasSavedSecret(provider, secretField.key) ? "已保存" : "可选";
  }

  return hasSavedSecret(provider, secretField.key) ? "已保存" : "未保存";
}

function secretStatusVariant(provider: SafeProviderConfig): "success" | "warning" | "muted" {
  const label = secretStatusLabel(provider);
  if (label === "已保存") {
    return "success";
  }
  if (label === "未保存") {
    return "warning";
  }
  return "muted";
}

function testStatusLabel(state: RowState | undefined): string {
  if (state?.status === "saved") {
    return "通过";
  }
  if (state?.status === "error") {
    return "失败";
  }
  if (state?.status === "testing") {
    return "测试中";
  }
  return "未测试";
}

function testStatusVariant(
  state: RowState | undefined,
): "success" | "warning" | "danger" | "muted" {
  if (state?.status === "saved") {
    return "success";
  }
  if (state?.status === "testing") {
    return "warning";
  }
  if (state?.status === "error") {
    return "danger";
  }
  return "muted";
}

function modeStatusLabel(provider: SafeProviderConfig, realEnabled: boolean): string {
  if (isOpenMeteoProvider(provider)) {
    return openMeteoMode(provider) === "customer" ? "商业模式" : "免费开发模式";
  }

  return realEnabled ? "真实服务" : "模拟测试";
}

function providerRequiresSavedSecret(provider: SafeProviderConfig, realEnabled: boolean): boolean {
  const secretField = primarySecretField(provider);
  if (!secretField || !realEnabled) {
    return false;
  }

  return !(isOpenMeteoProvider(provider) && openMeteoMode(provider) === "free");
}

function providerNeedsAttention(
  provider: SafeProviderConfig,
  flags: RealDevCallFlags,
  testState: RowState | undefined,
): boolean {
  const realEnabled = isRealDevCallEnabled(provider, flags);
  const secretField = primarySecretField(provider);
  const missingRequiredSecret =
    providerRequiresSavedSecret(provider, realEnabled) && secretField
      ? !hasSavedSecret(provider, secretField.key)
      : false;
  const qweatherMissingHost =
    provider.providerCode === "qweather" &&
    realEnabled &&
    !readStringJson(readJsonField(provider.configJson, "apiHost"));

  return testState?.status === "error" || missingRequiredSecret || qweatherMissingHost;
}

function sortManagedProviders(providers: readonly SafeProviderConfig[]): SafeProviderConfig[] {
  return providers
    .filter((provider) => getManagedProviderKey(provider))
    .sort((left, right) => {
      const leftIndex = providerOrder.indexOf(getManagedProviderKey(left) as ProviderKey);
      const rightIndex = providerOrder.indexOf(getManagedProviderKey(right) as ProviderKey);
      return leftIndex - rightIndex;
    });
}

function CompactSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 cursor-pointer items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm transition hover:border-primary hover:bg-secondary/60">
      <span className="min-w-0">
        <span className="block font-semibold text-card-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-border text-primary"
      />
    </label>
  );
}

function SectionTitle({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string;
}) {
  return (
    <div>
      <h4 className="text-sm font-bold text-card-foreground">{title}</h4>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function FeedbackPill({ state, dirty }: { readonly state?: RowState; readonly dirty?: boolean }) {
  const message = state?.message ?? (dirty ? "有未保存修改" : null);
  if (!message) {
    return null;
  }

  return (
    <span
      aria-live="polite"
      className={cn("rounded-md border px-2.5 py-1.5 text-xs", stateClass(state?.status ?? "idle"))}
    >
      {message}
    </span>
  );
}

function StatusFacts({
  provider,
  flags,
  testState,
}: {
  readonly provider: SafeProviderConfig;
  readonly flags: RealDevCallFlags;
  readonly testState?: RowState;
}) {
  const realEnabled = isRealDevCallEnabled(provider, flags);
  const facts = [
    {
      label: "真实调用",
      value: realEnabled ? "已启用" : "未启用",
      variant: realEnabled ? "success" : "muted",
    },
    {
      label: "密钥",
      value: secretStatusLabel(provider),
      variant: secretStatusVariant(provider),
    },
    {
      label: "最近测试",
      value: testStatusLabel(testState),
      variant: testStatusVariant(testState),
    },
    {
      label: "模式",
      value: modeStatusLabel(provider, realEnabled),
      variant: realEnabled ? "info" : "muted",
    },
  ] as const;

  return (
    <dl className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="min-w-0 rounded-md border border-border bg-background/45 px-3 py-2"
        >
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1">
            <Badge variant={fact.variant} className="max-w-full rounded-md px-2 py-0.5">
              <span className="truncate">{fact.value}</span>
            </Badge>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProviderTestDetails({ result }: { readonly result?: MockConnectionTestResult }) {
  if (!result) {
    return null;
  }

  const details = [
    result.modeLabelZh ? ["模式", result.modeLabelZh] : null,
    typeof result.latencyMs === "number" ? ["耗时", `${Math.round(result.latencyMs)}ms`] : null,
    result.statusCode ? ["上游状态", String(result.statusCode)] : null,
    result.apiHost ? ["API Host", result.apiHost] : null,
    result.endpoint ? ["Endpoint", result.endpoint] : null,
    result.model ? ["模型", result.model] : null,
    result.packages?.length ? ["Packages", result.packages.join(",")] : null,
  ].filter((item): item is [string, string] => Boolean(item));

  if (details.length === 0) {
    return null;
  }

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-muted-foreground">
      {details.map(([label, value]) => (
        <div key={label} className="flex min-w-0 gap-1">
          <dt className="shrink-0 font-semibold">{label}:</dt>
          <dd className="min-w-0 break-words text-card-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminProvidersClient({ providerType }: AdminProvidersClientProps) {
  const [providers, setProviders] = useState<SafeProviderConfig[]>([]);
  const [realDevCallFlags, setRealDevCallFlags] =
    useState<RealDevCallFlags>(defaultRealDevCallFlags);
  const [loadState, setLoadState] = useState<RowState>({ status: "idle" });
  const [enabledDrafts, setEnabledDrafts] = useState<Record<string, boolean>>({});
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, number>>({});
  const [configFieldDrafts, setConfigFieldDrafts] = useState<FieldDrafts>({});
  const [secretFieldDrafts, setSecretFieldDrafts] = useState<FieldDrafts>({});
  const [clearSecretDrafts, setClearSecretDrafts] = useState<ClearSecretDrafts>({});
  const [secretVisibility, setSecretVisibility] = useState<ClearSecretDrafts>({});
  const [advancedProviders, setAdvancedProviders] = useState<Record<string, boolean>>({});
  const [dirtyProviders, setDirtyProviders] = useState<Record<string, boolean>>({});
  const [saveStateByProvider, setSaveStateByProvider] = useState<Record<string, RowState>>({});
  const [testStateByProvider, setTestStateByProvider] = useState<Record<string, RowState>>({});
  const [testResultByProvider, setTestResultByProvider] = useState<TestResultDrafts>({});
  const savingProviderIds = useRef(new Set<string>());
  const testingProviderIds = useRef(new Set<string>());

  const loadProviders = useCallback(async () => {
    setLoadState({ status: "saving", message: "正在刷新服务商状态..." });
    try {
      const params = providerType ? `?providerType=${encodeURIComponent(providerType)}` : "";
      const response = await adminApiFetch<ProvidersResponse>(`/admin/providers${params}`);
      const managedProviders = sortManagedProviders(response.providers);
      setProviders(managedProviders);
      setRealDevCallFlags(response.realDevCallFlags ?? defaultRealDevCallFlags);
      setEnabledDrafts(createEnabledDrafts(managedProviders));
      setPriorityDrafts(createPriorityDrafts(managedProviders));
      setConfigFieldDrafts(createConfigFieldDrafts(managedProviders));
      setSecretFieldDrafts(createEmptyFieldDrafts(managedProviders));
      setClearSecretDrafts(createClearSecretDrafts(managedProviders));
      setDirtyProviders(
        Object.fromEntries(managedProviders.map((provider) => [provider.id, false])),
      );
      setLoadState({ status: "idle" });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "无法加载服务商配置。",
      });
    }
  }, [providerType]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const groupedProviders = useMemo(() => {
    const providerByGroup = new Map<ProviderGroupKey, SafeProviderConfig[]>();
    for (const group of providerGroups) {
      providerByGroup.set(group.key, []);
    }

    for (const provider of providers) {
      const meta = getMeta(provider);
      if (meta) {
        providerByGroup.get(meta.group)?.push(provider);
      }
    }

    return providerGroups
      .map((group) => ({
        ...group,
        providers: providerByGroup.get(group.key) ?? [],
      }))
      .filter((group) => !providerType || group.key === providerType || group.providers.length > 0);
  }, [providerType, providers]);

  const overview = useMemo(() => {
    const enabledCount = providers.filter((provider) => provider.enabled).length;
    const realEnabledCount = providers.filter((provider) =>
      isRealDevCallEnabled(provider, realDevCallFlags),
    ).length;
    const needsAttentionCount = providers.filter((provider) =>
      providerNeedsAttention(provider, realDevCallFlags, testStateByProvider[provider.id]),
    ).length;

    return {
      totalCount: providers.length,
      enabledCount,
      realEnabledCount,
      needsAttentionCount,
    };
  }, [providers, realDevCallFlags, testStateByProvider]);

  function markProviderDirty(providerId: string) {
    setDirtyProviders((current) => ({ ...current, [providerId]: true }));
    setSaveStateByProvider((current) => {
      const state = current[providerId];
      if (!state || state.status === "saving") {
        return current;
      }
      return { ...current, [providerId]: { status: "idle" } };
    });
  }

  function updateConfigField(provider: SafeProviderConfig, key: string, value: string) {
    markProviderDirty(provider.id);
    setConfigFieldDrafts((current) => ({
      ...current,
      [provider.id]: {
        ...(current[provider.id] ?? {}),
        [key]: value,
      },
    }));
  }

  function applyDeepSeekModel(provider: SafeProviderConfig, model: string) {
    const analysisMode = normalizeDeepSeekAnalysisMode(undefined, model);
    const defaults = getDeepSeekModeRuntimeDefaults(analysisMode);
    markProviderDirty(provider.id);
    setConfigFieldDrafts((current) => ({
      ...current,
      [provider.id]: {
        ...(current[provider.id] ?? {}),
        analysisMode,
        model: defaults.model,
        defaultModel: defaults.model,
        maxTokens: String(defaults.maxTokens),
        reasoningEffort: defaults.reasoningEffort,
        thinkingEnabled: String(defaults.thinkingEnabled),
      },
    }));
  }

  function updateSecretField(providerId: string, key: string, value: string) {
    markProviderDirty(providerId);
    setSecretFieldDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? {}),
        [key]: value,
      },
    }));
  }

  function toggleClearSecret(providerId: string, key: string) {
    markProviderDirty(providerId);
    setClearSecretDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? {}),
        [key]: !(current[providerId]?.[key] ?? false),
      },
    }));
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

  function renderConfigField(provider: SafeProviderConfig, field: ProviderFieldDefinition) {
    const value = configFieldDrafts[provider.id]?.[field.key] ?? fieldDefaultToInput(field);

    if (field.control === "boolean") {
      return (
        <CompactSwitch
          key={field.key}
          label={field.label}
          description={field.helpText}
          checked={value === "true"}
          onChange={(checked) => updateConfigField(provider, field.key, String(checked))}
        />
      );
    }

    if (field.control === "select") {
      return (
        <FormField key={field.key} label={field.label} hint={field.helpText}>
          <Select
            value={value}
            onChange={(event) => {
              if (provider.providerCode === "deepseek" && field.key === "model") {
                applyDeepSeekModel(provider, event.target.value);
                return;
              }
              updateConfigField(provider, field.key, event.target.value);
            }}
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
          onChange={(event) => updateConfigField(provider, field.key, event.target.value)}
        />
      </FormField>
    );
  }

  async function saveProvider(provider: SafeProviderConfig) {
    if (
      savingProviderIds.current.has(provider.id) ||
      saveStateByProvider[provider.id]?.status === "saving"
    ) {
      return;
    }

    savingProviderIds.current.add(provider.id);
    setSaveStateByProvider((current) => ({
      ...current,
      [provider.id]: { status: "saving", message: "正在保存..." },
    }));

    try {
      const configJson: Record<string, JsonValue> = {};
      for (const field of getPresetFields(provider, "configJson")) {
        const parsedValue = parseConfigFieldValue(
          field,
          configFieldDrafts[provider.id]?.[field.key],
        );
        if (parsedValue !== undefined) {
          configJson[field.key] = parsedValue;
        }
      }

      const secretJson: Record<string, JsonValue> = {};
      for (const field of getPresetFields(provider, "secretJson")) {
        const value = secretFieldDrafts[provider.id]?.[field.key]?.trim();
        if (value) {
          secretJson[field.key] = value;
        }
      }

      const clearSecretKeys = Object.entries(clearSecretDrafts[provider.id] ?? {})
        .filter(([, shouldClear]) => shouldClear)
        .map(([key]) => key);

      const payload: Record<string, unknown> = {
        enabled: enabledDrafts[provider.id] ?? provider.enabled,
        priority: priorityDrafts[provider.id] ?? provider.priority,
        configJson,
      };
      if (Object.keys(secretJson).length > 0) {
        payload.secretJson = secretJson;
      }
      if (clearSecretKeys.length > 0) {
        payload.clearSecretKeys = clearSecretKeys;
      }

      const response = await adminApiFetch<{
        readonly success?: boolean;
        readonly messageZh?: string;
        readonly provider: SafeProviderConfig;
      }>(`/admin/providers/${provider.providerType}/${provider.providerCode}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setProviders((current) =>
        current.map((item) => (item.id === provider.id ? response.provider : item)),
      );
      const realFlagKey = getRealDevCallFlagKey(response.provider);
      const configuredRealCall = readConfiguredRealCallEnabled(response.provider);
      if (realFlagKey && configuredRealCall !== undefined) {
        setRealDevCallFlags((current) => ({ ...current, [realFlagKey]: configuredRealCall }));
      }
      setEnabledDrafts((current) => ({ ...current, [provider.id]: response.provider.enabled }));
      setPriorityDrafts((current) => ({ ...current, [provider.id]: response.provider.priority }));
      setConfigFieldDrafts((current) => ({
        ...current,
        [provider.id]: createConfigFieldDraft(response.provider),
      }));
      setSecretFieldDrafts((current) => ({ ...current, [provider.id]: {} }));
      setClearSecretDrafts((current) => ({ ...current, [provider.id]: {} }));
      setDirtyProviders((current) => ({ ...current, [provider.id]: false }));
      setSaveStateByProvider((current) => ({
        ...current,
        [provider.id]: {
          status: "saved",
          message: response.messageZh ?? providerSaveSuccessMessage(response.provider),
        },
      }));
    } catch (error) {
      setSaveStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "error", message: providerSaveErrorMessage(error) },
      }));
    } finally {
      savingProviderIds.current.delete(provider.id);
    }
  }

  async function testProvider(provider: SafeProviderConfig) {
    if (
      testingProviderIds.current.has(provider.id) ||
      testStateByProvider[provider.id]?.status === "testing"
    ) {
      return;
    }

    testingProviderIds.current.add(provider.id);
    const realEnabled = isRealDevCallEnabled(provider, realDevCallFlags);
    setTestStateByProvider((current) => ({
      ...current,
      [provider.id]: {
        status: "testing",
        message: realEnabled ? "测试中，正在请求真实服务..." : "测试中，正在执行模拟测试...",
      },
    }));

    try {
      const result = await adminApiFetch<MockConnectionTestResult>(
        `/admin/providers/${provider.providerType}/${provider.providerCode}/test-connection`,
        createProviderConnectionTestRequestInit(),
      );
      setTestResultByProvider((current) => ({ ...current, [provider.id]: result }));
      setTestStateByProvider((current) => ({
        ...current,
        [provider.id]: {
          status: result.success === false ? "error" : "saved",
          message: providerTestSuccessMessage(provider, result),
        },
      }));
    } catch (error) {
      setTestStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "error", message: providerTestErrorMessage(provider, error) },
      }));
    } finally {
      testingProviderIds.current.delete(provider.id);
    }
  }

  if (providers.length === 0 && loadState.status === "error") {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          title="无法加载服务商配置"
          description={
            loadState.message ?? "请确认后台 API 已启动，并且当前账号拥有服务商配置权限。"
          }
        />
      </div>
    );
  }

  return (
    <div className="grid w-full gap-6">
      <header className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-4 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-normal text-foreground">服务商配置</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            统一管理地图、天气数据源和智能解读服务。保存配置只保存参数，测试连接用于验证真实服务是否可用。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={loadState.status === "saving"}
            onClick={() => void loadProviders()}
          >
            {loadState.status === "saving" ? "刷新中..." : "刷新状态"}
          </Button>
          <Link
            href="/admin"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
          >
            返回控制台
          </Link>
        </div>
      </header>

      {loadState.message ? (
        <div className={cn("rounded-md border px-3 py-2 text-sm", stateClass(loadState.status))}>
          {loadState.message}
        </div>
      ) : null}

      <section aria-label="服务商总览" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "服务商总数", value: overview.totalCount },
          { label: "已启用", value: overview.enabledCount },
          { label: "真实调用", value: overview.realEnabledCount },
          { label: "需要处理", value: overview.needsAttentionCount },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-bold leading-tight text-card-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </section>

      {groupedProviders.map((group) => {
        if (group.providers.length === 0) {
          return null;
        }

        return (
          <section key={group.key} className="grid gap-3" data-provider-group={group.key}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">{group.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{group.description}</p>
              </div>
              <Badge variant="muted">{group.providers.length} 个服务商</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {group.providers.map((provider, index) => {
                const meta = getMeta(provider);
                const realCallField = getFieldByKey(provider, "realCallEnabled");
                const requiredConfigFields = getRequiredConfigFields(provider);
                const advancedConfigFields = getAdvancedConfigFields(provider);
                const secretFields = getPresetFields(provider, "secretJson");
                const saveState = saveStateByProvider[provider.id];
                const testState = testStateByProvider[provider.id];
                const dirty = dirtyProviders[provider.id] ?? false;
                const isSaving = isProviderSaveDisabled(saveState);
                const isTesting = isProviderTestDisabled(testState);
                const isOddLast =
                  group.providers.length % 2 === 1 && index === group.providers.length - 1;
                const advancedOpen = advancedProviders[provider.id] ?? false;

                return (
                  <article
                    key={provider.id}
                    data-provider-card={providerIdentityKey(provider)}
                    className={cn(
                      "grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4 shadow-sm",
                      isOddLast && "md:col-span-2",
                    )}
                  >
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-bold text-card-foreground">
                            {providerName(provider)}
                          </h4>
                          <Badge variant="muted" className="rounded-md">
                            {provider.providerCode}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {meta?.purpose ?? "服务商配置与连接测试。"}
                        </p>
                      </div>
                      <Badge
                        variant={provider.enabled ? "success" : "muted"}
                        className="rounded-md"
                      >
                        {provider.enabled ? "已启用" : "未启用"}
                      </Badge>
                    </div>

                    <StatusFacts
                      provider={provider}
                      flags={realDevCallFlags}
                      testState={testState}
                    />

                    {meta?.capabilities.length ? (
                      <div className="flex flex-wrap gap-2">
                        {meta.capabilities.map((capability) => (
                          <Badge key={capability} variant="info" className="rounded-md px-2 py-0.5">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    <div className="grid gap-4 border-t border-border pt-4">
                      <section className="grid gap-3">
                        <SectionTitle
                          title="基础开关"
                          description="保存开关只更新后台参数；真实调用开关生效后，测试连接才会请求真实服务。"
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <CompactSwitch
                            label="启用该服务商"
                            description="控制该服务商是否可被后台流程读取。"
                            checked={enabledDrafts[provider.id] ?? provider.enabled}
                            onChange={(checked) => {
                              markProviderDirty(provider.id);
                              setEnabledDrafts((current) => ({
                                ...current,
                                [provider.id]: checked,
                              }));
                            }}
                          />
                          {realCallField ? renderConfigField(provider, realCallField) : null}
                        </div>
                      </section>

                      <section className="grid gap-3">
                        <SectionTitle
                          title="必填配置"
                          description={
                            requiredConfigFields.length > 0
                              ? "常用参数直接编辑，正常管理员不需要处理原始 JSON。"
                              : "该服务商的必填配置集中在密钥配置中。"
                          }
                        />
                        {requiredConfigFields.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {requiredConfigFields.map((field) =>
                              renderConfigField(provider, field),
                            )}
                          </div>
                        ) : (
                          <p className="rounded-md border border-border bg-background/45 px-3 py-2 text-sm text-muted-foreground">
                            保存 API Key 后即可测试真实连接。
                          </p>
                        )}
                      </section>

                      <section className="grid gap-3">
                        <SectionTitle
                          title="密钥配置"
                          description="密钥只保存到服务端；留空会保留已保存密钥，保存后仅显示脱敏状态。"
                        />
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
                                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
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
                          <p className="rounded-md border border-border bg-background/45 px-3 py-2 text-sm text-muted-foreground">
                            该服务商无需密钥。
                          </p>
                        )}
                      </section>

                      <details
                        className="rounded-md border border-border bg-background/35 px-3 py-2"
                        open={advancedOpen}
                        onToggle={(event) => {
                          setAdvancedProviders((current) => ({
                            ...current,
                            [provider.id]: event.currentTarget.open,
                          }));
                        }}
                      >
                        <summary className="cursor-pointer text-sm font-semibold text-card-foreground">
                          {advancedOpen ? "收起高级配置" : "展开高级配置"}
                        </summary>
                        <div className="mt-3 grid gap-3">
                          <FormField label="priority">
                            <Input
                              type="number"
                              value={priorityDrafts[provider.id] ?? provider.priority}
                              min={0}
                              max={10000}
                              step={1}
                              onChange={(event) => {
                                markProviderDirty(provider.id);
                                setPriorityDrafts((current) => ({
                                  ...current,
                                  [provider.id]: Number(event.target.value),
                                }));
                              }}
                            />
                          </FormField>
                          {advancedConfigFields.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {advancedConfigFields.map((field) =>
                                renderConfigField(provider, field),
                              )}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    </div>

                    <footer className="flex flex-col gap-3 border-t border-border pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap gap-2">
                          <FeedbackPill state={saveState} dirty={dirty} />
                          <FeedbackPill state={testState} />
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button disabled={isSaving} onClick={() => void saveProvider(provider)}>
                            {providerSaveButtonLabel(saveState)}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={isTesting}
                            onClick={() => void testProvider(provider)}
                          >
                            {providerTestButtonLabel(testState)}
                          </Button>
                        </div>
                      </div>
                      <ProviderTestDetails result={testResultByProvider[provider.id]} />
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {providers.length === 0 && loadState.status !== "saving" ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            title="暂无可管理的服务商"
            description="当前控制台只管理高德地图、和风天气、Open-Meteo、meteoblue 和 DeepSeek。"
          />
        </div>
      ) : null}
    </div>
  );
}
