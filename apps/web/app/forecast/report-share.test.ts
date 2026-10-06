import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { buildShareDocument, shareFileStem } from "./report-share-document";
import { paginateShareSections, wrapShareText, zipShareImages } from "./report-share-render";
import { cloudSeaRegressionFixture } from "./__tests__/fixtures/cloudSeaRegressionFixtures";
import { buildPhotographyOutlook } from "./photography-outlook";
import type { SubjectDecisionReport } from "./subject-decision-report";

const result = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase").result;
const measure = (text: string) => Array.from(text).length * 20;

describe("report sharing", () => {
  it("includes all general dates, decisions, risks and equipment without professional rows", () => {
    const outlook = buildPhotographyOutlook(result);
    const doc = buildShareDocument(result, outlook);
    const lines = doc.sections.flatMap((section) => section.lines);
    for (const line of [
      ...outlook.conclusion,
      ...outlook.days.flatMap((day) => day.lines),
      ...outlook.shooting,
      ...outlook.risks,
      ...outlook.clothing,
    ])
      expect(lines).toContain(line);
    expect(doc.updated).toContain("2026");
    expect(doc.updated).toContain(result.calendarBasis.timezone);
  });

  it.each(["astro", "cloud_sea", "glow"] as const)(
    "preserves %s conclusions, cautions and every date",
    (target) => {
      const report: SubjectDecisionReport = {
        target,
        title: "测试题材",
        verdict: "暂不建议专程去",
        reason: "资料不完整",
        timing: "待确认",
        arrival: "等待更新",
        caution: "地形遮挡未确认",
        datesTitle: "每日机会",
        dates: Array.from({ length: 7 }, (_, i) => ({
          title: `第${i + 1}天`,
          summary: "谨慎安排",
          lines: [`第${i + 1}天的独立建议`],
        })),
        shooting: { title: "怎么拍", lines: ["选取合适前景"] },
        risks: { title: "风险", lines: ["阵风较大"] },
      };
      const doc = buildShareDocument(result, report);
      const lines = doc.sections.flatMap((section) => section.lines);
      expect(lines).toContain(report.verdict);
      expect(lines).toContain(report.caution);
      for (const day of report.dates) expect(lines).toContain(day.lines[0]);
      expect(lines).toContain(report.shooting.lines[0]);
      expect(lines).toContain(report.risks.lines[0]);
    },
  );

  it("retains unavailable alert status and full official warning instructions", () => {
    const outlook = buildPhotographyOutlook(result);
    expect(
      JSON.stringify(
        buildShareDocument(
          { ...result, weatherAlerts: [], weatherAlertsStatus: "unavailable" },
          outlook,
        ),
      ),
    ).toContain("天气预警暂未获取");
    const warning = {
      id: "test",
      title: "大风红色预警",
      level: "red" as const,
      description: "请停止户外活动",
      instruction: "立即返回室内",
      startsAt: result.generatedAt,
      senderName: "气象台",
      attributions: ["测试来源"],
    };
    const doc = buildShareDocument({ ...result, weatherAlerts: [warning] }, outlook);
    expect(doc.sections[0]!.lines).toContain(warning.title);
    expect(JSON.stringify(doc)).toContain(warning.instruction);
    expect(JSON.stringify(doc)).toContain(warning.attributions[0]);
  });

  it("wraps long CJK, Latin and grapheme clusters without losing characters", () => {
    const text = "银河👨‍👩‍👧‍👦é".repeat(200) + " abcdefghijklmnopqrstuvwxyz";
    const lines = wrapShareText(text, 512, measure);
    expect(lines.join("")).toBe(text);
    expect(lines.every((line) => measure(line) <= 512)).toBe(true);
    expect(lines.filter((line) => line.includes("👨")).every((line) => line.includes("👨‍👩‍👧‍👦"))).toBe(
      true,
    );
  });

  it("paginates seven days without lost lines or overflow, including oversized sections", () => {
    const sections = Array.from({ length: 7 }, (_, i) => ({
      title: `日期${i}`,
      lines: [`${i}拍摄建议`.repeat(300), `风险${i}`],
    }));
    const pages = paginateShareSections(sections, measure, 220);
    const body = pages
      .flat()
      .filter((line) => !line.heading)
      .map((line) => line.text)
      .join("");
    expect(body).toBe(sections.flatMap((section) => section.lines).join(""));
    expect(pages.length).toBeGreaterThan(7);
    for (const page of pages) {
      expect(page.length).toBeGreaterThan(1);
      expect(page.every((line) => line.y >= 220 && line.y + 30 <= 712)).toBe(true);
    }
  });

  it("moves a short section intact to the next page", () => {
    const pages = paginateShareSections(
      [
        { title: "第一部分", lines: ["字".repeat(300)] },
        { title: "第二部分", lines: ["必须保持完整".repeat(12)] },
      ],
      measure,
    );
    expect(pages.length).toBe(2);
    expect(pages[1]![0]!.text).toBe("第二部分");
  });

  it("packages the original PNG bytes under safe ordered filenames", async () => {
    const stem = shareFileStem({
      location: '山/谷:*?"<>|',
      topic: "天气",
      updated: "",
      sections: [],
    });
    expect(stem).not.toMatch(/[<>:"/\\|?*]/);
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const files = [1, 2].map((i) => new File([bytes], `${stem}-0${i}.png`, { type: "image/png" }));
    const zip = await zipShareImages(files);
    const unpacked = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(unpacked)).toEqual(files.map((file) => file.name));
    expect(unpacked[files[1]!.name]).toEqual(bytes);
  });
});
