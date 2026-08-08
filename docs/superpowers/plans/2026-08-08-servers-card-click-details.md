# Servers 卡片整卡点击进详情 + 精简操作按钮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `ServerCard` 整卡可点击进入详情页 `/servers/:id`（含键盘可达性），操作区只保留「启动/停止 + 删除」两个图标（移除详情按钮），并保证交互按钮与拖拽手柄点击不触发卡片跳转、删除确认期间禁止跳转。

**Architecture:** 两处改动全部收口在 `src/components/servers/ServerCard.tsx` 单文件内，下游 `ServerGridView`/`ServerListView`/`Servers.tsx` 不动。Task 1 实现整卡跳转（`useNavigate` + 卡片 `onClick`/`onKeyDown` + `role="link"`/`tabIndex`/`cursor-pointer`）并移除 `PanelRightOpen` 详情按钮；Task 2 为操作区容器、删除确认行、拖拽手柄加 `stopPropagation`，并用 `removeFeedback !== null` 阻断删除确认期间的卡片跳转。测试在 `ServerCard.test.tsx` 内扩展：静态断言 + happy-dom 交互测试。

**Tech Stack:** React 19 + TypeScript，Tailwind v4（`cursor-orange`、`--fg-*`、`cursor-pointer`、`focus-visible:ring-*`），lucide-react 图标，react-router-dom v7（`useNavigate`/`MemoryRouter`/`Routes`/`Route`/`useLocation`），`vite-plus/test` 测试，`happy-dom`（新增 devDependency）做 DOM 交互测试。

## Global Constraints

- 测试框架：`import { describe, expect, it } from "vite-plus/test"`。静态断言用 `renderToStaticMarkup`（`react-dom/server`）；交互测试用 `react-dom/client` 的 `createRoot` + React 19 的 `act`，**测试文件顶部必须加 `// @vitest-environment happy-dom` docblock**。
- 运行命令：`node_modules/.bin/vp test run <file>`；`node_modules/.bin/vp check` 跑类型检查 + lint。
- `ServerCard` 内部用 `useNavigate`（react-router），测试渲染必须用 `MemoryRouter` 包裹，否则报错。
- **⚠️ Level 2 依赖变更**：需新增 devDependency `happy-dom`（当前 lockfile 中它仅是 vitest 的可选 peer，未实际安装）。原因：现有测试无 DOM 环境，无法验证点击/键盘交互，而 spec 已承诺「整卡跳转、操作按钮不触发跳转」交互测试。影响：`package.json` + `pnpm-lock.yaml`。回滚：`pnpm remove -D happy-dom`。若 `// @vitest-environment happy-dom` docblock 未被 vite-plus 识别（测试仍报缺 DOM），回退方案：在 `vite.config.ts` 的 `test` 块加 `environment: "happy-dom"`——对现有 `renderToStaticMarkup` 静态测试无影响。
- React 19 的 `act` 需要 `IS_REACT_ACT_ENVIRONMENT` 全局，交互测试文件顶部用 `(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;` 设置。
- 提交信息用 `feat(servers):` / `test(servers):` 前缀，与近期提交风格一致。
- 不改动：`ServerGridView` / `ServerListView` / `Servers.tsx`、Play/Stop 加载态（starting/stopping）、删除确认行流程本身、状态→颜色映射、搜索/排序/视图偏好持久化；不引入删除确认弹窗，不做返回滚动恢复。

---

## File Structure

| 文件                                         | 责任                                                         | 改动类型                                                 |
| -------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `src/components/servers/ServerCard.tsx`      | 单张服务器卡片：整卡跳转、操作区（启动/停止 + 删除）、防误触 | 修改：加跳转与键盘处理、移除详情按钮、加 stopPropagation |
| `src/components/servers/ServerCard.test.tsx` | `ServerCard` 静态断言 + happy-dom 交互测试                   | 修改：顶部加 docblock、补 import、加测试                 |
| `package.json` / `pnpm-lock.yaml`            | 新增 devDependency `happy-dom`                               | 修改                                                     |

