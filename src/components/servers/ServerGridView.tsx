import { useMemo } from "react";
import { SortableContext, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ServerCard } from "@/components/servers/ServerCard";
import { cn } from "@/lib/utils";
import type { Server } from "@moor/types";
import type { ServerAction } from "@/hooks/server-patch-utils";

interface ServerGridViewProps {
  servers: Server[];
  serverActions: Record<string, ServerAction | undefined>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
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

export function ServerGridView({
  servers,
  serverActions,
  onStart,
  onStop,
  onRemove,
}: ServerGridViewProps) {
  const ids = useMemo(() => servers.map((s) => s.id), [servers]);

  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100% / 3 - 8px, 260px), 1fr))",
        }}
      >
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
  );
}
