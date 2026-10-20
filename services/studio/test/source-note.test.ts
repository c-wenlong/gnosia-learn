import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const conceptShow = vi.hoisted(() => vi.fn());
vi.mock("../src/data/catalog", () => ({ conceptShow }));

import { absolute, scratchDir } from "../src/paths";
import { resolveSource } from "../src/diagram/source-note";

/**
 * A brief's source note since the cut-over: a note is a row, so a source that
 * names one and is not on disk is written into the job's scratch directory
 * from `learn concept show`, and anything else is left as the brief gave it.
 */

const home = mkdtempSync(path.join(tmpdir(), "studio-source-note-"));
process.env.STUDIO_HOME = home;
afterAll(() => {
  delete process.env.STUDIO_HOME;
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => conceptShow.mockReset());

describe("resolveSource", () => {
  it("writes a note the tree no longer holds into scratch, from the database", async () => {
    conceptShow.mockResolvedValue({
      ok: true,
      json: { id: "dot-product", title: "Dot product", body: "# Dot product\n\nSum of products.\n" },
      error: null,
      offline: false,
    });
    const resolved = await resolveSource("job-1", "learn/concepts/foundations/dot-product.md");
    const file = path.join(scratchDir("job-1"), "source", "dot-product.md");
    expect(resolved).toEqual({ path: file, concept: "dot-product" });
    expect(conceptShow).toHaveBeenCalledWith("dot-product");
    expect(readFileSync(file, "utf8")).toBe("# Dot product\n\nSum of products.\n");
  });

  it("takes a bare slug the same way", async () => {
    conceptShow.mockResolvedValue({ ok: true, json: { body: "text" }, error: null, offline: false });
    expect((await resolveSource("job-2", "softmax")).concept).toBe("softmax");
  });

  it("leaves a file in the tree as it is, and asks nothing", async () => {
    // The test's repository root is a temp farm (vitest.setup.ts), never the checkout.
    mkdirSync(absolute("docs-fixture"), { recursive: true });
    writeFileSync(absolute("docs-fixture/notes.md"), "a document");
    try {
      expect(await resolveSource("job-3", "docs-fixture/notes.md")).toEqual({ path: "docs-fixture/notes.md", concept: null });
      expect(conceptShow).not.toHaveBeenCalled();
    } finally {
      rmSync(absolute("docs-fixture"), { recursive: true, force: true });
    }
  });

  it("leaves the source as given when the database has no such note, or does not answer", async () => {
    conceptShow.mockResolvedValue({ ok: false, json: null, error: "no such concept", offline: false });
    expect(await resolveSource("job-4", "learn/concepts/x/nowhere.md")).toEqual({
      path: "learn/concepts/x/nowhere.md",
      concept: null,
    });
    conceptShow.mockResolvedValue({ ok: false, json: null, error: "unreachable", offline: true });
    expect((await resolveSource("job-4", "nowhere")).concept).toBeNull();
  });

  it("does not take a path that is not a note for a concept", async () => {
    expect(await resolveSource("job-5", "../outside/thing.txt")).toEqual({ path: "../outside/thing.txt", concept: null });
    expect(conceptShow).not.toHaveBeenCalled();
  });
});
