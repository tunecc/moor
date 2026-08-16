import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiPost, apiPut, apiDelete } from "@/lib/api/client";
import { routes } from "@/lib/api-routes";
import { serverGroupKeys, serverKeys } from "@/lib/query-keys";
import type { ServerGroup } from "@moor/types";

/** 未分组分区的固定虚拟 id;不会写入数据库。 */
export const UNGROUPED_ID = "__ungrouped__";

export function useServerGroups() {
  const queryClient = useQueryClient();

  const {
    data: groups = [],
    isLoading: loading,
    error,
  } = useQuery<ServerGroup[]>({
    queryKey: serverGroupKeys.list(),
    queryFn: ({ signal }) => api<ServerGroup[]>(routes.serverGroups.list(), { signal }),
  });

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: serverGroupKeys.list() });
    await queryClient.invalidateQueries({ queryKey: serverKeys.list() });
  }, [queryClient]);

  const [createError, setCreateError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const createGroup = useMutation({
    mutationFn: async (name: string) => {
      return apiPost<ServerGroup>(routes.serverGroups.create(), { name });
    },
    onSuccess: (group) => {
      queryClient.setQueryData<ServerGroup[]>(serverGroupKeys.list(), (prev) => [
        ...(prev ?? []),
        group,
      ]);
    },
    onError: (err) => setCreateError(err instanceof Error ? err.message : "Failed to create group"),
  });

  const renameGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiPut<ServerGroup>(routes.serverGroups.update(id), { name });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<ServerGroup[]>(serverGroupKeys.list(), (prev) =>
        (prev ?? []).map((g) => (g.id === updated.id ? updated : g)),
      );
    },
    onError: (err) => setRenameError(err instanceof Error ? err.message : "Failed to rename group"),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      await apiDelete(routes.serverGroups.delete(id));
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<ServerGroup[]>(serverGroupKeys.list(), (prev) =>
        (prev ?? []).filter((g) => g.id !== id),
      );
      void invalidateAll();
    },
  });

  const reorderGroups = useMutation({
    mutationFn: async (nextGroups: ServerGroup[]) => {
      const ordered = await apiPut<ServerGroup[]>(routes.serverGroups.order(), {
        groupIds: nextGroups.map((g) => g.id),
      });
      return ordered;
    },
    onMutate: async (nextGroups) => {
      await queryClient.cancelQueries({ queryKey: serverGroupKeys.list() });
      const previous = queryClient.getQueryData<ServerGroup[]>(serverGroupKeys.list());
      queryClient.setQueryData<ServerGroup[]>(serverGroupKeys.list(), nextGroups);
      return { previous };
    },
    onSuccess: (ordered) => {
      queryClient.setQueryData<ServerGroup[]>(serverGroupKeys.list(), ordered);
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<ServerGroup[]>(serverGroupKeys.list(), context.previous);
      }
    },
  });

  const resetCreateError = useCallback(() => setCreateError(null), []);
  const resetRenameError = useCallback(() => setRenameError(null), []);

  return {
    groups,
    loading,
    error: error?.message ?? null,
    createError,
    renameError,
    createGroup: createGroup.mutateAsync,
    renameGroup: renameGroup.mutateAsync,
    deleteGroup: deleteGroup.mutateAsync,
    reorderGroups: reorderGroups.mutateAsync,
    invalidateAll,
    resetCreateError,
    resetRenameError,
  };
}
