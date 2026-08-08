import { describe, expect, it } from "vite-plus/test";
import { normalizeServerViewMode } from "./useServerViewPreferences";

describe("normalizeServerViewMode", () => {
  it("accepts list and grid", () => {
    expect(normalizeServerViewMode("list")).toBe("list");
    expect(normalizeServerViewMode("grid")).toBe("grid");
  });

  it("falls back to list for null or invalid values", () => {
    expect(normalizeServerViewMode(null)).toBe("list");
    expect(normalizeServerViewMode("")).toBe("list");
    expect(normalizeServerViewMode("cards")).toBe("list");
  });
});
