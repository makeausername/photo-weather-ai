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
  AdminCalibrationStats,
  AdminCalibrationTarget,
  AdminForecastReplayResult,
  AdminObservedOutcome,
  AdminPhotoSpot,
} from "../admin-api";

type CalibrationOverviewResponse = {
  readonly photoSpots: AdminPhotoSpot[];
  readonly targets: AdminCalibrationTarget[];
  readonly minimumHintSampleCount: number;
  readonly stats: AdminCalibrationStats[];
  readonly recentResults: AdminForecastReplayResult[];
  readonly outcomes: AdminObservedOutcome[];
};

type ReplayResultsResponse = {
  readonly results: AdminForecastReplayResult[];
  readonly outcomes: AdminObservedOutcome[];
};

type OutcomeForm = {
  readonly outcomeDate: string;
  readonly observedResult: AdminObservedOutcome["observedResult"];
  readonly cloudSeaLevel: string;
  readonly whiteoutLevel: string;
  readonly sunriseGlowLevel: string;
  readonly sunsetGlowLevel: string;
  readonly astroVisibilityLevel: string;
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
  glow: "朝霞晚霞",
  astro: "星空银河",
};

const emptyOutcomeForm: OutcomeForm = {
  outcomeDate: todayDate(),
  observedResult: "unknown",
  cloudSeaLevel: "",
  whiteoutLevel: "",
  sunriseGlowLevel: "",
  sunsetGlowLevel: "",
  astroVisibilityLevel: "",
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

function matchStatus(result: AdminForecastReplayResult, outcome?: AdminObservedOutcome): string {
  if (!outcome || outcome.observedResult === "unknown") {
    return "未标注";
  }
  const predictedPositive = result.overallScore >= 45;
  if (predictedPositive && outcome.observedResult === "fail") {
    return "误报";
  }
  if (!predictedPositive && outcome.observedResult === "success") {
    return "漏报";
  }
  if (outcome.observedResult === "partial") {
    return "部分命中";
  }
  return "命中";
}

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "命中") {
    return "success";
  }
  if (status === "误报" || status === "漏报") {
    return "danger";
  }
  if (status === "部分命中") {
    return "warning";
  }
  return "muted";
}

