import type {
  ForecastCalculationResult,
  TerrainHorizonAssessment,
  TerrainHorizonDataSource,
} from "@photo-weather/shared";

export type ForecastTerrainElevationBandKey =
  | "unknown"
  | "low"
  | "hill_low_mountain"
  | "mid_high"
  | "high"
  | "very_high";

export type ForecastTerrainReliefSupportLevel =
  | "missing"
  | "weak"
  | "moderate"
  | "strong";

export type ForecastTerrainDisplayModel = {
  readonly sourceBadgeLabelZh: string;
  readonly isMock: boolean;
  readonly elevationBand: {
    readonly key: ForecastTerrainElevationBandKey;
    readonly labelZh: string;
    readonly detail: string;
  };
  readonly spotElevation: {
    readonly valueMeters?: number;
    readonly valueLabel: string;
    readonly detail: string;
  };
  readonly surroundingRelief: {
    readonly available: boolean;
    readonly supportLevel: ForecastTerrainReliefSupportLevel;
    readonly valueMeters?: number;
    readonly valueLabel: string;
    readonly statusLabelZh: string;
    readonly supportLabelZh: string;
    readonly rangeLabel: string;
    readonly detail: string;
    readonly boundaryZh: string;
  };
  readonly cloudSeaMorphology: {
    readonly confidenceLabelZh: string;
    readonly supportLabelZh: string;
    readonly detail: string;
    readonly dataBoundaryZh: string;
  };
  readonly directionalHorizon: {
    readonly assessment?: TerrainHorizonAssessment;
    readonly available: boolean;
    readonly demBacked: boolean;
    readonly statusLabelZh: string;
    readonly sourceLabelZh: string;
    readonly targetLabelZh: string;
    readonly horizonAltitudeLabel: string;
    readonly clearanceLabel: string;
    readonly detail: string;
  };
  readonly demStatus: {
    readonly availableForDirectionalHorizon: boolean;
    readonly labelZh: string;
    readonly detail: string;
  };
  readonly dataBoundary: {
    readonly labelZh: string;
    readonly detail: string;
  };
  readonly uncertaintyBoundaryZh: string;
  readonly publicSummaryZh: string;
  readonly cloudSeaNoteZh: string;
};

export function buildTerrainDisplayModel(
  result: ForecastCalculationResult,
  options: {
    readonly terrainHorizonAssessment?: TerrainHorizonAssessment;
    readonly targetLabelZh?: string;
  } = {},
): ForecastTerrainDisplayModel {
  const profile = result.terrainAnalysis.terrainProfile;
  const terrainSupport = result.cloudSeaAnalysis.terrainSupport;
  const assessment = options.terrainHorizonAssessment ?? selectTerrainHorizonAssessment(result);
  const elevation =
    finiteNumber(profile.locationElevation) ??
    finiteNumber(profile.elevationMeters) ??
    finiteNumber(terrainSupport.selectedSpotElevationMeters);
  const elevationBand = elevationBandForMeters(elevation);
  const relief = resolveSurroundingRelief(result);
  const directionalHorizon = buildDirectionalHorizonDisplay(
    assessment,
    options.targetLabelZh ?? terrainHorizonTargetLabel(assessment?.target),
  );
  const sourceBadgeLabelZh = result.terrainAnalysis.isMock
    ? "演示地形数据"
    : directionalHorizon.demBacked
      ? directionalHorizon.sourceLabelZh
      : result.terrainAnalysis.dataSourceLabelZh;
  const demStatus = buildDemStatus(result, assessment, directionalHorizon);
  const spotElevation = {
    valueMeters: elevation,
    valueLabel:
      elevation === undefined
        ? "机位海拔暂未返回"
        : `约 ${Math.round(elevation)} 米（${elevationBand.labelZh}）`,
    detail:
      elevation === undefined
        ? "当前仅能按低置信度处理体感和地形相关判断。"
        : "机位海拔只表示拍摄点高度，不等同于周边高差或目标方向遮挡。",
  };
  const uncertaintyBoundaryZh = buildUncertaintyBoundary({
    isMock: result.terrainAnalysis.isMock,
    honestyNoteZh: result.terrainAnalysis.honestyNoteZh,
    reliefAvailable: relief.available,
    directionalHorizon,
    demStatus,
  });
  const cloudSeaMorphology = buildCloudSeaMorphology({
    elevation,
    elevationBand,
    relief,
    demStatus,
  });
  const dataBoundary = {
    labelZh: dataBoundaryLabel({ isMock: result.terrainAnalysis.isMock, relief, directionalHorizon }),
    detail: uncertaintyBoundaryZh,
  };
  const publicSummaryZh = [
    `海拔带：${elevationBand.labelZh}`,
    `机位海拔：${spotElevation.valueLabel}`,
    `周边高差：${relief.valueLabel}`,
    `方向遮挡：${directionalHorizon.statusLabelZh}`,
    `数据边界：${dataBoundary.labelZh}`,
  ].join("；");

  return {
    sourceBadgeLabelZh,
    isMock: result.terrainAnalysis.isMock,
    elevationBand,
    spotElevation,
    surroundingRelief: relief,
    cloudSeaMorphology,
    directionalHorizon,
    demStatus,
    dataBoundary,
    uncertaintyBoundaryZh,
    publicSummaryZh,
    cloudSeaNoteZh: cloudSeaMorphology.detail,
  };
}

