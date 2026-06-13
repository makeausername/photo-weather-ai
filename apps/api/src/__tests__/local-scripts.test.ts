import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { forecastQueryInputSchema } from "@photo-weather/shared";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const itOnWindows = process.platform === "win32" ? it : it.skip;

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

describe("local astro diagnostics scripts", () => {
  itOnWindows("parses .env.local values with underscores and quotes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "photo-weather-env-"));
    const envPath = join(tempDir, ".env.local");
    writeFileSync(
      envPath,
      [
        'DATABASE_URL="postgresql://photo_weather:pass-with-dash@127.0.0.1:15432/photo_weather_ai"',
        "NEXT_PUBLIC_API_BASE_URL='http://localhost:4000'",
        "ENABLE_ASTRO_SERVICE=true",
        'ASTRO_SERVICE_URL="http://localhost:4100"',
        "ASTRO_SERVICE_TIMEOUT_MS=45000",
        'CUSTOM_KEY_WITH_UNDERSCORE="quoted value with spaces"',
      ].join("\n"),
      "utf8",
    );

    try {
      const command = [
        "$ErrorActionPreference = 'Stop'",
        `. ${quotePowerShellString(join(repoRoot, "scripts", "local-env.ps1"))}`,
        `$null = Import-LocalDotEnv -Path ${quotePowerShellString(envPath)}`,
        "$result = [ordered]@{}",
        "$result.DATABASE_URL = $env:DATABASE_URL",
        "$result.NEXT_PUBLIC_API_BASE_URL = $env:NEXT_PUBLIC_API_BASE_URL",
        "$result.ENABLE_ASTRO_SERVICE = $env:ENABLE_ASTRO_SERVICE",
        "$result.ASTRO_SERVICE_URL = $env:ASTRO_SERVICE_URL",
        "$result.ASTRO_SERVICE_TIMEOUT_MS = $env:ASTRO_SERVICE_TIMEOUT_MS",
        "$result.CUSTOM_KEY_WITH_UNDERSCORE = $env:CUSTOM_KEY_WITH_UNDERSCORE",
        "$result.PHOTO_WEATHER_ENV_LOCAL_LOADED = $env:PHOTO_WEATHER_ENV_LOCAL_LOADED",
        "$result.MASKED_DATABASE_URL = Mask-DatabaseUrl -DatabaseUrl $env:DATABASE_URL",
        "[pscustomobject]$result | ConvertTo-Json -Compress",
      ].join("; ");
      const output = execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ]).toString("utf8");
      const parsed = JSON.parse(output) as Record<string, string>;

      expect(parsed.DATABASE_URL).toBe(
        "postgresql://photo_weather:pass-with-dash@127.0.0.1:15432/photo_weather_ai",
      );
      expect(parsed.NEXT_PUBLIC_API_BASE_URL).toBe("http://localhost:4000");
      expect(parsed.ENABLE_ASTRO_SERVICE).toBe("true");
      expect(parsed.ASTRO_SERVICE_URL).toBe("http://localhost:4100");
      expect(parsed.ASTRO_SERVICE_TIMEOUT_MS).toBe("45000");
      expect(parsed.CUSTOM_KEY_WITH_UNDERSCORE).toBe("quoted value with spaces");
      expect(parsed.PHOTO_WEATHER_ENV_LOCAL_LOADED).toBe("true");
      expect(parsed.MASKED_DATABASE_URL).toContain("photo_weather:***@");
      expect(parsed.MASKED_DATABASE_URL).not.toContain("pass-with-dash");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("wires root scripts and local diagnostics to the astro-service env contract", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      scripts: Record<string, string>;
    };
    const devLocalScript = readRepoFile("scripts/dev-local.ps1");
    const checkLocalScript = readRepoFile("scripts/check-local.ps1");
    const debugAstroScript = readRepoFile("scripts/debug-astro-local.ps1");
    const testAstroApiScript = readRepoFile("scripts/test-astro-forecast-api.ps1");
    const testQWeatherScript = readRepoFile("scripts/test-qweather-provider.ps1");

    expect(packageJson.scripts["debug:astro"]).toBe(
      "powershell -ExecutionPolicy Bypass -File scripts/debug-astro-local.ps1",
    );
    expect(packageJson.scripts["test:astro-api"]).toBe(
      "powershell -ExecutionPolicy Bypass -File scripts/test-astro-forecast-api.ps1",
    );
    expect(packageJson.scripts["test:qweather"]).toBe(
      "powershell -ExecutionPolicy Bypass -File scripts/test-qweather-provider.ps1",
    );

    for (const script of [devLocalScript, checkLocalScript, debugAstroScript]) {
      expect(script).toContain("ENABLE_ASTRO_SERVICE");
      expect(script).toContain("ASTRO_SERVICE_URL");
      expect(script).toContain("ASTRO_SERVICE_TIMEOUT_MS");
    }

    expect(devLocalScript).toContain("Export-ProcessEnvironment");
    expect(devLocalScript).toContain("NEXT_PUBLIC_API_BASE_URL");
    expect(devLocalScript).toContain("JWT_SECRET");
    expect(debugAstroScript).toContain("DATABASE_URL");
    expect(debugAstroScript).toContain("Astro resolved timeout ms:");
    expect(debugAstroScript).toContain("Get-Content -LiteralPath $apiLogPath");
    expect(debugAstroScript).toContain('"astro"');
    expect(debugAstroScript).toContain('"forecast"');
    expect(debugAstroScript).toContain('"calculate"');
    expect(debugAstroScript).toContain('"ECONN"');
    expect(testAstroApiScript).toContain("/forecast/calculate");
    expect(testAstroApiScript).toContain("horizon=7d");
    expect(testAstroApiScript).toContain("Elapsed ms:");
    expect(testQWeatherScript).toContain("/admin/providers/weather/qweather/test-connection");
    expect(testQWeatherScript).toContain("/debug/providers");
    expect(testQWeatherScript).toContain("PHOTO_WEATHER_ADMIN_ACCESS_TOKEN");
  });

  it("keeps diagnostic scripts Windows PowerShell 5.1 friendly and ASCII-safe", () => {
    const scripts = [
      readRepoFile("scripts/debug-astro-local.ps1"),
      readRepoFile("scripts/test-astro-forecast-api.ps1"),
      readRepoFile("scripts/test-qweather-provider.ps1"),
    ];
    const forbiddenSnippets = [
      "??",
      "?:",
      "ForEach-Object -Parallel",
      "$(if",
      "::new(",
      "�",
      "ï»¿",
      "鈥",
      "涓",
      "鎴",
      "澶",
      "閾",
      "锛",
      "銆",
    ];

    for (const script of scripts) {
      for (const forbidden of forbiddenSnippets) {
        expect(script).not.toContain(forbidden);
      }

      for (const character of script) {
        expect(character.charCodeAt(0)).toBeLessThanOrEqual(127);
      }
    }
  });

  itOnWindows("parses diagnostic scripts with Windows PowerShell", () => {
    for (const scriptName of [
      "debug-astro-local.ps1",
      "test-astro-forecast-api.ps1",
      "test-qweather-provider.ps1",
    ]) {
      const scriptPath = join(repoRoot, "scripts", scriptName);
      const command = [
        "$ErrorActionPreference = 'Stop'",
        `$source = Get-Content -Raw -Encoding UTF8 -LiteralPath ${quotePowerShellString(scriptPath)}`,
        "[scriptblock]::Create($source) | Out-Null",
      ].join("; ");

      expect(() =>
        execFileSync("powershell.exe", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          command,
        ]),
      ).not.toThrow();
    }
  });

  it("keeps the direct astro forecast script payload aligned with the API contract", () => {
    const testAstroApiScript = readRepoFile("scripts/test-astro-forecast-api.ps1");
    const payload = {
      name: "黄山光明顶",
      source: "local_photo_spot",
      latitudeGcj02: 30.13254,
      longitudeGcj02: 118.16876,
      latitudeWgs84: 30.1321,
      longitudeWgs84: 118.1691,
      elevationMeters: 1800,
      timezone: "Asia/Shanghai",
      horizon: "24h",
      target: "astro",
      locationId: "location-huangshan",
      photoSpotId: "spot-guangmingding",
    };
    const acceptedQueryPayload = {
      name: payload.name,
      source: payload.source,
      latitudeGcj02: payload.latitudeGcj02,
      longitudeGcj02: payload.longitudeGcj02,
      latitudeWgs84: payload.latitudeWgs84,
      longitudeWgs84: payload.longitudeWgs84,
      horizon: payload.horizon,
      target: payload.target,
      locationId: payload.locationId,
      photoSpotId: payload.photoSpotId,
    };

    expect(forecastQueryInputSchema.safeParse(acceptedQueryPayload).success).toBe(true);
    for (const key of Object.keys(payload)) {
      expect(testAstroApiScript).toContain(key);
    }
    expect(testAstroApiScript).toContain("New-UnicodeString");
    expect(testAstroApiScript).toContain("Asia/Shanghai");
  });

  it("logs safe API astro startup diagnostics without secret fields", () => {
    const serverSource = readRepoFile("apps/api/src/server.ts");

    expect(serverSource).toContain("Astro service enabled:");
    expect(serverSource).toContain("Astro service URL:");
    expect(serverSource).toContain("Astro service timeout ms:");
    expect(serverSource).toContain("Environment loaded from .env.local:");
    expect(serverSource).not.toContain("DATABASE_URL");
    expect(serverSource).not.toContain("JWT_SECRET");
  });

  it("wires terrain DEM import and check scripts to local-only production compose operations", () => {
    const importScript = readRepoFile("scripts/import-terrain-dem.sh");
    const checkScript = readRepoFile("scripts/check-terrain-dem.sh");
    const combined = `${importScript}\n${checkScript}`;

    for (const expected of [
      "docker-compose.prod.yml",
      ".env.production",
      "deploy/terrain-dem",
      "/app/data/terrain-dem",
      "python -m scripts.import_terrain_dem",
      "python -m scripts.import_terrain_dem --check",
      "terrainDemAvailable",
      "terrainDemDatasetExists",
      "terrainDemMetadataAvailable",
      "terrainDemDatasetName",
      "terrainDemDatasetYear",
      "terrainDemDatasetVersion",
      "terrainDemHealthStatus",
      "terrainDemLoadError",
      "This script does not download DEM data.",
    ]) {
      expect(combined).toContain(expected);
    }

    expect(combined).not.toMatch(/curl|wget|Invoke-WebRequest|Remove-Item|rm -rf/);
  });

  it("wires sky-brightness import and check scripts to local-only production compose operations", () => {
    const importScript = readRepoFile("scripts/import-sky-brightness-raster.sh");
    const checkScript = readRepoFile("scripts/check-sky-brightness-raster.sh");
    const combined = `${importScript}\n${checkScript}`;

    for (const expected of [
      "docker-compose.prod.yml",
      ".env.production",
      "deploy/sky-brightness",
      "/app/data/sky-brightness",
      "python -m scripts.import_sky_brightness_raster",
      "python -m scripts.import_sky_brightness_raster --check",
      "skyBrightnessAvailable",
      "skyBrightnessDatasetExists",
      "skyBrightnessMetadataAvailable",
      "skyBrightnessDatasetName",
      "skyBrightnessDatasetYear",
      "skyBrightnessDatasetVersion",
      "skyBrightnessValueType",
      "skyBrightnessHealthStatus",
      "skyBrightnessLoadError",
      "This script does not download WA or other sky-brightness data.",
    ]) {
      expect(combined).toContain(expected);
    }

    expect(combined).not.toMatch(/curl|wget|Invoke-WebRequest|Remove-Item|rm -rf/);
  });

  it("wires sky-darkness diagnostic and benchmark wrappers to local-only compose operations", () => {
    const diagnoseScript = readRepoFile("scripts/diagnose-sky-darkness.sh");
    const evaluateScript = readRepoFile("scripts/evaluate-sky-darkness-benchmarks.sh");
    const reportScript = readRepoFile("scripts/report-sky-darkness-qa.sh");
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      scripts: Record<string, string>;
    };
    const apiPackageJson = JSON.parse(readRepoFile("apps/api/package.json")) as {
      scripts: Record<string, string>;
    };
    const combined = `${diagnoseScript}\n${evaluateScript}\n${reportScript}`;

    expect(packageJson.scripts["sky-darkness:diagnose"]).toBe(
      "pnpm --filter @photo-weather/api sky-darkness:diagnose",
    );
    expect(apiPackageJson.scripts["sky-darkness:diagnose"]).toBe(
      "tsx src/scripts/diagnose-sky-darkness.ts",
    );
    expect(packageJson.scripts["sky-darkness:qa"]).toBe("bash scripts/report-sky-darkness-qa.sh");

    for (const expected of [
      "docker-compose.prod.yml",
      ".env.production",
      "pnpm --filter @photo-weather/api exec tsx src/scripts/diagnose-sky-darkness.ts",
      "pnpm --filter @photo-weather/api exec tsx src/scripts/national-sky-darkness-benchmark.ts",
      "--astro-service-url http://astro-service:4100",
      "normalized_args+=(--format json)",
      "This command queries only the local active WA/model and VIIRS datasets",
      "Compatibility: --json is translated to --format json.",
      "Default outputs: --format markdown --format json.",
      "This is audit-only. It writes QA reports, not production rules.",
      "competitorBenchmark, thirdPartyReference, notGroundTruth",
    ]) {
      expect(combined).toContain(expected);
    }

    expect(diagnoseScript).not.toMatch(/sky-darkness:diagnose\s+--/);
    expect(evaluateScript).not.toMatch(/sky-darkness:benchmark\s+--/);
    expect(evaluateScript).toContain('if [[ "${arg}" == "--json" ]]');
    expect(evaluateScript).toContain("args=(--input");
    expect(evaluateScript).toContain('"${normalized_args[@]}"');
    expect(reportScript).toContain("normalized_args+=(--format markdown --format json)");
    expect(reportScript).toContain("src/scripts/national-sky-darkness-benchmark.ts");
    expect(combined).not.toMatch(/curl|wget|Invoke-WebRequest|Remove-Item|rm -rf/);
  });

  it("prints real-weather calibration diagnostics without raw provider secrets", () => {
    const script = readRepoFile("scripts/test-real-weather.sh");

    for (const expected of [
      "rawTemperature:",
      "locationName:",
      "latitudeWgs84:",
      "longitudeWgs84:",
      "elevationMeters:",
      "elevationSource:",
      "elevationConfidence:",
      "terrainProfile:",
      "providerElevationMeters:",
      "selectedSpotElevationMeters:",
      "elevationDifferenceMeters=",
      "temperatureCorrectionApplied:",
      "dayCorrectionRatio:",
      "nightCorrectionRatio:",
      "correctedTemperature:",
      "mountainFeelsLikeC:",
      "precipitationRisk:",
      "astroConditionScore:",
      "astroPracticalScore:",
      "astroWindowAvailable:",
      "astroShootable:",
      "astroWeatherBlockers:",
      "bestWindowFullLabel:",
      "recommendedArrivalFullLabel:",
      "topRankedWindows:",
      "dedicatedTripRecommendation:",
      "nearbyObservationRecommendation:",
      "mainPrecipitationPeriodLabelZh:",
      "watchableWindows:",
      "bestShootableWindow:",
      "dailyPracticalScores:",
      "temperatureCorrectionSummary:",
      "tripodStabilityRisk=",
      "clothingRiskNoteZh:",
      "generalBestSubject:",
      "confidenceByTarget:",
      "cloudSeaFormationScore:",
      "cloudSeaShootableScore:",
      "whiteoutRiskScore:",
      "lightAlignedScore:",
      "bestCloudSeaWindow:",
      "watchableCloudSeaWindows:",
      "terrainSupport:",
      "rainSupportSignal:",
      "activeRainDuringWindow:",
      "postRainOpeningChance:",
      "cloudSeaConfidence:",
      "cloudSeaReasons:",
      "sunriseGlowScore:",
      "sunsetGlowScore:",
      "colorCarrierScore:",
      "lowCloudObstructionRisk:",
      "rainOverlapsSunriseWindow:",
      "rainOverlapsSunsetWindow:",
      "bestGlowWindow:",
      "glowConfidence:",
      "glowReasons:",
    ]) {
      expect(script).toContain(expected);
    }

    expect(script).toContain("No API keys or secrets will be printed.");
    expect(script).toContain("apiKeyPresent");
    expect(script).not.toMatch(/provider\.apiKey(?!Present)/);
    expect(script).not.toContain("process.env.QWEATHER");
    expect(script).not.toContain("process.env.METEOBLUE");
  });

  it("prints cloud-layer coverage diagnostics without raw provider secrets", () => {
    const iconScript = readRepoFile("scripts/test-open-meteo-icon-cloud-layers.sh");
    const coverageScript = readRepoFile("scripts/test-cloud-layer-coverage.sh");
    const combined = `${iconScript}\n${coverageScript}`;

    for (const expected of [
      "forecast_hours",
      "cloud_cover_low",
      "cloud_cover_mid",
      "cloud_cover_high",
      "fieldCoverageSummary",
      "providerCoverageSummary",
      "firstLastRows",
      "layerCoverageAtLeast90",
      "skipped_no_key",
    ]) {
      expect(combined).toContain(expected);
    }

    expect(combined).toContain("No API keys or raw provider JSON are printed.");
    expect(combined).not.toContain("console.log(process.env.METEOBLUE_API_KEY");
    expect(combined).not.toContain("console.log(process.env.OPEN_METEO_API_KEY");
  });

  it("wires historical calibration smoke testing without printing admin secrets", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      scripts: Record<string, string>;
    };
    const script = readRepoFile("scripts/test-historical-calibration.sh");
    const cli = readRepoFile("apps/api/src/historical-calibration-cli.ts");
    const apiPackageJson = JSON.parse(readRepoFile("apps/api/package.json")) as {
      scripts: Record<string, string>;
    };
    const combined = `${script}\n${cli}`;

    expect(packageJson.scripts["calibration:test"]).toBe(
      "bash scripts/test-historical-calibration.sh",
    );
    expect(apiPackageJson.scripts["calibration:test"]).toBe(
      "node dist/historical-calibration-cli.js",
    );
    for (const expected of [
      "docker compose --env-file",
      "pnpm --filter @photo-weather/api calibration:test",
      "open_meteo_historical",
      "samples inserted/updated/skipped:",
      "replayResultsCount=",
      "observedOutcomeId=",
      "matchStatus=",
      "falsePositiveRate=",
      "calibrationHint=",
      "daily recommendations:",
      "No API keys or secrets will be printed.",
      "黄山光明顶",
    ]) {
      expect(combined).toContain(expected);
    }

    expect(combined).not.toContain("QWEATHER_API_KEY");
    expect(combined).not.toContain("METEOBLUE_API_KEY");
    expect(combined).not.toContain("DEEPSEEK_API_KEY");
  });

  it("prints DeepSeek interpretation diagnostics without raw secrets", () => {
    const script = readRepoFile("scripts/test-deepseek-interpretation.sh");

    for (const expected of [
      "model: ${config.model}",
      "timeoutMs: ${config.timeoutMs}",
      "deepseek-v4-pro",
      "success:",
      "source:",
      "parseSuccess:",
      "parseStrategy:",
      "rawResponseSizeChars:",
      "errorCategory:",
      "messageZh:",
      "promptSizeChars:",
      "retryable:",
      "latencyMs:",
      "fallbackSuccess:",
    ]) {
      expect(script).toContain(expected);
    }

    expect(script).toContain("No API keys or secrets will be printed.");
    expect(script).toContain("apiKeyPresent");
    expect(script).toContain("api_node()");
    expect(script).toContain("compose exec -T api node");
    expect(script).toContain("timeout 130s");
    expect(script).toContain("print_timeout_result");
    expect(script).not.toContain('started_ms="$(node');
    expect(script).not.toContain('ended_ms="$(node');
    expect(script).not.toContain('node - "$response_file"');
    expect(script).not.toContain("DEEPSEEK_API_KEY");
  });
});
