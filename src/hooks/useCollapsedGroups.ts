import { useCallback, useState } from "react";

const STORAGE_KEY = "moor.servers.collapsedGroups";

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeCollapsed(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // best-effort
  }
}

export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed());

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeCollapsed(next);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((id: string) => collapsed.has(id), [collapsed]);

  return { collapsed, isCollapsed, toggle };
}
