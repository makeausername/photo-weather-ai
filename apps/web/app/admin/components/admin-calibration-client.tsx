"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Select,
  Table,
  Textarea,
} from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type {
  AdminCalibrationComparison,
  AdminCalibrationStats,
  AdminCalibrationTarget,
  AdminForecastReplayResult,
  AdminGeoSearchResult,
  AdminObservedOutcome,
} from "../admin-api";
import {
  AdminActionToast,
  type AdminActionFeedback,
  type AdminActionFeedbackInput,
} from "./admin-action-feedback";

type CalibrationOverviewResponse = {
  readonly overview: {
    readonly totalReplayRuns: number;
    readonly totalHistoricalSamples: number;
    readonly totalObservedOutcomes: number;
  };
  readonly targets: AdminCalibrationTarget[];
  readonly minimumHintSampleCount: number;
  readonly stats: AdminCalibrationStats[];
  readonly recentResults: AdminForecastReplayResult[];
  readonly outcomes: AdminObservedOutcome[];
};

type ReplayResultsResponse = {
  readonly results: AdminForecastReplayResult[];
  readonly outcomes: AdminObservedOutcome[];
  readonly comparisons: AdminCalibrationComparison[];
};

type ManualLocationForm = {
  readonly locationName: string;
  readonly latitudeWgs84: string;
  readonly longitudeWgs84: string;
  readonly elevationMeters: string;
  readonly timezone: string;
};

type ManualCalibrationLocationPayload = {
  readonly locationName: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters: number | null;
  readonly timezone: string;
};

type CalibrationLocationResponse = {
  readonly locationName: string;
  readonly locationKey: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters?: number | null;
};

type GeoSearchResponse = {
  readonly provider: string;
  readonly results: AdminGeoSearchResult[];
};

type OutcomeForm = {
  readonly outcomeDate: string;
  readonly observedResult: AdminObservedOutcome["observedResult"];
  readonly cloudSeaLevel: string;
  readonly whiteoutLevel: string;
  readonly sunriseGlowLevel: string;
  readonly sunsetGlowLevel: string;
  readonly astroVisibilityLevel: string;
  readonly milkyWayVisibilityLevel: string;
  readonly transparencyLevel: string;
  readonly rainImpactLevel: string;
  readonly observationWindowStart: string;
  readonly observationWindowEnd: string;
  readonly notes: string;
  readonly photoEvidenceUrl: string;
};

const targetLabels: Record<AdminCalibrationTarget, string> = {
  general: "综合",
  cloud_sea: "云海",
  glow: "霞光",
  astro: "星空",
};

const matchStatusLabels: Record<AdminCalibrationComparison["matchStatus"], string> = {
  true_positive: "正向命中",
  true_negative: "保守命中",
  false_positive: "误报",
  false_negative: "漏报",
  partial_match: "部分命中",
  unlabeled: "未标注",
  unknown: "未知",
};

const observedResultLabels: Record<AdminObservedOutcome["observedResult"], string> = {
  success: "成功",
  partial: "部分成功",
  fail: "失败",
  unknown: "未知",
};

const emptyOutcomeForm: OutcomeForm = {
  outcomeDate: todayDate(),
  observedResult: "unknown",
  cloudSeaLevel: "",
  whiteoutLevel: "",
  sunriseGlowLevel: "",
  sunsetGlowLevel: "",
  astroVisibilityLevel: "",
  milkyWayVisibilityLevel: "",
  transparencyLevel: "",
  rainImpactLevel: "",
  observationWindowStart: "",
  observationWindowEnd: "",
  notes: "",
  photoEvidenceUrl: "",
};

const emptyManualLocationForm: ManualLocationForm = {
  locationName: "",
  latitudeWgs84: "",
  longitudeWgs84: "",
  elevationMeters: "",
  timezone: "Asia/Shanghai",
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgo(): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - 7);
  return value.toISOString().slice(0, 10);
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "暂无";
}

function formatDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "暂无";
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start || !end) {
    return "暂无";
  }
  return `${new Date(start).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })}-${new Date(end).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalDateTimeWithOffset(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+08:00`;
}