---

### Task 1: 整卡可点击进入详情 + 移除详情按钮

**Files:**

- Modify: `src/components/servers/ServerCard.tsx`（imports、`ServerControls`、`ServerCard` 根组件）
- Modify: `src/components/servers/ServerCard.test.tsx`（顶部 docblock + import + helper + 新 describe）
- Modify: `package.json` / `pnpm-lock.yaml`（新增 `happy-dom`）

**Interfaces:**

- Consumes: `ServerCard` 现有 props（`server: Server`、`variant?: "full" | "compact"`、`dragHandle?: ReactNode`、`isSorting?: boolean`、`onStart`/`onStop`/`onRemove`）；`Server` 类型（`@moor/types`）。
- Produces: `ServerCard` 对外 props 不变，下游组件零改动。行为变更——整卡可点击/回车跳转 `/servers/${server.id}`；不再渲染详情按钮（`PanelRightOpen`）。

- [ ] **Step 1: 新增 devDependency `happy-dom`（Level 2 依赖变更）**

```bash
pnpm add -D happy-dom
```

Expected: `package.json` 的 `devDependencies` 出现 `happy-dom`，`pnpm-lock.yaml` 更新。若此步需等待确认，说明：这是 spec 已承诺的交互测试所需的最小 DOM 环境；回滚用 `pnpm remove -D happy-dom`。

- [ ] **Step 2: 写失败测试**

更新 `src/components/servers/ServerCard.test.tsx`：

**2a. 文件顶部加 docblock + 补 import + 设置 act 环境**（docblock 必须是文件第一个注释）：

```tsx
// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ServerCard } from "@/components/servers/ServerCard";
import type { Server } from "@moor/types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
```

（把原文件里 `import { MemoryRouter } from "react-router-dom";` 替换为上面这行带 `Route, Routes, useLocation` 的；`IS_REACT_ACT_ENVIRONMENT` 赋值放在所有 import 之后，避免触发 `import/first` lint。）

**2b. 在 `noop` 定义后加 DOM 挂载 helper**：

```tsx
function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function mountCard(server: Server, withDragHandle = false) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/servers"]}>
        <Routes>
          <Route path="/servers" element={<LocationProbe />} />
          <Route path="/servers/:id" element={<LocationProbe />} />
        </Routes>
        <ServerCard
          server={server}
          onStart={noop}
          onStop={noop}
          onRemove={noop}
          dragHandle={
            withDragHandle ? (
              <button type="button" title={`Reorder ${server.name}`}>
                drag
              </button>
            ) : undefined
          }
        />
      </MemoryRouter>,
    );
  });
  const location = () => container.querySelector('[data-testid="location"]')?.textContent ?? "";
  const click = (el: Element | null) => {
    act(() => {
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  };
  return { container, root, location, click };
}
```

**2c. 在文件末尾追加一个 describe 块**：

```tsx
describe("ServerCard click-to-details", () => {
  it("removes the details icon button", () => {
    const markup = renderCard(baseServer, "full");
    expect(markup).not.toContain("Server details");
    expect(markup).not.toContain("Open details");
  });

  it("renders the card as a keyboard-accessible link target", () => {
    const markup = renderCard(baseServer, "full");
    expect(markup).toContain('role="link"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("cursor-pointer");
  });

  it("keeps the start/stop and remove buttons", () => {
    const markup = renderCard(baseServer, "full");
    // running server → Stop button
    expect(markup).toContain("Stop server");
    expect(markup).toContain("Remove My Server");
  });

  it("navigates to the server detail page when the card is clicked", () => {
    const { container, location, click } = mountCard(baseServer);
    expect(location()).toBe("/servers");
    click(container.querySelector('[role="link"]'));
    expect(location()).toBe("/servers/s1");
  });

  it("navigates to the detail page on Enter key", () => {
    const { container, location } = mountCard(baseServer);
    act(() => {
      container
        .querySelector('[role="link"]')
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(location()).toBe("/servers/s1");
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node_modules/.bin/vp test run src/components/servers/ServerCard.test.tsx`
Expected: 新加的 5 条 FAIL——`removes the details icon button`（当前仍渲染 "Server details"）、`renders ... link target`（无 `role="link"`）、两条交互测试（点击/回车不跳转）、`keeps ... buttons` 通过；原有 4 条 status badge 测试应仍 PASS。

