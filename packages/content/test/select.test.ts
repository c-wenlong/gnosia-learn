import { describe, expect, it, vi } from "vitest";

import {
  CONTENT_TYPES,
  ContentError,
  parseContentSource,
  resolveOwnership,
  selectSource,
  type ContentSource,
  type TopicEntry,
} from "../src/index";

/**
 * `selectSource`: which implementation answers each type, and why.
 *
 * The precedence for a reader is the variable, then the `content_source` row,
 * then the database (D18: the row is the authority, `CONTENT_SOURCE` overrides
 * readers only; the default was files until phase 3's cut-over removed them). These tests hand it two fake sources that answer with their own name,
 * so every assertion is about the routing and nothing else.
 */

function labelled(name: string): ContentSource {
  const topic = { slug: name } as TopicEntry;
  return {
    topics: async () => [topic],
    tags: async () => [{ id: name, label: name, description: name }],
    courses: async () => [],
    concept: async (slug) => ({ slug, domain: name, path: name, markdown: name }),
    sessionLog: async (id) => ({ id, path: name, markdown: name }),
    diagram: async (slug) => ({ slug, path: name, document: name, svgPath: null }),
  };
}

const files = labelled("files");
const db = labelled("db");
const answer = async (source: ContentSource) => ({
  topics: (await source.topics())[0]?.slug,
  tags: (await source.tags())[0]?.id,
  concepts: (await source.concept("x"))?.domain,
  sessions: (await source.sessionLog("x"))?.path,
  diagrams: (await source.diagram("x"))?.path,
});

describe("parseContentSource", () => {
  it("reads nothing as no override", () => {
    expect(parseContentSource(undefined)).toEqual({});
    expect(parseContentSource("  ")).toEqual({});
  });

  it("reads a bare source as every type", () => {
    const all = parseContentSource("db");
    expect(Object.keys(all).sort()).toEqual([...CONTENT_TYPES].sort());
    expect(new Set(Object.values(all))).toEqual(new Set(["db"]));
  });

  it("reads a per-type list, spaces and all", () => {
    expect(parseContentSource(" topics=db , courses = files ")).toEqual({ topics: "db", courses: "files" });
  });

  it.each([
    ["topic=db", /"topic" is not a content type/],
    ["topics=postgres", /"postgres" is not a source/],
    ["topics", /is not <type>=<source>/],
    ["topics=db=files", /is not <type>=<source>/],
    ["topics=db,topics=files", /"topics" is named twice/],
    ["everything", /is not <type>=<source>/],
    ["topics=db,", /an entry is empty/],
    [",", /an entry is empty/],
    ["topics=db,,courses=files", /an entry is empty/],
  ])("refuses %j rather than ignoring it", (value, message) => {
    expect(() => parseContentSource(value)).toThrow(ContentError);
    expect(() => parseContentSource(value)).toThrow(message);
  });
});

describe("resolveOwnership", () => {
  it("is the database, from the default, with nothing set", () => {
    const resolved = resolveOwnership({ variable: {}, rows: {} });
    for (const type of CONTENT_TYPES) expect(resolved[type]).toEqual({ kind: "db", from: "default" });
  });

  it("follows the row over the default", () => {
    expect(resolveOwnership({ variable: {}, rows: { topics: "files" } }).topics).toEqual({ kind: "files", from: "row" });
  });

  it("follows the variable over the row, in both directions", () => {
    const resolved = resolveOwnership({
      variable: { topics: "files", tags: "db" },
      rows: { topics: "db", tags: "files" },
    });
    expect(resolved.topics).toEqual({ kind: "files", from: "variable" });
    expect(resolved.tags).toEqual({ kind: "db", from: "variable" });
  });

  it("leaves a type the variable does not name to its row", () => {
    const resolved = resolveOwnership({ variable: { courses: "files" }, rows: { topics: "db" } });
    expect(resolved.topics).toEqual({ kind: "db", from: "row" });
    expect(resolved.courses).toEqual({ kind: "files", from: "variable" });
    expect(resolved.tags).toEqual({ kind: "db", from: "default" });
  });
});

