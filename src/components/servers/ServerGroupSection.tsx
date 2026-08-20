import { useState, type KeyboardEvent, type ReactNode } from "react";
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
import { useDroppable } from "@dnd-kit/core";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServerGroup } from "@moor/types";

interface ServerGroupSectionProps {
  id: string;
  name: string;
  isUngrouped: boolean;
  count: number;
  collapsed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleCollapse: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStartAll?: () => Promise<void> | void;
  onStopAll?: () => Promise<void> | void;
  startAllDisabled?: boolean;
  stopAllDisabled?: boolean;
  children: ReactNode;
}

/**
 * 整个分区的可落点区域:作为跨组拖拽的目标。
 * droppableId 形如 `group:<id>`(具名组)或 `group:__ungrouped__`。
 *
 * `GroupDropArea` 包裹整段分区(分区头 + 内容/空态/折叠态),其矩形覆盖整个分区,
 * 由外层自定义碰撞检测在光标进入该矩形(且不在任何 server sortable 上)时命中,
 * 实现稳定的跨组移动。
 */
function GroupDropArea({ droppableId, children }: { droppableId: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-colors",
        isOver ? "bg-cursor-orange/[0.04] ring-1 ring-cursor-orange/20" : "bg-transparent",
      )}
    >
      {children}
    </div>
  );
}

export function ServerGroupSection({
  id,
  name,
  isUngrouped,
  count,
  collapsed,
  canMoveUp,
  canMoveDown,
  onToggleCollapse,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  onStartAll,
  onStopAll,
  startAllDisabled = false,
  stopAllDisabled = false,
  children,
}: ServerGroupSectionProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [startAllBusy, setStartAllBusy] = useState(false);
  const [stopAllBusy, setStopAllBusy] = useState(false);

  const startRename = () => {
    setRenameValue(name);
    setRenameOpen(true);
  };

  const confirmRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === name) {
      setRenameOpen(false);
      return;
    }
    setRenameBusy(true);
    try {
      await onRename(renameValue.trim());
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

  const handleStartAll = async () => {
    if (!onStartAll) return;
    setStartAllBusy(true);
    try {
      await onStartAll();
    } finally {
      setStartAllBusy(false);
    }
  };

  const handleStopAll = async () => {
    if (!onStopAll) return;
    setStopAllBusy(true);
    try {
      await onStopAll();
    } finally {
      setStopAllBusy(false);
    }
  };

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggleCollapse();
    }
  };

  return (
    <section className="space-y-2" data-group-id={id}>
      <GroupDropArea droppableId={`group:${id}`}>
        <div
          role="button"
          tabIndex={0}
          onClick={onToggleCollapse}
          onKeyDown={handleHeaderKeyDown}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-[var(--fg-08)] bg-surface-200/40 px-3 py-2 cursor-pointer select-none",
          )}
        >
          <span className="shrink-0 text-[var(--fg-40)]" aria-hidden="true">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <span className="font-headline text-sm font-medium text-cursor-dark truncate">
            {name}
          </span>
          <span className="text-xs text-[var(--fg-40)] tabular-nums">{count}</span>

          <div
            className="ml-auto flex items-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            {!isUngrouped && onStartAll && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-[var(--fg-45)] hover:text-success-muted hover:bg-success-muted/10"
                disabled={startAllBusy || startAllDisabled}
                onClick={() => void handleStartAll()}
                title={`Start all servers in ${name}`}
                aria-label={`Start all servers in ${name}`}
              >
                {startAllBusy ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <Play className="h-[18px] w-[18px]" />
                )}
              </Button>
            )}
            {!isUngrouped && onStopAll && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-[var(--fg-45)] hover:text-error-warm hover:bg-error-warm/10"
                disabled={stopAllBusy || stopAllDisabled}
                onClick={() => void handleStopAll()}
                title={`Stop all servers in ${name}`}
                aria-label={`Stop all servers in ${name}`}
              >
                {stopAllBusy ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <Square className="h-[18px] w-[18px]" />
                )}
              </Button>
            )}
            {!isUngrouped && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  disabled={!canMoveUp}
                  onClick={onMoveUp}
                  title={`Move ${name} up`}
                  aria-label={`Move ${name} up`}
                >
                  <ArrowUp className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  disabled={!canMoveDown}
                  onClick={onMoveDown}
                  title={`Move ${name} down`}
                  aria-label={`Move ${name} down`}
                >
                  <ArrowDown className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={startRename}
                  title={`Rename ${name}`}
                  aria-label={`Rename ${name}`}
                >
                  <Pencil className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-[var(--fg-45)] hover:text-error-warm hover:bg-error-warm/10"
                  onClick={() => setDeleteOpen(true)}
                  title={`Delete ${name}`}
                  aria-label={`Delete ${name}`}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {collapsed ? (
          count === 0 ? (
            <p className="mt-2 px-3 py-2 font-body text-xs text-[var(--fg-35)]">
              Empty group — drag a server here.
            </p>
          ) : null
        ) : (
          <div className="mt-2 pl-1">{children}</div>
        )}
      </GroupDropArea>

      {/* Rename dialog */}
      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename group</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for &ldquo;{name}&rdquo;.
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
              Delete &ldquo;{name}&rdquo;? Its {count} server{count === 1 ? "" : "s"} will move to
              Ungrouped. The servers themselves are not deleted.
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
    </section>
  );
}

export type { ServerGroup };
