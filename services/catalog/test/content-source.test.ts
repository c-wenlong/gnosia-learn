import { CONTENT_TYPES, METHOD_TYPES, type ContentSource } from "@self-learn/content";
import { describe, expect, it } from "vitest";

import { DB_READERS } from "../src/content/flip";
import { dbSource, NotMigratedError, READERS, readyTypes } from "../src/content/source";
import type { CatalogDatabase } from "../src/db";

/**
 * The database half of the reader seam, before any track fills it in.
 *
 * Needs no Postgres: the stub runs no query, and that is part of what is
 * pinned. A method that answered with an empty list instead of refusing would
 * render a site with nothing in it and no error anywhere.
 */

// Never touched: a method that reached for it would throw on the property read.
const db = new Proxy({} as CatalogDatabase, {
  get: (_, key) => {
    throw new Error(`dbSource queried the database (${String(key)}) before its track landed`);
  },
});

describe("dbSource", () => {
  const source = dbSource(db);
  const calls: Record<keyof ContentSource, () => Promise<unknown>> = {
    topics: () => source.topics(),
    tags: () => source.tags(),
    courses: () => source.courses(),
    concept: () => source.concept("dot-product"),
    sessionLog: () => source.sessionLog("2026-08-19-react-agents"),
    diagram: () => source.diagram("dot-product"),
  };

  // Only the readers no track has filled in yet: a ready one reads rows, and
  // is tested by its track against a database.
  const pending = (Object.keys(calls) as (keyof ContentSource)[]).filter((method) => !READERS[method].ready);

  it("refuses every method whose reader is not ready, with its type named", async () => {
    for (const method of pending) {
      const type = METHOD_TYPES[method];
      const refused = calls[method]().then(
        () => null,
        (error: unknown) => error,
      );
      const error = await refused;
      expect(error, method).toBeInstanceOf(NotMigratedError);
      expect((error as NotMigratedError).type).toBe(type);
      expect((error as Error).message).toMatch(new RegExp(`^${type} is not migrated yet`));
    }
  });

  it("covers every content type", () => {
    expect(new Set(Object.values(METHOD_TYPES))).toEqual(new Set(CONTENT_TYPES));
  });

  it("names as readable exactly the types whose reader is ready", () => {
    // `catalog flip` refuses a type missing from DB_READERS. A track that
    // fills in its reader sets `ready` in its own file, which takes its method
    // out of the refusal case above and puts its type here.
    const ready = (Object.keys(READERS) as (keyof ContentSource)[])
      .filter((method) => READERS[method].ready)
      .map((method) => METHOD_TYPES[method]);
    expect([...DB_READERS].sort()).toEqual(ready.sort());
    expect(DB_READERS.has("concepts") && DB_READERS.has("sessions")).toBe(true);
  });

  it("derives the readable types from each reader's own flag", () => {
    const flags = (ready: (keyof ContentSource)[]) =>
      Object.fromEntries(
        (Object.keys(READERS) as (keyof ContentSource)[]).map((method) => [method, { ready: ready.includes(method) }]),
      ) as Record<keyof ContentSource, { ready: boolean }>;
    expect([...readyTypes(flags(["concept", "topics"]))].sort()).toEqual(["concepts", "topics"]);
    expect([...readyTypes(flags([]))]).toEqual([]);
  });
});
