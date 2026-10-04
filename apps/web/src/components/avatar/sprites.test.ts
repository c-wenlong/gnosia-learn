import { AVATARS } from "@self-learn/schema/shared";
import { describe, expect, it } from "vitest";

import { PALETTE, SPRITES, spriteRuns } from "./sprites";

/**
 * The sprite grids: one per name in `AVATARS` and no other, each 16 by 16
 * with every pixel clear or a palette colour, and the runs `PixelAvatar`
 * draws covering exactly the coloured pixels.
 */
describe("SPRITES", () => {
  it("draws every avatar the database can hold, and nothing else", () => {
    expect(Object.keys(SPRITES).sort()).toEqual([...AVATARS].sort());
  });

  it.each(AVATARS)("%s is a 16 by 16 grid of palette colours", (avatar) => {
    const { rows, disc } = SPRITES[avatar];
    expect(rows).toHaveLength(16);
    for (const row of rows) {
      expect(row).toHaveLength(16);
      for (const pixel of row) expect(pixel === "." || pixel in PALETTE).toBe(true);
    }
    expect(disc).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(AVATARS)("%s is drawn by runs that cover each coloured pixel once", (avatar) => {
    const sprite = SPRITES[avatar];
    const painted = new Map<string, string>();
    for (const run of spriteRuns(sprite)) {
      for (let x = run.x; x < run.x + run.width; x++) {
        const at = `${x},${run.y}`;
        expect(painted.has(at)).toBe(false);
        painted.set(at, run.fill);
      }
    }
    sprite.rows.forEach((row, y) =>
      [...row].forEach((pixel, x) => {
        expect(painted.get(`${x},${y}`)).toBe(pixel === "." ? undefined : PALETTE[pixel as keyof typeof PALETTE]);
      }),
    );
  });
});
