import { describe, expect, it } from "vite-plus/test";
import { partitionServersByGroup, getReorderedGroups } from "@/lib/server-groups";
import { UNGROUPED_ID } from "@/hooks/useServerGroups";
import type { Server, ServerGroup } from "@moor/types";

function makeServer(id: string, groupId?: string | null): Server {
  return {
    id,
    name: id,
    connectionType: "stdio",
    status: "stopped",
    autoStart: false,
    command: "node",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    groupId: groupId ?? null,
  };
}

function makeGroup(id: string, name: string, sortOrder: number): ServerGroup {
  return {
    id,
    name,
    sortOrder,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("partitionServersByGroup", () => {
  it("orders named groups in the given order and keeps ungrouped last", () => {
    // hook 返回的 groups 已按 sortOrder 排序;partition 直接按给定顺序。
    const groups = [makeGroup("g2", "Ops", 1), makeGroup("g1", "Dev", 5)];
    const servers = [
      makeServer("a", "g1"),
      makeServer("b", null),
      makeServer("c", "g2"),
      makeServer("d", "g1"),
    ];
    const partitions = partitionServersByGroup(servers, groups);
    expect(partitions.map((p) => p.name)).toEqual(["Ops", "Dev", "Ungrouped"]);
    expect(partitions[0].servers.map((s) => s.id)).toEqual(["c"]);
    expect(partitions[1].servers.map((s) => s.id)).toEqual(["a", "d"]);
    expect(partitions[2].isUngrouped).toBe(true);
    expect(partitions[2].servers.map((s) => s.id)).toEqual(["b"]);
  });

  it("keeps empty named groups so they can render an empty state", () => {
    const groups = [makeGroup("g1", "Dev", 0), makeGroup("g2", "Ops", 1)];
    const partitions = partitionServersByGroup([], groups);
    expect(partitions.map((p) => p.name)).toEqual(["Dev", "Ops"]);
    expect(partitions.every((p) => p.servers.length === 0)).toBe(true);
  });

  it("omits the ungrouped partition when no server is ungrouped", () => {
    const groups = [makeGroup("g1", "Dev", 0)];
    const servers = [makeServer("a", "g1")];
    const partitions = partitionServersByGroup(servers, groups);
    expect(partitions.map((p) => p.id)).toEqual(["g1"]);
    expect(partitions.some((p) => p.id === UNGROUPED_ID)).toBe(false);
  });

  it("moving a server between groups reflects in a single partition", () => {
    const groups = [makeGroup("g1", "Dev", 0), makeGroup("g2", "Ops", 1)];
    const servers = [makeServer("a", "g1")];
    const before = partitionServersByGroup(servers, groups);
    expect(before[0].servers.map((s) => s.id)).toEqual(["a"]);
    const moved = partitionServersByGroup([makeServer("a", "g2")], groups);
    expect(moved[1].servers.map((s) => s.id)).toEqual(["a"]);
    expect(moved[0].servers).toHaveLength(0);
  });
});

describe("getReorderedGroups", () => {
  it("reorders by id", () => {
    const groups = [makeGroup("g1", "A", 0), makeGroup("g2", "B", 1), makeGroup("g3", "C", 2)];
    const next = getReorderedGroups(groups, "g3", "g1");
    expect(next.map((g) => g.id)).toEqual(["g3", "g1", "g2"]);
  });

  it("returns the same array when overId is null", () => {
    const groups = [makeGroup("g1", "A", 0)];
    expect(getReorderedGroups(groups, "g1", null)).toBe(groups);
  });
});
