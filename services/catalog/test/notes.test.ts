import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { notePaths } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { seedContent } from "./state-fixture";
import { LOCAL_LEARNER_ID, ownerScope } from "@gnosia/schema";

/** Who these reads are for: the one owner there is today (phase 4 scoping). */
const LOCAL = ownerScope(LOCAL_LEARNER_ID);

/**
 * `notePaths`: a concept slug to the repo-relative path the indexer read its
 * note from. The web app joins it onto its own root rather than building a
 * `learn/` path itself (ARCHITECTURE.md rule 6).
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("notePaths", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("answers every slug it knows, keyed by slug", async () => {
    expect(await notePaths(scratch.db, ["alpha", "gamma"], LOCAL)).toEqual({
      alpha: "learn/concepts/fixtures/alpha.md",
      gamma: "learn/concepts/fixtures/gamma.md",
    });
  });

  it("leaves out a slug with no concept row, and asks nothing for no slugs", async () => {
    expect(await notePaths(scratch.db, ["alpha", "no-such-concept", "alpha"], LOCAL)).toEqual({
      alpha: "learn/concepts/fixtures/alpha.md",
    });
    expect(await notePaths(scratch.db, [], LOCAL)).toEqual({});
  });
});