describe("selectSource", () => {
  it("reads the database for everything by default, and builds it once", async () => {
    const build = vi.fn(() => db);
    const source = selectSource({ files, db: build, variable: undefined });
    expect(await answer(source)).toEqual({
      topics: "db",
      tags: "db",
      concepts: "db",
      sessions: "db",
      diagrams: "db",
    });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("never builds the database when every type is sent to files", async () => {
    const build = vi.fn(() => db);
    const source = selectSource({ files, db: build, variable: "files" });
    expect((await answer(source)).topics).toBe("files");
    expect(build).not.toHaveBeenCalled();
  });

  it("routes each type by row, then variable, then default", async () => {
    const source = selectSource({
      files,
      db: () => db,
      ownership: async () => ({ topics: "db", tags: "db", concepts: "files" }),
      variable: "tags=files,diagrams=files",
    });
    expect(await answer(source)).toEqual({
      topics: "db", // the row
      tags: "files", // the variable over the row
      concepts: "files", // the row
      sessions: "db", // the default
      diagrams: "files", // the variable
    });
    const resolution = await source.resolution();
    expect(resolution.topics.from).toBe("row");
    expect(resolution.tags.from).toBe("variable");
    expect(resolution.sessions.from).toBe("default");
  });

  it("reads the rows and builds the database once per selected source", async () => {
    const ownership = vi.fn(async () => ({ topics: "db" as const }));
    const build = vi.fn(async () => db);
    const source = selectSource({ files, db: build, ownership, variable: undefined });
    await Promise.all([source.topics(), source.topics(), source.tags()]);
    await source.topics();
    expect(ownership).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("builds the database again after a build that failed", async () => {
    const build = vi
      .fn<() => Promise<ContentSource>>()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue(db);
    const source = selectSource({ files, db: build, variable: "topics=db" });
    await expect(source.topics()).rejects.toThrow("connection refused");
    expect((await source.topics())[0]?.slug).toBe("db");
  });

  it("reads the database when the rows cannot be read, and says why once", async () => {
    const onOwnershipError = vi.fn();
    const source = selectSource({
      files,
      db: () => db,
      ownership: async () => {
        throw new Error("ECONNREFUSED");
      },
      onOwnershipError,
      variable: undefined,
    });
    expect((await source.topics())[0]?.slug).toBe("db");
    await source.tags();
    expect(onOwnershipError).toHaveBeenCalledTimes(1);
    expect(String(onOwnershipError.mock.calls[0]?.[0])).toContain("ECONNREFUSED");
  });

  it("fails the read with what the reporter throws, rather than falling back", async () => {
    const signal = new Error("the framework's own control flow");
    const source = selectSource({
      files,
      db: () => db,
      ownership: async () => {
        throw signal;
      },
      onOwnershipError: (error) => {
        throw error;
      },
      variable: undefined,
    });
    await expect(source.topics()).rejects.toBe(signal);
  });

  it("still obeys the variable when the rows cannot be read", async () => {
    const source = selectSource({
      files,
      db: () => db,
      ownership: async () => {
        throw new Error("down");
      },
      onOwnershipError: () => {},
      variable: "topics=files",
    });
    expect((await source.topics())[0]?.slug).toBe("files");
  });

  it("refuses a db type when no database source was given, naming the type", async () => {
    const source = selectSource({ files, variable: "courses=db,topics=files" });
    await expect(source.courses()).rejects.toThrow(/^courses is to be read from the database \(CONTENT_SOURCE\)/);
    expect((await source.topics())[0]?.slug).toBe("files");
  });

  it("refuses a bad variable when it is made, not on some later read", () => {
    expect(() => selectSource({ files, variable: "topics=sql" })).toThrow(ContentError);
  });

  it("reads CONTENT_SOURCE from the environment when no value is passed", async () => {
    vi.stubEnv("CONTENT_SOURCE", "tags=files");
    try {
      const source = selectSource({ files, db: () => db });
      expect((await source.tags())[0]?.id).toBe("files");
      expect((await source.topics())[0]?.slug).toBe("db");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
