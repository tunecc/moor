import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, GripVertical, Plus, Pencil, Trash2, X } from "lucide-react";
import { cn, getErrorMessage } from "@/lib/utils";
import { UNGROUPED_ID } from "@/hooks/useServerGroups";
import type { Server, ServerGroup } from "@moor/types";

interface ServerGroupsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ServerGroup[];
  servers: Server[];
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (id: string, name: string) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onReorderGroups: (next: ServerGroup[]) => Promise<void>;
  onAssignGroup: (serverId: string, groupId: string | null) => Promise<void>;
}

/**
 * 按分组归类 server。Ungrouped 用 UNGROUPED_ID 作为 key。
 */
function partitionServers(servers: Server[]): Map<string, Server[]> {
  const map = new Map<string, Server[]>();
  for (const s of servers) {
    const key = s.groupId ?? UNGROUPED_ID;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return map;
}

/**
 * 一个分组区域:列出组内 server,并作为 droppable 落点。
 * droppableId 形如 `group:<id>`(具名组)或 `group:__ungrouped__`。
 */
function GroupBucket({
  droppableId,
  name,
  count,
  isUngrouped,
  children,
}: {
  droppableId: string;
  name: string;
  count: number;
  isUngrouped: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border transition-colors",
        isOver
          ? "border-cursor-orange/40 bg-cursor-orange/[0.04]"
          : "border-[var(--fg-08)] bg-surface-200/40",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--fg-30)]" />
          <span className="font-headline text-sm font-medium text-cursor-dark truncate">
            {name}
          </span>
          <span className="text-xs text-[var(--fg-40)] tabular-nums">{count}</span>
        </div>
      </div>
      <div className="px-2 pb-2 max-h-64 overflow-auto">
        {count === 0 ? (
          <p className="px-1 py-2 font-body text-xs text-[var(--fg-35)]">
            {isUngrouped ? "No ungrouped servers." : "Empty — drag a server here."}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function ServerGroupsManager({
  open,
  onOpenChange,
  groups,
  servers,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onReorderGroups,
  onAssignGroup,
}: ServerGroupsManagerProps) {
  const [createValue, setCreateValue] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byGroup = partitionServers(servers);

  const handleCreate = async () => {
    const name = createValue.trim();
    if (!name) return;
    setCreateBusy(true);
    setError(null);
    try {
      await onCreateGroup(name);
      setCreateValue("");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to create group"));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    void onReorderGroups(next).catch((err) => {
      setError(getErrorMessage(err, "Unable to reorder groups"));
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over?.id) : null;
    if (!overId || activeId === overId) return;
    if (!overId.startsWith("group:")) return;
    const targetPartitionId = overId.slice("group:".length);
    const targetGroupId = targetPartitionId === UNGROUPED_ID ? null : targetPartitionId;
    const active = servers.find((s) => s.id === activeId);
    if (!active) return;
    if ((active.groupId ?? null) === targetGroupId) return;
    void onAssignGroup(activeId, targetGroupId).catch((err) => {
      setError(getErrorMessage(err, "Unable to move server"));
    });
  };

  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <div className="flex items-center justify-between">
            <AlertDialogTitle>Manage Groups</AlertDialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <AlertDialogDescription>
            Create, rename, reorder, or delete groups. Drag a server between groups to move it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-auto">
          {/* Create */}
          <div className="flex items-center gap-2">
            <Input
              value={createValue}
              onChange={(e) => setCreateValue(e.target.value)}
              placeholder="New group name"
              className="h-9"
              aria-label="New group name"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              disabled={createBusy}
            />
            <Button
              onClick={() => void handleCreate()}
              disabled={createBusy || !createValue.trim()}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {error && <p className="font-body text-xs text-error-warm">{error}</p>}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            {groups.length === 0 ? (
              <p className="py-4 text-center font-body text-sm text-[var(--fg-40)]">
                No groups yet. Create one above to organize your servers.
              </p>
            ) : (
              <div className="space-y-2">
                {groups.map((group, index) => (
                  <ManagerGroupRow
                    key={group.id}
                    group={group}
                    servers={byGroup.get(group.id) ?? []}
                    canMoveUp={index > 0}
                    canMoveDown={index < groups.length - 1}
                    onMoveUp={() => handleMove(index, -1)}
                    onMoveDown={() => handleMove(index, 1)}
                    onRename={async (name) => {
                      try {
                        await onRenameGroup(group.id, name);
                      } catch (err) {
                        setError(getErrorMessage(err, "Unable to rename group"));
                        throw err;
                      }
                    }}
                    onDelete={async () => {
                      try {
                        await onDeleteGroup(group.id);
                      } catch (err) {
                        setError(getErrorMessage(err, "Unable to delete group"));
                        throw err;
                      }
                    }}
                  />
                ))}
              </div>
            )}

            {/* Ungrouped 落点 */}
            <GroupBucket
              droppableId={`group:${UNGROUPED_ID}`}
              name="Ungrouped"
              count={byGroup.get(UNGROUPED_ID)?.length ?? 0}
              isUngrouped
            >
              <div className="space-y-1">
                {(byGroup.get(UNGROUPED_ID) ?? []).map((server) => (
                  <DraggableServerChip key={server.id} server={server} />
                ))}
              </div>
            </GroupBucket>
          </DndContext>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DraggableServerChip({ server }: { server: Server }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: server.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex items-center gap-2 rounded-md border border-[var(--fg-08)] bg-surface-100 px-2 py-1.5 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-60 ring-1 ring-cursor-orange/40",
      )}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--fg-30)]" />
      <span className="font-body text-xs text-cursor-dark truncate">{server.name}</span>
    </div>
  );
}

interface ManagerGroupRowProps {
  group: ServerGroup;
  servers: Server[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function ManagerGroupRow({
  group,
  servers,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
}: ManagerGroupRowProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const startRename = () => {
    setRenameValue(group.name);
    setRenameOpen(true);
  };

  const confirmRename = async () => {
    const name = renameValue.trim();
    if (!name || name === group.name) {
      setRenameOpen(false);
      return;
    }
    setRenameBusy(true);
    try {
      await onRename(name);
      setRenameOpen(false);
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await onDelete();
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <GroupBucket
      droppableId={`group:${group.id}`}
      name={group.name}
      count={servers.length}
      isUngrouped={false}
    >
      <div className="space-y-1">
        {servers.map((server) => (
          <DraggableServerChip key={server.id} server={server} />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-end gap-1 px-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          aria-label={`Move ${group.name} up`}
          title={`Move ${group.name} up`}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          aria-label={`Move ${group.name} down`}
          title={`Move ${group.name} down`}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={startRename}
          aria-label={`Rename ${group.name}`}
          title={`Rename ${group.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[var(--fg-45)] hover:text-error-warm hover:bg-error-warm/10"
          onClick={() => setDeleteOpen(true)}
          aria-label={`Delete ${group.name}`}
          title={`Delete ${group.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Rename dialog */}
      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename group</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for &ldquo;{group.name}&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmRename();
            }}
            aria-label="Group name"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renameBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={renameBusy || !renameValue.trim()}
              onClick={(e) => {
                e.preventDefault();
                void confirmRename();
              }}
            >
              {renameBusy ? "Saving..." : "Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{group.name}&rdquo;? Its {servers.length} server
              {servers.length === 1 ? "" : "s"} will move to Ungrouped. The servers themselves are
              not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-error-warm text-surface-200 hover:bg-error-warm/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteBusy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GroupBucket>
  );
}
