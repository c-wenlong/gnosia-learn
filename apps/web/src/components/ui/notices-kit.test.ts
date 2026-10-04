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
  "components/workspace/VerdictRow.tsx":
    "the tutor chat's recorded verdict, ok or warn, which Callout has no ok tone for; settled with the tutor chat's own work",
};

/** The source without its comments, so a doc line naming `confirm()` is not a call. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/**
 * Every class expression in a file: each string literal, and each
 * `className={...}` and `cx(...)` whole, so classes split over several
 * literals (`cx("bg-warn-tint", "rounded-xl")`) are read together.
 */
function classExpressions(text: string): string[] {
  const found = [...text.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)].map(([literal]) => literal);
  const balanced = (from: number, open: string, close: string): string => {
    let depth = 0;
    for (let at = from; at < text.length; at++) {
      if (text[at] === open) depth++;
      else if (text[at] === close && --depth === 0) return text.slice(from, at + 1);
    }
    return text.slice(from);
  };
  for (const match of text.matchAll(/className=\{|\bcx\(/g)) {
    const start = match.index + match[0].length - 1;
    found.push(match[0].endsWith("{") ? balanced(start, "{", "}") : balanced(start, "(", ")"));
  }
  return found;
}

const WARN_TINT = /\b(?:bg-warn-tint|bg-\[var\(--warn-bg\)\])/;
/** A box's radius: a pill (`rounded-full`) or a tag (`rounded-sm`) is not a box. */
const BOX_RADIUS = /\brounded-(?:md|lg|xl|2xl|3xl)\b/;
/** A fixed height is a control (a button, a chip), not a box of words. */
const CONTROL_HEIGHT = /(?:^|[\s"'`])h-\d/;
const handBuiltBox = (classes: string) => WARN_TINT.test(classes) && BOX_RADIUS.test(classes) && !CONTROL_HEIGHT.test(classes);

describe("notices and confirms", () => {
  it("asks in place, never through the browser's confirm()", () => {
    // `confirm(` bare too, unless the file binds a `confirm` of its own (the
    // learner store's write confirmation is a parameter by that name).
    const offenders = sources()
      .map(({ path, text }) => ({ path, text: code(text) }))
      .filter(({ text }) => {
        if (/\b(?:window|globalThis|self)\.confirm\s*\(/.test(text)) return true;
        const bare = /(^|[^.\w$])confirm\s*\(/.test(text);
        const bound = /function\s+confirm\b|\b(?:const|let|var)\s+confirm\b|[(,{]\s*confirm\s*[:,)=}]/.test(text);
        return bare && !bound;
      })
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("draws a warn-tinted box with Callout, not by hand", () => {
    const offenders = sources()
      .filter(({ path }) => !path.startsWith("components/ui/") && !(path in NOT_YET))
      .filter(({ text }) => classExpressions(code(text)).some(handBuiltBox))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("reads classes split over several literals together", () => {
    const split = 'const x = <p className={cx("rounded-xl px-4", ok ? "bg-ok-tint" : "bg-warn-tint")}>no</p>;';
    expect(classExpressions(split).some(handBuiltBox)).toBe(true);
    expect(classExpressions('<span className="rounded-full bg-warn-tint px-3" />').some(handBuiltBox)).toBe(false);
    expect(classExpressions('<button className="inline-flex h-7 rounded-md bg-warn-tint px-2" />').some(handBuiltBox)).toBe(false);
  });
});
