---
generated_from_state_version: 7
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-08-20T06:32:40.380Z
- Summary: All acceptance items A1-A8 verified against code and tests with concrete evidence; all three checks (test, tsc, lint) pass. Non-goals confirmed: no backend/API changes, no new dependencies, ServerGroupsManager has no start-all/collapse-toggle behavior, useCollapsedGroups localStorage logic unchanged with toggle wiring still calling toggleCollapsed(partition.id).

## Acceptance

| ID  | Result | Source   | Criterion                                                                                                                                                                                                                                                     | Reason                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | passed | brief.md | **A1 具名分组显示一键启动按钮**:渲染 `ServerGroupSection`(非 Ungrouped)时,分区头右侧操作区包含一个 Play 图标按钮,`aria-label`/`title` 含 `Start all servers in <name>`。                                                                                      | ServerGroupSection.tsx:166-178 renders a Play/Loader2 icon Button gated on `!isUngrouped && onStartAll`, with title/aria-label = `Start all servers in ${name}`. Servers.tsx:484-488 passes non-undefined onStartAll for named partitions. Test `renders a start all button for a named group` (test:76-81) asserts button exists and title matches.                                 |
| A2  | passed | brief.md | **A2 Ungrouped 不显示一键启动按钮**:`isUngrouped` 为 true 时,分区头不渲染 Start all 按钮(也不渲染上移/下移/重命名/删除)。                                                                                                                                     | Start all gated by `!isUngrouped && onStartAll` (ServerGroupSection.tsx:166); move/rename/delete by `!isUngrouped` (line 179); Servers.tsx:484-488 passes onStartAll=undefined for Ungrouped. Test `does not render start all, move, rename, or delete for Ungrouped` (test:83-89) asserts all absent.                                                                               |
| A3  | passed | brief.md | **A3 一键启动只启动可启动服务器**:给定分组内 server 状态分别为 `stopped`、`error`、`running`、`starting`,点击 Start all 后只对 `stopped` 和 `error` 的 server 调用一次 `onStartAll`(该回调内部并发调用各自的 `startServer`),不重复触发 `running`/`starting`。 | Servers.tsx:194-200 handleStartAll calls getStartableServerIds then `Promise.all(startableIds.map(id => startServer(id)))` — concurrent, only stopped/error ids. server-groups.ts:49-53 filters to status==='stopped'\|\|'error'. Lib tests confirm running/starting excluded; component test `calls onStartAll once` (test:96-108) confirms onStartAll called exactly once.         |
| A4  | passed | brief.md | **A4 空组或无可用服务器的按钮禁用**:分组内 0 个 server,或所有 server 都为 `running`/`starting`,Start all 按钮为 disabled。                                                                                                                                    | Servers.tsx:489-496 computes startAllDisabled = `!partition.servers.some(s => s.status==='stopped'\|\|s.status==='error')` for named groups, so empty group or all running/starting → disabled. ServerGroupSection.tsx:171 `disabled={startAllBusy \|\| startAllDisabled}`. Test `disables start all when startAllDisabled is true` (test:91-94) asserts button.disabled===true.     |
| A5  | passed | brief.md | **A5 按钮点击不触发折叠**:点击 Start all 按钮只执行启动逻辑,不调用 `onToggleCollapse`。                                                                                                                                                                       | Right-side ops wrapper div has `onClick={event => event.stopPropagation()}` (ServerGroupSection.tsx:162-165), preventing bubbling to header onClick=onToggleCollapse (line 146). Test `calls onStartAll once and does not toggle collapse when clicked` (test:96-108) confirms onToggleCollapse not called.                                                                          |
| A6  | passed | brief.md | **A6 整行点击折叠/展开**:点击分区头名称/数量/空白区域调用 `onToggleCollapse` 一次;点击上移/下移/重命名/删除按钮不调用 `onToggleCollapse`。                                                                                                                    | Header div onClick=onToggleCollapse (line 146); name/count/blank are direct children so click bubbles and fires once. Functional buttons live inside the stopPropagation wrapper (lines 162-225). Tests `toggles collapse when the header row is clicked` and `does not toggle collapse when move controls are clicked` (test:112-136) confirm.                                      |
| A7  | passed | brief.md | **A7 键盘折叠/展开**:分区头聚焦后按 Enter 或 Space 调用 `onToggleCollapse`;焦点在内部功能按钮时按 Enter/Space 不触发分区折叠。                                                                                                                                | handleHeaderKeyDown (ServerGroupSection.tsx:132-138) early-returns when `event.target !== event.currentTarget`, so key events on inner buttons do not toggle; Enter/Space on the header row itself calls onToggleCollapse. Tests `toggles collapse with Enter and Space` and `does not toggle collapse when keyboard events originate from an inner control` (test:138-159) confirm. |
| A8  | passed | brief.md | **A8 折叠状态与图标不回归**:`collapsed` 为 true 显示 ChevronRight,false 显示 ChevronDown;折叠时内容区按既有逻辑隐藏;`localStorage` 折叠状态逻辑不变。                                                                                                         | ChevronRight/ChevronDown swap on `collapsed` (ServerGroupSection.tsx:154-156); collapsed hides children (lines 228-236). useCollapsedGroups.ts unchanged (git diff empty); Servers.tsx:461 still wires `onToggleCollapse={() => toggleCollapsed(partition.id)}`. Test `keeps collapse icon and aria-expanded in sync` (test:161-171) asserts aria-expanded false/true.               |

## Checks

| Check                 | Command          | Working directory | Status | Exit | Duration |
| --------------------- | ---------------- | ----------------- | ------ | ---: | -------: |
| pnpm exec vp test run | exec vp test run | .                 | passed |    0 |  1515 ms |
| pnpm exec tsc -b      | exec tsc -b      | .                 | passed |    0 |  2816 ms |
| pnpm exec vp lint src | exec vp lint src | .                 | passed |    0 |   944 ms |

## Blockers

_None._

## Risks and skipped work

- ServerGroupsManager.tsx has uncommitted refactoring of GroupBucket props (canMoveUp/canMoveDown/onMoveUp/onMoveDown/onRename/onDelete) that appears unrelated to this change's stated scope; it does NOT add Start all or role=button/onClick collapse to the manager panel (non-goal satisfied), but the working tree contains changes beyond the change's described scope.
- A3 concurrency is verified by composing the lib test (getStartableServerIds returns only stopped/error ids) with the Servers.tsx wiring (Promise.all + startServer per id); there is no direct integration test asserting startServer is called N times with expected ids, but the composition is unambiguous.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary                                                                                                                                                                                                                                                                                                                                                                      | Completed                |
| ---------: | --------: | ------: | ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
|          1 |         1 |       1 | pass    | —          | All acceptance items A1-A8 verified against code and tests with concrete evidence; all three checks (test, tsc, lint) pass. Non-goals confirmed: no backend/API changes, no new dependencies, ServerGroupsManager has no start-all/collapse-toggle behavior, useCollapsedGroups localStorage logic unchanged with toggle wiring still calling toggleCollapsed(partition.id). | 2026-08-20T06:32:40.380Z |

## Conclusion

All acceptance items A1-A8 verified against code and tests with concrete evidence; all three checks (test, tsc, lint) pass. Non-goals confirmed: no backend/API changes, no new dependencies, ServerGroupsManager has no start-all/collapse-toggle behavior, useCollapsedGroups localStorage logic unchanged with toggle wiring still calling toggleCollapsed(partition.id).
