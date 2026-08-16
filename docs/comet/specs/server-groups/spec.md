# Server Groups

## Scenario: data migration

Given an existing Moor database, when migrations run, then a `server_groups` table is created with columns `id TEXT PRIMARY KEY`, `name TEXT NOT NULL`, `sort_order INTEGER NOT NULL DEFAULT 0`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`. A nullable `group_id TEXT` column is added to `mcp_servers`; existing servers keep `group_id` NULL (ungrouped). The migration is idempotent via `CREATE TABLE IF NOT EXISTS`, `ensure_column`, and `CREATE INDEX IF NOT EXISTS`, and may be run repeatedly without error. The existing `sort_order` backfill behavior does not regress.

## Scenario: Ungrouped partition

`group_id IS NULL` servers are displayed in a virtual "Ungrouped" partition that always appears after every named group, cannot be renamed, and cannot be deleted. The Ungrouped id is a sentinel never stored in the database.

## Scenario: single membership

A server belongs to at most one group at a time. Moving a server to a new group removes it from the previous group by writing `mcp_servers.group_id` directly.

## Scenario: ordering

Servers are partitioned by group; named groups are ordered by `server_groups.sort_order` ascending, with Ungrouped last. Within each partition, servers keep their existing `mcp_servers.sort_order` and reorder behavior unchanged.

## Scenario: exposure unchanged

Grouping is purely visual. Creating, renaming, deleting a group, or moving a server between groups does not change any `profile_servers` row, does not change the Active Profile enabled server set, does not change `tools/list` results, and does not record grouping information in audit logs.

## Scenario: group create

Creating a group with a non-empty name persists a `server_groups` row, assigns `sort_order` via `COALESCE(MIN(sort_order), 0) - 1` so new groups appear first, returns 201, and the new group is initially empty.

## Scenario: group rename

Renaming a group updates only `name` and `updated_at`; the group id and `sort_order` are unchanged, so its servers remain assigned and the displayed name updates.

## Scenario: group delete

Deleting a non-empty group runs in a transaction that sets `group_id = NULL` on all servers in that group, then deletes the group row. The servers themselves are not deleted and fall back to Ungrouped. Deleting the last named group leaves only Ungrouped. Deleting a missing group returns not found.

## Scenario: group reorder

Reordering groups requires the input to equal the set of all existing named group ids exactly once; otherwise it is rejected. It writes `sort_order` in the given sequence. Within a group, servers still sort by their own `sort_order`.

## Scenario: server assignment via update

`/api/servers/{id}` `PUT` accepts an optional `groupId: string | null`. `null` moves the server to Ungrouped; a non-null value must reference an existing group, otherwise the update is rejected. There is no separate move endpoint.

## Scenario: HTTP surface

The API exposes `GET /api/server-groups`, `POST /api/server-groups` returning 201, `GET/PUT/DELETE /api/server-groups/{id}`, and `PUT /api/server-groups/order` with `{ groupIds }`.

## Scenario: frontend types

`@moor/types` adds `ServerGroup`, adds `groupId?: string | null` on `Server`, adds `groupId?: string | null` on `ServerUpdateInput`, and adds `serverGroupKeys`.

## Scenario: frontend queries

`useServerGroups` provides list query plus create/rename/delete/reorder mutations; mutations invalidate both `serverGroupKeys.list()` and `serverKeys.list()`. Server group assignment goes through the existing `updateServer` mutation on `/api/servers/{id}`. AddServerForm does not add a group selector; newly added servers are ungrouped by default.

## Scenario: Servers page UI

The Servers page partitions filtered servers by group: named groups by `sortOrder` and Ungrouped last. Each partition has a header with name, server count, rename and delete controls (Ungrouped hides rename/delete), and collapse state persisted in `localStorage` key `moor.servers.collapsedGroups`, shared across grid and list views. Group order is adjusted via header up/down buttons. Search filters across groups by name; empty groups show an empty state; both grid and list views render the same partitions and empty states.

## Scenario: non-regression

Profile, ProfileServer, ToolDiscovery, Audit, Config Import, and server start/stop/drag-reorder behaviors are unchanged after grouping is introduced. Config Import keeps its existing logic; imported servers default to Ungrouped.
