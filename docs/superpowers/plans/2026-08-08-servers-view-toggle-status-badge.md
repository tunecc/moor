# Servers 视图切换与状态徽章优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Servers 页面的列表/网格视图切换从两个独立图标按钮改为连体分段控件（一眼可辨当前视图），并在网格视图去掉冗余的 Running/Stopped 状态徽章（状态交给卡片底色与头像表达）。

**Architecture:** 两处独立改动，各自带测试。Task 1 改 `ServerCard.tsx` 的 `ServerIdentity`，给 `StatusBadge` 加 `!compact` 渲染条件（网格视图隐藏、列表视图保留）。Task 2 重写 `ServersToolbar.tsx` 的视图切换部分为连体分段控件，搜索框与清空按钮逻辑不变。两个 Task 互不依赖，可任意顺序执行。

**Tech Stack:** React 19 + TypeScript，Tailwind v4（`cursor-orange`、`--fg-*`、`bg-success-muted` 等设计 token），lucide-react 图标，`vite-plus/test` + `react-dom/server` 的 `renderToStaticMarkup` 做组件测试，`vp test run <file>` 跑测试。

## Global Constraints

- 测试框架：`import { describe, expect, it } from "vite-plus/test"`，组件用 `renderToStaticMarkup` 渲染后断言 markup 字符串。运行命令 `node_modules/.bin/vp test run <file>`（或 `pnpm exec vp test run <file>`）。
- `ServerCard` 内部用了 `useNavigate`（react-router），测试渲染时必须用 `MemoryRouter` 包裹，否则报错。
- 设计 token 来源：`cursor-orange`（品牌亮橙，见 `badge.tsx` 的 `accent` 变体、`button.tsx` 的 `default` hover 态）；`--fg-40`（弱化前景色）；`text-surface-200`（近黑深色，用于亮橙底上的图标）。
- 不改动 `StatusBadge` 组件本身、`ServerGridView`/`ServerListView`/`Servers.tsx` 逻辑、状态→颜色映射规则、搜索与视图偏好持久化。
- 提交信息用 `feat(servers):` / `test(servers):` 前缀，与近期提交风格一致（见 `git log`）。

---

## File Structure

| 文件                                             | 责任                                                   | 改动类型                                                   |
| ------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------- |
| `src/components/servers/ServerCard.tsx`          | 单个服务器卡片，含 `ServerIdentity`（名称 + 状态徽章） | 修改：`ServerIdentity` 的 `StatusBadge` 加 `!compact` 条件 |
| `src/components/servers/ServerCard.test.tsx`     | `ServerCard` 的渲染测试                                | 新建                                                       |
| `src/components/servers/ServersToolbar.tsx`      | 搜索框 + 视图切换控件                                  | 修改：视图切换重写为连体分段控件                           |
| `src/components/servers/ServersToolbar.test.tsx` | 工具栏的渲染与交互测试                                 | 新建                                                       |

---

### Task 1: 网格视图隐藏状态徽章

**Files:**

- Modify: `src/components/servers/ServerCard.tsx:88-124`（`ServerIdentity` 组件）
- Test: `src/components/servers/ServerCard.test.tsx`（新建）

**Interfaces:**

- Consumes: `Server`（`@moor/types`，字段见 `packages/types/src/server.ts`：`id`/`name`/`connectionType`/`status`/`autoStart`/`command`/`args`/`createdAt`/`updatedAt` 等）；`ServerCard` props（`variant?: "full" | "compact"`，默认 `"full"`）。
- Produces: `ServerCard` 行为变更——`variant="compact"` 时 `ServerIdentity` 不渲染 `StatusBadge`；`variant="full"`（含默认）时照常渲染。`ServerCard` 的对外 props 与导出不变，下游 `ServerGridView`（传 `variant="compact"`）与 `ServerListView`（默认 `full`）无需改动。

- [ ] **Step 1: 写失败测试**

新建 `src/components/servers/ServerCard.test.tsx`：

