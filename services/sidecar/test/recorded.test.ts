import { describe, expect, it } from "vitest";

import type { CatalogDatabase } from "@gnosia/catalog/state";
import type { TutorDeps } from "@gnosia/tutor/server/deps";

import { gradedExtras, observedExtras, prerequisitesOf, withRecordedRows } from "../src/recorded";

/**
 * The wrapper's own edges; the rows themselves are read against a real
 * catalog in sidecar.test.ts.
 */

function deps(db: Promise<CatalogDatabase>): TutorDeps {
  db.catch(() => {});
  return { db, owner: "local" } as unknown as TutorDeps;
}

describe("withRecordedRows", () => {
  it("passes a refusal through without reading anything", async () => {
    const refusal = { status: 400, body: { error: "no", code: "BAD_REQUEST" } };
    const wrapped = withRecordedRows(async () => refusal, observedExtras);
    expect(await wrapped(deps(Promise.reject(new Error("must not be read"))), {})).toBe(refusal);
  });

  it("keeps a recorded answer's reply when its rows cannot be read back", async () => {
    const recorded = { status: 200, body: { ok: true, result: { concept: "alpha", replayed: false } } };
    const wrapped = withRecordedRows(async () => recorded, gradedExtras);
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(await wrapped(deps(Promise.reject(new Error("database down"))), {})).toEqual(recorded);
    } finally {
      console.error = quiet;
    }
  });

  it("walks every prerequisite, however far, once each", () => {
    const graph = {
      nodes: new Map<string, unknown>([
        ["gamma", { requires: ["beta", "alpha"] }],
        ["beta", { requires: ["alpha"] }],
        ["alpha", { requires: [] }],
        ["loose", {}],
      ]),
    };
    expect(prerequisitesOf(graph, "gamma")).toEqual(["beta", "alpha"]);
    expect(prerequisitesOf(graph, "alpha")).toEqual([]);
    expect(prerequisitesOf(graph, "missing")).toEqual([]);
  });

  it("asks for the graded concept's rows alone", async () => {
    expect(await gradedExtras({} as CatalogDatabase, {} as TutorDeps, {}, { concept: "alpha" })).toEqual({ concepts: ["alpha"] });
  });
});