export function terrainDisplayTextWithoutRawLabels(text: string): string {
  return text
    .replace(/clearance rule v1/gi, "地形净空角规则")
    .replace(/\bclearance\b/gi, "地形净空角")
    .replace(/target altitude/gi, "目标高度角")
    .replace(/terrain horizon altitude/gi, "地形地平线高度角")
    .replace(/DEM coverage missing/g, "DEM 覆盖缺失")
    .replace(/checksum/gi, "校验码")
    .replace(/\bfallback\b/gi, "保守参考");
}

function elevationBandForMeters(
  elevation: number | undefined,
): ForecastTerrainDisplayModel["elevationBand"] {
  if (elevation === undefined) {
    return {
      key: "unknown",
      labelZh: "海拔缺测",
      detail: "机位海拔暂未返回，不能据此判断低地、山地或高海拔体感。",
    };
  }
  if (elevation < 200) {
    return {
      key: "low",
      labelZh: "低海拔",
      detail: "低于 200 米，按低海拔机位处理体感和低云参考。",
    };
  }
  if (elevation < 800) {
    return {
      key: "hill_low_mountain",
      labelZh: "丘陵/低山",
      detail: "约 200-800 米，属于丘陵或低山机位。",
    };
  }
  if (elevation < 1500) {
    return {
      key: "mid_high",
      labelZh: "中高海拔",
      detail: "约 800-1500 米，机位海拔已有山地体感参考价值。",
    };
  }
  if (elevation < 2500) {
    return {
      key: "high",
      labelZh: "高海拔",
      detail: "约 1500-2500 米，按高海拔机位处理体感、低云和云顶高度复核。",
    };
  }
  return {
    key: "very_high",
    labelZh: "超高海拔",
    detail: "2500 米及以上，按超高海拔机位处理体感、低云和安全余量。",
  };
}

function resolveSurroundingRelief(
  result: ForecastCalculationResult,
): ForecastTerrainDisplayModel["surroundingRelief"] {
  const profile = result.terrainAnalysis.terrainProfile;
  const support = result.cloudSeaAnalysis.terrainSupport;
  const localRelief =
    finiteNumber(profile.localReliefMeters) ??
    finiteNumber(profile.elevationDiff5km) ??
    finiteNumber(support.localReliefMeters);
  const minElevation = finiteNumber(profile.minElevation5km);
  const maxElevation = finiteNumber(profile.maxElevation5km);
  const avgElevation = finiteNumber(profile.avgElevation5km);
  const rangeLabel =
    minElevation !== undefined && maxElevation !== undefined
      ? `${formatMeters(minElevation)} - ${formatMeters(maxElevation)}`
      : "周边海拔范围暂未返回";
  const rangeRelief =
    localRelief === undefined && minElevation !== undefined && maxElevation !== undefined
      ? Math.max(0, maxElevation - minElevation)
      : undefined;
  const relief = localRelief ?? rangeRelief;

  if (relief !== undefined) {
    const source =
      localRelief !== undefined ? "来自周边高差统计" : "由已返回的周边最高/最低海拔范围计算";
    const supportLevel = surroundingReliefSupportLevel(relief);
    const supportLabelZh = surroundingReliefSupportLabel(supportLevel);
    return {
      available: true,
      supportLevel,
      valueMeters: relief,
      valueLabel: `高差约 ${formatMeters(relief)}`,
      statusLabelZh: "高差已返回",
      supportLabelZh,
      rangeLabel,
      detail:
        avgElevation !== undefined
          ? `${source}；5公里范围平均海拔约 ${formatMeters(avgElevation)}。`
          : `${source}；没有用方向遮挡结论反推周边高差。`,
      boundaryZh: "周边高差已返回；仍需结合现场云雾高度和近景遮挡复核。",
    };
  }

  return {
    available: false,
    supportLevel: "missing",
    valueLabel: "周边高差未返回",
    statusLabelZh: "高差缺测",
    supportLabelZh: "云海地形支撑低置信",
    rangeLabel,
    detail: "周边5公里高差、局地高差或最高/最低海拔范围暂未返回，不能按 0 米处理。",
    boundaryZh: "周边高差统计暂未返回；云海地形高差不能按已确认处理，需要现场复核。",
  };
}

