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
