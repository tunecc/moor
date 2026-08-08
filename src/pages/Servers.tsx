import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageLoading } from "@/components/shared/PageLoading";
import { ServersToolbar } from "@/components/servers/ServersToolbar";
import { ServerListView } from "@/components/servers/ServerListView";
import { ServerGridView } from "@/components/servers/ServerGridView";
import { useServers } from "@/hooks/useServers";
import { useConfigImport } from "@/hooks/useConfigImport";
import { useServerViewPreferences } from "@/hooks/useServerViewPreferences";
import { filterServersByName } from "@/lib/server-list";
import { FileJson, Plus, RefreshCw, ScanSearch, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddServerForm } from "./servers/AddServerForm";
import { ConfigImportPanel } from "./servers/ConfigImportPanel";

export function Servers() {
  const {
    servers,
    loading,
    startServer,
    stopServer,
    removeServer,
    reorderServers,
    addServer,
    refresh,
    serverActions,
  } = useServers();
  const [showAdd, setShowAdd] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const importState = useConfigImport();
  const { viewMode, setViewMode } = useServerViewPreferences();

  const filteredServers = useMemo(
    () => filterServersByName(servers, searchQuery),
    [servers, searchQuery],
  );

  const showToolbar = !loading && servers.length > 0;
  const hasSearch = searchQuery.trim().length > 0;
  const showSearchEmpty = showToolbar && filteredServers.length === 0 && hasSearch;

  const handleAdd = useCallback(
    async (config: Parameters<typeof addServer>[0]) => {
      await addServer(config);
      refresh();
    },
    [addServer, refresh],
  );

  const handleScan = useCallback(() => {
    setShowAdd(false);
    setShowJsonImport(false);
    void importState.scan();
  }, [importState]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="Servers"
        subtitle="Manage and configure your MCP servers"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowAdd(false);
                setShowJsonImport(true);
              }}
            >
              <FileJson className="h-4 w-4 mr-2" /> Import JSON
            </Button>
            <Button variant="outline" onClick={handleScan}>
              <ScanSearch className="h-4 w-4 mr-2" /> Scan Configs
            </Button>
            <Button
              onClick={() => {
                setShowJsonImport(false);
                setShowAdd(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Server
            </Button>
          </div>
        }
      />

      {/* Import Panels */}
      <ConfigImportPanel
        state={importState}
        showJsonImport={showJsonImport}
        onCloseJsonImport={() => setShowJsonImport(false)}
      />

      {/* Add Server Form */}
      {showAdd && <AddServerForm onAdd={handleAdd} onClose={() => setShowAdd(false)} />}

      {orderError && <ErrorBanner message={orderError} className="animate-fade-in" />}

      {/* Server List */}
      <div className="space-y-2">
        {loading ? (
          <PageLoading message="Loading servers..." />
        ) : servers.length === 0 ? (
          <button
            onClick={() => setShowAdd(true)}
            className={cn(
              "w-full py-10 rounded-xl border-2 border-dashed border-[var(--fg-12)]",
              "text-[var(--fg-40)] hover:text-cursor-orange hover:border-cursor-orange/30 hover:bg-cursor-orange/[0.02]",
              "transition-all duration-200 flex flex-col items-center justify-center gap-3 cursor-pointer",
            )}
          >
            <div className="h-12 w-12 rounded-full bg-surface-300 flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <div className="text-center">
              <p className="font-headline text-sm font-medium">Add Your First Server</p>
              <p className="font-body text-xs text-[var(--fg-40)] mt-1">
                Or scan existing configs to import
              </p>
            </div>
          </button>
        ) : (
          <>
            <ServersToolbar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
            {showSearchEmpty ? (
              <div className="py-10 text-center">
                <Search className="mx-auto mb-3 h-8 w-8 text-[var(--fg-15)]" />
                <p className="font-body text-sm text-[var(--fg-35)]">
                  No servers match “{searchQuery.trim()}”
                </p>
                <Button variant="outline" className="mt-4" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              </div>
            ) : viewMode === "list" ? (
              <ServerListView
                servers={filteredServers}
                allServers={servers}
                serverActions={serverActions}
                onStart={startServer}
                onStop={stopServer}
                onRemove={removeServer}
                onReorder={async (next) => {
                  setOrderError(null);
                  await reorderServers(next);
                }}
                onReorderError={(message) => setOrderError(message)}
              />
            ) : (
              <ServerGridView
                servers={filteredServers}
                serverActions={serverActions}
                onStart={startServer}
                onStop={stopServer}
                onRemove={removeServer}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
