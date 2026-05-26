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

  it("prints real-weather calibration diagnostics without raw provider secrets", () => {
    const script = readRepoFile("scripts/test-real-weather.sh");

    for (const expected of [
      "rawTemperature:",
      "providerElevationMeters:",
      "selectedSpotElevationMeters:",
      "temperatureCorrectionApplied:",
      "correctedTemperature:",
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
      "generalBestSubject:",
      "confidenceByTarget:",
    ]) {
      expect(script).toContain(expected);
    }

    expect(script).toContain("No API keys or secrets will be printed.");
    expect(script).toContain("apiKeyPresent");
    expect(script).not.toMatch(/provider\.apiKey(?!Present)/);
    expect(script).not.toContain("process.env.QWEATHER");
    expect(script).not.toContain("process.env.METEOBLUE");
  });

  it("prints DeepSeek interpretation diagnostics without raw secrets", () => {
    const script = readRepoFile("scripts/test-deepseek-interpretation.sh");

    for (const expected of [
      "model: ${config.model}",
      "timeoutMs: ${config.timeoutMs}",
      "deepseek-v4-pro",
      "success:",
      "errorCategory:",
      "messageZh:",
      "promptSizeChars:",
    ]) {
      expect(script).toContain(expected);
    }

    expect(script).toContain("No API keys or secrets will be printed.");
    expect(script).toContain("apiKeyPresent");
    expect(script).not.toContain("DEEPSEEK_API_KEY");
  });
});
