import { useCallback } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ServerCard } from "@/components/servers/ServerCard";
import { getServerIds } from "@/lib/server-list";
import { cn, getErrorMessage } from "@/lib/utils";
import { GripVertical } from "lucide-react";
import type { Server, ServerGroup } from "@moor/types";
import type { ServerAction } from "@/hooks/server-patch-utils";
import { UNGROUPED_ID } from "@/hooks/useServerGroups";

interface ServerListViewProps {
  /** Filtered servers for display + sortable items */
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
  /** Available groups + handler passed through to each card's move-to-group control. */
  groups?: ServerGroup[];
  onAssignGroup?: (serverId: string, groupId: string | null) => Promise<void>;
}

function SortableServerCard({
  server,
  action,
  onStart,
  onStop,
  onRemove,
  groups,
  onAssignGroup,
}: {
  server: Server;
  action: ServerAction | undefined;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  groups?: ServerGroup[];
  onAssignGroup?: (serverId: string, groupId: string | null) => Promise<void>;
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
    <div ref={setNodeRef} style={style} className={cn(isDragging && "relative")}>
      <ServerCard
        server={server}
        action={action}
        isSorting={isDragging}
        groups={groups}
        onAssignGroup={onAssignGroup}
        dragHandle={
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 cursor-grab text-[var(--fg-30)] hover:text-cursor-dark active:cursor-grabbing"
            title={`Reorder ${server.name}`}
            aria-label={`Reorder ${server.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-[18px] w-[18px]" />
          </Button>
        }
        onStart={onStart}
        onStop={onStop}
        onRemove={onRemove}
      />
    </div>
  );
}

// 在 allServers 中查找目标 server 所属组(返回其 groupId 或 UNGROUPED_ID)。
function groupOf(server: Server | undefined): string {
  if (!server) return UNGROUPED_ID;
  return server.groupId ?? UNGROUPED_ID;
}

export function ServerListView({
  servers,
  allServers,
  serverActions,
  onStart,
  onStop,
  onRemove,
  onReorder,
  onReorderError,
  groupId,
  groups,
  onAssignGroup,
}: ServerListViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // groupId 仅作语义记录(本视图对应哪个分区);dnd 落点按 server.groupId 判断同组/跨组。
  void groupId;

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over?.id ? String(event.over?.id) : null;
      if (!overId || activeId === overId) return;

      const activeServer =
        servers.find((s) => s.id === activeId) ?? allServers.find((s) => s.id === activeId);
      const overServer =
        servers.find((s) => s.id === overId) ?? allServers.find((s) => s.id === overId);
      if (!activeServer || !overServer) return;

      const activeGroup = groupOf(activeServer);
      const overGroup = groupOf(overServer);

      if (activeGroup !== overGroup) {
        // 跨组移动:只写 groupId,不改 sort_order,不调 onReorder。
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

      // 同组重排:沿用既有 reorder 逻辑。
      const reordered = [...servers];
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <SortableContext items={getServerIds(servers)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {servers.map((server) => (
            <SortableServerCard
              key={server.id}
              server={server}
              action={serverActions[server.id]}
              groups={groups}
              onAssignGroup={onAssignGroup}
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
