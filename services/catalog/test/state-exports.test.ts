import { describe, expect, it } from "vitest";

import * as store from "../src/state";
import { byKind, type AssetRef } from "../src/state";

/**
 * What comes out of `@self-learn/catalog/state`.
 *
 * `apps/web/` may import this package through exactly one specifier
 * (ARCHITECTURE.md layering rule 1), so this list is not an implementation
 * detail: a name that stops being exported here is a feature the web app can
 * no longer build, and the failure shows up as a page that cannot be written
 * rather than as a broken test. That is what happened to the asset queries,
 * which sat private inside `commands/show.ts` for a bundle and a half.
 *
 * Needs no database. Importing the barrel opens no connection: `connect` is a
 * function, and every caller calls it.
 */

/** The names the web app has to be able to reach. Removing one is breaking. */
const REQUIRED = [
  // The connection, and the errors a caller has to distinguish.
  "connect",
  "withDatabase",
  "StateError",
  // Learner state: read for a render, written by a route handler.
  "readLearnerSnapshot",
  "readProgress",
  "setProgress",
  "setNote",
  "resetCourse",
  "upsertRecap",
  "readPreference",
  "writePreference",
  "importLegacyState",
  // The concept graph.
  "readKnowledgeBase",
  "dueConcepts",
  "EMPTY_KNOWLEDGE_BASE",
  // Assets: which video, diagram, note or link is about this subject.
  "assetsForTopic",
  "assetsForConcept",
  "assetsForCollection",
  "assetsByIds",
  "byKind",
  // Assets: everything, filtered and paged, for a library page.
  "listAssets",
  "assetCounts",
] as const;

describe("the state barrel", () => {
  it.each(REQUIRED)("exports %s", (name) => {
    expect(store).toHaveProperty(name);
    expect(store[name]).toBeDefined();
  });

  it("keeps the door open for assets specifically", () => {
    // Spelled out rather than left to the list above, because this is the one
    // the layering rule already closed once.
    for (const name of ["assetsForTopic", "assetsForConcept", "assetsForCollection"] as const) {
      expect(typeof store[name]).toBe("function");
    }
  });
});

describe("byKind", () => {
  const ref = (id: string, kind: string): AssetRef => ({
    id,
    kind,
    path: `out/${id}`,
    url: null,
    bytes: null,
    title: null,
    sourceRepo: "manimkc",
  });

  it("groups by kind, in the order the rows arrived", () => {
    expect(byKind([ref("a", "video"), ref("b", "note"), ref("c", "video")])).toEqual({
      video: [ref("a", "video"), ref("c", "video")],
      note: [ref("b", "note")],
    });
  });

  it("has no key for a kind with no rows", () => {
    // The reason the CLI's `--json` stays small, and the reason a page can
    // write `assets.video === undefined` to mean "there is no video".
    const grouped = byKind([ref("a", "note")]);
    expect(Object.keys(grouped)).toEqual(["note"]);
    expect(grouped["video"]).toBeUndefined();
  });

  it("returns an empty object for no rows at all", () => {
    expect(byKind([])).toEqual({});
  });
});