function outcomeForResult(
  result: AdminForecastReplayResult,
  outcomes: readonly AdminObservedOutcome[],
): AdminObservedOutcome | undefined {
  return outcomes.find(
    (outcome) =>
      outcome.locationKey === result.locationKey &&
      outcome.target === result.target &&
      outcome.outcomeDate.slice(0, 10) === result.forecastDate.slice(0, 10),
  );
}

function comparisonForResult(
  result: AdminForecastReplayResult,
  comparisons: readonly AdminCalibrationComparison[],
): AdminCalibrationComparison | undefined {
  return comparisons.find((comparison) => comparison.replayResultId === result.id);
}

function statusVariant(
  status: AdminCalibrationComparison["matchStatus"] | undefined,
): "success" | "warning" | "danger" | "muted" {
  if (status === "true_positive" || status === "true_negative") {
    return "success";
  }
  if (status === "false_positive" || status === "false_negative") {
    return "danger";
  }
  if (status === "partial_match") {
    return "warning";
  }
  return "muted";
}

function summaryJsonObject(value: AdminCalibrationStats["summaryJson"]) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function summaryStringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function calibrationHintText(stats: AdminCalibrationStats | undefined, minimumSamples: number): string {
  if (!stats || stats.labeledCount < minimumSamples) {
    return "历史样本较少，当前仍以实时判断为主。";
  }
  if (stats.falsePositiveRate >= 0.35) {
    return "历史回放显示该地点同类条件偏乐观，建议出发前复核临近预报。";
  }
  if (stats.falseNegativeRate >= 0.35) {
    return "历史回放显示该地点偶有低分出片情况，若已在附近可保留机动观察。";
  }
  if (stats.hitRate >= 0.75) {
    return "该地点同类条件历史命中率较稳定。";
  }
  return "当前样本未显示明显系统性偏差，仍建议按临近预报复核。";
}

