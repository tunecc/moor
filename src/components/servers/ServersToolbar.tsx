import { Search, X, List, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ServerViewMode } from "@/hooks/useServerViewPreferences";

interface ServersToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  viewMode: ServerViewMode;
  onViewModeChange: (mode: ServerViewMode) => void;
}

export function ServersToolbar({
  searchQuery,
  onSearchQueryChange,
  viewMode,
  onViewModeChange,
}: ServersToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-40)]" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && searchQuery) onSearchQueryChange("");
          }}
          placeholder="Search servers..."
          className="h-9 pl-9 pr-9"
          aria-label="Search servers"
        />
        {searchQuery ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => onSearchQueryChange("")}
            aria-label="Clear search"
            title="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      <div
        role="group"
        aria-label="Server view"
        className="inline-flex h-9 items-center rounded-lg border border-[var(--fg-10)] bg-transparent p-0.5"
      >
        <button
          type="button"
          aria-pressed={viewMode === "list"}
          aria-label="List view"
          title="List view"
          onClick={() => onViewModeChange("list")}
          className={cn(
            "flex h-8 flex-1 items-center justify-center rounded-md px-2.5 transition-colors",
            viewMode === "list"
              ? "bg-cursor-orange text-surface-200"
              : "bg-transparent text-[var(--fg-40)] hover:bg-[var(--fg-06)]",
          )}
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "grid"}
          aria-label="Grid view"
          title="Grid view"
          onClick={() => onViewModeChange("grid")}
          className={cn(
            "flex h-8 flex-1 items-center justify-center rounded-md px-2.5 transition-colors",
            viewMode === "grid"
              ? "bg-cursor-orange text-surface-200"
              : "bg-transparent text-[var(--fg-40)] hover:bg-[var(--fg-06)]",
          )}
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
