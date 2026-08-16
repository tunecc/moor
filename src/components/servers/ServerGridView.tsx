import { ServerCard } from "@/components/servers/ServerCard";
import type { Server, ServerGroup } from "@moor/types";
import type { ServerAction } from "@/hooks/server-patch-utils";

interface ServerGridViewProps {
  servers: Server[];
  serverActions: Record<string, ServerAction | undefined>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  groups?: ServerGroup[];
  onAssignGroup?: (serverId: string, groupId: string | null) => Promise<void>;
}

export function ServerGridView({
  servers,
  serverActions,
  onStart,
  onStop,
  onRemove,
  groups,
  onAssignGroup,
}: ServerGridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {servers.map((server) => (
        <ServerCard
          key={server.id}
          server={server}
          variant="compact"
          action={serverActions[server.id]}
          groups={groups}
          onAssignGroup={onAssignGroup}
          onStart={onStart}
          onStop={onStop}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