- [ ] **Step 4: 实现整卡跳转并移除详情按钮**

修改 `src/components/servers/ServerCard.tsx`：

**4a. import**：`import { useState, type ReactNode } from "react";` 改为 `import { useState, type KeyboardEvent, type ReactNode } from "react";`；lucide 导入列表去掉 `PanelRightOpen,`。

**4b. `ServerControls`**：删除组件内的 `const navigate = useNavigate();` 与整个详情按钮 `<Button ... onClick={() => navigate(...)} title="Server details">...<PanelRightOpen/></Button>`（原第 205-215 行）。组件只保留 `LifecycleButton` 与删除按钮。

**4c. `ServerCard` 根组件**：加 `const navigate = useNavigate();`；在 `removeFeedback` 计算后加：

```tsx
const navigationBlocked = removeFeedback !== null;

const handleCardClick = () => {
  if (navigationBlocked) return;
  navigate(`/servers/${server.id}`);
};

const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  if (navigationBlocked) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    navigate(`/servers/${server.id}`);
  }
};
```

`<Card>` 根元素加 props，并在 className 中加 `cursor-pointer` 与键盘焦点环：

```tsx
<Card
  role="link"
  tabIndex={0}
  aria-label={`Open ${server.name}`}
  onClick={handleCardClick}
  onKeyDown={handleCardKeyDown}
  className={cn(
    "group cursor-pointer transition-all duration-200 hover:shadow-[rgba(0,0,0,0.04)_0px_12px_40px,rgba(0,0,0,0.02)_0px_0px_16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cursor-orange/60",
    ...
  )}
>
```

（className 其余条件分支原样保留。）

- [ ] **Step 5: 运行测试确认通过**

Run: `node_modules/.bin/vp test run src/components/servers/ServerCard.test.tsx`
Expected: PASS（4 条 status badge + 5 条 click-to-details 全过）。若报「document is not defined」之类的 DOM 缺失，说明 docblock 未被识别——按 Global Constraints 的回退方案在 `vite.config.ts` `test` 块加 `environment: "happy-dom"`。

- [ ] **Step 6: 提交**

```bash
git add src/components/servers/ServerCard.tsx src/components/servers/ServerCard.test.tsx package.json pnpm-lock.yaml
git commit -m "feat(servers): make server card fully clickable to details"
```

---

### Task 2: 操作区 / 拖拽手柄 / 删除确认防误触跳转

**Files:**

- Modify: `src/components/servers/ServerCard.tsx`（`ServerControls` 容器、`RemoveFeedbackRow` 根节点、`ServerCard` 中 dragHandle 渲染处）
- Modify: `src/components/servers/ServerCard.test.tsx`（追加交互测试）

**Interfaces:**

- Consumes: Task 1 产出的 `handleCardClick`（卡片级 `navigationBlocked` 守卫）与 `mountCard` helper；`dragHandle` prop（`ServerListView` 传入 dnd-kit 手柄）。
- Produces: 点击启动/停止、删除、删除确认行按钮、拖拽手柄均不触发卡片跳转；`confirmingRemove`/`isRemoving`/`removeError` 任一非空时整卡点击不跳转。`ServerListView`/`ServerGridView` 无需改动。

- [ ] **Step 1: 写失败测试**

