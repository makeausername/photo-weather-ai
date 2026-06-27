import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "admin-action-feedback.tsx"), "utf8");

describe("admin action feedback component", () => {
  it("exports toast and inline feedback surfaces", () => {
    expect(source).toContain("export function AdminActionToast");
    expect(source).toContain("export function AdminActionInlineMessage");
    expect(source).toContain('export type AdminActionFeedbackVariant = "saving" | "info" | "success" | "warning" | "error"');
  });

  it("keeps the toast fixed, dismissible, and screen-reader announced", () => {
    expect(source).toContain("fixed inset-x-0 bottom-4");
    expect(source).toContain("sm:right-4 sm:top-20");
    expect(source).toContain('role={isError ? "alert" : "status"}');
    expect(source).toContain('aria-live={isError ? "assertive" : "polite"}');
    expect(source).toContain('aria-label="关闭提示"');
    expect(source).toContain("pointer-events-none");
    expect(source).toContain("pointer-events-auto");
  });

  it("auto-dismisses success without leaking timers and keeps errors until dismissed", () => {
    expect(source).toContain('if (feedback.variant === "success")');
    expect(source).toContain("return 4000");
    expect(source).toContain("return false");
    expect(source).toContain("window.setTimeout");
    expect(source).toContain("window.clearTimeout");
    expect(source).toContain("onDismissRef.current?.()");
  });
});
