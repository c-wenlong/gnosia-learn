import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioGridLoading } from "./StudioLoading";

/**
 * The grid's loading frame stands in for the tiles it is replaced by, so a
 * placeholder thumbnail has the tiles' 4:3 frame (D22) and nothing grows as
 * the grid lands (S1-22 of the web audit).
 */
describe("StudioGridLoading", () => {
  it("draws each placeholder thumbnail in the tiles' 4:3 frame", () => {
    const markup = renderToStaticMarkup(createElement(StudioGridLoading));
    expect(markup.match(/aspect-\[4\/3\]/g)).toHaveLength(8);
    expect(markup).not.toMatch(/aspect-\[16\/10\]/);
  });
});