function buildDirectionalHorizonDisplay(
  assessment: TerrainHorizonAssessment | undefined,
  targetLabelZh: string,
): ForecastTerrainDisplayModel["directionalHorizon"] {
  const available = terrainHorizonAssessmentIsResolved(assessment);
  const demBacked = terrainHorizonAssessmentIsDemBacked(assessment);
  const statusLabelZh = available
    ? terrainHorizonStatusLabel(assessment.obstructionLevel)
    : assessment
      ? "目标方向地形地平线未达到公开判定条件"
      : "目标方向地形地平线暂未返回";
  const sourceLabelZh = assessment ? terrainHorizonSourceLabel(assessment) : "暂无方向剖面";
  const horizonAltitudeLabel =
    typeof assessment?.horizonAltitudeDegrees === "number"
      ? formatDegrees(assessment.horizonAltitudeDegrees)
      : "暂无精确角度";
  const clearanceLabel =
    typeof assessment?.obstructionClearanceDegrees === "number"
      ? formatDegrees(assessment.obstructionClearanceDegrees)
      : "暂无精确角度";

  return {
    assessment,
    available,
    demBacked,
    statusLabelZh,
    sourceLabelZh,
    targetLabelZh,
    horizonAltitudeLabel,
    clearanceLabel,
    detail: directionalHorizonDetail({
      assessment,
      available,
      demBacked,
      statusLabelZh,
      horizonAltitudeLabel,
      clearanceLabel,
      targetLabelZh,
    }),
  };
}

function buildDemStatus(
  result: ForecastCalculationResult,
  assessment: TerrainHorizonAssessment | undefined,
  directionalHorizon: ForecastTerrainDisplayModel["directionalHorizon"],
): ForecastTerrainDisplayModel["demStatus"] {
  if (directionalHorizon.available && directionalHorizon.demBacked) {
    return {
      availableForDirectionalHorizon: true,
      labelZh: "DEM 地形遮挡已可用",
      detail: `${directionalHorizon.sourceLabelZh}已返回${directionalHorizon.targetLabelZh}地形地平线和地形净空角。`,
    };
  }

  const unavailableReason = assessment?.unavailableReason;
  if (
    unavailableReason === "terrain_dem_out_of_bounds" ||
    unavailableReason === "terrain_dem_missing" ||
    unavailableReason === "terrain_dem_no_data" ||
    unavailableReason === "terrain_dem_metadata_missing" ||
    unavailableReason === "terrain_dem_unreadable"
  ) {
    return {
      availableForDirectionalHorizon: false,
      labelZh: "DEM 地形遮挡暂不可用",
      detail: "DEM 未覆盖或无法读取当前目标方向；系统不会把地形标记为无遮挡。",
    };
  }

  if (result.terrainAnalysis.isMock) {
    return {
      availableForDirectionalHorizon: false,
      labelZh: "演示地形数据",
      detail: "当前地形来源为演示数据，仅用于体验参考。",
    };
  }

  if (result.terrainAnalysis.dataSource === "dem") {
    return {
      availableForDirectionalHorizon: false,
      labelZh: "DEM 数据已接入，方向遮挡待返回",
      detail: "地形来源为 DEM，但当前结果未提供可公开判定的目标方向地形地平线。",
    };
  }

  if (directionalHorizon.available) {
    return {
      availableForDirectionalHorizon: false,
      labelZh: "方向地形地平线已返回",
      detail: `${directionalHorizon.sourceLabelZh}已返回目标方向遮挡；未标记为 DEM 来源。`,
    };
  }

  return {
    availableForDirectionalHorizon: false,
    labelZh: "DEM 方向遮挡未返回",
    detail: "当前结果缺少可公开判定的目标方向地形地平线，不按无遮挡处理。",
  };
}

