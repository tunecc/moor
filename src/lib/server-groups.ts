import type { Server, ServerGroup } from "@moor/types";
import { UNGROUPED_ID } from "@/hooks/useServerGroups";

export interface ServerGroupPartition {
  id: string;
  name: string;
  isUngrouped: boolean;
  servers: Server[];
}

/**
 * 把扁平 server 列表按 group_id 归入分组分区。具名分组按 serverGroup.sortOrder
 * 升序,未分组(Ungrouped)恒在最后。空分组仍保留(展示空状态)。
 */
export function partitionServersByGroup(
  servers: Server[],
  groups: ServerGroup[],
): ServerGroupPartition[] {
  const byGroup = new Map<string, Server[]>();
  for (const server of servers) {
    const key = server.groupId ?? UNGROUPED_ID;
    const list = byGroup.get(key) ?? [];
    list.push(server);
    byGroup.set(key, list);
  }

  const partitions: ServerGroupPartition[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    isUngrouped: false,
    servers: byGroup.get(group.id) ?? [],
  }));

  // 只有实际存在未分组 server 时才追加 Ungrouped 分区;空时不显示。
  const ungrouped = byGroup.get(UNGROUPED_ID) ?? [];
  if (ungrouped.length > 0) {
    partitions.push({
      id: UNGROUPED_ID,
      name: "Ungrouped",
      isUngrouped: true,
      servers: ungrouped,
    });
  }

  return partitions;
}

/** 返回分区内可一键启动(stopped/error)的 server id;running/starting 不重复触发。 */
export function getStartableServerIds(servers: Server[]): string[] {
  return servers
    .filter((server) => server.status === "stopped" || server.status === "error")
    .map((server) => server.id);
}

export function getReorderedGroups<T extends { id: string }>(
  groups: T[],
  activeId: string,
  overId: string | null | undefined,
): T[] {
  if (!overId || activeId === overId) return groups;
  const oldIndex = groups.findIndex((g) => g.id === activeId);
  const newIndex = groups.findIndex((g) => g.id === overId);
  if (oldIndex < 0 || newIndex < 0) return groups;
  const next = [...groups];
  const [moved] = next.splice(oldIndex, 1);
  if (!moved) return groups;
  next.splice(newIndex, 0, moved);
  return next;
}
