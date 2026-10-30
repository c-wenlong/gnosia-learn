import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioGridLoading } from "./StudioLoading";
import { TILE_THUMB } from "./surfaces";

/**
 * The grid's loading frame stands in for the tiles it is replaced by, so a
 * placeholder thumbnail has the tiles' 4:3 frame (D22) and nothing grows as
 * the grid lands (S1-22 of the web audit).
 */
describe("StudioGridLoading", () => {
  it("draws each placeholder thumbnail in the tiles' own frame, whatever its ratio", () => {
    const markup = renderToStaticMarkup(createElement(StudioGridLoading));
    // The class the tiles draw their pictures in (`TILE_THUMB`), so the two
    // cannot drift apart: a new ratio there is the skeleton's too.
    expect(markup.split(TILE_THUMB).length - 1).toBe(8);
    expect(markup).not.toMatch(/aspect-\[16\/10\]/);
  });
});
