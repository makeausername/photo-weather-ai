"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  getProviderFieldPreset,
  tencentCaptchaDefaultCaptchaType,
  tencentCaptchaDefaultEndpoint,
  tencentCaptchaDefaultSdkUrl,
  type ProviderFieldDefinition,
} from "../../../../../packages/shared/src/provider-fields";
import type {
  AdminEmailTestResult,
  AdminCdnOperationResult,
  AdminCdnProviderCode,
  AdminCdnRefreshType,
  JsonValue,
  MockConnectionTestResult,
  SafeProviderConfig,
} from "../admin-api";
import {
  adminApiFetch,
  createProviderConnectionTestRequestInit,
  prefetchCdnUrls,
  refreshCdnCache,
} from "../admin-api";
import { Badge, Button, EmptyState, FormField, Input, Select, cn } from "../../../components/ui";
import { getAdaptiveGridClassName, getAdaptiveGridItemClassName } from "./admin-adaptive-grid";
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

type ProviderGroupKey =
  | "geo"
  | "weather"
  | "billing"
  | "notification"
  | "captcha"
  | "storage"
  | "cdn";
type ProviderApiType =
  | "geo"
  | "weather"
  | "billing"
  | "email"
  | "sms"
  | "captcha"
  | "storage"
  | "cdn";
type AdminProvidersClientProps = {
  readonly providerType: ProviderGroupKey;
};
type ProviderKey =
  | "geo:amap"
  | "weather:qweather"
  | "weather:open_meteo"
  | "weather:meteoblue"
  | "billing:wechat_pay"
  | "billing:alipay"
  | "email:aliyun_smtp"
  | "sms:aliyun_sms"
  | "captcha:tencent_captcha"
  | "storage:local_storage"
  | "storage:aliyun_oss"
  | "storage:tencent_cos"
  | "cdn:aliyun_cdn"
  | "cdn:tencent_cdn";
type RowState = ProviderSaveFeedbackState;
type FieldDrafts = Record<string, Record<string, string>>;
type ClearSecretDrafts = Record<string, Record<string, boolean>>;
type TestResultDrafts = Record<string, MockConnectionTestResult | undefined>;
type EmailTestResultDrafts = Record<string, AdminEmailTestResult | undefined>;

