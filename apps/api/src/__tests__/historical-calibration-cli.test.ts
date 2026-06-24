import { describe, expect, it, vi } from "vitest";
import {
  parseHistoricalCalibrationArgs,
  runHistoricalCalibrationCli,
} from "../historical-calibration-cli.js";
import { createFakeDatabaseClient } from "./fake-db.js";

describe("historical calibration CLI", () => {
  it("parses a mocked calibration command without secrets or provider keys", () => {
    const options = parseHistoricalCalibrationArgs([
      "--mock",
      "--location-name",
      "黄山光明顶",
      "--lat",
      "30.1321",
      "--lng",
      "118.1691",
      "--start-date",
      "2026-05-01",
      "--end-date",
      "2026-05-01",
      "--targets",
      "general,glow",
    ]);

    expect(options.mock).toBe(true);
    expect(options.provider).toBe("open_meteo_historical");
    expect(options.targets).toEqual(["general", "glow"]);
  });

  it("runs in mocked test mode without calling real external APIs", async () => {
    const { client } = await createFakeDatabaseClient();
    const output: string[] = [];
    const errorOutput: string[] = [];
    const fetchSpy = vi.fn(() => {
      throw new Error("mocked CLI must not call network");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const exitCode = await runHistoricalCalibrationCli(
      [
        "--mock",
        "--location-name",
        "黄山光明顶",
        "--lat",
        "30.1321",
        "--lng",
        "118.1691",
        "--start-date",
        "2026-05-01",
        "--end-date",
        "2026-05-01",
        "--target",
        "general",
      ],
      (text) => output.push(text),
      (text) => errorOutput.push(text),
      { dbClient: client, env: { NODE_ENV: "test" } as NodeJS.ProcessEnv },
    );

    expect(exitCode).toBe(0);
    expect(errorOutput).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain("provider: open_meteo_historical (mocked)");
    expect(output.join("\n")).toContain("samples inserted/updated/skipped:");
    expect(output.join("\n")).toContain("replayResultsCount=1");
    expect(output.join("\n")).toContain("observedOutcomeId=");
    expect(output.join("\n")).toContain("matchStatus=");
    expect(output.join("\n")).toContain("labeledCount=");
    expect(output.join("\n")).toContain("calibrationHint=");
    expect(output.join("\n")).not.toContain("QWEATHER_API_KEY");
    expect(output.join("\n")).not.toContain("METEOBLUE_API_KEY");
    expect(output.join("\n")).not.toContain("OPENAI_API_KEY");
    vi.unstubAllGlobals();
  });
});
