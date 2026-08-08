# Servers List/Grid View + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add List/Grid view toggle and name search to the Servers page, with compact cards in Grid and persisted view preference.

**Architecture:** Split Servers page concerns into `ServersToolbar`, `ServerListView`, `ServerGridView`, and `useServerViewPreferences`. Keep full `ServerCard` for List (with DnD); add `variant="compact"` for Grid. Filter by name in the page orchestrator; reorder always operates on the full servers array by id.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, lucide-react, @dnd-kit, localStorage, vite-plus/test (`vp test`)

**Spec:** `docs/superpowers/specs/2026-08-06-servers-view-search-design.md`

## Global Constraints

- Learn mcp-router interaction only; keep moor visual language and English UI copy
- Default view mode: `list`; persist with key `moor.servers.viewMode`
- Search matches `server.name` only (case-insensitive, trimmed); do not persist `searchQuery`
- DnD only in List; Grid has no drag handles
- No zustand; no backend API changes; no project grouping
- Tests: pure helpers with `vite-plus/test`; run via `vp test <file>`
- Commit after each task

---

### Task 1: View preference helpers + hook

**Files:**
- Create: `src/hooks/useServerViewPreferences.ts`
- Create: `src/hooks/useServerViewPreferences.test.ts`

**Interfaces:**
- Produces:
  - `export type ServerViewMode = "list" | "grid"`
  - `export function normalizeServerViewMode(value: string | null): ServerViewMode`
  - `export function readStoredServerViewMode(): ServerViewMode`
  - `export function writeStoredServerViewMode(mode: ServerViewMode): void`
  - `export function useServerViewPreferences(): { viewMode: ServerViewMode; setViewMode: (mode: ServerViewMode) => void }`
- Storage key: `moor.servers.viewMode`
- Invalid/missing → `"list"`
- `writeStoredServerViewMode` must try/catch localStorage failures (no throw to UI)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { normalizeServerViewMode } from "./useServerViewPreferences";

