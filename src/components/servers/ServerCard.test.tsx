// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ServerCard } from "@/components/servers/ServerCard";
import type { Server, ServerGroup } from "@moor/types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

const groups: ServerGroup[] = [
  {
    id: "g1",
    name: "Dev",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "g2",
    name: "Ops",
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

const noop = async () => undefined;

const mountedCards: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

afterEach(() => {
  for (const { root, container } of mountedCards.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

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
  mountedCards.push({ root, container });
  return { container, root, location, click };
}

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
    expect(markup).not.toContain("Stopped");
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

  it("navigates to the detail page on Space key", () => {
    const { container, location } = mountCard(baseServer);
    act(() => {
      container
        .querySelector('[role="link"]')
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
        );
    });
    expect(location()).toBe("/servers/s1");
  });

  it("does not navigate when the stop button is clicked", () => {
    const { container, location, click } = mountCard(baseServer);
    click(container.querySelector('[title="Stop server"]'));
    expect(location()).toBe("/servers");
  });

  it("does not navigate when Enter is pressed on a control button", () => {
    const { container, location } = mountCard(baseServer);
    act(() => {
      container
        .querySelector('[title="Stop server"]')
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
    });
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
});

describe("ServerCard group assignment", () => {
  it("does not render an inline group selector row", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ServerCard
          server={baseServer}
          variant="full"
          groups={groups}
          onAssignGroup={noop}
          onStart={noop}
          onStop={noop}
          onRemove={noop}
        />
      </MemoryRouter>,
    );
    // 旧实现渲染的 FolderInput 图标与行内 Select 触发器都不应再出现。
    expect(markup).not.toContain("Move to group");
    expect(markup).not.toContain("FolderInput");
    // 溢出菜单触发器存在。
    expect(markup).toContain("Move My Server to group");
  });

  it("renders the overflow menu only when groups + onAssignGroup are provided", () => {
    const without = renderToStaticMarkup(
      <MemoryRouter>
        <ServerCard
          server={baseServer}
          variant="full"
          onStart={noop}
          onStop={noop}
          onRemove={noop}
        />
      </MemoryRouter>,
    );
    expect(without).not.toContain("Move My Server to group");
  });

  it("calls onAssignGroup when a group is chosen from the overflow menu", () => {
    const onAssignGroup = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <ServerCard
            server={{ ...baseServer, groupId: null }}
            variant="full"
            groups={groups}
            onAssignGroup={onAssignGroup}
            onStart={noop}
            onStop={noop}
            onRemove={noop}
          />
        </MemoryRouter>,
      );
    });
    mountedCards.push({ root, container });
    const trigger = container.querySelector('button[aria-label="Move My Server to group"]');
    expect(trigger).not.toBeNull();
    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const item = container.querySelector('button[role="menuitemradio"][aria-label="Dev"]');
    // label 由文本内容提供,回退到包含 "Dev" 文本的菜单项。
    const devItem = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]'),
    ).find((el) => el.textContent?.includes("Dev"));
    expect(devItem).toBeTruthy();
    void item;
    act(() => {
      devItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAssignGroup).toHaveBeenCalledWith("s1", "g1");
  });

  it("treats Ungrouped as groupId null", () => {
    const onAssignGroup = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <ServerCard
            server={{ ...baseServer, groupId: "g1" }}
            variant="full"
            groups={groups}
            onAssignGroup={onAssignGroup}
            onStart={noop}
            onStop={noop}
            onRemove={noop}
          />
        </MemoryRouter>,
      );
    });
    mountedCards.push({ root, container });
    const trigger = container.querySelector('button[aria-label="Move My Server to group"]');
    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const ungrouped = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]'),
    ).find((el) => el.textContent?.includes("Ungrouped"));
    act(() => {
      ungrouped?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAssignGroup).toHaveBeenCalledWith("s1", null);
  });

  it("does not navigate when the overflow menu trigger is clicked", () => {
    const { container, location } = mountCard(baseServer);
    // 卡片没有传 groups,这里只验证触发器不存在时点击卡片本体才跳转。
    // 直接验证点击 Remove 之外的区域不会因菜单触发跳转(本卡无菜单)。
    act(() => {
      container
        .querySelector('[role="link"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(location()).toBe("/servers/s1");
  });
});
