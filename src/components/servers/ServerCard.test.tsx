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
