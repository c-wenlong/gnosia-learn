import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * One popover for every menu (#359). An audit found four: `FilterMenu`'s
 * chip face clipped inside scrolling threads, the account menu's own, the
 * studio's `<details>` popover, and two suggestion lists with their own
 * borders and highlights. These fail when one of them comes back.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), "../..");

function sources(): Array<{ path: string; text: string }> {
  const found: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        found.push({ path: relative(src, path), text: readFileSync(path, "utf8") });
      }
    }
  };
  walk(src);
  return found;
}

/**
 * The `<details>` left in the app, each a fold of text and never a menu: the
 * studio's list of diagrams that could not be read, and a concept's note.
 * A menu is a kit `Popover`; a new fold of text goes on this list.
 */
const DISCLOSURES = ["app/(app)/studio/page.tsx", "components/workspace/NoteDisclosure.tsx"];

describe("menus", () => {
  it("builds no menu out of a <details>", () => {
    const found = sources()
      .filter(({ path, text }) => /<details\b/.test(text) && !DISCLOSURES.includes(path))
      .map(({ path }) => path);
    expect(found).toEqual([]);
  });

  it("shows a popover only through the kit Popover", () => {
    const found = sources()
      .filter(({ path, text }) => path !== "components/ui/Popover.tsx" && /\bpopover=|\.showPopover\(/.test(text))
      .map(({ path }) => path);
    expect(found).toEqual([]);
  });

  it("draws the menu box once, in classes.ts", () => {
    // A class string holding the box's radius, border, face and inset together.
    const box = /["'`][^"'`]*\brounded-2xl\b[^"'`]*["'`]/g;
    const found = sources()
      .filter(({ path }) => path !== "components/ui/classes.ts")
      .filter(({ text }) =>
        (text.match(box) ?? []).some((literal) => ["border-2", "bg-surface", "p-1.5"].every((token) => literal.split(/\s|["'`]/).includes(token))),
      )
      .map(({ path }) => path);
    expect(found).toEqual([]);
  });

  it("draws every listbox and menu in the kit's box", () => {
    const found = sources()
      .filter(({ text }) => /(^|\s)role="(listbox|menu)"/m.test(text) && !/\b(MENU_PANEL|LIST_PANEL)\b/.test(text))
      .map(({ path }) => path);
    expect(found).toEqual([]);
  });
});
