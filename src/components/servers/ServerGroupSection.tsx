import { useState, type ReactNode } from "react";
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
import { ChevronDown, ChevronRight, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
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
  children: ReactNode;
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
  children,
}: ServerGroupSectionProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  return (
    <section className="space-y-2" data-group-id={id}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-[var(--fg-08)] bg-surface-200/40 px-3 py-2",
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
          aria-expanded={!collapsed}
          className="shrink-0 text-[var(--fg-40)] hover:text-cursor-dark transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="font-headline text-sm font-medium text-cursor-dark truncate">{name}</span>
        <span className="text-xs text-[var(--fg-40)] tabular-nums">{count}</span>

        <div className="ml-auto flex items-center gap-0.5">
          {!isUngrouped && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                title={`Move ${name} up`}
                aria-label={`Move ${name} up`}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                title={`Move ${name} down`}
                aria-label={`Move ${name} down`}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={startRename}
                title={`Rename ${name}`}
                aria-label={`Rename ${name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[var(--fg-45)] hover:text-error-warm hover:bg-error-warm/10"
                onClick={() => setDeleteOpen(true)}
                title={`Delete ${name}`}
                aria-label={`Delete ${name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {!collapsed && <div className="pl-1">{children}</div>}

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