function requiredNumber(fieldName: string, value: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName}必须是有效数字。`);
  }
  return parsed;
}

function optionalNumber(fieldName: string, value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  return requiredNumber(fieldName, value);
}

function buildWgs84LocationKey(latitudeWgs84: number, longitudeWgs84: number): string {
  return `wgs84:${latitudeWgs84.toFixed(5)},${longitudeWgs84.toFixed(5)}`;
}

function manualLocationPayload(form: ManualLocationForm): ManualCalibrationLocationPayload {
  const locationName = form.locationName.trim();
  if (!locationName) {
    throw new Error("请填写地点名称与 WGS84 坐标。");
  }

  const latitudeWgs84 = requiredNumber("WGS84 纬度", form.latitudeWgs84);
  const longitudeWgs84 = requiredNumber("WGS84 经度", form.longitudeWgs84);
  const elevationMeters = optionalNumber("海拔", form.elevationMeters);
  const timezone = form.timezone.trim() || "Asia/Shanghai";

  return {
    locationName,
    latitudeWgs84,
    longitudeWgs84,
    elevationMeters,
    timezone,
  };
}

function manualLocationKey(form: ManualLocationForm): string {
  try {
    const payload = manualLocationPayload(form);
    return buildWgs84LocationKey(payload.latitudeWgs84, payload.longitudeWgs84);
  } catch {
    return "";
  }
}

function formFromReturnedLocation(
  current: ManualLocationForm,
  location: CalibrationLocationResponse,
): ManualLocationForm {
  return {
    ...current,
    locationName: location.locationName,
    latitudeWgs84: String(location.latitudeWgs84),
    longitudeWgs84: String(location.longitudeWgs84),
    elevationMeters:
      location.elevationMeters === null || location.elevationMeters === undefined
        ? current.elevationMeters
        : String(location.elevationMeters),
  };
}

export function AdminCalibrationClient() {
  const [stats, setStats] = useState<AdminCalibrationStats[]>([]);
  const [results, setResults] = useState<AdminForecastReplayResult[]>([]);
  const [outcomes, setOutcomes] = useState<AdminObservedOutcome[]>([]);
  const [comparisons, setComparisons] = useState<AdminCalibrationComparison[]>([]);
  const [overview, setOverview] = useState({
    totalReplayRuns: 0,
    totalHistoricalSamples: 0,
    totalObservedOutcomes: 0,
  });
  const [minimumSamples, setMinimumSamples] = useState(10);
  const [manualLocation, setManualLocation] =
    useState<ManualLocationForm>(emptyManualLocationForm);
  const [geoSearchQuery, setGeoSearchQuery] = useState("");
  const [geoSearchResults, setGeoSearchResults] = useState<AdminGeoSearchResult[]>([]);
  const [target, setTarget] = useState<AdminCalibrationTarget>("general");
  const [startDate, setStartDate] = useState(sevenDaysAgo());
  const [endDate, setEndDate] = useState(todayDate());
  const [outcomeForm, setOutcomeForm] = useState<OutcomeForm>(emptyOutcomeForm);
  const [status, setStatus] = useState("正在加载历史校准数据...");
  const [actionToast, setActionToast] = useState<AdminActionFeedback | null>(null);
  const actionToastId = useRef(0);

  function showActionToast(feedback: AdminActionFeedbackInput) {
    actionToastId.current += 1;
    setActionToast({ id: actionToastId.current, ...feedback });
  }

  const selectedLocationKey = useMemo(() => manualLocationKey(manualLocation), [manualLocation]);
  const filteredStats = stats.filter(
    (item) =>
      (!selectedLocationKey || item.locationKey === selectedLocationKey) && item.target === target,
  );
  const selectedStats = selectedLocationKey ? filteredStats[0] : undefined;
  const selectedSummary = selectedStats ? summaryJsonObject(selectedStats.summaryJson) : {};
  const mismatchReasons = summaryStringList(selectedSummary.mismatchReasons);

  async function loadOverview() {
    try {
      const response = await adminApiFetch<CalibrationOverviewResponse>("/admin/calibration");
      setOverview(response.overview);
      setStats(response.stats);
      setResults(response.recentResults);
      setOutcomes(response.outcomes);
      setComparisons([]);
      setMinimumSamples(response.minimumHintSampleCount);
      setStatus("历史校准数据已加载。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function loadReplayResults(nextLocationKey = selectedLocationKey, nextTarget = target) {
    const params = new URLSearchParams({
      target: nextTarget,
      limit: "100",
    });
    if (nextLocationKey) {
      params.set("locationKey", nextLocationKey);
    }
    const response = await adminApiFetch<ReplayResultsResponse>(
      `/admin/calibration/replay-results?${params.toString()}`,
    );
    setResults(response.results);
    setOutcomes(response.outcomes);
    setComparisons(response.comparisons);
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  function updateManualLocation<K extends keyof ManualLocationForm>(
    key: K,
    value: ManualLocationForm[K],
  ) {
    setManualLocation((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function fetchHistory() {
    const loadingMessage = "正在拉取历史天气...";
    setStatus(loadingMessage);
    showActionToast({
      variant: "saving",
      title: "历史天气",
      message: loadingMessage,
    });
    try {
      const locationPayload = manualLocationPayload(manualLocation);
      const response = await adminApiFetch<{
        readonly location: CalibrationLocationResponse;
        readonly insertedCount: number;
        readonly skippedDuplicateCount: number;
        readonly sampleCount: number;
      }>("/admin/calibration/fetch-history", {
        method: "POST",
        body: JSON.stringify({ ...locationPayload, startDate, endDate }),
      });
      setManualLocation((current) => formFromReturnedLocation(current, response.location));
      const message = `历史天气已入库：新增 ${response.insertedCount} 条，跳过重复 ${response.skippedDuplicateCount} 条。`;
      setStatus(message);
      showActionToast({
        variant: "success",
        title: "历史天气",
        message,
      });
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "历史天气",
        message,
      });
    }
  }

  async function runReplay() {
    const loadingMessage = "正在执行历史回放...";
    setStatus(loadingMessage);
    showActionToast({
      variant: "saving",
      title: "历史回放",
      message: loadingMessage,
    });
    try {
      const locationPayload = manualLocationPayload(manualLocation);
      const locationKey = buildWgs84LocationKey(
        locationPayload.latitudeWgs84,
        locationPayload.longitudeWgs84,
      );
      const response = await adminApiFetch<{ readonly resultCount: number }>(
        "/admin/calibration/replay",
        {
          method: "POST",
          body: JSON.stringify({
            ...locationPayload,
            startDate,
            endDate,
            target,
          }),
        },
      );
      await loadReplayResults(locationKey, target);
      const message = `历史回放完成：生成 ${response.resultCount} 条预测结果。`;
      setStatus(message);
      showActionToast({
        variant: "success",
        title: "历史回放",
        message,
      });
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "历史回放",
        message,
      });
    }
  }

  async function rebuildStats() {
    const loadingMessage = "正在计算校准统计...";
    setStatus(loadingMessage);
    showActionToast({
      variant: "saving",
      title: "校准统计",
      message: loadingMessage,
    });
    try {
      const locationPayload = manualLocationPayload(manualLocation);
      const response = await adminApiFetch<{ readonly stats: AdminCalibrationStats }>(
        "/admin/calibration/stats/rebuild",
        {
          method: "POST",
          body: JSON.stringify({ ...locationPayload, target }),
        },
      );
      setStats((current) => [
        response.stats,
        ...current.filter(
          (item) =>
            !(
              item.locationKey === response.stats.locationKey &&
              item.target === response.stats.target &&
              item.ruleVersion === response.stats.ruleVersion
            ),
        ),
      ]);
      const message = "校准统计已更新。";
      setStatus(message);
      showActionToast({
        variant: "success",
        title: "校准统计",
        message,
      });
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "校准统计",
        message,
      });
    }
  }

  async function saveOutcome() {
    const loadingMessage = "正在保存观测标注...";
    setStatus(loadingMessage);
    showActionToast({
      variant: "saving",
      title: "保存观测标注",
      message: loadingMessage,
    });
    try {
      const locationPayload = manualLocationPayload(manualLocation);
      const locationKey = buildWgs84LocationKey(
        locationPayload.latitudeWgs84,
        locationPayload.longitudeWgs84,
      );
      const response = await adminApiFetch<{ readonly outcome: AdminObservedOutcome }>(
        "/admin/calibration/outcomes",
        {
          method: "POST",
          body: JSON.stringify({
            ...locationPayload,
            target,
            outcomeDate: outcomeForm.outcomeDate,
            observedResult: outcomeForm.observedResult,
            cloudSeaLevel: optionalText(outcomeForm.cloudSeaLevel),
            whiteoutLevel: optionalText(outcomeForm.whiteoutLevel),
            sunriseGlowLevel: optionalText(outcomeForm.sunriseGlowLevel),
            sunsetGlowLevel: optionalText(outcomeForm.sunsetGlowLevel),
            astroVisibilityLevel: optionalText(outcomeForm.astroVisibilityLevel),
            milkyWayVisibilityLevel: optionalText(outcomeForm.milkyWayVisibilityLevel),
            transparencyLevel: optionalText(outcomeForm.transparencyLevel),
            rainImpactLevel: optionalText(outcomeForm.rainImpactLevel),
            observationWindowStart: optionalDateTimeWithOffset(outcomeForm.observationWindowStart),
            observationWindowEnd: optionalDateTimeWithOffset(outcomeForm.observationWindowEnd),
            notes: optionalText(outcomeForm.notes),
            photoEvidenceUrl: optionalText(outcomeForm.photoEvidenceUrl),
          }),
        },
      );
      setOutcomes((current) => [
        response.outcome,
        ...current.filter((item) => item.id !== response.outcome.id),
      ]);
      const outcomeLatitudeWgs84 = response.outcome.latitudeWgs84;
      const outcomeLongitudeWgs84 = response.outcome.longitudeWgs84;
      if (typeof outcomeLatitudeWgs84 === "number" && typeof outcomeLongitudeWgs84 === "number") {
        setManualLocation((current) =>
          formFromReturnedLocation(current, {
            locationName: response.outcome.locationName,
            locationKey: response.outcome.locationKey ?? locationKey,
            latitudeWgs84: outcomeLatitudeWgs84,
            longitudeWgs84: outcomeLongitudeWgs84,
          }),
        );
      }
      await loadReplayResults(locationKey, target);
      const message = "观测标注已保存。";
      setStatus(message);
      showActionToast({
        variant: "success",
        title: "保存观测标注",
        message,
      });
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "保存观测标注",
        message,
      });
    }
  }

  function selectResultForOutcome(result: AdminForecastReplayResult) {
    const existing = outcomeForResult(result, outcomes);
    setOutcomeForm((current) => ({
      ...current,
      outcomeDate: result.forecastDate.slice(0, 10),
      observedResult: existing?.observedResult ?? current.observedResult,
      cloudSeaLevel: existing?.cloudSeaLevel ?? current.cloudSeaLevel,
      whiteoutLevel: existing?.whiteoutLevel ?? current.whiteoutLevel,
      sunriseGlowLevel: existing?.sunriseGlowLevel ?? current.sunriseGlowLevel,
      sunsetGlowLevel: existing?.sunsetGlowLevel ?? current.sunsetGlowLevel,
      astroVisibilityLevel: existing?.astroVisibilityLevel ?? current.astroVisibilityLevel,
      milkyWayVisibilityLevel:
        existing?.milkyWayVisibilityLevel ?? current.milkyWayVisibilityLevel,
      transparencyLevel: existing?.transparencyLevel ?? current.transparencyLevel,
      rainImpactLevel: existing?.rainImpactLevel ?? current.rainImpactLevel,
      observationWindowStart:
        existing?.observationWindowStart?.slice(0, 16) ?? current.observationWindowStart,
      observationWindowEnd: existing?.observationWindowEnd?.slice(0, 16) ?? current.observationWindowEnd,
      notes: existing?.notes ?? current.notes,
      photoEvidenceUrl: existing?.photoEvidenceUrl ?? current.photoEvidenceUrl,
    }));
  }

  async function searchGeoLocation() {
    const query = geoSearchQuery.trim();
    if (!query) {
      const message = "请输入要搜索的地点名称。";
      setStatus(message);
      showActionToast({
        variant: "warning",
        title: "地点搜索",
        message,
      });
      return;
    }

    const loadingMessage = "正在搜索地点...";
    setStatus(loadingMessage);
    showActionToast({
      variant: "saving",
      title: "地点搜索",
      message: loadingMessage,
    });
    try {
      const response = await adminApiFetch<GeoSearchResponse>(
        `/admin/geo/search?q=${encodeURIComponent(query)}`,
      );
      setGeoSearchResults(response.results);
      const message =
        response.results.length > 0 ? "地点搜索结果已加载。" : "未找到地点，请手动填写 WGS84 坐标。";
      setStatus(message);
      showActionToast({
        variant: response.results.length > 0 ? "success" : "warning",
        title: "地点搜索",
        message,
      });
    } catch (error) {
      setGeoSearchResults([]);
      const message = `${(error as Error).message}。可继续手动填写 WGS84 坐标。`;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "地点搜索",
        message,
      });
    }
  }

  function applyGeoSearchResult(result: AdminGeoSearchResult) {
    setManualLocation((current) => ({
      ...current,
      locationName: result.name,
      latitudeWgs84: String(result.coordinatesWgs84.latitude),
      longitudeWgs84: String(result.coordinatesWgs84.longitude),
    }));
    setGeoSearchQuery(result.name);
    setGeoSearchResults([]);
    const message = "已填入搜索结果，可按需校正 WGS84 坐标。";
    setStatus(message);
    showActionToast({
      variant: "info",
      title: "地点搜索",
      message,
    });
  }

  return (
    <div className="grid gap-5">
      <AdminActionToast feedback={actionToast} onDismiss={() => setActionToast(null)} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-bold">地点校准概览</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              普通结果页至少需要 {minimumSamples} 条样本才显示历史校准提示。
            </p>
          </div>
          <Badge variant="info">{status}</Badge>
        </div>
        <div className="grid gap-3 border-b border-border p-5 md:grid-cols-3">
          <OverviewMetric label="回放批次" value={overview.totalReplayRuns} />
          <OverviewMetric label="历史样本" value={overview.totalHistoricalSamples} />
          <OverviewMetric label="观测标注" value={overview.totalObservedOutcomes} />
        </div>
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-4">
          {Object.entries(targetLabels).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={target === value ? "primary" : "secondary"}
              onClick={() => {
                const nextTarget = value as AdminCalibrationTarget;
                setTarget(nextTarget);
                void loadReplayResults(selectedLocationKey, nextTarget);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 border-b border-border p-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="地点名称">
              <Input
                value={manualLocation.locationName}
                onChange={(event) => updateManualLocation("locationName", event.target.value)}
              />
            </FormField>
            <FormField label="WGS84 纬度">
              <Input
                inputMode="decimal"
                value={manualLocation.latitudeWgs84}
                onChange={(event) => updateManualLocation("latitudeWgs84", event.target.value)}
              />
            </FormField>
            <FormField label="WGS84 经度">
              <Input
                inputMode="decimal"
                value={manualLocation.longitudeWgs84}
                onChange={(event) => updateManualLocation("longitudeWgs84", event.target.value)}
              />
            </FormField>
            <FormField label="海拔（米，可选）">
              <Input
                inputMode="decimal"
                value={manualLocation.elevationMeters}
                onChange={(event) => updateManualLocation("elevationMeters", event.target.value)}
              />
            </FormField>
            <FormField label="时区">
              <Input
                value={manualLocation.timezone}
                onChange={(event) => updateManualLocation("timezone", event.target.value)}
              />
            </FormField>
            <div className="self-end text-xs leading-5 text-muted-foreground xl:col-span-1">
              天气与历史样本按 WGS84 坐标匹配；搜索结果只填入表单，不会创建保存地点。
            </div>
          </div>

          <div className="grid content-start gap-3">
            <FormField label="搜索地点（可选）">
              <div className="flex gap-2">
                <Input
                  value={geoSearchQuery}
                  onChange={(event) => setGeoSearchQuery(event.target.value)}
                />
                <Button variant="secondary" onClick={() => void searchGeoLocation()}>
                  搜索
                </Button>
              </div>
            </FormField>
            {geoSearchResults.length > 0 ? (
              <div className="grid gap-2">
                {geoSearchResults.slice(0, 4).map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition hover:border-primary hover:bg-secondary"
                    onClick={() => applyGeoSearchResult(result)}
                  >
                    <span className="font-semibold text-foreground">{result.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {[result.province, result.city, result.district].filter(Boolean).join(" / ") ||
                        result.address ||
                        "WGS84 坐标结果"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <FormField label="开始日期">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FormField>
          <FormField label="结束日期">
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-border px-5 py-4">
          <Button onClick={() => void fetchHistory()}>拉取历史天气</Button>
          <Button variant="secondary" onClick={() => void runReplay()}>
            运行历史回放
          </Button>
          <Button variant="secondary" onClick={() => void rebuildStats()}>
            重新统计
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-bold">回放结果</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              显示当前手动位置和目标的历史预测、人工标注和命中状态；未填写位置时显示近期全局回放。
            </p>
          </div>
          {results.length > 0 ? (
            <Table aria-label="历史回放结果">
              <thead className="bg-muted text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">日期</th>
                  <th className="px-4 py-3">目标</th>
                  <th className="px-4 py-3">预测</th>
                  <th className="px-4 py-3">分数</th>
                  <th className="px-4 py-3">最佳窗口</th>
                  <th className="px-4 py-3">主目标</th>
                  <th className="px-4 py-3">置信度</th>
                  <th className="px-4 py-3">观测</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((result) => {
                  const outcome = outcomeForResult(result, outcomes);
                  const comparison = comparisonForResult(result, comparisons);
                  const matched = comparison?.matchStatus ?? "unlabeled";
                  return (
                    <tr key={result.id}>
                      <td className="px-4 py-3">{formatDate(result.forecastDate)}</td>
                      <td className="px-4 py-3">{targetLabels[result.target]}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{result.recommendationLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {result.dedicatedTripRecommendation ?? result.nearbyObservationRecommendation ?? "暂无"}
                        </div>
                      </td>
                      <td className="px-4 py-3">{Math.round(result.overallScore ?? 0)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>{formatWindow(result.bestWindowStart, result.bestWindowEnd)}</div>
                      </td>
                      <td className="px-4 py-3">{result.bestSubject ?? "暂无"}</td>
                      <td className="px-4 py-3">{result.confidenceLabel ?? "暂无"}</td>
                      <td className="px-4 py-3">
                        {outcome ? observedResultLabels[outcome.observedResult] : "未标注"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(matched)}>{matchStatusLabels[matched]}</Badge>
                        {comparison?.mismatchReasons[0] ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {comparison.mismatchReasons[0]}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => selectResultForOutcome(result)}
                        >
                          {outcome ? "编辑标注" : "标注结果"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="暂无回放结果" description="填写地点名称与 WGS84 坐标后，可拉取历史天气并执行规则回放。" />
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-bold">观测标注</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              人工记录真实结果，用于命中率和误报统计。
            </p>
          </div>
          <form
            className="grid gap-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void saveOutcome();
            }}
          >
            <FormField label="结果日期">
              <Input
                type="date"
                value={outcomeForm.outcomeDate}
                onChange={(event) =>
                  setOutcomeForm((current) => ({ ...current, outcomeDate: event.target.value }))
                }
              />
            </FormField>
            <FormField label="实际结果">
              <Select
                value={outcomeForm.observedResult}
                onChange={(event) =>
                  setOutcomeForm((current) => ({
                    ...current,
                    observedResult: event.target.value as OutcomeForm["observedResult"],
                  }))
                }
              >
                <option value="success">成功</option>
                <option value="partial">部分成功</option>
                <option value="fail">失败</option>
                <option value="unknown">未知</option>
              </Select>
            </FormField>
            <div className="grid gap-3 md:grid-cols-2">
              <LevelSelect
                label="云海强度"
                value={outcomeForm.cloudSeaLevel}
                onChange={(value) =>
                  setOutcomeForm((current) => ({ ...current, cloudSeaLevel: value }))
                }
              />
              <LevelSelect
                label="白墙风险"
                value={outcomeForm.whiteoutLevel}
                mode="risk"
                onChange={(value) =>
                  setOutcomeForm((current) => ({ ...current, whiteoutLevel: value }))
                }
              />
              <LevelSelect
                label="朝霞强度"
                value={outcomeForm.sunriseGlowLevel}
                onChange={(value) =>
                  setOutcomeForm((current) => ({ ...current, sunriseGlowLevel: value }))
                }
              />
              <LevelSelect
                label="晚霞强度"
                value={outcomeForm.sunsetGlowLevel}
                onChange={(value) =>
                  setOutcomeForm((current) => ({ ...current, sunsetGlowLevel: value }))
                }
              />
              <LevelSelect
                label="星空可见"
                value={outcomeForm.astroVisibilityLevel}
                onChange={(value) =>
                  setOutcomeForm((current) => ({ ...current, astroVisibilityLevel: value }))
                }
              />
              <LevelSelect
                label="银河可见"
                value={outcomeForm.milkyWayVisibilityLevel}
                onChange={(value) =>
                  setOutcomeForm((current) => ({ ...current, milkyWayVisibilityLevel: value }))
                }
              />
              <TransparencySelect
                value={outcomeForm.transparencyLevel}
                onChange={(value) =>
                  setOutcomeForm((current) => ({ ...current, transparencyLevel: value }))
                }
              />
              <LevelSelect
                label="降水影响"
                value={outcomeForm.rainImpactLevel}
                mode="risk"
                onChange={(value) =>
                  setOutcomeForm((current) => ({ ...current, rainImpactLevel: value }))
                }
              />
            </div>
            <FormField label="观测开始">
              <Input
                type="datetime-local"
                value={outcomeForm.observationWindowStart}
                onChange={(event) =>
                  setOutcomeForm((current) => ({
                    ...current,
                    observationWindowStart: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="观测结束">
              <Input
                type="datetime-local"
                value={outcomeForm.observationWindowEnd}
                onChange={(event) =>
                  setOutcomeForm((current) => ({
                    ...current,
                    observationWindowEnd: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="照片证据链接">
              <Input
                value={outcomeForm.photoEvidenceUrl}
                onChange={(event) =>
                  setOutcomeForm((current) => ({
                    ...current,
                    photoEvidenceUrl: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="备注">
              <Textarea
                value={outcomeForm.notes}
                onChange={(event) =>
                  setOutcomeForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </FormField>
            <Button type="submit">保存标注</Button>
          </form>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">校准统计</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            统计仅用于保守调整置信度，不自动改写确定性规则。
          </p>
        </div>
        {selectedStats ? (
          <div className="grid gap-4 p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <OverviewMetric label="已标注样本" value={selectedStats.labeledCount} />
              <OverviewMetric label="命中率" value={formatPercent(selectedStats.hitRate)} />
              <OverviewMetric label="误报率" value={formatPercent(selectedStats.falsePositiveRate)} />
              <OverviewMetric label="漏报率" value={formatPercent(selectedStats.falseNegativeRate)} />
            </div>
            <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
              <div className="rounded-lg border border-border bg-muted p-4">
                <div className="text-sm font-semibold">常见错配原因</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {mismatchReasons.length > 0 ? mismatchReasons.join("；") : "暂无明显集中错配。"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted p-4">
                <div className="text-sm font-semibold">校准提示</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {calibrationHintText(selectedStats, minimumSamples)}
                </div>
              </div>
            </div>
            <Table aria-label="校准统计">
              <thead className="bg-muted text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">目标</th>
                  <th className="px-4 py-3">总样本</th>
                  <th className="px-4 py-3">已标注</th>
                  <th className="px-4 py-3">正向命中</th>
                  <th className="px-4 py-3">保守命中</th>
                  <th className="px-4 py-3">部分命中</th>
                  <th className="px-4 py-3">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStats.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">{targetLabels[item.target]}</td>
                    <td className="px-4 py-3">{item.sampleCount}</td>
                    <td className="px-4 py-3">{item.labeledCount}</td>
                    <td className="px-4 py-3">{item.truePositiveCount}</td>
                    <td className="px-4 py-3">{item.trueNegativeCount}</td>
                    <td className="px-4 py-3">{item.partialHitCount}</td>
                    <td className="px-4 py-3">{formatDate(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <EmptyState title="暂无统计" description="填写手动位置并保存观测标注后，可重新统计该 WGS84 位置的校准结果。" />
        )}
      </Card>
    </div>
  );
}

function LevelSelect({
  label,
  value,
  mode = "strength",
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly mode?: "strength" | "risk";
  readonly onChange: (value: string) => void;
}) {
  const options =
    mode === "risk"
      ? [
          ["none", "无"],
          ["low", "低"],
          ["medium", "中"],
          ["high", "高"],
          ["unknown", "未知"],
        ]
      : [
          ["none", "无"],
          ["weak", "弱"],
          ["medium", "中"],
          ["strong", "强"],
          ["unknown", "未知"],
        ];
  return (
    <FormField label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">未标注</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

function OverviewMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function TransparencySelect({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <FormField label="通透度">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">未标注</option>
        <option value="poor">较差</option>
        <option value="fair">一般</option>
        <option value="good">较好</option>
        <option value="excellent">优秀</option>
        <option value="unknown">未知</option>
      </Select>
    </FormField>
  );
}
