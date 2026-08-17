import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageLoading } from "@/components/shared/PageLoading";
import { ServersToolbar } from "@/components/servers/ServersToolbar";
import { ServerListView } from "@/components/servers/ServerListView";
import { ServerGridView } from "@/components/servers/ServerGridView";
import { ServerGroupSection } from "@/components/servers/ServerGroupSection";
import { ServerGroupsManager } from "@/components/servers/ServerGroupsManager";
import { useServers } from "@/hooks/useServers";
import { useServerGroups } from "@/hooks/useServerGroups";
import { useCollapsedGroups } from "@/hooks/useCollapsedGroups";
import { useConfigImport } from "@/hooks/useConfigImport";
import { useServerViewPreferences } from "@/hooks/useServerViewPreferences";
import { filterServersByName } from "@/lib/server-list";
import { partitionServersByGroup } from "@/lib/server-groups";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { FileJson, Plus, RefreshCw, ScanSearch, Search } from "lucide-react";
import { cn, getErrorMessage } from "@/lib/utils";
import { UNGROUPED_ID } from "@/hooks/useServerGroups";
import { AddServerForm } from "./servers/AddServerForm";
import { ConfigImportPanel } from "./servers/ConfigImportPanel";
import type { Server } from "@moor/types";

export function Servers() {
  const {
    servers,
    loading,
    startServer,
    stopServer,
    removeServer,
    reorderServers,
    addServer,
    refresh,
    serverActions,
    updateServer,
  } = useServers();
  const {
    groups,
    loading: groupsLoading,
    createGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
    createError,
    renameError,
  } = useServerGroups();
  const { isCollapsed, toggle: toggleCollapsed } = useCollapsedGroups();
  const [showAdd, setShowAdd] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [showGroupsManager, setShowGroupsManager] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const importState = useConfigImport();
  const { viewMode, setViewMode } = useServerViewPreferences();

  const filteredServers = useMemo(
    () => filterServersByName(servers, searchQuery),
    [servers, searchQuery],
  );

  const partitions = useMemo(
    () => partitionServersByGroup(filteredServers, groups),
    [filteredServers, groups],
  );

  const showToolbar = !loading && servers.length > 0;
  const hasSearch = searchQuery.trim().length > 0;
  const showSearchEmpty = showToolbar && filteredServers.length === 0 && hasSearch;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleAdd = useCallback(
    async (config: Parameters<typeof addServer>[0]) => {
      await addServer(config);
      refresh();
    },
    [addServer, refresh],
  );

  const handleScan = useCallback(() => {
    setShowAdd(false);
    setShowJsonImport(false);
    void importState.scan();
  }, [importState]);

  const handleMoveGroup = useCallback(
    async (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= groups.length) return;
      // Ungrouped 分区不参与排序;具名分组都在 partitions 开头且与 groups 顺序一致。
      const next = [...groups];
      const [moved] = next.splice(index, 1);
      if (!moved) return;
      next.splice(target, 0, moved);
      try {
        await reorderGroups(next);
      } catch (err) {
        setOrderError(err instanceof Error ? err.message : "Unable to reorder groups");
      }
    },
    [groups, reorderGroups],
  );

  const handleAssignGroup = useCallback(
    async (serverId: string, groupId: string | null) => {
      await updateServer({ id: serverId, updates: { groupId } });
    },
    [updateServer],
  );

  // 在 allServers 中查找目标 server 所属组(返回其 groupId 或 UNGROUPED_ID)。
  const groupOf = useCallback((server: Server | undefined): string => {
    if (!server) return UNGROUPED_ID;
    return server.groupId ?? UNGROUPED_ID;
  }, []);

  // 统一拖拽落点处理:
  // - over.id 以 `group:` 前缀 → 落到分区头/空组/折叠分区的 GroupDropArea,
  //   跨组移动只写 groupId,不改 sort_order。
  // - 否则 over 是另一个 server 项:同组则重排 sort_order,跨组则只写 groupId。
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over?.id ? String(event.over?.id) : null;
      if (!overId || activeId === overId) return;

      const activeServer = servers.find((s) => s.id === activeId);
      if (!activeServer) return;

      // 1) 落到分组落点区域(`group:<id>`)。
      if (overId.startsWith("group:")) {
        const targetPartitionId = overId.slice("group:".length);
        const targetGroupId = targetPartitionId === UNGROUPED_ID ? null : targetPartitionId;
        if ((activeServer.groupId ?? null) === targetGroupId) return;
        try {
          await handleAssignGroup(activeId, targetGroupId);
        } catch (err) {
          setOrderError(getErrorMessage(err, "Unable to move server"));
        }
        return;
      }

      // 2) 落到另一个 server 项。
      const overServer = servers.find((s) => s.id === overId);
      if (!overServer) return;

      const activeGroup = groupOf(activeServer);
      const overGroup = groupOf(overServer);

      if (activeGroup !== overGroup) {
        // 跨组移动:只写 groupId,不改 sort_order。
        const target = overGroup === UNGROUPED_ID ? null : overGroup;
        if ((activeServer.groupId ?? null) === target) return;
        try {
          await handleAssignGroup(activeId, target);
        } catch (err) {
          setOrderError(getErrorMessage(err, "Unable to move server"));
        }
        return;
      }

      // 3) 同组重排:沿用既有 reorder 逻辑,在该分区内重排后写回 allServers。
      const partition = partitions.find((p) => p.servers.some((s) => s.id === activeId));
      const scoped = partition?.servers ?? [];
      const reordered = [...scoped];
      const oldIndex = reordered.findIndex((s) => s.id === activeId);
      const newIndex = reordered.findIndex((s) => s.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const [moved] = reordered.splice(oldIndex, 1);
      if (!moved) return;
      reordered.splice(newIndex, 0, moved);

      // 在 allServers 中以新顺序替换该组 server 块,组外 server 保持原相对顺序。
      const scopeIds = new Set(reordered.map((s) => s.id));
      const result: Server[] = [];
      let pushedGroup = false;
      for (const s of servers) {
        if (scopeIds.has(s.id)) {
          if (!pushedGroup) {
            result.push(...reordered);
            pushedGroup = true;
          }
        } else {
          result.push(s);
        }
      }
      if (!pushedGroup) result.push(...reordered);

      setOrderError(null);
      try {
        await reorderServers(result);
      } catch (err) {
        setOrderError(getErrorMessage(err, "Unable to save server order"));
      }
    },
    [servers, partitions, handleAssignGroup, reorderServers, groupOf],
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="Servers"
        subtitle="Manage and configure your MCP servers"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowAdd(false);
                setShowJsonImport(true);
              }}
            >
              <FileJson className="h-4 w-4 mr-2" /> Import JSON
            </Button>
            <Button variant="outline" onClick={handleScan}>
              <ScanSearch className="h-4 w-4 mr-2" /> Scan Configs
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await createGroup("New Group");
                } catch (err) {
                  setOrderError(err instanceof Error ? err.message : "Unable to create group");
                }
              }}
              disabled={groupsLoading}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Group
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowGroupsManager(true)}
              aria-label="Manage groups"
            >
              Manage Groups
            </Button>
            <Button
              onClick={() => {
                setShowJsonImport(false);
                setShowAdd(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Server
            </Button>
          </div>
        }
      />

      {/* Import Panels */}
      <ConfigImportPanel
        state={importState}
        showJsonImport={showJsonImport}
        onCloseJsonImport={() => setShowJsonImport(false)}
      />

      {/* Add Server Form */}
      {showAdd && <AddServerForm onAdd={handleAdd} onClose={() => setShowAdd(false)} />}

      <ServerGroupsManager
        open={showGroupsManager}
        onOpenChange={setShowGroupsManager}
        groups={groups}
        servers={servers}
        onCreateGroup={async (name) => {
          try {
            await createGroup(name);
          } catch (err) {
            setOrderError(err instanceof Error ? err.message : "Unable to create group");
          }
        }}
        onRenameGroup={async (id, name) => {
          try {
            await renameGroup({ id, name });
          } catch (err) {
            setOrderError(err instanceof Error ? err.message : "Unable to rename group");
            throw err;
          }
        }}
        onDeleteGroup={async (id) => {
          try {
            await deleteGroup(id);
          } catch (err) {
            setOrderError(err instanceof Error ? err.message : "Unable to delete group");
            throw err;
          }
        }}
        onReorderGroups={async (next) => {
          try {
            await reorderGroups(next);
          } catch (err) {
            setOrderError(err instanceof Error ? err.message : "Unable to reorder groups");
            throw err;
          }
        }}
        onAssignGroup={handleAssignGroup}
      />

      {orderError && <ErrorBanner message={orderError} className="animate-fade-in" />}
      {createError && <ErrorBanner message={createError} className="animate-fade-in" />}
      {renameError && <ErrorBanner message={renameError} className="animate-fade-in" />}

      {/* Server List */}
      <div className="space-y-2">
        {loading ? (
          <PageLoading message="Loading servers..." />
        ) : servers.length === 0 ? (
          <button
            onClick={() => setShowAdd(true)}
            className={cn(
              "w-full py-10 rounded-xl border-2 border-dashed border-[var(--fg-12)]",
              "text-[var(--fg-40)] hover:text-cursor-orange hover:border-cursor-orange/30 hover:bg-cursor-orange/[0.02]",
              "transition-all duration-200 flex flex-col items-center justify-center gap-3 cursor-pointer",
            )}
          >
            <div className="h-12 w-12 rounded-full bg-surface-300 flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <div className="text-center">
              <p className="font-headline text-sm font-medium">Add Your First Server</p>
              <p className="font-body text-xs text-[var(--fg-40)] mt-1">
                Or scan existing configs to import
              </p>
            </div>
          </button>
        ) : (
          <>
            <ServersToolbar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
            {showSearchEmpty ? (
              <div className="py-10 text-center">
                <Search className="mx-auto mb-3 h-8 w-8 text-[var(--fg-15)]" />
                <p className="font-body text-sm text-[var(--fg-35)]">
                  No servers match “{searchQuery.trim()}”
                </p>
                <Button variant="outline" className="mt-4" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              </div>
            ) : partitions.length === 0 ? (
              <div className="py-10 text-center">
                <p className="font-body text-sm text-[var(--fg-35)]">
                  No groups yet. Create one below to organize your servers.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => void handleDragEnd(event)}
              >
                <div className="space-y-4">
                  {partitions.map((partition, index) => (
                    <ServerGroupSection
                      key={partition.id}
                      id={partition.id}
                      name={partition.name}
                      isUngrouped={partition.isUngrouped}
                      count={partition.servers.length}
                      collapsed={isCollapsed(partition.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < partitions.length - 1}
                      onToggleCollapse={() => toggleCollapsed(partition.id)}
                      onRename={async (name) => {
                        try {
                          await renameGroup({ id: partition.id, name });
                        } catch (err) {
                          setOrderError(
                            err instanceof Error ? err.message : "Unable to rename group",
                          );
                          throw err;
                        }
                      }}
                      onDelete={async () => {
                        try {
                          await deleteGroup(partition.id);
                        } catch (err) {
                          setOrderError(
                            err instanceof Error ? err.message : "Unable to delete group",
                          );
                          throw err;
                        }
                      }}
                      onMoveUp={() => void handleMoveGroup(index, -1)}
                      onMoveDown={() => void handleMoveGroup(index, 1)}
                    >
                      {partition.servers.length === 0 ? (
                        <p className="px-2 py-3 font-body text-xs text-[var(--fg-35)]">
                          No servers in this group — drag one here.
                        </p>
                      ) : viewMode === "list" ? (
                        <ServerListView
                          servers={partition.servers}
                          serverActions={serverActions}
                          onStart={startServer}
                          onStop={stopServer}
                          onRemove={removeServer}
                        />
                      ) : (
                        <ServerGridView
                          servers={partition.servers}
                          serverActions={serverActions}
                          onStart={startServer}
                          onStop={stopServer}
                          onRemove={removeServer}
                        />
                      )}
                    </ServerGroupSection>
                  ))}
                </div>
              </DndContext>
            )}
          </>
        )}
      </div>
    </div>
  );
}