function buildUncertaintyBoundary(input: {
  readonly isMock: boolean;
  readonly honestyNoteZh: string;
  readonly reliefAvailable: boolean;
  readonly directionalHorizon: ForecastTerrainDisplayModel["directionalHorizon"];
  readonly demStatus: ForecastTerrainDisplayModel["demStatus"];
}): string {
  if (input.isMock) {
    return input.honestyNoteZh;
  }
  if (input.demStatus.availableForDirectionalHorizon && !input.reliefAvailable) {
    return "DEM 地形遮挡已可用，但周边高差统计暂未返回；当前可判断目标方向遮挡，云海地形高差仍需结合现场云雾高度复核。";
  }
  if (input.directionalHorizon.available && !input.reliefAvailable) {
    return "目标方向地形地平线已返回，但周边高差统计暂未返回；不会用地形净空角反推周边高差。";
  }
  if (!input.directionalHorizon.available) {
    return "目标方向地形地平线暂未形成可公开判定结果；系统不把地形当作无遮挡处理。";
  }
  return "周边高差与目标方向地形遮挡来自不同字段，当前展示不互相推算。";
}

function buildCloudSeaMorphology(input: {
  readonly elevation?: number;
  readonly elevationBand: ForecastTerrainDisplayModel["elevationBand"];
  readonly relief: ForecastTerrainDisplayModel["surroundingRelief"];
  readonly demStatus: ForecastTerrainDisplayModel["demStatus"];
}): ForecastTerrainDisplayModel["cloudSeaMorphology"] {
  const elevationText =
    input.elevation === undefined
      ? "机位海拔暂未返回"
      : `机位海拔约 ${Math.round(input.elevation)} 米（${input.elevationBand.labelZh}）`;

  if (input.relief.available && input.relief.valueMeters !== undefined) {
    const reliefValue = input.relief.valueMeters;
    const conclusion = cloudSeaReliefConclusion(reliefValue);
    const detail = `地形参考：${elevationText}；周边5公里高差约 ${Math.round(
      reliefValue,
    )} 米。${conclusion}仍需现场复核云顶高度、低云贴地情况和白墙风险。`;
    return {
      confidenceLabelZh: "中置信（高差已返回）",
      supportLabelZh: input.relief.supportLabelZh,
      detail,
      dataBoundaryZh: input.relief.boundaryZh,
    };
  }

  const elevationHandling =
    input.elevation === undefined
      ? "当前仅按低置信度处理体感、低云和白墙风险"
      : `当前可按${input.elevationBand.labelZh}机位处理体感、低云和白墙风险`;
  const demBoundary = input.demStatus.availableForDirectionalHorizon
    ? "DEM 方向遮挡数据已可用；周边高差统计仍未返回。"
    : "周边高差统计仍未返回。";
  const detail = `地形参考：${elevationText}；高差缺测，周边5公里高差统计暂未返回。${elevationHandling}，但云海地形高差不能按已确认处理，需结合现场云雾高度复核。${demBoundary}`;

  return {
    confidenceLabelZh: "低置信（高差缺测）",
    supportLabelZh: input.relief.supportLabelZh,
    detail,
    dataBoundaryZh: demBoundary,
  };
}

function cloudSeaReliefConclusion(reliefMeters: number): string {
  const supportLevel = surroundingReliefSupportLevel(reliefMeters);
  if (supportLevel === "strong") {
    return "高差明显，有利于俯拍低云/云海；";
  }
  if (supportLevel === "moderate") {
    return "高差一般，可作为云雾层次参考，不把云海确定性抬高；";
  }
  return "高差较弱，云海纵深和俯拍优势有限；";
}

