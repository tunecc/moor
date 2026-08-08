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
