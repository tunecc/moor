// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DndContext } from "@dnd-kit/core";
import { ServerGroupSection } from "@/components/servers/ServerGroupSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = vi.fn(async () => undefined);

interface MountOptions {
  isUngrouped?: boolean;
  count?: number;
  collapsed?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onStartAll?: (() => Promise<void>) | undefined;
  onStopAll?: (() => Promise<void>) | undefined;
  startAllDisabled?: boolean;
  stopAllDisabled?: boolean;
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function mount(options: MountOptions = {}) {
  const onToggleCollapse = vi.fn();
  const onMoveUp = vi.fn();
  const onMoveDown = vi.fn();
  const onStartAll =
    options.onStartAll === undefined ? vi.fn(async () => undefined) : options.onStartAll;
  const onStopAll =
    options.onStopAll === undefined ? vi.fn(async () => undefined) : options.onStopAll;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <DndContext>
        <ServerGroupSection
          id={options.isUngrouped ? "__ungrouped__" : "g1"}
          name={options.isUngrouped ? "Ungrouped" : "Dev"}
          isUngrouped={options.isUngrouped ?? false}
          count={options.count ?? 0}
          collapsed={options.collapsed ?? false}
          canMoveUp={options.canMoveUp ?? false}
          canMoveDown={options.canMoveDown ?? false}
          onToggleCollapse={onToggleCollapse}
          onRename={noop}
          onDelete={noop}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onStartAll={onStartAll}
          onStopAll={onStopAll}
          startAllDisabled={options.startAllDisabled ?? false}
          stopAllDisabled={options.stopAllDisabled ?? false}
        >
          <div data-testid="content">content</div>
        </ServerGroupSection>
      </DndContext>,
    );
  });

  mounted.push({ root, container });
  return { container, onToggleCollapse, onMoveUp, onMoveDown, onStartAll, onStopAll };
}

function getStartAllButton(container: HTMLElement, name = "Dev") {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="Start all servers in ${name}"]`,
  );
}

function getStopAllButton(container: HTMLElement, name = "Dev") {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="Stop all servers in ${name}"]`,
  );
}

describe("ServerGroupSection group actions", () => {
  it("renders a start all button for a named group", () => {
    const { container } = mount({ count: 2 });
    const button = getStartAllButton(container);
    expect(button).not.toBeNull();
    expect(button?.getAttribute("title")).toBe("Start all servers in Dev");
  });

  it("does not render start all, stop all, move, rename, or delete for Ungrouped", () => {
    const { container } = mount({ isUngrouped: true, count: 2 });
    expect(getStartAllButton(container, "Ungrouped")).toBeNull();
    expect(getStopAllButton(container, "Ungrouped")).toBeNull();
    expect(container.querySelector('button[aria-label^="Move"]')).toBeNull();
    expect(container.querySelector('button[aria-label^="Rename"]')).toBeNull();
    expect(container.querySelector('button[aria-label^="Delete"]')).toBeNull();
  });

  it("renders a stop all button for a named group", () => {
    const { container } = mount({ count: 2 });
    const button = getStopAllButton(container);
    expect(button).not.toBeNull();
    expect(button?.getAttribute("title")).toBe("Stop all servers in Dev");
  });

  it("disables start all when startAllDisabled is true", () => {
    const { container } = mount({ count: 2, startAllDisabled: true });
    expect(getStartAllButton(container)?.disabled).toBe(true);
  });

  it("disables stop all when stopAllDisabled is true", () => {
    const { container } = mount({ count: 2, stopAllDisabled: true });
    expect(getStopAllButton(container)?.disabled).toBe(true);
  });

  it("calls onStartAll once and does not toggle collapse when clicked", async () => {
    const onStartAll = vi.fn(async () => undefined);
    const { container, onToggleCollapse } = mount({ count: 2, onStartAll });
    const button = getStartAllButton(container);
    expect(button).not.toBeNull();

    await act(async () => {
      button?.click();
    });

    expect(onStartAll).toHaveBeenCalledTimes(1);
    expect(onToggleCollapse).not.toHaveBeenCalled();
  });

  it("calls onStopAll once and does not toggle collapse when clicked", async () => {
    const onStopAll = vi.fn(async () => undefined);
    const { container, onToggleCollapse } = mount({ count: 2, onStopAll });
    const button = getStopAllButton(container);
    expect(button).not.toBeNull();

    await act(async () => {
      button?.click();
    });

    expect(onStopAll).toHaveBeenCalledTimes(1);
    expect(onToggleCollapse).not.toHaveBeenCalled();
  });
});

describe("ServerGroupSection header row collapse", () => {
  it("toggles collapse when the header row is clicked", () => {
    const { container, onToggleCollapse } = mount({ count: 2 });
    const header = container.querySelector('[role="button"]') as HTMLDivElement;
    act(() => {
      header.click();
    });
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("does not toggle collapse when move controls are clicked", () => {
    const { container, onToggleCollapse, onMoveUp, onMoveDown } = mount({
      count: 2,
      canMoveUp: true,
      canMoveDown: true,
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Move Dev up"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Move Dev down"]')?.click();
    });

    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(onToggleCollapse).not.toHaveBeenCalled();
  });

  it("toggles collapse with Enter and Space on the header row", () => {
    const { container, onToggleCollapse } = mount({ count: 2 });
    const header = container.querySelector('[role="button"]') as HTMLDivElement;

    act(() => {
      header.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      header.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });

    expect(onToggleCollapse).toHaveBeenCalledTimes(2);
  });

  it("does not toggle collapse when keyboard events originate from an inner control", () => {
    const { container, onToggleCollapse } = mount({ count: 2 });
    const startAll = getStartAllButton(container);

    act(() => {
      startAll?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onToggleCollapse).not.toHaveBeenCalled();
  });

  it("keeps collapse icon and aria-expanded in sync", () => {
    const collapsed = mount({ count: 2, collapsed: true });
    const header = collapsed.container.querySelector('[role="button"]') as HTMLDivElement;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(collapsed.container.querySelector("svg")).not.toBeNull();

    const expanded = mount({ count: 2, collapsed: false });
    expect(expanded.container.querySelector('[role="button"]')?.getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});
