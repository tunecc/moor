import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ServerCard } from "@/components/servers/ServerCard";
import { getServerIds } from "@/lib/server-list";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";
import type { Server } from "@moor/types";
import type { ServerAction } from "@/hooks/server-patch-utils";

interface ServerListViewProps {
  /** 该分区内用于排序与渲染的 server 列表。 */
  servers: Server[];
  serverActions: Record<string, ServerAction | undefined>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
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
  serverActions,
  onStart,
  onStop,
  onRemove,
}: ServerListViewProps) {
  return (
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
  );
}
