import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isPlainClick } from "./plain-click";

const click = (over: Partial<Parameters<typeof isPlainClick>[0]> = {}) =>
  isPlainClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over });

describe("isPlainClick", () => {
  it("is a main-button click with no modifier", () => expect(click()).toBe(true));
  it("leaves every modified click to the browser", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(click({ [key]: true })).toBe(false);
  });
  it("leaves the middle and right buttons to the browser", () => {
    expect(click({ button: 1 })).toBe(false);
    expect(click({ button: 2 })).toBe(false);
  });

  it("is the one test of a modified click: no component spells it out", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          if (/\.button\s*!==\s*0\s*\|\|[^;]*\.metaKey/.test(readFileSync(path, "utf8"))) offenders.push(relative(src, path));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
