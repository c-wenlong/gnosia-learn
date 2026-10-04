import { describe, expect, it } from "vitest";

import { menuPlacement } from "./menu-place";

const viewport = { width: 1000, height: 800 };
const button = { top: 100, bottom: 132, left: 900, right: 932 };

describe("menuPlacement", () => {
  it("opens under the button with its end edge on the button's", () => {
    expect(menuPlacement({ trigger: button, width: 240, height: 300, viewport })).toEqual({
      top: 138,
      left: 692,
      above: false,
      maxHeight: 800 - 8 - 138,
    });
  });

  it("lines up its start edge for align start, and moves in from the right edge of the screen", () => {
    expect(menuPlacement({ trigger: button, width: 240, height: 300, viewport, align: "start" }).left).toBe(1000 - 8 - 240);
    expect(menuPlacement({ trigger: { ...button, left: 0, right: 32 }, width: 240, height: 300, viewport }).left).toBe(8);
  });

  it("opens above when it does not fit under and there is more room above", () => {
    const low = { top: 700, bottom: 732, left: 900, right: 932 };
    expect(menuPlacement({ trigger: low, width: 240, height: 300, viewport })).toEqual({
      top: 700 - 6 - 300,
      left: 692,
      above: true,
      maxHeight: 700 - 6 - 8,
    });
  });

  it("stays under when neither side fits but under has more room, and caps its height there", () => {
    const place = menuPlacement({ trigger: button, width: 240, height: 2000, viewport });
    expect(place.above).toBe(false);
    expect(place.maxHeight).toBe(654);
  });
});
