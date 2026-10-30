import { describe, expect, it } from "vitest";

import type { CatalogDatabase } from "@gnosia/catalog/state";
import type { TutorDeps } from "@gnosia/tutor/server/deps";

import { gradedConcepts, observedConcepts, withRecordedRows } from "../src/recorded";

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
    const wrapped = withRecordedRows(async () => refusal, observedConcepts);
    expect(await wrapped(deps(Promise.reject(new Error("must not be read"))), {})).toBe(refusal);
  });

  it("keeps a recorded answer's reply when its rows cannot be read back", async () => {
    const recorded = { status: 200, body: { ok: true, result: { concept: "alpha", replayed: false } } };
    const wrapped = withRecordedRows(async () => recorded, gradedConcepts);
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(await wrapped(deps(Promise.reject(new Error("database down"))), {})).toEqual(recorded);
    } finally {
      console.error = quiet;
    }
  });

  it("names the answered concept and every prerequisite it spread to", () => {
    expect(observedConcepts({ concept: "gamma", propagated: [{ concept: "beta", hops: 1 }, { concept: "alpha", hops: 2 }] })).toEqual([
      "gamma",
      "beta",
      "alpha",
    ]);
    expect(observedConcepts({ propagated: "nonsense" })).toEqual([]);
    expect(gradedConcepts({ concept: "alpha" })).toEqual(["alpha"]);
  });
});
