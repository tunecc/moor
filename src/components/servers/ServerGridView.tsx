import { useCallback, useMemo } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ServerCard } from "@/components/servers/ServerCard";
import { cn, getErrorMessage } from "@/lib/utils";
import type { Server } from "@moor/types";
import type { ServerAction } from "@/hooks/server-patch-utils";
import { UNGROUPED_ID } from "@/hooks/useServerGroups";

interface ServerGridViewProps {
  servers: Server[];
  /** Full list used for reorder mapping */
  allServers: Server[];
  serverActions: Record<string, ServerAction | undefined>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (nextServers: Server[]) => Promise<void>;
  onReorderError: (message: string) => void;
  /** Optional group id; when provided, reorder is scoped to that group's servers. */
  groupId?: string;
  /** Cross-group move handler (writes groupId only). */
  onAssignGroup?: (serverId: string, groupId: string | null) => Promise<void>;
}

function SortableGridServerCard({
  server,
  action,
  onStart,
  onStop,
  onRemove,
}: {
  server: Server;
  action: ServerAction | undefined;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: server.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "relative cursor-grabbing")}
      {...attributes}
      {...listeners}
    >
      <ServerCard
        server={server}
        action={action}
        variant="compact"
        isSorting={isDragging}
        onStart={onStart}
        onStop={onStop}
        onRemove={onRemove}
      />
    </div>
  );
}

function groupOf(server: Server | undefined): string {
  if (!server) return UNGROUPED_ID;
  return server.groupId ?? UNGROUPED_ID;
}

export function ServerGridView({
  servers,
  allServers,
  serverActions,
  onStart,
  onStop,
  onRemove,
  onReorder,
  onReorderError,
  groupId,
  onAssignGroup,
}: ServerGridViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = useMemo(() => servers.map((s) => s.id), [servers]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over?.id ? String(event.over?.id) : null;
      if (!overId || activeId === overId) return;

      const activeServer = servers.find((s) => s.id === activeId);
      const overServer = servers.find((s) => s.id === overId);
      if (!activeServer || !overServer) return;

      const activeGroup = groupOf(activeServer);
      const overGroup = groupOf(overServer);

      if (activeGroup !== overGroup) {
        // 跨组移动:只写 groupId。
        if (!onAssignGroup) return;
        const target = overGroup === UNGROUPED_ID ? null : overGroup;
        if ((activeServer.groupId ?? null) === target) return;
        try {
          await onAssignGroup(activeId, target);
        } catch (err) {
          onReorderError(getErrorMessage(err, "Unable to move server"));
        }
        return;
      }

      // 同组重排:在 allServers 中以新顺序替换该组 server 块,组外 server 保持原相对顺序。
      const reordered = [...servers];
      const oldIndex = reordered.findIndex((s) => s.id === activeId);
      const newIndex = reordered.findIndex((s) => s.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const [moved] = reordered.splice(oldIndex, 1);
      if (!moved) return;
      reordered.splice(newIndex, 0, moved);

      const scopeIds = new Set(reordered.map((s) => s.id));
      const result: Server[] = [];
      let pushedGroup = false;
      for (const s of allServers) {
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

      try {
        await onReorder(result);
      } catch (err) {
        onReorderError(getErrorMessage(err, "Unable to save server order"));
      }
    },
    [servers, allServers, onReorder, onReorderError, onAssignGroup],
  );

  // groupId 仅用于语义记录(当前视图对应哪个分区);dnd 落点已按 server.groupId 判断。
  void groupId;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {servers.map((server) => (
            <SortableGridServerCard
              key={server.id}
              server={server}
              action={serverActions[server.id]}
              onStart={onStart}
              onStop={onStop}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
