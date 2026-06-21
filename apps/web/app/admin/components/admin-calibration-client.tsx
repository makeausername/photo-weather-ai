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
  Table,
  Textarea,
} from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type {
  AdminCalibrationComparison,
  AdminCalibrationStats,
  AdminCalibrationTarget,
  AdminForecastReplayResult,
  AdminLocation,
  AdminObservedOutcome,
} from "../admin-api";

type CalibrationOverviewResponse = {
  readonly overview: {
    readonly totalReplayRuns: number;
    readonly totalHistoricalSamples: number;
    readonly totalObservedOutcomes: number;
  };
  readonly locations: AdminLocation[];
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

function buildLocationKey(location: AdminLocation): string {
  return `location:${location.id}`;
}

function calibrationLocationPayload(location: AdminLocation) {
  return {
    locationId: location.id,
    locationKey: buildLocationKey(location),
    locationName: location.name,
    latitudeWgs84: location.latitudeWgs84,
    longitudeWgs84: location.longitudeWgs84,
    elevationMeters: location.elevation,
  };
}

export function AdminCalibrationClient() {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
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
  const [locationId, setLocationId] = useState("");
  const [target, setTarget] = useState<AdminCalibrationTarget>("general");
  const [startDate, setStartDate] = useState(sevenDaysAgo());
  const [endDate, setEndDate] = useState(todayDate());
  const [outcomeForm, setOutcomeForm] = useState<OutcomeForm>(emptyOutcomeForm);
  const [status, setStatus] = useState("正在加载历史校准数据...");

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === locationId),
    [locations, locationId],
  );
  const selectedLocationKey = selectedLocation ? buildLocationKey(selectedLocation) : "";
  const filteredStats = stats.filter(
    (item) =>
      (!selectedLocationKey || item.locationKey === selectedLocationKey) && item.target === target,
  );
  const selectedStats = filteredStats[0];
  const selectedSummary = selectedStats ? summaryJsonObject(selectedStats.summaryJson) : {};
  const mismatchReasons = summaryStringList(selectedSummary.mismatchReasons);

  async function loadOverview() {
    try {
      const response = await adminApiFetch<CalibrationOverviewResponse>("/admin/calibration");
      setOverview(response.overview);
      setLocations(response.locations);
      setStats(response.stats);
      setResults(response.recentResults);
      setOutcomes(response.outcomes);
      setComparisons([]);
      setMinimumSamples(response.minimumHintSampleCount);
      setLocationId((current) => current || response.locations[0]?.id || "");
      setStatus("历史校准数据已加载。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function loadReplayResults(nextLocationId = locationId, nextTarget = target) {
    const location = locations.find((item) => item.id === nextLocationId);
    if (!location) {
      return;
    }
    const params = new URLSearchParams({
      locationKey: buildLocationKey(location),
      target: nextTarget,
      limit: "100",
    });
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

  async function fetchHistory() {
    if (!selectedLocation) {
      setStatus("请先选择地点。");
      return;
    }
    setStatus("正在拉取历史天气...");
    try {
      const response = await adminApiFetch<{
        readonly insertedCount: number;
        readonly skippedDuplicateCount: number;
        readonly sampleCount: number;
      }>("/admin/calibration/fetch-history", {
        method: "POST",
        body: JSON.stringify({ ...calibrationLocationPayload(selectedLocation), startDate, endDate }),
      });
      setStatus(
        `历史天气已入库：新增 ${response.insertedCount} 条，跳过重复 ${response.skippedDuplicateCount} 条。`,
      );
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function runReplay() {
    if (!selectedLocation) {
      setStatus("请先选择地点。");
      return;
    }
    setStatus("正在执行历史回放...");
    try {
      const response = await adminApiFetch<{ readonly resultCount: number }>(
        "/admin/calibration/replay",
        {
          method: "POST",
          body: JSON.stringify({
            ...calibrationLocationPayload(selectedLocation),
            startDate,
            endDate,
            target,
          }),
        },
      );
      await loadReplayResults(selectedLocation.id, target);
      setStatus(`历史回放完成：生成 ${response.resultCount} 条预测结果。`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function rebuildStats() {
    if (!selectedLocation) {
      setStatus("请先选择地点。");
      return;
    }
    setStatus("正在计算校准统计...");
    try {
      const response = await adminApiFetch<{ readonly stats: AdminCalibrationStats }>(
        "/admin/calibration/stats/rebuild",
        {
          method: "POST",
          body: JSON.stringify({ ...calibrationLocationPayload(selectedLocation), target }),
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
      setStatus("校准统计已更新。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function saveOutcome() {
    if (!selectedLocation) {
      setStatus("请先选择地点。");
      return;
    }
    setStatus("正在保存观测标注...");
    try {
      const response = await adminApiFetch<{ readonly outcome: AdminObservedOutcome }>(
        "/admin/calibration/outcomes",
        {
          method: "POST",
          body: JSON.stringify({
            ...calibrationLocationPayload(selectedLocation),
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
      await loadReplayResults(selectedLocation.id, target);
      setStatus("观测标注已保存。");
    } catch (error) {
      setStatus((error as Error).message);
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

  return (
    <div className="grid gap-5">
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
                void loadReplayResults(locationId, nextTarget);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          <FormField label="历史校准地点">
            <Select
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                void loadReplayResults(event.target.value, target);
              }}
            >
              <option value="">请选择地点</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </FormField>
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
              显示当前地点和目标的历史预测、人工标注和命中状态。
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
            <EmptyState title="暂无回放结果" description="先拉取历史天气，再执行规则回放。" />
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
          <EmptyState title="暂无统计" description="保存观测标注后点击计算校准统计。" />
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
