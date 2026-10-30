import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Chip } from "./Chip";

// Children as an argument, as the lint rule wants; the props type requires them, hence the cast.
type ChipProps = ComponentProps<typeof Chip>;

describe("Chip", () => {
  it("disables its toggle, and dims it", () => {
    const html = renderToStaticMarkup(createElement(Chip, { onClick: () => undefined, disabled: true } as unknown as ChipProps, "Add"));
    expect(html).toContain('disabled=""');
    expect(html).toContain("disabled:opacity-50");
  });

  it("draws a dashed chip", () => {
    const html = renderToStaticMarkup(createElement(Chip, { onClick: () => undefined, dashed: true } as unknown as ChipProps, "Add"));
    expect(html).toContain("border-dashed");
  });
});
