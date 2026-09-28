import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";
import { IndexError } from "../src/index/errors";
import {
  hasCanvasCli,
  listByCli,
  listByParsing,
  metaFromDocument,
  normaliseListing,
} from "../src/index/tldr";

/**
 * The two ways a `.tldr`'s metadata can be read, and the claim that they agree.
 *
 * `listByCli` is tldrawkc's own answer; `listByParsing` is this repo reading
 * the JSON itself because a fresh clone and CI have no built submodule. Two
 * readers of one format is exactly how two consumers come to disagree about it,
 * so the agreement is asserted against a real stamped document rather than
 * assumed. It can only be asserted where the CLI exists, so that one case skips
 * without a build; everything the fallback does on its own runs everywhere.
 */

const built = hasCanvasCli(REPO_ROOT);

/** The seed's stamped diagram (seed/README.md), and the source of truth for the shapes. */
const STAMPED = path.join(REPO_ROOT, "seed", "learn", "assets", "vector-as-a-list-of-numbers.tldr");

/** A minimal document with whatever metadata the case needs. */
function document(meta: unknown): string {
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2, sequences: {} },
    records: [
      { id: "pointer:pointer", typeName: "pointer", x: 0, y: 0 },
      { id: "document:document", typeName: "document", gridSize: 10, name: "", meta },
    ],
  });
}

describe("metaFromDocument", () => {
  it("reads the object off the document record", () => {
    const meta = metaFromDocument(
      JSON.parse(
        document({
          tldrawkc: {
            kc: 1,
            title: "Vectors",
            topic: "vector-and-linear-algebra-basics",
            concepts: ["vector-as-a-list-of-numbers"],
            source: "learn/concepts/foundations/vector-as-a-list-of-numbers.md",
            created: "2026-09-13T10:00:00.000Z",
          },
        }),
      ),
    );
    expect(meta).toEqual({
      kc: 1,
      title: "Vectors",
      topic: "vector-and-linear-algebra-basics",
      concepts: ["vector-as-a-list-of-numbers"],
      source: "learn/concepts/foundations/vector-as-a-list-of-numbers.md",
      created: "2026-09-13T10:00:00.000Z",
    });
  });

  it("is null for a document drawn before metadata existed", () => {
    expect(metaFromDocument(JSON.parse(document({})))).toBeNull();
    expect(metaFromDocument(JSON.parse(document({ other: 1 })))).toBeNull();
  });

  it("drops fields of the wrong type rather than trusting them", () => {
    // A hand-edited file, or a version that reused a name for something else.
    // Reading a number as a slug would put it in the database as one.
    const meta = metaFromDocument(
      JSON.parse(document({ tldrawkc: { topic: 7, concepts: ["a", 3, "b"], title: null } })),
    );
    expect(meta).toEqual({ concepts: ["a", "b"] });
  });

  it("is null for anything that is not a tldraw file", () => {
    expect(metaFromDocument({})).toBeNull();
    expect(metaFromDocument({ records: "no" })).toBeNull();
    expect(metaFromDocument(null)).toBeNull();
  });
});

describe("normaliseListing", () => {
  it("keeps the path and the metadata and drops the rest", () => {
    const listing = normaliseListing(
      {
        dir: "/tmp/x",
        diagrams: [
          { path: "/tmp/x/b.tldr", meta: { topic: "beta" }, shapes: 3, svg: { exists: true } },
          { path: "/tmp/x/a.tldr", meta: null, shapes: 1, svg: { exists: false } },
        ],
        errors: [{ path: "/tmp/x/bad.tldr", message: "Unexpected end of JSON input" }],
      },
      "/tmp/x",
    );
    expect(listing.via).toBe("tldrawkc");
    expect(listing.diagrams).toEqual([
      { path: "/tmp/x/a.tldr", meta: null },
      { path: "/tmp/x/b.tldr", meta: { topic: "beta" } },
    ]);
    expect(listing.errors).toEqual([
      { path: "/tmp/x/bad.tldr", message: "Unexpected end of JSON input" },
    ]);
  });

  it("refuses a payload with no diagrams list", () => {
    expect(() => normaliseListing({ ok: true }, "/tmp/x")).toThrow(IndexError);
  });
});

describe("listByParsing", () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "tldr-parse-"));
    await copyFile(STAMPED, path.join(directory, "stamped.tldr"));
    await writeFile(path.join(directory, "bare.tldr"), document({}), "utf8");
    await writeFile(path.join(directory, "broken.tldr"), "{not json", "utf8");
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reads every document and sends the unreadable one to errors", async () => {
    const listing = await listByParsing(directory);
    expect(listing.via).toBe("json");
    expect(listing.diagrams.map((d) => path.basename(d.path))).toEqual([
      "bare.tldr",
      "stamped.tldr",
    ]);
    expect(listing.diagrams[0]?.meta).toBeNull();
    expect(listing.diagrams[1]?.meta?.topic).toBe("vector-and-linear-algebra-basics");
    expect(listing.errors.map((e) => path.basename(e.path))).toEqual(["broken.tldr"]);
  });

  it.skipIf(!built)("agrees with tldrawkc list on the same directory", async () => {
    const [tool, own] = await Promise.all([
      listByCli(REPO_ROOT, directory),
      listByParsing(directory),
    ]);
    // The `via` label is the one field they are meant to differ on.
    expect(tool.diagrams).toEqual(own.diagrams);
    expect(tool.errors.map((e) => e.path)).toEqual(own.errors.map((e) => e.path));
    expect(tool.diagrams[1]?.meta).toMatchObject({
      kc: 1,
      topic: "vector-and-linear-algebra-basics",
      concepts: ["vector-as-a-list-of-numbers"],
    });
  }, 60_000);
});
