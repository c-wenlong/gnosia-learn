import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A notice, a callout, a banner and a confirm are the kit's (`Notice`,
 * `Callout`, `Banner`, `ConfirmFold`, `InlineConfirm`). An audit on
 * 2026-10-05 found the warn box alone built five ways (radius 8, 12 or 16,
 * bordered or not, padding 12 to 16, 13 or 14px), and a browser `confirm()`
 * left in the recap card after the house rule had removed the others. These
 * fail when either comes back.
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
 * Files another piece of work owns while this guard lands, each with why.
 * Move one onto `Callout` and take it off this list; never add to it.
 */
const NOT_YET: Record<string, string> = {
  "components/workspace/TutorChat.tsx": "another session was rewriting the tutor's chat when the kit landed",
  "components/AgentSession.tsx": "another session was rewriting the agent session when the kit landed",
};

describe("notices and confirms", () => {
  it("asks in place, never through the browser's confirm()", () => {
    const offenders = sources()
      .filter(({ text }) => /\b(?:window|globalThis)\.confirm\s*\(/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("draws a warn-tinted box with Callout, not by hand", () => {
    // One class string holding the warn tint and a box's radius: a pill
    // (`rounded-full`) or a tag (`rounded-sm`) is not a box.
    const box = /["'`][^"'`]*\b(?:bg-warn-tint|bg-\[var\(--warn-bg\)\])[^"'`]*["'`]/g;
    const radius = /\brounded-(?:md|lg|xl|2xl|3xl)\b/;
    const offenders = sources()
      .filter(({ path }) => !path.startsWith("components/ui/") && !(path in NOT_YET))
      .filter(({ text }) => [...text.matchAll(box)].some(([literal]) => radius.test(literal)))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