type RealDevCallFlags = {
  readonly amap: boolean;
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
export type ProviderModuleLayout = "empty" | "single-detail" | "top" | "side";

export function getProviderModuleLayout(providerCount: number): ProviderModuleLayout {
  const count = Number.isFinite(providerCount) ? Math.max(0, Math.floor(providerCount)) : 0;

  if (count <= 0) {
    return "empty";
  }

  if (count === 1) {
    return "single-detail";
  }

  if (count >= 4) {
    return "side";
  }

  return "top";
}

const defaultRealDevCallFlags: RealDevCallFlags = {
  amap: false,
  qweather: false,
  openMeteo: false,
  meteoblue: false,
};

const providerOrder: readonly ProviderKey[] = [
  "geo:amap",
  "weather:qweather",
  "weather:open_meteo",
  "weather:meteoblue",
  "billing:wechat_pay",
  "billing:alipay",
  "email:aliyun_smtp",
  "sms:aliyun_sms",
  "captcha:tencent_captcha",
  "storage:local_storage",
  "storage:aliyun_oss",
  "storage:tencent_cos",
  "cdn:aliyun_cdn",
  "cdn:tencent_cdn",
];

const providerModules = [
  {
    key: "geo",
    title: "地图服务",
    description: "管理高德地图的地点搜索、地理编码和坐标转换配置。",
    apiProviderTypes: ["geo"],
  },
  {
    key: "weather",
    title: "天气数据",
    description: "管理和风天气、Open-Meteo、meteoblue 等天气数据源、逐小时预报和云层分层配置。",
    apiProviderTypes: ["weather"],
  },
  {
    key: "billing",
    title: "支付收款",
    description: "管理微信支付、支付宝、订单回调、证书、密钥和验签配置。",
    apiProviderTypes: ["billing"],
  },
  {
    key: "notification",
    title: "邮箱短信",
    description: "管理邮箱验证码和短信验证码服务配置。",
    apiProviderTypes: ["email", "sms"],
  },
  {
    key: "captcha",
    title: "人机验证",
    description: "管理腾讯云验证码，用于注册、登录和账号绑定前的人机校验。",
    apiProviderTypes: ["captcha"],
  },
  {
    key: "storage",
    title: "对象存储",
    description: "管理本地存储、阿里云 OSS、腾讯云 COS 等报告与文件存储配置。",
    apiProviderTypes: ["storage"],
  },
  {
    key: "cdn",
    title: "CDN加速",
    description: "管理阿里云 CDN、腾讯云 CDN 的缓存刷新、预热和域名加速配置。",
    apiProviderTypes: ["cdn"],
  },
] as const satisfies readonly {
  readonly key: ProviderGroupKey;
  readonly title: string;
  readonly description: string;
  readonly apiProviderTypes: readonly ProviderApiType[];
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
  "billing:wechat_pay": {
    key: "billing:wechat_pay",
    group: "billing",
    displayName: "微信支付",
    purpose: "用于国内微信 Native 扫码支付，回调验签通过后才会发放订单权益。",
    capabilities: ["Native 扫码", "API v3 签名", "回调验签", "权益发放"],
    requiredConfigKeys: ["mode", "appId", "mchId", "notifyUrl", "returnUrl"],
  },
  "billing:alipay": {
    key: "billing:alipay",
    group: "billing",
    displayName: "支付宝",
    purpose: "用于支付宝电脑网站和手机网站支付，异步通知验签通过后才会发放订单权益。",
    capabilities: ["电脑网站支付", "手机网站支付", "RSA2 签名", "异步通知"],
    requiredConfigKeys: ["mode", "appId", "notifyUrl", "returnUrl"],
  },
  "email:aliyun_smtp": {
    key: "email:aliyun_smtp",
    group: "notification",
    displayName: "阿里云企业邮箱 SMTP",
    purpose: "用于发送邮箱注册验证码。",
    capabilities: ["邮箱验证码", "SMTP", "注册验证"],
    requiredConfigKeys: ["host", "port", "secure", "fromAddress"],
  },
  "sms:aliyun_sms": {
    key: "sms:aliyun_sms",
    group: "notification",
    displayName: "阿里云短信",
    purpose: "用于发送手机注册验证码。",
    capabilities: ["短信验证码", "注册验证", "阿里云短信"],
    requiredConfigKeys: ["regionId", "signName", "templateCode"],
  },
  "captcha:tencent_captcha": {
    key: "captcha:tencent_captcha",
    group: "captcha",
    displayName: "腾讯云验证码",
    purpose: "用于登录、注册发送验证码和账号绑定前的人机校验。",
    capabilities: ["人机验证", "注册防刷", "登录保护", "账号绑定保护"],
    requiredConfigKeys: ["captchaAppId", "captchaType", "sdkUrl", "endpoint", "region"],
  },
  "storage:local_storage": {
    key: "storage:local_storage",
    group: "storage",
    displayName: "本地存储",
    purpose: "单机部署和开发环境的本地文件存储后端。",
    capabilities: ["报告文件", "导出文件", "生成素材", "本地磁盘"],
    requiredConfigKeys: ["rootPath", "publicBaseUrl", "basePrefix", "maxUploadBytes"],
  },
  "storage:aliyun_oss": {
    key: "storage:aliyun_oss",
    group: "storage",
    displayName: "阿里云 OSS",
    purpose: "用于生产环境报告、导出文件和生成素材的阿里云 OSS 存储后端。",
    capabilities: ["对象存储", "报告文件", "导出文件", "生成素材"],
    requiredConfigKeys: ["region", "endpoint", "bucket", "basePrefix", "publicBaseUrl"],
  },
  "storage:tencent_cos": {
    key: "storage:tencent_cos",
    group: "storage",
    displayName: "腾讯云 COS",
    purpose: "用于生产环境报告、导出文件和生成素材的腾讯云 COS 存储后端。",
    capabilities: ["对象存储", "报告文件", "导出文件", "生成素材"],
    requiredConfigKeys: ["region", "bucket", "basePrefix", "publicBaseUrl"],
  },
  "cdn:aliyun_cdn": {
    key: "cdn:aliyun_cdn",
    group: "cdn",
    displayName: "阿里云 CDN",
    purpose: "用于阿里云 CDN 域名缓存刷新、URL 预热和加速配置。",
    capabilities: ["缓存刷新", "URL 预热", "域名配置", "回源加速", "访问加速"],
    requiredConfigKeys: ["domains", "endpoint", "defaultRefreshType"],
  },
  "cdn:tencent_cdn": {
    key: "cdn:tencent_cdn",
    group: "cdn",
    displayName: "腾讯云 CDN",
    purpose: "用于腾讯云 CDN URL 刷新、路径刷新、URL 预热和加速配置。",
    capabilities: ["缓存刷新", "URL 预热", "域名配置", "回源加速", "访问加速"],
    requiredConfigKeys: ["domains", "endpoint", "defaultPurgeType"],
  },
};

const advancedHiddenKeys = new Set(["realCallEnabled", "analysisMode", "model"]);
const defaultProviderModule =
  providerModules.find((module) => module.key === "weather") ?? providerModules[0];

const providerConfigDefaults: Partial<Record<string, Record<string, JsonValue>>> = {
  qweather: {
    timeoutMs: 10000,
    retryCount: 1,
    language: "zh",
    unit: "m",
  },
  open_meteo: {
    mode: "free",
    timeoutMs: 10000,
    retryCount: 1,
    customerEndpoint: "https://customer-api.open-meteo.com",
  },
  meteoblue: {
    baseUrl: "https://my.meteoblue.com",
    packages: ["basic-1h", "clouds-1h"],
    timeoutMs: 10000,
    retryCount: 1,
  },
  amap: {
    timeoutMs: 10000,
    retryCount: 1,
  },
  wechat_pay: {
    realCallEnabled: false,
    mode: "native",
    appId: "",
    mchId: "",
    notifyUrl: "",
    returnUrl: "",
    apiBaseUrl: "https://api.mch.weixin.qq.com",
    timeoutMs: 10000,
  },
  alipay: {
    realCallEnabled: false,
    mode: "page",
    appId: "",
    notifyUrl: "",
    returnUrl: "",
    gatewayUrl: "https://openapi.alipay.com/gateway.do",
    charset: "utf-8",
    signType: "RSA2",
    timeoutMs: 10000,
  },
  aliyun_smtp: {
    realCallEnabled: false,
    host: "",
    port: 465,
    secure: true,
    fromName: "逐光天气",
    fromAddress: "",
    timeoutMs: 10000,
  },
  aliyun_sms: {
    realCallEnabled: false,
    regionId: "cn-hangzhou",
    endpoint: "",
    signName: "",
    templateCode: "",
    timeoutMs: 10000,
  },
  tencent_captcha: {
    realCallEnabled: false,
    captchaAppId: "",
    captchaType: tencentCaptchaDefaultCaptchaType,
    endpoint: tencentCaptchaDefaultEndpoint,
    sdkUrl: tencentCaptchaDefaultSdkUrl,
    region: "ap-guangzhou",
    timeoutMs: 10000,
    retryCount: 1,
    enforceOnLogin: false,
    enforceOnRegisterSendCode: true,
    enforceOnRegisterConfirm: false,
    enforceOnAccountBinding: true,
    failOpenInDevelopment: true,
    failOpenInProduction: false,
  },
  local_storage: {
    rootPath: "data/uploads",
    publicBaseUrl: "",
    basePrefix: "uploads",
    maxUploadBytes: 10485760,
  },
  aliyun_oss: {
    realCallEnabled: false,
    region: "",
    endpoint: "",
    bucket: "",
    basePrefix: "uploads",
    publicBaseUrl: "",
    forcePathStyle: false,
    timeoutMs: 10000,
    maxUploadBytes: 10485760,
  },
  tencent_cos: {
    realCallEnabled: false,
    region: "",
    bucket: "",
    basePrefix: "uploads",
    publicBaseUrl: "",
    timeoutMs: 10000,
    maxUploadBytes: 10485760,
  },
  aliyun_cdn: {
    realCallEnabled: false,
    endpoint: "https://cdn.aliyuncs.com",
    domains: "",
    defaultRefreshType: "file",
    timeoutMs: 10000,
    retryCount: 1,
    rateLimitPerMinute: 60,
    dryRun: true,
  },
  tencent_cdn: {
    realCallEnabled: false,
    endpoint: "https://cdn.tencentcloudapi.com",
    region: "",
    domains: "",
    defaultPurgeType: "url",
    timeoutMs: 10000,
    retryCount: 1,
    rateLimitPerMinute: 60,
    dryRun: true,
  },
};

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

function configFieldValueToInput(
  field: ProviderFieldDefinition,
  value: JsonValue | undefined,
): string {
  if ((field.key === "packages" || field.key === "domains") && Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(",");
  }

  return fieldValueToInput(value);
}

function providerFieldDefaultToInput(
  provider: SafeProviderConfig,
  field: ProviderFieldDefinition,
): string {
  const value = providerConfigDefaults[provider.providerCode]?.[field.key];
  if ((field.key === "packages" || field.key === "domains") && Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(",");
  }
  return value === undefined ? fieldDefaultToInput(field) : configFieldValueToInput(field, value);
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

function providerTypeLabel(providerType: string): string {
  const labels: Record<string, string> = {
    billing: "支付收款",
    captcha: "人机验证",
    cdn: "CDN 加速",
    email: "邮箱验证",
    geo: "地图服务",
    sms: "短信验证",
    storage: "对象存储",
    weather: "天气数据",
  };
  return labels[providerType] ?? "服务商配置";
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

  return Object.fromEntries(
    getPresetFields(provider, "configJson").map((field) => {
      const value = configJson[field.key];

      return [
        field.key,
        value === undefined
          ? providerFieldDefaultToInput(provider, field)
          : configFieldValueToInput(field, value),
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

function isAliyunSmtpProvider(provider: SafeProviderConfig): boolean {
  return provider.providerType === "email" && provider.providerCode === "aliyun_smtp";
}

function openMeteoMode(provider: SafeProviderConfig): "free" | "customer" {
  return readStringJson(readJsonField(provider.configJson, "mode")) === "customer"
    ? "customer"
    : "free";
}

function secretStatusLabel(provider: SafeProviderConfig): string {
  const secretFields = getPresetFields(provider, "secretJson");
  if (secretFields.length === 0) {
    return "可选";
  }

  if (isOpenMeteoProvider(provider) && openMeteoMode(provider) === "free") {
    return secretFields.some((field) => hasSavedSecret(provider, field.key)) ? "已保存" : "可选";
  }

  return secretFields.every((field) => hasSavedSecret(provider, field.key)) ? "已保存" : "未保存";
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
  const secretFields = getPresetFields(provider, "secretJson");
  if (secretFields.length === 0 || !realEnabled) {
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
  const secretFields = getPresetFields(provider, "secretJson");
  const missingRequiredSecret =
    providerRequiresSavedSecret(provider, realEnabled) && secretFields.length > 0
      ? secretFields.some((field) => !hasSavedSecret(provider, field.key))
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
    <dl
      className={getAdaptiveGridClassName(facts.length, {
        variant: "metric",
        allowFourMetricColumns: true,
        gapClassName: "gap-2",
        className: "text-xs",
      })}
    >
      {facts.map((fact, index) => (
        <div
          key={fact.label}
          className={cn(
            getAdaptiveGridItemClassName(facts.length, index, { variant: "metric" }),
            "rounded-md border border-border bg-background/45 px-3 py-2",
          )}
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
    result.modeLabelZh ? ["Mode", result.modeLabelZh] : null,
    typeof result.latencyMs === "number" ? ["Latency", `${Math.round(result.latencyMs)}ms`] : null,
    result.statusCode ? ["Upstream status", String(result.statusCode)] : null,
    result.apiHost ? ["API Host", result.apiHost] : null,
    result.endpoint ? ["Endpoint", result.endpoint] : null,
    typeof result.attempts === "number" ? ["attempts", String(result.attempts)] : null,
    typeof result.upstreamStatusCode === "number"
      ? ["upstreamStatusCode", String(result.upstreamStatusCode)]
      : null,
    result.upstreamErrorCode ? ["upstreamErrorCode", result.upstreamErrorCode] : null,
    result.upstreamErrorType ? ["upstreamErrorType", result.upstreamErrorType] : null,
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

function EmailTestResultDetails({ result }: { readonly result?: AdminEmailTestResult }) {
  if (!result) {
    return null;
  }

  const message = result.success ? "测试邮件已发送，请检查收件箱或垃圾箱。" : result.messageZh;
  const details = [
    result.errorCode ? ["errorCode", result.errorCode] : null,
    typeof result.responseCode === "number" ? ["responseCode", String(result.responseCode)] : null,
    result.command ? ["command", result.command] : null,
    result.response ? ["response", result.response] : null,
  ].filter((item): item is [string, string] => Boolean(item));

  return (
    <div
      data-email-test-result
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        stateClass(result.success ? "saved" : "error"),
      )}
    >
      <p className="font-semibold">{message}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">收件人：{result.toMasked}</p>
      {result.missingFields?.length ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          待补充：{result.missingFields.join("、")}
        </p>
      ) : null}
      {details.length ? (
        <dl className="mt-2 grid gap-1 text-xs leading-5">
          {details.map(([label, value]) => (
            <div key={label} className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)]">
              <dt className="font-semibold text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-card-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

class ProviderCardErrorBoundary extends Component<
  { readonly providerLabel: string; readonly children: ReactNode },
  { readonly hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { readonly hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[admin] provider card render failed", {
      providerLabel: this.props.providerLabel,
      message: error instanceof Error ? error.message : "unknown provider card render error",
      componentStack: info.componentStack?.slice(0, 500) ?? "",
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-md border border-danger bg-card px-3 py-2 text-sm text-danger">
          该服务商配置暂时无法显示，请刷新或检查配置。
        </div>
      );
    }

    return this.props.children;
  }
}

function AdvancedConfigContent({
  provider,
  advancedOpen,
  advancedConfigFields,
  priority,
  onOpenChange,
  onPriorityChange,
  renderConfigField,
}: {
  readonly provider: SafeProviderConfig;
  readonly advancedOpen: boolean;
  readonly advancedConfigFields: readonly ProviderFieldDefinition[];
  readonly priority: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPriorityChange: (priority: number) => void;
  readonly renderConfigField: (
    provider: SafeProviderConfig,
    field: ProviderFieldDefinition,
  ) => ReactNode;
}) {
  return (
    <details
      className="rounded-md border border-border bg-background/35 px-3 py-2"
      open={advancedOpen}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold text-card-foreground">
        {advancedOpen ? "收起高级配置" : "展开高级配置"}
      </summary>
      <div className="mt-3 grid gap-3">
        <FormField label="priority">
          <Input
            type="number"
            value={priority}
            min={0}
            max={10000}
            step={1}
            onChange={(event) => onPriorityChange(Number(event.target.value))}
          />
        </FormField>
        {advancedConfigFields.length > 0 ? (
          <div
            className={getAdaptiveGridClassName(advancedConfigFields.length, {
              breakpoint: "sm",
            })}
          >
            {advancedConfigFields.map((field, index) => (
              <div
                key={field.key}
                className={getAdaptiveGridItemClassName(advancedConfigFields.length, index, {
                  breakpoint: "sm",
                })}
              >
                {renderConfigField(provider, field)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function isAdminCdnProviderCode(providerCode: string): providerCode is AdminCdnProviderCode {
  return providerCode === "aliyun_cdn" || providerCode === "tencent_cdn";
}

function splitCdnOperationInput(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readCdnDomains(provider: SafeProviderConfig): readonly string[] {
  const value = readJsonField(provider.configJson, "domains");
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  }
  if (typeof value === "string") {
    return splitCdnOperationInput(value);
  }
  return [];
}

function cdnProviderReadiness(provider: SafeProviderConfig | null): {
  readonly ready: boolean;
  readonly message: string;
  readonly realCallEnabled: boolean;
} {
  if (!provider) {
    return {
      ready: false,
      message: "请先选择 CDN 服务商。",
      realCallEnabled: false,
    };
  }

  const realCallEnabled =
    readBooleanJson(readJsonField(provider.configJson, "realCallEnabled")) ?? false;
  if (!provider.enabled) {
    return {
      ready: false,
      message: "请先启用该 CDN 服务商。",
      realCallEnabled,
    };
  }

  if (readCdnDomains(provider).length === 0) {
    return {
      ready: false,
      message: "请先保存 CDN 加速域名。",
      realCallEnabled,
    };
  }

  if (realCallEnabled) {
    const missingSecret = getPresetFields(provider, "secretJson").some(
      (field) => !hasSavedSecret(provider, field.key),
    );
    if (missingSecret) {
      return {
        ready: false,
        message: "真实调用开启时请先保存 CDN 密钥。",
        realCallEnabled,
      };
    }
  }

  return {
    ready: true,
    message: realCallEnabled ? "真实调用模式" : "配置检查模式",
    realCallEnabled,
  };
}

function CdnOperationResultSummary({ result }: { readonly result?: AdminCdnOperationResult }) {
  if (!result) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-md border border-border bg-background/45 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={result.success ? "success" : "danger"} className="rounded-md">
          {result.success ? "已受理" : "未受理"}
        </Badge>
        <Badge variant="muted" className="rounded-md">
          {result.providerNameZh}
        </Badge>
        <Badge variant={result.mode === "real" ? "info" : "muted"} className="rounded-md">
          {result.mode === "real" ? "真实调用" : "配置检查"}
        </Badge>
      </div>
      <p className="leading-6 text-card-foreground">{result.messageZh}</p>
      <p className="text-xs leading-5 text-muted-foreground">
        已接收 {result.acceptedCount} 条，拒绝 {result.rejectedCount} 条
        {result.providerTaskId ? `，任务 ${result.providerTaskId}` : ""}。
      </p>
    </div>
  );
}

function CdnOperationsPanel({ providers }: { readonly providers: readonly SafeProviderConfig[] }) {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [refreshUrlsInput, setRefreshUrlsInput] = useState("");
  const [refreshDirectoriesInput, setRefreshDirectoriesInput] = useState("");
  const [prefetchUrlsInput, setPrefetchUrlsInput] = useState("");
  const [refreshType, setRefreshType] = useState<AdminCdnRefreshType>("file");
  const [busyAction, setBusyAction] = useState<"refresh" | "prefetch" | null>(null);
  const [result, setResult] = useState<AdminCdnOperationResult | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cdnProviders = useMemo(
    () => providers.filter((provider) => isAdminCdnProviderCode(provider.providerCode)),
    [providers],
  );
  const selectedProvider = useMemo(
    () => cdnProviders.find((provider) => provider.id === selectedProviderId) ?? null,
    [cdnProviders, selectedProviderId],
  );
  const readiness = cdnProviderReadiness(selectedProvider);
  const refreshUrls = splitCdnOperationInput(refreshUrlsInput);
  const refreshDirectories = splitCdnOperationInput(refreshDirectoriesInput);
  const prefetchUrls = splitCdnOperationInput(prefetchUrlsInput);
  const selectedProviderCode = selectedProvider?.providerCode;
  const canRefresh =
    readiness.ready &&
    busyAction === null &&
    Boolean(selectedProviderCode && isAdminCdnProviderCode(selectedProviderCode)) &&
    (refreshUrls.length > 0 || refreshDirectories.length > 0);
  const canPrefetch =
    readiness.ready &&
    busyAction === null &&
    Boolean(selectedProviderCode && isAdminCdnProviderCode(selectedProviderCode)) &&
    prefetchUrls.length > 0;

  useEffect(() => {
    const preferredProvider =
      cdnProviders.find((provider) => provider.enabled) ?? cdnProviders[0] ?? null;
    if (!preferredProvider) {
      setSelectedProviderId("");
      return;
    }

    if (
      !selectedProviderId ||
      !cdnProviders.some((provider) => provider.id === selectedProviderId)
    ) {
      setSelectedProviderId(preferredProvider.id);
    }
  }, [cdnProviders, selectedProviderId]);

  useEffect(() => {
    if (
      selectedProvider?.providerCode === "tencent_cdn" &&
      refreshType !== "url" &&
      refreshType !== "path"
    ) {
      setRefreshType("url");
    }
    if (
      selectedProvider?.providerCode === "aliyun_cdn" &&
      refreshType !== "file" &&
      refreshType !== "directory"
    ) {
      setRefreshType("file");
    }
  }, [refreshType, selectedProvider?.providerCode]);

  async function runRefresh() {
    if (!selectedProviderCode || !isAdminCdnProviderCode(selectedProviderCode)) {
      return;
    }
    if (!canRefresh) {
      setErrorMessage(readiness.message);
      return;
    }

    setBusyAction("refresh");
    setErrorMessage(null);
    setResult(undefined);
    try {
      setResult(
        await refreshCdnCache({
          providerCode: selectedProviderCode,
          urls: refreshUrls,
          directories: refreshDirectories,
          refreshType,
        }),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "CDN 缓存刷新失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function runPrefetch() {
    if (!selectedProviderCode || !isAdminCdnProviderCode(selectedProviderCode)) {
      return;
    }
    if (!canPrefetch) {
      setErrorMessage(readiness.message);
      return;
    }

    setBusyAction("prefetch");
    setErrorMessage(null);
    setResult(undefined);
    try {
      setResult(
        await prefetchCdnUrls({
          providerCode: selectedProviderCode,
          urls: prefetchUrls,
        }),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "CDN URL 预热失败。");
    } finally {
      setBusyAction(null);
    }
  }

  const refreshTypeOptions =
    selectedProvider?.providerCode === "tencent_cdn"
      ? [
          { value: "url", label: "URL" },
          { value: "path", label: "路径目录" },
        ]
      : [
          { value: "file", label: "URL 文件" },
          { value: "directory", label: "目录" },
        ];

  const showCdnProviderSideRail = cdnProviders.length > 1;
  const cdnOperationPanelCount = 2;

  return (
    <section
      data-cdn-operation-panel
      className="grid gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">CDN 操作</p>
          <h3 className="mt-1 text-lg font-bold text-card-foreground">缓存刷新与 URL 预热</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            刷新和预热会消耗 CDN 配额；真实调用开启后会影响线上缓存状态。
          </p>
        </div>
        <Badge variant={readiness.ready ? "success" : "warning"} className="rounded-md">
          {readiness.message}
        </Badge>
      </div>

      <div
        className={cn(
          "grid gap-3",
          showCdnProviderSideRail && "lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]",
        )}
        data-cdn-operation-layout={showCdnProviderSideRail ? "side-provider" : "stacked"}
      >
        <FormField label="服务商">
          <Select
            value={selectedProviderId}
            onChange={(event) => setSelectedProviderId(event.target.value)}
          >
            {cdnProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {providerName(provider)}
              </option>
            ))}
          </Select>
        </FormField>

        <div className={getAdaptiveGridClassName(cdnOperationPanelCount, { breakpoint: "md" })}>
          <section
            className={cn(
              getAdaptiveGridItemClassName(cdnOperationPanelCount, 0, { breakpoint: "md" }),
              "grid gap-3 rounded-md border border-border bg-background/35 p-3",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <SectionTitle title="缓存刷新" description="URL 与目录会按已配置 CDN 域名校验。" />
              <Select
                className="w-32"
                value={refreshType}
                onChange={(event) => setRefreshType(event.target.value as AdminCdnRefreshType)}
              >
                {refreshTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <FormField label="CDN 操作 URL">
              <textarea
                value={refreshUrlsInput}
                onChange={(event) => setRefreshUrlsInput(event.target.value)}
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
                placeholder="https://cdn.example.com/assets/app.js"
              />
            </FormField>
            <FormField label="目录 / 路径">
              <textarea
                value={refreshDirectoriesInput}
                onChange={(event) => setRefreshDirectoriesInput(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
                placeholder="https://cdn.example.com/assets/"
              />
            </FormField>
            <Button disabled={!canRefresh} onClick={() => void runRefresh()}>
              {busyAction === "refresh" ? "刷新中..." : "刷新缓存"}
            </Button>
          </section>

          <section
            className={cn(
              getAdaptiveGridItemClassName(cdnOperationPanelCount, 1, { breakpoint: "md" }),
              "grid gap-3 rounded-md border border-border bg-background/35 p-3",
            )}
          >
            <SectionTitle title="URL 预热" description="预热 URL 同样会按已配置 CDN 域名校验。" />
            <FormField label="CDN 预热 URL">
              <textarea
                value={prefetchUrlsInput}
                onChange={(event) => setPrefetchUrlsInput(event.target.value)}
                rows={7}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
                placeholder="https://cdn.example.com/assets/app.js"
              />
            </FormField>
            <Button disabled={!canPrefetch} onClick={() => void runPrefetch()}>
              {busyAction === "prefetch" ? "预热中..." : "URL 预热"}
            </Button>
          </section>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-danger bg-card px-3 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}
      <CdnOperationResultSummary result={result} />
    </section>
  );
}

export function AdminProvidersClient({ providerType }: AdminProvidersClientProps) {
  const moduleDefinition = useMemo(
    () => providerModules.find((module) => module.key === providerType) ?? defaultProviderModule,
    [providerType],
  );
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
  const [emailTestDrafts, setEmailTestDrafts] = useState<Record<string, string>>({});
  const [emailTestStateByProvider, setEmailTestStateByProvider] = useState<
    Record<string, RowState>
  >({});
  const [emailTestResultByProvider, setEmailTestResultByProvider] = useState<EmailTestResultDrafts>(
    {},
  );
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const savingProviderIds = useRef(new Set<string>());
  const testingProviderIds = useRef(new Set<string>());
  const sendingEmailTestProviderIds = useRef(new Set<string>());

  const loadProviders = useCallback(async () => {
    setLoadState({ status: "saving", message: `正在刷新${moduleDefinition.title}状态...` });
    try {
      const responses = await Promise.all(
        moduleDefinition.apiProviderTypes.map((apiProviderType) =>
          adminApiFetch<ProvidersResponse>(
            `/admin/providers?providerType=${encodeURIComponent(apiProviderType)}`,
          ),
        ),
      );
      const managedProviders = sortManagedProviders(
        responses.flatMap((response) => response.providers),
      ).filter((provider) => getMeta(provider)?.group === moduleDefinition.key);
      const realDevFlags =
        responses.find((response) => response.realDevCallFlags)?.realDevCallFlags ??
        defaultRealDevCallFlags;
      setProviders(managedProviders);
      setRealDevCallFlags(realDevFlags);
      setEnabledDrafts(createEnabledDrafts(managedProviders));
      setPriorityDrafts(createPriorityDrafts(managedProviders));
      setConfigFieldDrafts(createConfigFieldDrafts(managedProviders));
      setSecretFieldDrafts(createEmptyFieldDrafts(managedProviders));
      setClearSecretDrafts(createClearSecretDrafts(managedProviders));
      setEmailTestDrafts(Object.fromEntries(managedProviders.map((provider) => [provider.id, ""])));
      setEmailTestStateByProvider({});
      setEmailTestResultByProvider({});
      setDirtyProviders(
        Object.fromEntries(managedProviders.map((provider) => [provider.id, false])),
      );
      setLoadState({ status: "idle" });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : `无法加载${moduleDefinition.title}配置。`,
      });
    }
  }, [moduleDefinition]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

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

  const visibleProviders = useMemo(
    () => providers.filter((provider) => getMeta(provider)?.group === moduleDefinition.key),
    [moduleDefinition.key, providers],
  );
  const visibleProviderIds = useMemo(
    () => new Set(visibleProviders.map((provider) => provider.id)),
    [visibleProviders],
  );
  const preferredVisibleProvider = useMemo(
    () =>
      visibleProviders.find((provider) =>
        providerNeedsAttention(provider, realDevCallFlags, testStateByProvider[provider.id]),
      ) ??
      visibleProviders.find((provider) => provider.enabled) ??
      visibleProviders[0] ??
      null,
    [realDevCallFlags, testStateByProvider, visibleProviders],
  );
  const selectedProvider = useMemo(
    () => visibleProviders.find((provider) => provider.id === selectedProviderId) ?? null,
    [selectedProviderId, visibleProviders],
  );
  const detailProvider = selectedProvider ?? preferredVisibleProvider;
  const providerModuleLayout = getProviderModuleLayout(visibleProviders.length);
  const useSideProviderList = providerModuleLayout === "side";
  const overviewItems = [
    { label: "模块服务商", value: overview.totalCount },
    { label: "已启用", value: overview.enabledCount },
    { label: "真实调用", value: overview.realEnabledCount },
    { label: "需要处理", value: overview.needsAttentionCount },
  ];

  useEffect(() => {
    if (!preferredVisibleProvider) {
      if (selectedProviderId !== null) {
        setSelectedProviderId(null);
      }
      return;
    }

    if (!selectedProviderId || !visibleProviderIds.has(selectedProviderId)) {
      setSelectedProviderId(preferredVisibleProvider.id);
    }
  }, [preferredVisibleProvider, selectedProviderId, visibleProviderIds]);

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
    const value =
      configFieldDrafts[provider.id]?.[field.key] ?? providerFieldDefaultToInput(provider, field);

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

  function updateEmailTestDraft(providerId: string, value: string) {
    setEmailTestDrafts((current) => ({ ...current, [providerId]: value }));
    setEmailTestStateByProvider((current) => {
      const state = current[providerId];
      if (!state || state.status === "testing") {
        return current;
      }
      return { ...current, [providerId]: { status: "idle" } };
    });
  }

  async function sendTestEmail(provider: SafeProviderConfig) {
    if (
      sendingEmailTestProviderIds.current.has(provider.id) ||
      emailTestStateByProvider[provider.id]?.status === "testing"
    ) {
      return;
    }

    const to = (emailTestDrafts[provider.id] ?? "").trim();
    if (!to) {
      setEmailTestStateByProvider((current) => ({
        ...current,
        [provider.id]: { status: "error", message: "请填写测试邮箱。" },
      }));
      return;
    }

    sendingEmailTestProviderIds.current.add(provider.id);
    setEmailTestStateByProvider((current) => ({
      ...current,
      [provider.id]: { status: "testing", message: "正在发送测试邮件..." },
    }));

    try {
      const result = await adminApiFetch<AdminEmailTestResult>(
        "/admin/providers/email/aliyun_smtp/send-test",
        {
          method: "POST",
          body: JSON.stringify({ to }),
        },
      );
      setEmailTestResultByProvider((current) => ({ ...current, [provider.id]: result }));
      setEmailTestStateByProvider((current) => ({
        ...current,
        [provider.id]: {
          status: result.success ? "saved" : "error",
          message: result.messageZh,
        },
      }));
    } catch (error) {
      setEmailTestResultByProvider((current) => ({ ...current, [provider.id]: undefined }));
      setEmailTestStateByProvider((current) => ({
        ...current,
        [provider.id]: {
          status: "error",
          message: error instanceof Error ? error.message : "测试邮件发送失败，请检查配置后重试。",
        },
      }));
    } finally {
      sendingEmailTestProviderIds.current.delete(provider.id);
    }
  }

  function selectProvider(provider: SafeProviderConfig) {
    setSelectedProviderId(provider.id);
  }

  function renderEmailTestPanel(provider: SafeProviderConfig) {
    const state = emailTestStateByProvider[provider.id];
    const result = emailTestResultByProvider[provider.id];
    const isSending =
      sendingEmailTestProviderIds.current.has(provider.id) || state?.status === "testing";

    return (
      <section
        data-email-send-test-panel
        className="grid gap-3 rounded-md border border-border bg-background/35 px-3 py-3"
      >
        <SectionTitle title="发送测试邮件" description="真实测试会通过当前 SMTP 配置发送邮件。" />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <FormField label="测试邮箱">
            <Input
              type="email"
              value={emailTestDrafts[provider.id] ?? ""}
              placeholder="test@example.com"
              onChange={(event) => updateEmailTestDraft(provider.id, event.target.value)}
            />
          </FormField>
          <Button disabled={isSending} onClick={() => void sendTestEmail(provider)}>
            {isSending ? "发送中..." : "发送测试邮件"}
          </Button>
        </div>
        {state?.message && !result ? (
          <div className={cn("rounded-md border px-3 py-2 text-sm", stateClass(state.status))}>
            {state.message}
          </div>
        ) : null}
        <EmailTestResultDetails result={result} />
      </section>
    );
  }

  function renderProviderListRow(provider: SafeProviderConfig, index: number) {
    const meta = getMeta(provider);
    const saveState = saveStateByProvider[provider.id];
    const testState = testStateByProvider[provider.id];
    const dirty = dirtyProviders[provider.id] ?? false;
    const isSaving = isProviderSaveDisabled(saveState);
    const isTesting = isProviderTestDisabled(testState);
    const realEnabled = isRealDevCallEnabled(provider, realDevCallFlags);
    const needsAttention = providerNeedsAttention(provider, realDevCallFlags, testState);
    const selected = detailProvider?.id === provider.id;

    return (
      <li
        key={provider.id}
        data-provider-summary={providerIdentityKey(provider)}
        className={cn(
          "grid min-w-0 gap-3 px-3 py-3 transition",
          useSideProviderList
            ? "min-w-0"
            : getAdaptiveGridItemClassName(visibleProviders.length, index, { breakpoint: "md" }),
          useSideProviderList
            ? "border-b border-border last:border-b-0"
            : "rounded-md border border-border",
          !useSideProviderList && !selected && "bg-background/35",
          selected && "bg-secondary/70 ring-1 ring-primary/40",
          needsAttention && !selected && "bg-warning/5",
        )}
      >
        <div className="grid min-w-0 gap-2">
          <button
            type="button"
            aria-pressed={selected}
            className="grid min-w-0 gap-1 text-left"
            onClick={() => selectProvider(provider)}
          >
            <span className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
              <span className="grid min-w-0 gap-0.5">
                <span className="break-words text-sm font-bold leading-5 text-card-foreground">
                  {providerName(provider)}
                </span>
                <span className="break-words text-xs leading-5 text-muted-foreground">
                  {providerTypeLabel(provider.providerType)}
                </span>
              </span>
              {needsAttention ? (
                <Badge variant="warning" className="rounded-md px-2 py-0.5">
                  需处理
                </Badge>
              ) : null}
            </span>
            <span className="break-words text-xs leading-5 text-muted-foreground">
              {meta?.purpose ?? "服务商配置与连接测试。"}
            </span>
          </button>

          <div className="flex min-w-0 flex-wrap gap-2">
            <Badge
              variant={provider.enabled ? "success" : "muted"}
              className="rounded-md px-2 py-0.5"
            >
              {provider.enabled ? "启用" : "停用"}
            </Badge>
            <Badge variant={realEnabled ? "success" : "muted"} className="rounded-md px-2 py-0.5">
              真实：{realEnabled ? "开" : "关"}
            </Badge>
            <Badge variant={secretStatusVariant(provider)} className="rounded-md px-2 py-0.5">
              密钥：{secretStatusLabel(provider)}
            </Badge>
            <Badge variant={testStatusVariant(testState)} className="rounded-md px-2 py-0.5">
              测试：{testStatusLabel(testState)}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {meta?.capabilities.slice(0, 3).map((capability) => (
              <Badge key={capability} variant="info" className="rounded-md px-2 py-0.5">
                {capability}
              </Badge>
            ))}
            <FeedbackPill state={saveState} dirty={dirty} />
            <FeedbackPill state={testState} />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <Button size="sm" onClick={() => selectProvider(provider)}>
              配置
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label="测试连接"
              disabled={isTesting}
              onClick={() => void testProvider(provider)}
            >
              {providerTestButtonLabel(testState)}
            </Button>
            {dirty ? (
              <Button
                size="sm"
                aria-label="保存配置"
                disabled={isSaving}
                onClick={() => void saveProvider(provider)}
              >
                {providerSaveButtonLabel(saveState)}
              </Button>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  function renderProviderDetail(provider: SafeProviderConfig) {
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
    const advancedOpen = advancedProviders[provider.id] ?? false;
    const basicControls = [
      {
        key: "enabled",
        node: (
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
        ),
      },
      ...(realCallField
        ? [
            {
              key: realCallField.key,
              node: renderConfigField(provider, realCallField),
            },
          ]
        : []),
    ];

    return (
      <article
        key={provider.id}
        data-provider-detail={providerIdentityKey(provider)}
        className="grid min-w-0 gap-4 rounded-lg border border-primary/50 bg-card p-4 shadow-sm"
      >
        <p className="text-xs font-semibold text-primary">顶部概览</p>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold text-card-foreground">{providerName(provider)}</h4>
              <Badge variant="muted" className="rounded-md">
                {providerTypeLabel(provider.providerType)}
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {meta?.purpose ?? "服务商配置与连接测试。"}
            </p>
          </div>
          <Badge variant={provider.enabled ? "success" : "muted"} className="rounded-md">
            {provider.enabled ? "已启用" : "未启用"}
          </Badge>
        </div>

        <StatusFacts provider={provider} flags={realDevCallFlags} testState={testState} />

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
            <div
              className={getAdaptiveGridClassName(basicControls.length, {
                breakpoint: "sm",
                gapClassName: "gap-2",
              })}
            >
              {basicControls.map((control, index) => (
                <div
                  key={control.key}
                  className={getAdaptiveGridItemClassName(basicControls.length, index, {
                    breakpoint: "sm",
                  })}
                >
                  {control.node}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3">
            <SectionTitle
              title="常用配置"
              description={
                requiredConfigFields.length > 0
                  ? "常用参数直接编辑，正常管理员不需要处理原始 JSON。"
                  : "该服务商没有额外常用参数；如需密钥请在下方维护。"
              }
            />
            {requiredConfigFields.length > 0 ? (
              <div
                className={getAdaptiveGridClassName(requiredConfigFields.length, {
                  breakpoint: "sm",
                })}
              >
                {requiredConfigFields.map((field, index) => (
                  <div
                    key={field.key}
                    className={getAdaptiveGridItemClassName(requiredConfigFields.length, index, {
                      breakpoint: "sm",
                    })}
                  >
                    {renderConfigField(provider, field)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-border bg-background/45 px-3 py-2 text-sm text-muted-foreground">
                保存密钥或开关后即可测试连接。
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
                  const clearSelected = clearSecretDrafts[provider.id]?.[field.key] ?? false;
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
                            updateSecretField(provider.id, field.key, event.target.value)
                          }
                        />
                        {field.password ? (
                          <Button
                            variant="secondary"
                            onClick={() => toggleSecretVisibility(provider.id, field.key)}
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

          {isAliyunSmtpProvider(provider) ? renderEmailTestPanel(provider) : null}

          <ProviderCardErrorBoundary providerLabel={providerName(provider)}>
            <AdvancedConfigContent
              provider={provider}
              advancedOpen={advancedOpen}
              advancedConfigFields={advancedConfigFields}
              priority={priorityDrafts[provider.id] ?? provider.priority}
              onOpenChange={(open) => {
                setAdvancedProviders((current) => ({
                  ...current,
                  [provider.id]: open,
                }));
              }}
              onPriorityChange={(priority) => {
                markProviderDirty(provider.id);
                setPriorityDrafts((current) => ({
                  ...current,
                  [provider.id]: priority,
                }));
              }}
              renderConfigField={renderConfigField}
            />
          </ProviderCardErrorBoundary>
        </div>

        <footer className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-2">
              <FeedbackPill state={saveState} dirty={dirty} />
              <FeedbackPill state={testState} />
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                aria-label="保存配置"
                disabled={isSaving}
                onClick={() => void saveProvider(provider)}
              >
                {providerSaveButtonLabel(saveState)}
              </Button>
              <Button
                variant="secondary"
                aria-label="测试连接"
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
    <div
      className="grid w-full gap-5"
      data-provider-console
      data-provider-module={moduleDefinition.key}
    >
      <header className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-normal text-foreground">
            {moduleDefinition.title}服务商
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            {moduleDefinition.description}
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
        </div>
      </header>

      {loadState.message ? (
        <div className={cn("rounded-md border px-3 py-2 text-sm", stateClass(loadState.status))}>
          {loadState.message}
        </div>
      ) : null}

      <section
        aria-label={`${moduleDefinition.title}模块概览`}
        className={getAdaptiveGridClassName(overviewItems.length, {
          variant: "metric",
          allowFourMetricColumns: true,
          gapClassName: "gap-2",
        })}
      >
        {overviewItems.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              getAdaptiveGridItemClassName(overviewItems.length, index, { variant: "metric" }),
              "rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm",
            )}
          >
            <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-xl font-bold leading-tight text-card-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </section>

      <section
        className={cn(
          "grid gap-4",
          visibleProviders.length > 1 &&
            (useSideProviderList
              ? "xl:grid-cols-[minmax(420px,500px)_minmax(0,1fr)]"
              : "xl:grid-cols-1"),
        )}
        data-provider-module-grid
        data-provider-layout={providerModuleLayout}
      >
        {providerModuleLayout === "single-detail" && detailProvider ? (
          <section data-provider-single-detail className="min-w-0">
            {renderProviderDetail(detailProvider)}
          </section>
        ) : (
          <>
            <section
              aria-label={`${moduleDefinition.title}服务商列表`}
              data-provider-list
              data-provider-list-layout={useSideProviderList ? "side" : "top"}
              className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
            >
              <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary">当前模块</p>
                  <h3 className="mt-1 text-lg font-bold text-foreground">
                    {moduleDefinition.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {useSideProviderList
                      ? "选择一个服务商后，在右侧维护完整配置和连接测试。"
                      : "选择一个服务商后，在下方维护完整配置和连接测试。"}
                  </p>
                </div>
                <Badge variant="muted" className="rounded-md">
                  {visibleProviders.length} 个服务商
                </Badge>
              </div>

              {visibleProviders.length > 0 ? (
                <ul
                  data-provider-list-group={moduleDefinition.key}
                  className={cn(
                    "min-w-0",
                    useSideProviderList
                      ? "grid"
                      : getAdaptiveGridClassName(visibleProviders.length, {
                          breakpoint: "md",
                          className: "p-3",
                        }),
                  )}
                >
                  {visibleProviders.map((provider, index) =>
                    renderProviderListRow(provider, index),
                  )}
                </ul>
              ) : (
                <EmptyState
                  title={`当前没有可管理的${moduleDefinition.title}服务商`}
                  description="请确认后台 API 已返回该模块的安全服务商配置。"
                />
              )}
            </section>

            {visibleProviders.length > 0 ? (
              <section data-provider-detail-panel className="min-w-0">
                {detailProvider ? renderProviderDetail(detailProvider) : null}
              </section>
            ) : null}
          </>
        )}
      </section>

      {moduleDefinition.key === "cdn" ? <CdnOperationsPanel providers={visibleProviders} /> : null}
    </div>
  );
}
