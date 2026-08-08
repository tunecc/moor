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
import type { Server } from "@moor/types";
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
}

function SortableServerCard({
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
    <div ref={setNodeRef} style={style} className={cn(isDragging && "relative")}>
      <ServerCard
        server={server}
        action={action}
        isSorting={isDragging}
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
}: ServerListViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const nextServers = getReorderedServers(
        allServers,
        String(event.active.id),
        event.over?.id ? String(event.over.id) : null,
      );
      if (nextServers === allServers) return;
      try {
        await onReorder(nextServers);
      } catch (err) {
        onReorderError(getErrorMessage(err, "Unable to save server order"));
      }
    },
    [allServers, onReorder, onReorderError],
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