export function AdminCalibrationClient() {
  const [photoSpots, setPhotoSpots] = useState<AdminPhotoSpot[]>([]);
  const [stats, setStats] = useState<AdminCalibrationStats[]>([]);
  const [results, setResults] = useState<AdminForecastReplayResult[]>([]);
  const [outcomes, setOutcomes] = useState<AdminObservedOutcome[]>([]);
  const [minimumSamples, setMinimumSamples] = useState(10);
  const [spotId, setSpotId] = useState("");
  const [target, setTarget] = useState<AdminCalibrationTarget>("general");
  const [startDate, setStartDate] = useState(sevenDaysAgo());
  const [endDate, setEndDate] = useState(todayDate());
  const [outcomeForm, setOutcomeForm] = useState<OutcomeForm>(emptyOutcomeForm);
  const [status, setStatus] = useState("正在加载历史校准数据...");

  const selectedSpot = useMemo(
    () => photoSpots.find((spot) => spot.id === spotId),
    [photoSpots, spotId],
  );
  const selectedLocationKey = selectedSpot ? `spot:${selectedSpot.id}` : "";
  const filteredStats = stats.filter(
    (item) =>
      (!selectedLocationKey || item.locationKey === selectedLocationKey) && item.target === target,
  );

  async function loadOverview() {
    try {
      const response = await adminApiFetch<CalibrationOverviewResponse>("/admin/calibration");
      setPhotoSpots(response.photoSpots);
      setStats(response.stats);
      setResults(response.recentResults);
      setOutcomes(response.outcomes);
      setMinimumSamples(response.minimumHintSampleCount);
      setSpotId((current) => current || response.photoSpots[0]?.id || "");
      setStatus("历史校准数据已加载。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function loadReplayResults(nextSpotId = spotId, nextTarget = target) {
    if (!nextSpotId) {
      return;
    }
    const params = new URLSearchParams({
      spotId: nextSpotId,
      target: nextTarget,
      limit: "100",
    });
    const response = await adminApiFetch<ReplayResultsResponse>(
      `/admin/calibration/replay-results?${params.toString()}`,
    );
    setResults(response.results);
    setOutcomes(response.outcomes);
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  async function fetchHistory() {
    if (!spotId) {
      setStatus("请先选择机位。");
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
        body: JSON.stringify({ spotId, startDate, endDate }),
      });
      setStatus(
        `历史天气已入库：新增 ${response.insertedCount} 条，跳过重复 ${response.skippedDuplicateCount} 条。`,
      );
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function runReplay() {
    if (!spotId) {
      setStatus("请先选择机位。");
      return;
    }
    setStatus("正在执行历史回放...");
    try {
      const response = await adminApiFetch<{ readonly resultCount: number }>(
        "/admin/calibration/replay",
        {
          method: "POST",
          body: JSON.stringify({ spotId, startDate, endDate, target }),
        },
      );
      await loadReplayResults();
      setStatus(`历史回放完成：生成 ${response.resultCount} 条预测结果。`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function rebuildStats() {
    if (!spotId) {
      setStatus("请先选择机位。");
      return;
    }
    setStatus("正在计算校准统计...");
    try {
      const response = await adminApiFetch<{ readonly stats: AdminCalibrationStats }>(
        "/admin/calibration/stats/rebuild",
        {
          method: "POST",
          body: JSON.stringify({ spotId, target }),
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
    if (!spotId) {
      setStatus("请先选择机位。");
      return;
    }
    setStatus("正在保存观测标注...");
    try {
      const response = await adminApiFetch<{ readonly outcome: AdminObservedOutcome }>(
        "/admin/calibration/outcomes",
        {
          method: "POST",
          body: JSON.stringify({
            spotId,
            target,
            outcomeDate: outcomeForm.outcomeDate,
            observedResult: outcomeForm.observedResult,
            cloudSeaLevel: optionalText(outcomeForm.cloudSeaLevel),
            whiteoutLevel: optionalText(outcomeForm.whiteoutLevel),
            sunriseGlowLevel: optionalText(outcomeForm.sunriseGlowLevel),
            sunsetGlowLevel: optionalText(outcomeForm.sunsetGlowLevel),
            astroVisibilityLevel: optionalText(outcomeForm.astroVisibilityLevel),
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
      setStatus("观测标注已保存。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  function selectResultForOutcome(result: AdminForecastReplayResult) {
    setOutcomeForm((current) => ({
      ...current,
      outcomeDate: result.forecastDate.slice(0, 10),
    }));
  }

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-bold">校准概览</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              普通结果页至少需要 {minimumSamples} 条样本才显示历史校准提示。
            </p>
          </div>
          <Badge variant="info">{status}</Badge>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="机位">
            <Select
              value={spotId}
              onChange={(event) => {
                setSpotId(event.target.value);
                void loadReplayResults(event.target.value, target);
              }}
            >
              {photoSpots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {spot.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="目标">
            <Select
              value={target}
              onChange={(event) => {
                const nextTarget = event.target.value as AdminCalibrationTarget;
                setTarget(nextTarget);
                void loadReplayResults(spotId, nextTarget);
              }}
            >
              {Object.entries(targetLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
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
            执行规则回放
          </Button>
          <Button variant="secondary" onClick={() => void rebuildStats()}>
            计算校准统计
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-bold">回放结果</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              显示当前机位和目标的历史预测、人工标注和命中状态。
            </p>
          </div>
          {results.length > 0 ? (
            <Table aria-label="历史回放结果">
              <thead className="bg-muted text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">日期</th>
                  <th className="px-4 py-3">目标</th>
                  <th className="px-4 py-3">预测</th>
                  <th className="px-4 py-3">窗口</th>
                  <th className="px-4 py-3">风险</th>
                  <th className="px-4 py-3">观测</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((result) => {
                  const outcome = outcomeForResult(result, outcomes);
                  const matched = matchStatus(result, outcome);
                  return (
                    <tr key={result.id}>
                      <td className="px-4 py-3">{formatDate(result.forecastDate)}</td>
                      <td className="px-4 py-3">{targetLabels[result.target]}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{result.recommendationLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {Math.round(result.overallScore)} 分
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>{result.bestSubject ?? "暂无主目标"}</div>
                        <div>{formatWindow(result.bestWindowStart, result.bestWindowEnd)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>白墙：{result.whiteoutRiskScore ?? "暂无"}</div>
                        <div>降水：{result.precipitationRiskLevel ?? "暂无"}</div>
                      </td>
                      <td className="px-4 py-3">{outcome?.observedResult ?? "未标注"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(matched)}>{matched}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => selectResultForOutcome(result)}
                        >
                          标注
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
        {filteredStats.length > 0 ? (
          <Table aria-label="校准统计">
            <thead className="bg-muted text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">目标</th>
                <th className="px-4 py-3">样本</th>
                <th className="px-4 py-3">命中率</th>
                <th className="px-4 py-3">误报</th>
                <th className="px-4 py-3">漏报</th>
                <th className="px-4 py-3">窗口</th>
                <th className="px-4 py-3">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredStats.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{targetLabels[item.target]}</td>
                  <td className="px-4 py-3">{item.sampleCount}</td>
                  <td className="px-4 py-3">{formatPercent(item.hitRate)}</td>
                  <td className="px-4 py-3">{formatPercent(item.falsePositiveRate)}</td>
                  <td className="px-4 py-3">{formatPercent(item.falseNegativeRate)}</td>
                  <td className="px-4 py-3">{formatPercent(item.bestWindowHitRate)}</td>
                  <td className="px-4 py-3">{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
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
        ]
      : [
          ["none", "无"],
          ["weak", "弱"],
          ["medium", "中"],
          ["strong", "强"],
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
      </Select>
    </FormField>
  );
}