在 `src/components/servers/ServerCard.test.tsx` 的 `describe("ServerCard click-to-details", ...)` 块内、现有 5 条之后追加：

```tsx
it("does not navigate when the stop button is clicked", () => {
  const { container, location, click } = mountCard(baseServer);
  click(container.querySelector('[title="Stop server"]'));
  expect(location()).toBe("/servers");
});

it("does not navigate during remove confirmation", () => {
  const { container, location, click } = mountCard(baseServer);
  click(container.querySelector('[title="Remove server"]'));
  // 确认行已出现；此时点击卡片不应跳转
  click(container.querySelector('[role="link"]'));
  expect(location()).toBe("/servers");
});

it("does not navigate when the drag handle is clicked", () => {
  const { container, location, click } = mountCard(baseServer, true);
  click(container.querySelector('[title="Reorder My Server"]'));
  expect(location()).toBe("/servers");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node_modules/.bin/vp test run src/components/servers/ServerCard.test.tsx`
Expected: 新增 3 条 FAIL——`does not navigate when the stop button is clicked`（Stop 点击冒泡触发跳转）、`does not navigate during remove confirmation`（确认行可见时点卡片仍跳转）、`does not navigate when the drag handle is clicked`（手柄点击冒泡触发跳转）。其余通过。

- [ ] **Step 3: 实现 stopPropagation + 确认期阻断**

修改 `src/components/servers/ServerCard.tsx`：

**3a. `ServerControls` 容器**：给最外层 `<div className="flex items-center gap-1 shrink-0 bg-surface-300/50 rounded-lg p-1">` 加 `onClick={(e) => e.stopPropagation()}`，使 `LifecycleButton` 与删除按钮的点击都不冒泡到卡片：

```tsx
<div
  className="flex items-center gap-1 shrink-0 bg-surface-300/50 rounded-lg p-1"
  onClick={(e) => e.stopPropagation()}
>
```

**3b. `RemoveFeedbackRow` 根节点**：给 `<div className={cn("mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 animate-fade-in", ...)}>` 加 `onClick={(e) => e.stopPropagation()}`，防止 Cancel / Remove / Dismiss 点击冒泡（`navigationBlocked` 已覆盖确认期阻断，这里是双保险，避免依赖 state 更新时序）。

**3c. dragHandle 渲染处**：把

```tsx
{
  !isCompact && dragHandle;
}
```

改为

```tsx
{
  !isCompact && (
    <span onClick={(e) => e.stopPropagation()} className="shrink-0">
      {dragHandle}
    </span>
  );
}
```

这同时覆盖两种场景：单击手柄（未拖动）不跳转；dnd-kit 拖拽结束后浏览器在按下手柄处派发的 click 也会先经过该 `<span>` 被拦截，不会误触卡片跳转。

（`handleCardClick` 的 `navigationBlocked = removeFeedback !== null` 守卫在 Task 1 已实现，覆盖「删除确认期间禁止跳转」。）

- [ ] **Step 4: 运行测试确认通过**

Run: `node_modules/.bin/vp test run src/components/servers/ServerCard.test.tsx`
Expected: PASS（原 9 条 + 新增 3 条共 12 条全过）。

- [ ] **Step 5: 跑类型检查与 lint**

Run: `node_modules/.bin/vp check`
Expected: 通过（无类型错误、无 lint 错误）。

- [ ] **Step 6: 手动冒烟（可选）**

`pnpm dev` 启动后验证：列表/网格视图点卡片任意位置进详情、点启动/停止/删除不跳转、删除确认行出现时点卡片不跳转、列表视图拖动手柄排序后不误跳转。此步骤为人工验收，自动化测试已覆盖核心行为。

- [ ] **Step 7: 提交**

```bash
git add src/components/servers/ServerCard.tsx src/components/servers/ServerCard.test.tsx
git commit -m "feat(servers): stop card navigation on action controls and drag handle"
```
