import {
  classifyTerrainMode,
  terrainModeUsesLowlandSemantics,
  terrainModeUsesMountainSemantics,
  type ForecastCalculationResult,
  type ForecastTarget,
  type TerrainMode,
} from "@photo-weather/shared";
import { sanitizeUnsupportedForecastCopy } from "./forecast-claim-guard";

type ForecastPrimarySummaryOptions = {
  readonly cloudSeaDowngraded?: boolean;
};

export function normalizeForecastPublicCopyText(text: string): string {
  return text
    .replace(/仅供参考/g, "以当前预报范围内数据为准")
    .replace(/建议谨慎参考/g, "先列为备选，临近再决定")
    .replace(/谨慎参考，谨慎参考/g, "谨慎参考")
    .replace(/当前使用演示数据/g, "当前结果基于演示数据")
    .replace(/clearance rule v1/gi, "地形净空角规则")
    .replace(/\bclearance\b/gi, "地形净空角")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildForecastPrimarySummary(
  result: ForecastCalculationResult,
  target: ForecastTarget,
  options: ForecastPrimarySummaryOptions = {},
): string {
  const domain = forecastTargetToClaimDomain(target);
  const guarded = (text: string) =>
    normalizeForecastPublicCopyText(sanitizeUnsupportedForecastCopy(result, text, domain));

  if (target === "cloud_sea") {
    return guarded(buildCloudSeaSummary(result, options.cloudSeaDowngraded));
  }
  if (target === "glow") {
    return guarded(buildGlowSummary(result));
  }
  if (target === "astro") {
    return guarded(buildAstroSummary(result));
  }
  return guarded(buildGeneralSummary(result));
}

export function buildForecastDataBoundaryNotice(
  result: ForecastCalculationResult,
  target: ForecastTarget,
): string {
  const weatherStatus = weatherStatusLabel(result);
  const terrainStatus = result.terrainAnalysis.isMock
    ? "地形数据：演示数据"
    : `地形数据：${result.terrainAnalysis.dataSourceLabelZh}`;
  const weatherBoundary =
    result.weatherDataMode === "real"
      ? "当前结果基于所选预报范围内的正式天气数据生成。"
      : result.weatherDataMode === "fixture"
        ? "当前结果基于样例天气数据生成，用于体验分析流程。"
        : "当前结果基于演示天气数据生成，仅用于体验分析流程。";
  const targetBoundary = targetDataBoundary(result, target);
  const cloudLayerBoundary = hasMissingCloudLayers(result)
    ? "当前天气源缺少低云/中云/高云分层数据，相关判断将降低置信度。"
    : "";
  const astronomyBoundary =
    target === "astro" || target === "general"
      ? "天文时间由确定性天文数据生成，实际可见性仍受云量、月光、光污染和地形遮挡影响。"
      : "";
  const terrainBoundary = result.terrainAnalysis.honestyNoteZh;

  return normalizeForecastPublicCopyText(
    sanitizeUnsupportedForecastCopy(
      result,
      [
        `天气数据：${weatherStatus}；${terrainStatus}；天文数据：${result.astroDataSourceLabelZh}。`,
        weatherBoundary,
        targetBoundary,
        terrainBoundary,
        astronomyBoundary,
        cloudLayerBoundary,
      ]
        .filter(Boolean)
        .join(""),
      forecastTargetToClaimDomain(target),
    ),
  );
}

function forecastTargetToClaimDomain(
  target: ForecastTarget,
): "general" | "cloud_sea" | "glow" | "astro" {
  if (target === "cloud_sea" || target === "glow" || target === "astro") {
    return target;
  }
  return "general";
}

function buildGeneralSummary(result: ForecastCalculationResult): string {
  const opportunity = strongestGeneralOpportunity(result);
  const risk = mainDecisionRisk(result, "general");
  const action = decisionActionText(result.overallScore, result.recommendationLabel, "general");

  return `${opportunity}；${risk}；${action}`;
}

function buildCloudSeaSummary(
  result: ForecastCalculationResult,
  cloudSeaDowngraded = terrainModeUsesLowlandSemantics(terrainModeForResult(result)),
): string {
  const analysis = result.cloudSeaAnalysis;
  const risk = mainDecisionRisk(result, "cloud_sea");
  const action =
    analysis.shootableScore >= 70 && analysis.whiteoutRiskScore < 65
      ? "可作为清晨主窗口候选，到场后先看云顶高度、低云厚度和远山能见度。"
      : cloudSeaDowngraded
        ? "先列为低云/晨雾备选，已在附近可顺带观察，出发前复核降水、能见度和低云是否贴地。"
        : "先列为备选，临近出发前复核云图、降水、能见度和白墙风险。";

  if (cloudSeaDowngraded) {
    return `低海拔或高差证据不足时不按高山云海承诺；当前低云/晨雾信号${analysis.labels.formationOpportunity}，云层可观察机会${analysis.labels.shootableOpportunity}，低云遮挡${analysis.labels.whiteoutRisk}；${risk}；${action}`;
  }

  return `云海形成 ${analysis.formationScore} 分、可拍 ${analysis.shootableScore} 分，白墙风险 ${analysis.whiteoutRiskScore} 分；${risk}；${action}`;
}

function buildGlowSummary(result: ForecastCalculationResult): string {
  const analysis = result.glowAnalysis;
  const preferred = analysis.sunriseGlowScore >= analysis.sunsetGlowScore ? "朝霞" : "晚霞";
  const preferredScore = Math.max(analysis.sunriseGlowScore, analysis.sunsetGlowScore);
  const rainRisk =
    analysis.rainOverlapsSunriseWindow && analysis.rainOverlapsSunsetWindow
      ? "降水同时影响日出和日落窗口"
      : analysis.rainOverlapsSunriseWindow
        ? "降水主要影响日出前后窗口"
        : analysis.rainOverlapsSunsetWindow
          ? "降水主要影响日落前后窗口"
          : "降水暂未成为晨昏主窗口的主要阻断";
  const lightPathText =
    analysis.glowLightPathDataAvailability === "insufficient"
      ? "太阳方向光路需现场复核"
      : `霞光光路遮挡${analysis.labels.glowLightPathObstructionRisk}`;
  const action =
    preferredScore >= 70 &&
    analysis.glowLightPathDataAvailability === "available" &&
    analysis.glowLightPathObstructionRisk < 65 &&
    analysis.cloudSuppressionRisk < 65
      ? `可围绕${preferred}窗口等待，优先确认太阳方向开口和中高云色彩载体。`
      : "适合顺带观察晨昏光线，不建议只押大面积霞光，现场优先看地平线开口、降水和能见度。";

  return `日出/日落与民用曙暮光窗口中，${preferred}机会相对更高；中高云色彩载体${analysis.labels.colorCarrier}，低云/雾墙风险${analysis.labels.lowCloudFogWallRisk}，${lightPathText}，云层压制${analysis.labels.cloudSuppressionRisk}；${rainRisk}；${action}`;
}

function buildAstroSummary(result: ForecastCalculationResult): string {
  const analysis = result.astroAnalysis;
  const moon = analysis.moonInfo ?? result.astroSummaries[0]?.moonInfo;
  const moonText = moon
    ? `月相${moon.moonPhaseNameZh}，照明约 ${Math.round(moon.moonIllumination * 100)}%`
    : `月光影响${analysis.labels.moonlightImpact}`;
  const lightText = analysis.lightPollution.available
    ? `环境光污染${analysis.lightPollution.ambientRiskLevelLabelZh}，银河方向光害${
        analysis.lightPollution.targetDirectionLevelLabelZh ?? "待复核"
      }`
    : "光污染数据不足，不按低风险处理";
  const windowText = analysis.astroWindowAvailable
    ? `天文黑夜可用性${analysis.labels.astronomicalWindow}`
    : "天文黑夜或银河几何窗口不足";
  const risk = mainDecisionRisk(result, "astro");
  const action = analysis.astroShootable
    ? "可纳入夜拍候选，优先避开城市光源方向，出发前复核云图、月光、露水和风。"
    : "不建议专程拍银河，可把星轨、月光地景或云缝观察列为备选。";

  return `${windowText}，${moonText}；${lightText}；${risk}；${action}`;
}

function strongestGeneralOpportunity(result: ForecastCalculationResult): string {
  const mountain = terrainModeUsesMountainSemantics(terrainModeForResult(result));
  const astroScore = result.astroAnalysis.astroShootable
    ? Math.max(result.astroAnalysis.starsScore, result.astroAnalysis.milkyWayScore)
    : Math.min(result.astroAnalysis.astroPracticalScore, 34);
  const candidates = [
    {
      score: result.cloudSeaAnalysis.shootableScore,
      text: mountain
        ? `云海形成 ${result.cloudSeaAnalysis.formationScore} 分、可拍 ${result.cloudSeaAnalysis.shootableScore} 分`
        : `低云/晨雾信号 ${result.cloudSeaAnalysis.formationScore} 分、云层开口 ${result.cloudSeaAnalysis.shootableScore} 分`,
    },
    {
      score: Math.max(result.glowAnalysis.sunriseGlowScore, result.glowAnalysis.sunsetGlowScore),
      text: `朝霞 ${result.glowAnalysis.sunriseGlowScore} 分、晚霞 ${result.glowAnalysis.sunsetGlowScore} 分，中高云色彩载体${result.glowAnalysis.labels.colorCarrier}`,
    },
    {
      score: astroScore,
      text: result.astroAnalysis.astroShootable
        ? `天文黑夜、月光和云量组合支持星空银河候选`
        : `天文窗口需按云量、月光、光污染或地形条件降级`,
    },
    {
      score: result.scores.transparency.score,
      text: `通透度 ${result.scores.transparency.score} 分，影响远山层次和暗空反差`,
    },
  ].sort((left, right) => right.score - left.score);
  const best = candidates[0];

  return best?.text ?? "当前缺少明确优势题材";
}

function mainDecisionRisk(result: ForecastCalculationResult, target: ForecastTarget): string {
  if (target === "general") {
    const risk = result.riskFlags[0];
    return risk
      ? `主要风险是${risk.label}（${riskLevelLabel(risk.level)}），${risk.description}`
      : "主要风险暂未形成高等级阻断";
  }
  if (target === "cloud_sea") {
    return result.cloudSeaAnalysis.whiteoutRiskScore >= 65
      ? "主要风险是低云贴近机位造成白墙或低能见度"
      : "白墙、降水和能见度暂未形成高等级阻断";
  }
  if (target === "glow") {
    if (result.glowAnalysis.glowLightPathDataAvailability === "insufficient") {
      return "主要风险是太阳方向光路数据不足，需现场复核地平线云缝";
    }
    if (result.glowAnalysis.glowLightPathObstructionRisk >= 65) {
      return "主要风险是霞光光路遮挡偏高";
    }
    if (result.glowAnalysis.cloudSuppressionRisk >= 65) {
      return "主要风险是云层压制偏高，云量或云层厚度可能压住色彩";
    }
    if (result.glowAnalysis.lowCloudFogWallRisk >= 65) {
      return "主要风险是低云/雾墙偏高，近地视野需要现场复核";
    }
    return "光路遮挡、云层压制、低云/雾墙、降水和能见度暂未形成高等级阻断";
  }
  if (target === "astro") {
    const blocker = result.astroAnalysis.weatherBlockers[0];
    if (blocker) {
      return `主要风险是${blocker}`;
    }
    if (result.astroAnalysis.moonlightImpactScore >= 65) {
      return "主要风险是月光照明偏强，银河细节可能变弱";
    }
    return "云量、月光、光污染和地形遮挡暂未同时形成高等级阻断";
  }

  const risk = result.riskFlags[0];
  return risk
    ? `主要风险是${risk.label}（${riskLevelLabel(risk.level)}），${risk.description}`
    : "主要风险暂未形成高等级阻断";
}

function decisionActionText(
  score: number,
  recommendationLabel: string,
  target: ForecastTarget,
): string {
  const review = targetReviewText(target);
  if (recommendationLabel.includes("不建议") || score < 45) {
    return `不建议专程，等待下一次预报；${review}`;
  }
  if (recommendationLabel.includes("谨慎") || score < 65) {
    return `先列为备选，临近再决定是否专程；${review}`;
  }
  return `可进入出行候选，但出发前仍要复核最新预报和现场条件；${review}`;
}

function targetReviewText(target: ForecastTarget): string {
  if (target === "cloud_sea") {
    return "重点复核云图、降水、能见度、云顶高度和低云是否贴近机位。";
  }
  if (target === "glow") {
    return "重点复核日出/日落方向光路开口、云层压制、低云/雾墙、降水和能见度。";
  }
  if (target === "astro") {
    return "重点复核天文黑夜、月光、银河窗口、云量、光污染方向和地形地平线。";
  }
  return "重点复核降水、云量、能见度、风和备选题材。";
}

function targetDataBoundary(result: ForecastCalculationResult, target: ForecastTarget): string {
  if (target === "cloud_sea") {
    return "地形高差未返回时，不按已确认云海地形处理；降水、低云和能见度需临近出发前复核。";
  }
  if (target === "glow") {
    return "日出/日落方向光路或地形遮挡缺测时，不按无遮挡处理；降水、云层压制、低云/雾墙和能见度需临近出发前复核。";
  }
  if (target === "astro") {
    return "地形地平线缺测时，不按银河方向无遮挡处理；光污染为卫星夜光参考，不等于现场 SQM 实测。";
  }
  return result.weatherDataMode === "real"
    ? "当前结果基于所选预报范围，降水、云量和能见度仍需临近出发前复核。"
    : "当前结果基于所选预报范围，正式出行前需复核真实天气源、降水、云量和能见度。";
}

function terrainModeForResult(result: ForecastCalculationResult): TerrainMode {
  return (
    result.cloudSeaAnalysis.terrainSupport.terrainMode ??
    classifyTerrainMode({
      elevationMeters:
        result.terrainAnalysis.terrainProfile.locationElevation ??
        result.terrainAnalysis.terrainProfile.elevationMeters ??
        result.cloudSeaAnalysis.terrainSupport.selectedSpotElevationMeters,
      nearbyValleyElevationMeters:
        result.terrainAnalysis.terrainProfile.nearbyValleyElevationMeters ??
        result.cloudSeaAnalysis.terrainSupport.nearbyValleyElevationMeters,
      localReliefMeters:
        result.terrainAnalysis.terrainProfile.localReliefMeters ??
        result.terrainAnalysis.terrainProfile.elevationDiff5km ??
        result.cloudSeaAnalysis.terrainSupport.localReliefMeters,
      terrainType:
        result.terrainAnalysis.terrainProfile.terrainType ??
        result.cloudSeaAnalysis.terrainSupport.terrainType,
      elevationConfidence: result.terrainAnalysis.terrainProfile.elevationConfidence,
    })
  );
}

function weatherStatusLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real") {
    return "已启用真实天气数据";
  }
  if (result.weatherDataMode === "fixture") {
    return "样例天气数据";
  }
  if (result.weatherDataMode === "fallback") {
    return "已回退演示天气数据";
  }
  return "演示天气数据";
}

function hasMissingCloudLayers(result: ForecastCalculationResult): boolean {
  return ["cloudLow", "cloudMid", "cloudHigh"].some((field) =>
    result.weatherMissingFields.includes(field),
  );
}

function riskLevelLabel(level: "low" | "medium" | "high"): string {
  if (level === "high") {
    return "高风险";
  }
  if (level === "medium") {
    return "中风险";
  }
  return "低风险";
}