```tsx
import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ServerCard } from "@/components/servers/ServerCard";
import type { Server } from "@moor/types";

const baseServer: Server = {
  id: "s1",
  name: "My Server",
  connectionType: "stdio",
  status: "running",
  autoStart: false,
  command: "node",
  args: ["server.js"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const noop = async () => undefined;

function renderCard(server: Server, variant?: "full" | "compact") {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ServerCard server={server} variant={variant} onStart={noop} onStop={noop} onRemove={noop} />
    </MemoryRouter>,
  );
}

describe("ServerCard status badge", () => {
  it("shows the Running status badge in the full (list) variant", () => {
    const markup = renderCard(baseServer, "full");
    expect(markup).toContain("Running");
  });

  it("hides the Running status badge in the compact (grid) variant", () => {
    const markup = renderCard(baseServer, "compact");
    expect(markup).not.toContain("Running");
  });

  it("hides the Stopped status badge in the compact (grid) variant", () => {
    const markup = renderCard({ ...baseServer, status: "stopped" }, "compact");
    expect(markup).not.toContain("Stopped");
  });

  it("still shows the Stopped status badge in the full (list) variant", () => {
    const markup = renderCard({ ...baseServer, status: "stopped" }, "full");
    expect(markup).toContain("Stopped");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node_modules/.bin/vp test run src/components/servers/ServerCard.test.tsx`
Expected: FAIL —— "hides the Running status badge in the compact (grid) variant" 与 "hides the Stopped status badge in the compact (grid) variant" 两条失败（当前 compact 仍渲染徽章），其余两条通过。

- [ ] **Step 3: 修改 `ServerIdentity` 加 `!compact` 条件**

在 `src/components/servers/ServerCard.tsx` 的 `ServerIdentity` 组件中，把第 110 行的：

```tsx
<StatusBadge status={displayStatus} />
```

改为：

```tsx
{
  !compact && <StatusBadge status={displayStatus} />;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node_modules/.bin/vp test run src/components/servers/ServerCard.test.tsx`
Expected: PASS（4 条全过）。

- [ ] **Step 5: 跑类型检查与 lint**

Run: `node_modules/.bin/vp check`
Expected: 通过（无类型错误、无 lint 错误）。

- [ ] **Step 6: 提交**

```bash
git add src/components/servers/ServerCard.tsx src/components/servers/ServerCard.test.tsx
git commit -m "feat(servers): hide status badge in grid view"
```

---

### Task 2: 视图切换改为连体分段控件

**Files:**

- Modify: `src/components/servers/ServersToolbar.tsx:1,47-72`（导入与视图切换部分）
- Test: `src/components/servers/ServersToolbar.test.tsx`（新建）

**Interfaces:**

- Consumes: `ServerViewMode`（`"list" | "grid"`，`@/hooks/useServerViewPreferences`）；`ServersToolbar` props（`searchQuery`/`onSearchQueryChange`/`viewMode`/`onViewModeChange`）。
- Produces: `ServersToolbar` 对外 props 与导出名不变；`Servers.tsx` 无需改动。视图切换 DOM 从两个独立 `<Button>` 变为一个连体分段控件容器（内含两个 `<button>`），保留 `aria-pressed`/`title`/`aria-label` 与键盘可达性。

**设计要点（实现时遵循）：**

- 容器：圆角胶囊 `rounded-lg`，高度 `h-9`（与搜索框 `Input` 的 `h-9` 等高），`border border-[var(--fg-10)]`，`p-0.5`，`inline-flex`。
- 两个按钮等宽（`flex-1`），之间无间隙，仅外层统一圆角。
- 活动项：`bg-cursor-orange text-surface-200`（实心亮橙 + 深色图标），`rounded-md`。
- 非活动项：`bg-transparent text-[var(--fg-40)] hover:bg-[var(--fg-06)]`，`rounded-md`。
- 图标 `h-4 w-4`，左 `List`、右 `LayoutGrid`。
- 每个按钮保留 `aria-pressed`、`title`（"List view" / "Grid view"）、`aria-label`、`onClick`。

- [ ] **Step 1: 写失败测试**

新建 `src/components/servers/ServersToolbar.test.tsx`：