describe("normalizeServerViewMode", () => {
  it("accepts list and grid", () => {
    expect(normalizeServerViewMode("list")).toBe("list");
    expect(normalizeServerViewMode("grid")).toBe("grid");
  });

  it("falls back to list for null or invalid values", () => {
    expect(normalizeServerViewMode(null)).toBe("list");
    expect(normalizeServerViewMode("")).toBe("list");
    expect(normalizeServerViewMode("cards")).toBe("list");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/hooks/useServerViewPreferences.test.ts`
Expected: FAIL (module or export not found)

- [ ] **Step 3: Write minimal implementation**

```ts
import { useCallback, useState } from "react";

export type ServerViewMode = "list" | "grid";

const STORAGE_KEY = "moor.servers.viewMode";

export function normalizeServerViewMode(value: string | null): ServerViewMode {
  return value === "list" || value === "grid" ? value : "list";
}

export function readStoredServerViewMode(): ServerViewMode {
  try {
    return normalizeServerViewMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "list";
  }
}

export function writeStoredServerViewMode(mode: ServerViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Preference persistence is best-effort.
  }
}

export function useServerViewPreferences() {
  const [viewMode, setViewModeState] = useState<ServerViewMode>(() => readStoredServerViewMode());

  const setViewMode = useCallback((mode: ServerViewMode) => {
    setViewModeState(mode);
    writeStoredServerViewMode(mode);
  }, []);

  return { viewMode, setViewMode };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/hooks/useServerViewPreferences.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useServerViewPreferences.ts src/hooks/useServerViewPreferences.test.ts
git commit -m "feat(servers): add view mode preference hook"
```

---

### Task 2: Server list pure helpers (filter + reorder)

**Files:**
- Create: `src/lib/server-list.ts`
- Create: `src/lib/server-list.test.ts`

**Interfaces:**
- Produces:
  - `export function filterServersByName<T extends { name: string }>(servers: T[], query: string): T[]`
  - `export function getReorderedServers<T extends { id: string }>(servers: T[], activeId: string, overId: string | null | undefined): T[]`
- `filterServersByName`: `trim` + lower-case `includes` on `name`; empty normalized query returns same array reference
- `getReorderedServers`: same semantics as current `Servers.tsx` helper (no-op if missing ids or same id); operates on full array by id so filtered-list drags stay correct

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { filterServersByName, getReorderedServers } from "./server-list";

describe("filterServersByName", () => {
  const servers = [{ name: "GitHub" }, { name: "filesystem" }, { name: "Brave Search" }];

  it("returns the same reference for empty/whitespace query", () => {
    expect(filterServersByName(servers, "")).toBe(servers);
    expect(filterServersByName(servers, "  ")).toBe(servers);
  });

  it("filters by case-insensitive name substring", () => {
    expect(filterServersByName(servers, "git").map((s) => s.name)).toEqual(["GitHub"]);
    expect(filterServersByName(servers, " SEARCH ").map((s) => s.name)).toEqual(["Brave Search"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterServersByName(servers, "zzz")).toEqual([]);
  });
});

describe("getReorderedServers", () => {
  const servers = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("moves active id before/to over id in the full list", () => {
    expect(getReorderedServers(servers, "a", "c").map((s) => s.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("keeps hidden neighbors when reordering two visible ids", () => {
    // Simulate filter showing only a and c; drag a onto c using full array.
    expect(getReorderedServers(servers, "a", "c").map((s) => s.id)).toEqual(["b", "c", "a", "d"]);
    expect(getReorderedServers(servers, "c", "a").map((s) => s.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("returns the original array for no-op cases", () => {
    expect(getReorderedServers(servers, "a", "a")).toBe(servers);
    expect(getReorderedServers(servers, "a", null)).toBe(servers);
    expect(getReorderedServers(servers, "missing", "a")).toBe(servers);
  });
});
```

Note: exact order after splice depends on the existing algorithm in `Servers.tsx` (`splice` remove then insert at `newIndex`). **Copy that algorithm verbatim** so tests match production behavior. If the first expected order above does not match the existing helper, adjust expectations to the existing helper’s actual output (do not invent a new reorder semantic).

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/lib/server-list.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

Lift the current helpers from `src/pages/Servers.tsx` into `src/lib/server-list.ts`:

```ts
export function filterServersByName<T extends { name: string }>(servers: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return servers;
  return servers.filter((server) => server.name.toLowerCase().includes(normalized));
}

export function getReorderedServers<T extends { id: string }>(
  servers: T[],
  activeId: string,
  overId: string | null | undefined,
): T[] {
  if (!overId || activeId === overId) return servers;
  const oldIndex = servers.findIndex((server) => server.id === activeId);
  const newIndex = servers.findIndex((server) => server.id === overId);
  if (oldIndex < 0 || newIndex < 0) return servers;
  const next = [...servers];
  const [moved] = next.splice(oldIndex, 1);
  if (!moved) return servers;
  next.splice(newIndex, 0, moved);
  return next;
}

export function getServerIds<T extends { id: string }>(servers: T[]): string[] {
  return servers.map((server) => server.id);
}
```

Also export `getServerIds` (used by SortableContext). Add a small test or rely on list view usage.

- [ ] **Step 4: Run test and fix expectations if needed**

Run: `vp test src/lib/server-list.test.ts`
Expected: PASS  
If reorder expectations fail, run a quick node/assert against the lifted function and update test expected arrays to match the **existing** splice behavior — do not change reorder semantics.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server-list.ts src/lib/server-list.test.ts
git commit -m "feat(servers): extract filter and reorder helpers"
```

---

### Task 3: ServersToolbar

**Files:**
- Create: `src/components/servers/ServersToolbar.tsx`

**Interfaces:**
- Consumes: `ServerViewMode` from `@/hooks/useServerViewPreferences`
- Produces:

```ts
interface ServersToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  viewMode: ServerViewMode;
  onViewModeChange: (mode: ServerViewMode) => void;
}
```

- [ ] **Step 1: Implement toolbar UI**

Use existing `Input`, `Button`, lucide `Search`, `X`, `List`, `LayoutGrid`.

Behavior:
- Controlled search input, placeholder `Search servers...`
- Left search icon absolutely positioned
- Clear button (`X`) when `searchQuery.length > 0`; click clears to `""`
- `onKeyDown`: if `Escape`, clear query
- Two icon buttons for list/grid with `aria-pressed={viewMode === ...}`, `title` / `aria-label` `List view` / `Grid view`
- Active mode: `variant="default"`; inactive: `variant="outline"`
- Layout: `flex items-center gap-2`; search wrapper `relative flex-1`; buttons `size="icon"` with slightly smaller hit if needed via `className="h-9 w-9"`

Suggested structure:

```tsx
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
```

No component test required unless the repo already has RTL harness (it does not in package.json); keep this task UI-only.

- [ ] **Step 2: Typecheck touchpoint**

Run: `pnpm exec tsc -b --pretty false`  
Expected: no errors related to new file (project may already have unrelated noise — fix only what you introduced)

Alternatively rely on later page wiring if full `tsc` is heavy; at minimum ensure imports resolve.

- [ ] **Step 3: Commit**

```bash
git add src/components/servers/ServersToolbar.tsx
git commit -m "feat(servers): add servers toolbar with search and view toggle"
```

---

### Task 4: ServerCard compact variant

**Files:**
- Modify: `src/components/servers/ServerCard.tsx`

**Interfaces:**
- Extends props:

```ts
variant?: "full" | "compact"; // default "full"
```

- Compact ignores `dragHandle` / `isSorting` visually (still accepted)
- Keep all actions: start/stop, details, remove, remove confirm, error banner
- Compact density: smaller avatar (`h-8 w-8`), `p-3`, slightly tighter gaps; still show command preview truncated

- [ ] **Step 1: Add `variant` prop and branch layout**

Minimal approach:
1. Add `variant = "full"` to props
2. `const isCompact = variant === "compact"`
3. Conditionally:
   - CardContent padding: `isCompact ? "p-3" : "p-4"`
   - Only render `dragHandle` when `!isCompact && dragHandle`
   - `ServerAvatar`: pass size or className — extend avatar to accept optional `className` / `size` (`compact` → `h-8 w-8`, icon `h-4 w-4`)
4. Do **not** remove controls, identity, remove feedback, or error banner

Example prop update:

```ts
interface ServerCardProps {
  server: Server;
  action?: ServerAction;
  variant?: "full" | "compact";
  dragHandle?: ReactNode;
  isSorting?: boolean;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}
```

- [ ] **Step 2: Smoke via typecheck**

Run: `pnpm exec tsc -b --pretty false`  
Expected: clean for ServerCard changes (default prop keeps existing call sites working)

- [ ] **Step 3: Commit**

```bash
git add src/components/servers/ServerCard.tsx
git commit -m "feat(servers): add compact variant to ServerCard"
```

---

### Task 5: Extract ServerListView and ServerGridView

**Files:**
- Create: `src/components/servers/ServerListView.tsx`
- Create: `src/components/servers/ServerGridView.tsx`
- Modify: `src/pages/Servers.tsx` (only if needed to keep build green mid-way; full wiring is Task 6)

**Interfaces:**
- Consumes: `Server`, `ServerAction` map, start/stop/remove/reorder callbacks, helpers from `@/lib/server-list`
- Produces:

```ts
// ServerListView
interface ServerListViewProps {
  servers: Server[];           // filtered list for display + sortable items
  allServers: Server[];        // full list for reorder mapping
  serverActions: Record<string, ServerAction | undefined> | ServerActionMap;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (nextServers: Server[]) => Promise<void>;
  onReorderError: (message: string) => void;
}

// ServerGridView
interface ServerGridViewProps {
  servers: Server[];
  serverActions: Record<string, ServerAction | undefined> | ServerActionMap;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}
```

- [ ] **Step 1: Implement `ServerListView`**

Move from current `Servers.tsx`:
- `SortableServerCard` (can live in the same file as private function)
- `DndContext` / sensors / `handleDragEnd`

`handleDragEnd` must call:

```ts
const nextServers = getReorderedServers(allServers, String(event.active.id), event.over?.id ? String(event.over.id) : null);
if (nextServers === allServers) return;
try {
  await onReorder(nextServers);
} catch (err) {
  onReorderError(getErrorMessage(err, "Unable to save server order"));
}
```

Display maps `servers` (filtered). Sortable items: `getServerIds(servers)`.

- [ ] **Step 2: Implement `ServerGridView`**

```tsx
export function ServerGridView({ servers, serverActions, onStart, onStop, onRemove }: ServerGridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {servers.map((server) => (
        <ServerCard
          key={server.id}
          server={server}
          variant="compact"
          action={serverActions[server.id]}
          onStart={onStart}
          onStop={onStop}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/servers/ServerListView.tsx src/components/servers/ServerGridView.tsx
git commit -m "feat(servers): extract list and grid server views"
```

---

### Task 6: Wire Servers page (toolbar, filter, empty states)

**Files:**
- Modify: `src/pages/Servers.tsx`

**Interfaces:**
- Consumes all prior task exports
- Page owns: `searchQuery` state, `viewMode` from hook, `filteredServers`, import/add panels, header actions

- [ ] **Step 1: Rewrite orchestration**

Key logic:

```tsx
const { viewMode, setViewMode } = useServerViewPreferences();
const [searchQuery, setSearchQuery] = useState("");
const [orderError, setOrderError] = useState<string | null>(null);

const filteredServers = useMemo(
  () => filterServersByName(servers, searchQuery),
  [servers, searchQuery],
);

const showToolbar = !loading && servers.length > 0;
const hasSearch = searchQuery.trim().length > 0;
const showSearchEmpty = showToolbar && filteredServers.length === 0 && hasSearch;
```

Render order inside page:
1. `PageHeader` (unchanged actions)
2. `ConfigImportPanel` / `AddServerForm`
3. `orderError` banner
4. If `showToolbar`: `<ServersToolbar ... />`
5. Body:
   - loading → `PageLoading`
   - `servers.length === 0` → existing first-server CTA
   - `showSearchEmpty` → search empty state (not first-server CTA)
   - `viewMode === "list"` → `ServerListView` with `servers={filteredServers}` `allServers={servers}`
   - else → `ServerGridView` with `servers={filteredServers}`

Search empty state (inline is fine):

```tsx
<div className="py-10 text-center">
  <Search className="mx-auto mb-3 h-8 w-8 text-[var(--fg-15)]" />
  <p className="font-body text-sm text-[var(--fg-35)]">
    No servers match “{searchQuery.trim()}”
  </p>
  <Button variant="outline" className="mt-4" onClick={() => setSearchQuery("")}>
    Clear search
  </Button>
</div>
```

Remove inlined DnD/helpers from `Servers.tsx` once views own them. Keep `handleAdd` / scan / import behavior intact.

`onReorder`:

```tsx
onReorder={async (next) => {
  setOrderError(null);
  await reorderServers(next);
}}
onReorderError={(message) => setOrderError(message)}
```

- [ ] **Step 2: Run unit tests + typecheck**

```bash
vp test src/hooks/useServerViewPreferences.test.ts src/lib/server-list.test.ts
pnpm exec tsc -b --pretty false
```

Expected: tests PASS; no new TS errors in touched files

- [ ] **Step 3: Commit**

```bash
git add src/pages/Servers.tsx
git commit -m "feat(servers): wire search and list/grid views on Servers page"
```

---

### Task 7: Manual verification checklist + final polish

**Files:**
- Possibly small fix commits only if bugs found

- [ ] **Step 1: Manual checklist** (dev server if available: `pnpm dev` / `pnpm tauri dev`)

1. With 0 servers: no toolbar; first-server CTA works
2. With ≥1 servers: toolbar visible
3. Type search → list filters by name; Clear / Escape restores
4. No match → search empty + Clear search; not “Add Your First Server”
5. Switch to Grid → multi-column compact cards, no drag handle
6. Refresh page → still Grid
7. Switch back to List → full cards + drag handle
8. List drag reorder still saves
9. While filtered, drag two visible servers → full order updates without dropping hidden servers
10. Compact card: start/stop, open details, remove confirm still work
11. Narrow width: toolbar remains usable

- [ ] **Step 2: Fix any issues found; re-run tests**

```bash
vp test src/hooks/useServerViewPreferences.test.ts src/lib/server-list.test.ts
```

- [ ] **Step 3: Final commit if fixes landed**

```bash
git add -A
git status
# commit only if there are fix changes
git commit -m "fix(servers): polish list/grid search UX"
```

---

## Self-Review (plan vs spec)

| Spec requirement | Task |
|---|---|
| List/Grid toggle | Task 3, 6 |
| Persist view mode `moor.servers.viewMode` | Task 1 |
| Name-only search, session-only query | Task 2, 3, 6 |
| Toolbar under PageHeader | Task 3, 6 |
| List full card + DnD | Task 5, 6 |
| Grid compact, no DnD, 1/2/3 cols | Task 4, 5 |
| Search empty ≠ zero-server empty | Task 6 |
| Filtered drag uses full-array id reorder | Task 2, 5 |
| Split Toolbar/List/Grid/hook | Tasks 1, 3, 5 |
| No zustand / no backend / no grouping | Global constraints |
| Tests for normalize + filter + reorder | Tasks 1–2 |

No intentional placeholders remain. Reorder test expectations must follow existing splice semantics if samples differ.
