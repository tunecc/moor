// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ServerCard } from "@/components/servers/ServerCard";
import type { Server } from "@moor/types";

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

const noop = async () => undefined;

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
});