```tsx
import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { ServersToolbar } from "@/components/servers/ServersToolbar";

const noop = () => undefined;

function renderToolbar(viewMode: "list" | "grid") {
  return renderToStaticMarkup(
    <ServersToolbar
      searchQuery=""
      onSearchQueryChange={noop}
      viewMode={viewMode}
      onViewModeChange={noop}
    />,
  );
}

describe("ServersToolbar view toggle", () => {
  it("renders both List and Grid view buttons", () => {
    const markup = renderToolbar("list");
    expect(markup).toContain("List view");
    expect(markup).toContain("Grid view");
  });

  it("marks the List button as pressed when viewMode is list", () => {
    const markup = renderToolbar("list");
    // aria-pressed renders as aria-pressed="true" in static markup
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="List view"');
  });

  it("marks the Grid button as pressed when viewMode is grid", () => {
    const markup = renderToolbar("grid");
    expect(markup).toContain('aria-label="Grid view"');
    // Exactly one button is pressed; the grid button is the pressed one.
    const pressedCount = (markup.match(/aria-pressed="true"/g) || []).length;
    expect(pressedCount).toBe(1);
  });

  it("uses the brand accent color for the active segment", () => {
    const markup = renderToolbar("list");
    expect(markup).toContain("bg-cursor-orange");
  });

  it("renders the two segments inside a single joined container", () => {
    const markup = renderToolbar("list");
    // The segmented control container carries the joined look (rounded + border).
    // Both view buttons share one parent container with no gap between them.
    expect(markup).toContain("rounded-lg");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node_modules/.bin/vp test run src/components/servers/ServersToolbar.test.tsx`
Expected: FAIL —— "uses the brand accent color for the active segment" 失败（当前活动项用 `default` 变体的浅灰底，无 `bg-cursor-orange`）；其余多数通过但分段控件结构尚未重写。

- [ ] **Step 3: 重写 `ServersToolbar` 视图切换为连体分段控件**

把 `src/components/servers/ServersToolbar.tsx` 第 47-72 行的视图切换部分（`<div className="flex items-center gap-1">` 及其内两个 `<Button>`）替换为连体分段控件。完整的新文件内容：

```tsx
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
```

注意：原文件用 `Button` 组件做切换按钮，新版本改用原生 `<button>` 以便精确控制连体分段控件的样式（`Button` 的 `icon` size 是 `h-11 w-11`，与 `h-9` 容器不匹配，且其变体样式会干扰分段控件的实心/透明对比）。`Button` 仍用于清空搜索按钮，导入保留。新增 `cn` 导入用于条件类名。

- [ ] **Step 4: 运行测试确认通过**

Run: `node_modules/.bin/vp test run src/components/servers/ServersToolbar.test.tsx`
Expected: PASS（5 条全过）。

- [ ] **Step 5: 跑类型检查与 lint**

Run: `node_modules/.bin/vp check`
Expected: 通过。若 lint 报「`Button` 已导入但未使用」之类，确认 `Button` 仍用于清空搜索按钮（应不会报）；若报其他问题按提示修正。

- [ ] **Step 6: 提交**

```bash
git add src/components/servers/ServersToolbar.tsx src/components/servers/ServersToolbar.test.tsx
git commit -m "feat(servers): joined segmented control for view toggle"
```

---

## Self-Review

**1. Spec coverage:**

- Spec §1「视图切换改为连体分段控件」→ Task 2（容器 `h-9` 圆角胶囊、两等宽格、活动项 `cursor-orange` 实心、非活动项透明 `--fg-40`、保留 `aria-pressed`/`title`/`aria-label`、位置搜索框右侧）。✓
- Spec §2「网格视图去掉状态徽章」→ Task 1（`!compact` 条件，网格隐藏、列表保留）。✓
- Spec「涉及文件」两张表 → Task 1 改 `ServerCard.tsx`、Task 2 改 `ServersToolbar.tsx`。✓
- Spec「不改动」→ 计划未触碰 `StatusBadge`/`ServerGridView`/`ServerListView`/`Servers.tsx`/状态映射/搜索/持久化。✓
- Spec「验收」5 条 → Task 1 测试覆盖徽章显隐（验收 3、4）；Task 2 测试覆盖分段控件结构、活动项跟随 `viewMode`、品牌色、`aria-pressed`/`title`（验收 1、2、5）。验收中「运行/错误/启动/停止态仍可通过底色与头像区分」属既有未改逻辑，由 Task 1 不动底色条件类保证。✓

**2. Placeholder scan:** 无 TBD/TODO；每个步骤含可执行命令与完整代码。✓

**3. Type consistency:** `ServerViewMode`（`"list" | "grid"`）在 Task 2 的 props、测试、实现中一致；`variant: "full" | "compact"` 在 Task 1 一致；`Server` 类型字段与 `packages/types/src/server.ts` 一致。✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-08-servers-view-toggle-status-badge.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
