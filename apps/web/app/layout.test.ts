import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import RootLayout from "./layout";

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("RootLayout", () => {
  it("defaults to light and restores the saved reading mode before content", () => {
    const html = renderToStaticMarkup(
      React.createElement(RootLayout, null, React.createElement("main", null, "content")),
    );

    expect(html).toContain('<html lang="zh-CN" data-theme="light">');
    expect(html).toContain("<main>content</main></body>");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    for (const saved of ["dark", "light", null, "invalid"]) {
      const document = { documentElement: { dataset: { theme: "light" } } };
      runInNewContext(script!, { document, localStorage: { getItem: () => saved } });
      expect(document.documentElement.dataset.theme).toBe(saved === "dark" ? "dark" : "light");
    }
    expect(() =>
      runInNewContext(script!, {
        document: { documentElement: { dataset: {} } },
        localStorage: {
          getItem: () => {
            throw Error("unavailable");
          },
        },
      }),
    ).not.toThrow();
  });
});
