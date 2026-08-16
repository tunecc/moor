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
import { getReorderedServers, getServerIds } from "@/lib/server-list";
import { cn, getErrorMessage } from "@/lib/utils";
import { GripVertical } from "lucide-react";
import type { Server, ServerGroup } from "@moor/types";
import type { ServerAction } from "@/hooks/server-patch-utils";

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

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over?.id ? String(event.over?.id) : null;
      if (!overId || activeId === overId) return;
      // 仅允许在同组内拖拽;跨组拖拽不在此处处理(由分组头菜单/详情页承担)。
      const inSameScope = groupId
        ? servers.some((s) => s.id === overId)
        : allServers.some((s) => s.id === overId);
      if (!inSameScope) return;

      const nextServers = getReorderedServers(groupId ? servers : allServers, activeId, overId);
      if (nextServers === (groupId ? servers : allServers)) return;
      try {
        if (groupId) {
          // 仅重排组内 server:组外 server 保持原相对顺序,组内 server 作为一块按新顺序插入到
          // 它在 allServers 中第一次出现的位置。
          const scopeIds = new Set(nextServers.map((s) => s.id));
          const result: Server[] = [];
          let pushedGroup = false;
          for (const s of allServers) {
            if (scopeIds.has(s.id)) {
              if (!pushedGroup) {
                result.push(...nextServers);
                pushedGroup = true;
              }
            } else {
              result.push(s);
            }
          }
          if (!pushedGroup) result.push(...nextServers);
          await onReorder(result);
        } else {
          await onReorder(nextServers);
        }
      } catch (err) {
        onReorderError(getErrorMessage(err, "Unable to save server order"));
      }
    },
    [servers, allServers, groupId, onReorder, onReorderError],
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
