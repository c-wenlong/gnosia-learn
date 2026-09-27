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

  // A track that builds its reader sets `ready`, and its method leaves the
  // refusal cases; the rest must still refuse without touching the database.
  const waiting = (Object.keys(calls) as (keyof ContentSource)[]).filter((method) => !READERS[method].ready);

  it.each(waiting)("refuses %s with its type named", async (method) => {
    const type = METHOD_TYPES[method];
    const refused = calls[method]().then(
      () => null,
      (error: unknown) => error,
    );
    const error = await refused;
    expect(error).toBeInstanceOf(NotMigratedError);
    expect((error as NotMigratedError).type).toBe(type);
    expect((error as Error).message).toMatch(new RegExp(`^${type} is not migrated yet`));
  });

  it("covers every content type", () => {
    expect(new Set(Object.values(METHOD_TYPES))).toEqual(new Set(CONTENT_TYPES));
  });

  it("names as readable exactly the types whose reader says it is ready", () => {
    // `catalog flip` refuses a type missing from DB_READERS. A track that
    // fills in its reader sets `ready` in its own file, and moves its method
    // out of the refusal cases above.
    const ready = (Object.keys(READERS) as (keyof ContentSource)[]).filter((method) => READERS[method].ready);
    expect([...DB_READERS].sort()).toEqual(ready.map((method) => METHOD_TYPES[method]).sort());
    expect(READERS.diagram.ready).toBe(true);
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
