import { Search, X, List, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          className="h-9 w-9"
          variant={viewMode === "list" ? "default" : "outline"}
          aria-pressed={viewMode === "list"}
          aria-label="List view"
          title="List view"
          onClick={() => onViewModeChange("list")}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          className="h-9 w-9"
          variant={viewMode === "grid" ? "default" : "outline"}
          aria-pressed={viewMode === "grid"}
          aria-label="Grid view"
          title="Grid view"
          onClick={() => onViewModeChange("grid")}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
