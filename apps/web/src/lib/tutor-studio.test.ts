import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { studioCanTag } from "@/lib/tutor-studio";

/**
 * D67 of docs/STUDIO-TUTOR-HANDOFF.md: the tutor shows tags, and loads the
 * editor, only on a health answer where a tag can do something.
 */

const good = { ok: true, diagramAgent: { ok: true, problem: null }, video: { ok: true, checks: [] }, dailyCap: { totalUsd: 0, capUsd: null } };

describe("whether a health answer lets the tutor tag", () => {
  it("says no to anything that is not an answer: the runner down, the proxy refusing, another owner's runner", () => {
    expect(studioCanTag(null)).toBe(false);
    expect(studioCanTag(undefined)).toBe(false);
    expect(studioCanTag("ok")).toBe(false);
  });

  it("says no when the runner cannot run its planner", () => {
    expect(studioCanTag({ ...good, ok: false })).toBe(false);
    expect(studioCanTag({ diagramAgent: { ok: true }, video: { ok: true } })).toBe(false);
  });

  it("says no when neither kind can be made", () => {
    expect(studioCanTag({ ...good, diagramAgent: { ok: false, problem: "a quote in the path" }, video: { ok: false } })).toBe(false);
    expect(studioCanTag({ ...good, diagramAgent: { ok: false }, video: undefined })).toBe(false);
  });

  it("says yes when one kind can be made", () => {
    expect(studioCanTag(good)).toBe(true);
    expect(studioCanTag({ ...good, video: { ok: false, note: "the video doctor has not finished its first check" } })).toBe(true);
    expect(studioCanTag({ ...good, diagramAgent: { ok: false, problem: "x" } })).toBe(true);
    // A runner from before `diagramAgent` could always queue a diagram.
    expect(studioCanTag({ ok: true })).toBe(true);
  });

  it("says yes with the day's cap spent: the menu shows, both entries disabled with the reason", () => {
    expect(studioCanTag({ ...good, dailyCap: { totalUsd: 12, capUsd: 10, exceeded: true } })).toBe(true);
  });
});

/**
 * D68: a concept page without a studio pays only for `TutorChat`'s own lines
 * and the loader. Anything of the studio's that `TutorChat` imports as a
 * value is on every concept page's first load, so only types may be imported
 * from it, and the chunk with Lexical and the hand-off only through `import()`.
 */
describe("the concept page's first load", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "..", "components", "workspace", "TutorChat.tsx"), "utf8");
  const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gms)].map((match) => ({
    typeOnly: match[1] !== undefined,
    from: match[2]!,
  }));

  it("takes nothing of the studio's but types", () => {
    // `tutor-studio` is this file's subject, the small reader the page does load.
    const studio = imports.filter(({ from }) => /\/(studio|MentionComposer$|TutorStudioKit)/.test(from));
    expect(studio.length).toBeGreaterThan(0);
    for (const { typeOnly, from } of studio) expect({ from, typeOnly }).toEqual({ from, typeOnly: true });
  });

  it("fetches the composer's chunk only with a dynamic import", () => {
    expect(source).toMatch(/await import\("\.\/TutorStudioKit"\)/);
    expect(imports.some(({ from }) => from.endsWith("TutorStudioKit"))).toBe(false);
  });

  it("never sends a hand-off's marker to the tutor's route", () => {
    expect(source).toContain("trimForRequest(chatTurns(");
  });
});
