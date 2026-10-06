import { shareFileStem, type ShareDocument, type ShareSection } from "./report-share-document";

const WIDTH = 600;
const HEIGHT = 800;
const CONTENT_WIDTH = 512;
const LINE_HEIGHT = 30;
const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';
export type ShareLine = { text: string; y: number; heading: boolean };
export type SharePage = ShareLine[];
type Measure = (text: string, heading: boolean) => number;

/** Grapheme boundaries preserve emoji and combining characters. Whitespace is retained. */
export function wrapShareText(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line && measure(line + segment) > width) {
        lines.push(line);
        line = "";
      }
      line += segment;
    }
    lines.push(line);
    return lines;
  });
}

/** Keep sections together when possible; continue oversized sections without cropping text. */
export function paginateShareSections(
  sections: readonly ShareSection[],
  measure: Measure,
  top = 180,
  bottom = 712,
): SharePage[] {
  const pages: SharePage[] = [[]];
  let y = top;
  const next = () => {
    pages.push([]);
    y = top;
  };
  const add = (text: string, heading: boolean) => {
    pages[pages.length - 1]!.push({ text, y, heading });
    y += LINE_HEIGHT;
  };
  for (const section of sections) {
    const paragraphs = section.lines
      .filter(Boolean)
      .map((text) => wrapShareText(text, CONTENT_WIDTH, (line) => measure(line, false)));
    if (!paragraphs.length) continue;
    // Titles are allowed to wrap too; continuation uses a short heading to leave room for content.
    const headings = wrapShareText(section.title, CONTENT_WIDTH, (line) => measure(line, true));
    const total =
      (headings.length + paragraphs.reduce((sum, lines) => sum + lines.length, 0)) * LINE_HEIGHT +
      paragraphs.length * 10 +
      18;
    if (
      pages[pages.length - 1]!.length &&
      ((total <= bottom - top && y + total > bottom) || y + 3 * LINE_HEIGHT > bottom)
    )
      next();
    for (const heading of headings) {
      if (y + 2 * LINE_HEIGHT > bottom) next();
      add(heading, true);
    }
    for (const paragraph of paragraphs) {
      if (
        paragraph.length * LINE_HEIGHT <= bottom - top - LINE_HEIGHT &&
        y + paragraph.length * LINE_HEIGHT > bottom
      ) {
        next();
        add("接上页 · 继续阅读", true);
      }
      for (const line of paragraph) {
        if (y + LINE_HEIGHT > bottom) {
          next();
          add("接上页 · 继续阅读", true);
        }
        add(line, false);
      }
      y += 10;
    }
    y += 18;
  }
  return pages;
}

export async function renderShareImages(
  document: ShareDocument,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<File[]> {
  await globalThis.document.fonts.ready;
  signal.throwIfAborted();
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成图片，请换一个浏览器重试。");
  context.scale(1.8, 1.8);
  const font = (heading: boolean) => `${heading ? 600 : 400} 20px ${FONT}`;
  const measure: Measure = (text, heading) => {
    context.font = font(heading);
    return context.measureText(text).width;
  };
  const locationLines = wrapShareText(document.location, CONTENT_WIDTH, (text) => {
    context.font = `700 26px ${FONT}`;
    return context.measureText(text).width;
  });
  // Exceptionally long names are kept in full in the body rather than consuming every page.
  const longName = locationLines.length > 2;
  const headerLines = longName ? ["所选机位（全名见正文）"] : locationLines;
  const top = 156 + headerLines.length * 32;
  const pages = paginateShareSections(
    longName
      ? [{ title: "机位名称", lines: [document.location] }, ...document.sections]
      : document.sections,
    measure,
    top,
  );
  const files: File[] = [];
  try {
    for (let index = 0; index < pages.length; index++) {
      signal.throwIfAborted();
      context.fillStyle = "#f3f6f5";
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = "#ffffff";
      context.fillRect(24, top - 24, 552, 746 - top);
      context.fillStyle = "#14736b";
      context.font = `600 14px ${FONT}`;
      context.fillText(`逐光天气  /  ${document.topic}`, 44, 38);
      context.fillStyle = "#172e30";
      context.font = `700 26px ${FONT}`;
      headerLines.forEach((line, i) => context.fillText(line, 44, 77 + i * 32));
      context.fillStyle = "#52696b";
      context.font = `400 12px ${FONT}`;
      context.fillText(`报告更新：${document.updated}`, 44, 105 + (headerLines.length - 1) * 32);
      context.fillText(
        "请结合整组结论判断，出发前再次查看最新天气。",
        44,
        126 + (headerLines.length - 1) * 32,
      );
      context.textBaseline = "top";
      for (const line of pages[index]!) {
        context.font = font(line.heading);
        context.fillStyle = line.heading ? "#14736b" : "#172e30";
        context.fillText(line.text, 44, line.y);
      }
      context.textBaseline = "alphabetic";
      context.font = `400 13px ${FONT}`;
      context.fillStyle = "#52696b";
      context.fillText("zhuguangweather.com", 44, 764);
      context.textAlign = "right";
      context.fillText(`${index + 1} / ${pages.length}`, 556, 764);
      context.textAlign = "left";
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("图片生成失败，请重试。"))),
          "image/png",
        ),
      );
      signal.throwIfAborted();
      files.push(
        new File([blob], `${shareFileStem(document)}-${String(index + 1).padStart(2, "0")}.png`, {
          type: "image/png",
        }),
      );
      onProgress(index + 1, pages.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return files;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function zipShareImages(files: readonly File[]): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const entries = await Promise.all(
    files.map(async (file) => [file.name, new Uint8Array(await file.arrayBuffer())] as const),
  );
  return new Blob([zipSync(Object.fromEntries(entries), { level: 0 })], {
    type: "application/zip",
  });
}
