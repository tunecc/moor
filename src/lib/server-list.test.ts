import { describe, expect, it } from "vite-plus/test";
import { filterServersByName, getReorderedServers } from "./server-list";

describe("filterServersByName", () => {
  const servers = [{ name: "GitHub" }, { name: "filesystem" }, { name: "Brave Search" }];

  it("returns the same reference for empty/whitespace query", () => {
    expect(filterServersByName(servers, "")).toBe(servers);
    expect(filterServersByName(servers, "  ")).toBe(servers);
  });

  it("filters by case-insensitive name substring", () => {
    expect(filterServersByName(servers, "git").map((s) => s.name)).toEqual(["GitHub"]);
    expect(filterServersByName(servers, " SEARCH ").map((s) => s.name)).toEqual(["Brave Search"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterServersByName(servers, "zzz")).toEqual([]);
  });
});

describe("getReorderedServers", () => {
  const servers = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("moves active id before/to over id in the full list", () => {
    expect(getReorderedServers(servers, "a", "c").map((s) => s.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("keeps hidden neighbors when reordering two visible ids", () => {
    // Simulate filter showing only a and c; drag a onto c using full array.
    expect(getReorderedServers(servers, "a", "c").map((s) => s.id)).toEqual(["b", "c", "a", "d"]);
    expect(getReorderedServers(servers, "c", "a").map((s) => s.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("returns the original array for no-op cases", () => {
    expect(getReorderedServers(servers, "a", "a")).toBe(servers);
    expect(getReorderedServers(servers, "a", null)).toBe(servers);
    expect(getReorderedServers(servers, "missing", "a")).toBe(servers);
  });
});
