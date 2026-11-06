import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { moduleNumber, modulePlace, numberedTitle } from "../src/module-number";

/**
 * The module-number contract with the macOS app: a module is numbered by its
 * place in the course's module list, so a course whose modules carry
 * authored `order` 1 and 3 reads "Module 1 of 2" and "Module 2 of 2".
 * apps/macos/Tests/GnosiaTests/CourseNumberingTests.swift asserts the Swift
 * port against this same file.
 */

interface Fixture {
  cases: {
    name: string;
    modules: { id: string; order: number; title: string }[];
    expected: { number: number; place: string; numberedTitle: string }[];
  }[];
}

const FIXTURE = resolve(__dirname, "../../../apps/macos/Tests/GnosiaTests/Fixtures/module-numbers.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;

describe("module numbers", () => {
  it("covers a gap in the authored order", () => {
    const orders = fixture.cases.map((c) => c.modules.map((m) => m.order));
    expect(orders).toContainEqual([1, 3]);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const course = { modules: c.modules };
    expect(
      c.modules.map((m) => ({
        number: moduleNumber(course, m),
        place: modulePlace(course, m),
        numberedTitle: numberedTitle(course, m),
      })),
    ).toEqual(c.expected);
  });

  it("finds a module by id, so a copy serialised apart from its course still numbers", () => {
    const course = { modules: [{ id: "a" }, { id: "b" }] };
    expect(moduleNumber(course, { id: "b" })).toBe(2);
  });

  it("refuses a module the course does not list", () => {
    expect(() => moduleNumber({ modules: [{ id: "a" }] }, { id: "z" })).toThrow(/"z"/);
  });
});
