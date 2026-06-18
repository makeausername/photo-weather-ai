import { afterEach, describe, expect, it, vi } from "vitest";
import SpotsPage from "./spots/page";
import SpotDetailPage from "./spots/[slug]/page";

const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

afterEach(() => {
  redirectMock.mockClear();
});

describe("spot library redirects", () => {
  it("redirects /spots to the homepage", () => {
    expect(() => SpotsPage()).toThrow("redirect:/");

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redirects /spots/[slug] to the homepage", () => {
    expect(() => SpotDetailPage()).toThrow("redirect:/");

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
