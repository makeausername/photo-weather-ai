import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout from "./layout";

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("RootLayout", () => {
  it("renders the document in the static light appearance without a bootstrap script", () => {
    const html = renderToStaticMarkup(
      React.createElement(RootLayout, null, React.createElement("main", null, "content")),
    );

    expect(html).toContain('<html lang="zh-CN" data-theme="light">');
    expect(html).toContain("<body><main>content</main></body>");
    expect(html).not.toContain("<script");
  });
});