function surroundingReliefSupportLevel(value: number): ForecastTerrainReliefSupportLevel {
  if (value >= 600) {
    return "strong";
  }
  if (value >= 300) {
    return "moderate";
  }
  return "weak";
}

function surroundingReliefSupportLabel(level: ForecastTerrainReliefSupportLevel): string {
  switch (level) {
    case "strong":
      return "高差明显";
    case "moderate":
      return "高差一般";
    case "weak":
      return "高差较弱";
    case "missing":
      return "高差缺测";
  }
}

function dataBoundaryLabel(input: {
  readonly isMock: boolean;
  readonly relief: ForecastTerrainDisplayModel["surroundingRelief"];
  readonly directionalHorizon: ForecastTerrainDisplayModel["directionalHorizon"];
}): string {
  if (input.isMock) {
    return "演示地形数据";
  }
  if (!input.relief.available && input.directionalHorizon.available) {
    return "方向遮挡可用 / 高差缺测";
  }
  if (!input.relief.available) {
    return "高差缺测";
  }
  if (!input.directionalHorizon.available) {
    return "高差已返回 / 方向遮挡待复核";
  }
  return "高差与方向遮挡分开显示";
}

function selectTerrainHorizonAssessment(
  result: ForecastCalculationResult,
): TerrainHorizonAssessment | undefined {
  const candidates: TerrainHorizonAssessment[] = [];
  addCandidate(candidates, result.terrainAnalysis.horizonProfile.milkyWayAssessment);
  addCandidate(candidates, result.terrainSummary.milkyWayAssessment);
  addCandidate(candidates, result.astroAnalysis.terrainHorizonAssessment);
  for (const day of result.astroAnalysis.dailyAstro) {
    addCandidate(candidates, day.terrainHorizonAssessment);
    addCandidate(candidates, day.recommendedMilkyWayWindow?.terrainHorizonAssessment);
  }
  for (const window of [
    result.astroAnalysis.recommendedMilkyWayWindow,
    ...result.astroAnalysis.recommendedMilkyWayWindows,
    ...result.astroAnalysis.milkyWayCandidateWindows,
  ]) {
    addCandidate(candidates, window?.terrainHorizonAssessment);
  }
  return candidates.sort(compareTerrainHorizonAssessments)[0];
}

function addCandidate(
  candidates: TerrainHorizonAssessment[],
  assessment: TerrainHorizonAssessment | undefined,
): void {
  if (assessment) {
    candidates.push(assessment);
  }
}

function compareTerrainHorizonAssessments(
  left: TerrainHorizonAssessment,
  right: TerrainHorizonAssessment,
): number {
  return terrainHorizonRank(right) - terrainHorizonRank(left);
}

function terrainHorizonRank(assessment: TerrainHorizonAssessment): number {
  let rank = 0;
  if (terrainHorizonAssessmentIsResolved(assessment)) {
    rank += 100;
  }
  if (terrainHorizonAssessmentIsDemBacked(assessment)) {
    rank += 40;
  }
  if (assessment.confidence === "high") {
    rank += 20;
  } else if (assessment.confidence === "medium") {
    rank += 10;
  }
  if (assessment.professionalDiagnostics.usedDirectionalProfile) {
    rank += 10;
  }
  return rank;
}

function terrainHorizonAssessmentIsResolved(
  assessment: TerrainHorizonAssessment | undefined,
): assessment is TerrainHorizonAssessment {
  return Boolean(
    assessment &&
      assessment.professionalDiagnostics.usedDirectionalProfile &&
      (assessment.confidence === "medium" || assessment.confidence === "high") &&
      typeof assessment.horizonAltitudeDegrees === "number" &&
      typeof assessment.obstructionClearanceDegrees === "number" &&
      assessment.obstructionLevel !== "unknown",
  );
}

