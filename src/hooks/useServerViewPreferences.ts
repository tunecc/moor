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