function terrainHorizonAssessmentIsDemBacked(
  assessment: TerrainHorizonAssessment | undefined,
): boolean {
  if (!assessment) {
    return false;
  }
  const sources = [
    assessment.dataSource,
    assessment.directionSample?.dataSource,
    ...(assessment.directionSamples ?? []).map((sample) => sample.dataSource),
  ].filter((source): source is TerrainHorizonDataSource => Boolean(source));
  return (
    sources.some(isDemTerrainHorizonSource) ||
    Boolean(
      assessment.dataSourceLabelZh?.includes("DEM") ||
        assessment.directionSample?.dataSourceLabelZh?.includes("DEM") ||
        assessment.professionalDiagnostics.terrainDemCoverage?.status === "available" ||
        assessment.directionSample?.terrainDemCoverage?.status === "available",
    )
  );
}

function isDemTerrainHorizonSource(source: TerrainHorizonDataSource): boolean {
  return source === "dem" || source === "dem_raster" || source === "custom_local_dem";
}

function terrainHorizonSourceLabel(assessment: TerrainHorizonAssessment): string {
  if (assessment.dataSourceLabelZh) {
    return terrainDisplayTextWithoutRawLabels(assessment.dataSourceLabelZh);
  }
  if (terrainHorizonAssessmentIsDemBacked(assessment)) {
    return "本地 DEM 地形剖面";
  }
  if (assessment.dataSource === "manual_profile") {
    return "人工地形剖面";
  }
  if (assessment.dataSource === "mock_terrain_profile") {
    return "演示地形剖面";
  }
  if (assessment.dataSource === "qualitative_fallback") {
    return "定性地形参考";
  }
  return "方向地形剖面";
}

function directionalHorizonDetail(input: {
  readonly assessment: TerrainHorizonAssessment | undefined;
  readonly available: boolean;
  readonly demBacked: boolean;
  readonly statusLabelZh: string;
  readonly horizonAltitudeLabel: string;
  readonly clearanceLabel: string;
  readonly targetLabelZh: string;
}): string {
  if (!input.assessment) {
    return "目标方向地形地平线暂未返回；当前不按无遮挡处理。";
  }
  if (!input.available) {
    return `已有地形记录但未达到公开判定条件：${terrainUnavailableReasonLabel(
      input.assessment.unavailableReason,
    )}；当前不按无遮挡处理。`;
  }
  const source = input.demBacked ? "DEM 方向剖面" : "方向剖面";
  return `${source}显示${input.targetLabelZh}地形地平线 ${input.horizonAltitudeLabel}，地形净空角 ${input.clearanceLabel}，结论为${input.statusLabelZh}。`;
}

function terrainHorizonStatusLabel(level: TerrainHorizonAssessment["obstructionLevel"]): string {
  switch (level) {
    case "clear":
      return "无遮挡";
    case "marginal":
      return "遮挡临界";
    case "obstructed":
      return "可能遮挡";
    case "unknown":
      return "数据不足";
  }
}

function terrainHorizonTargetLabel(target: TerrainHorizonAssessment["target"] | undefined): string {
  switch (target) {
    case "milky_way":
      return "银河方向";
    case "sunrise":
      return "日出方向";
    case "sunset":
      return "日落方向";
    case "moonrise":
      return "月出方向";
    case "moonset":
      return "月落方向";
    case "landscape":
      return "景观方向";
    case "custom":
      return "目标方向";
    case undefined:
      return "目标方向";
  }
}

function terrainUnavailableReasonLabel(
  reason: TerrainHorizonAssessment["unavailableReason"],
): string {
  switch (reason) {
    case "terrain_dem_out_of_bounds":
      return "坐标超出 DEM 范围";
    case "terrain_dem_missing":
      return "DEM 数据缺失";
    case "terrain_dem_no_data":
      return "DEM 像元无有效海拔";
    case "terrain_dem_metadata_missing":
      return "DEM 元数据缺失";
    case "terrain_dem_unreadable":
      return "DEM 无法读取";
    case "missing_directional_profile":
      return "缺少目标方向地形剖面";
    case "missing_target_geometry":
      return "缺少目标方位角或高度角";
    case "missing_observer_elevation":
      return "缺少机位海拔";
    case "insufficient_directional_sample":
      return "目标方向样本不足";
    case "invalid_directional_sample":
      return "地形剖面样本无效";
    case "invalid_coordinate":
      return "坐标无效";
    case "unknown":
    case undefined:
      return "数据不足";
  }
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatMeters(value: number): string {
  return `${Math.round(value)} 米`;
}

function formatDegrees(value: number): string {
  return `${Number(value.toFixed(1))}°`;
}
