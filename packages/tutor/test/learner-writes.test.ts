import { COMMONS_OWNER, learner, LOCAL_LEARNER_ID, ownerScope } from "@gnosia/schema";
import { readPreference } from "@gnosia/catalog/state";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { playbackKey } from "../src/playback";
import type { TutorDeps } from "../src/server/deps";
import { favoriteTurn, observeTurn, playbackTurn, watchedTurn } from "../src/server/learner-writes";
import { migratedScratchDatabase, probe, type Scratch } from "../../../services/catalog/test/scratch-database";
import { ASSETS, seedAssets, seedContent } from "../../../services/catalog/test/state-fixture";

/**
 * The learner write turns the web routes and the sidecar share, against a
 * real scratch catalog: a star, a watched mark and a playback save land only
 * on an asset the owner may read (theirs or the commons'), never on another
 * owner's, and a playback row stored with a `watchedAt` that is not a date
 * does not turn the next save into a 503 after it landed (R3-1-04).
 */

const reachable = await probe();
const OTHER = "owner-b";

describe.skipIf(!reachable.ok)("learner write turns", () => {
  let scratch: Scratch;

  function deps(owner: string): TutorDeps {
    return { db: Promise.resolve(scratch.db), owner, env: {}, scope: ownerScope(owner) } as unknown as TutorDeps;
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }, { id: COMMONS_OWNER }]).onConflictDoNothing();
    await seedContent(scratch.db);
    await seedAssets(scratch.db);
    // The video is another owner's: the local owner cannot read it.
    await scratch.pool.query(`update asset set owner_id = '${OTHER}' where id = '${ASSETS.video}'`);
    // The link is the commons': every owner may read it.
    await scratch.pool.query(`update asset set owner_id = '${COMMONS_OWNER}' where id = '${ASSETS.link}'`);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    // `event` is append-only, so each test counts the events it adds.
    await scratch.pool.query("delete from preference");
  });

  const save = { assetId: ASSETS.video, duration: 100, position: 10, ranges: [[0, 10]] };

  const events = async () => Number((await scratch.pool.query("select count(*) as n from event")).rows[0]?.n);

  it("refuses a star, a watched mark or a playback save on another owner's asset, writing nothing", async () => {
    const before = await events();
    for (const [turn, body] of [
      [favoriteTurn, { assetId: ASSETS.video, favorite: true }],
      [watchedTurn, { assetId: ASSETS.video }],
      [playbackTurn, save],
    ] as const) {
      const answer = await turn(deps(LOCAL_LEARNER_ID), body);
      expect(answer.status, turn.name).toBe(400);
      expect(JSON.stringify(answer.body)).toContain(ASSETS.video);
    }
    expect((await scratch.pool.query("select 1 from preference")).rowCount).toBe(0);
    expect(await events()).toBe(before);
  });

  it("writes them for the owner of the asset", async () => {
    expect((await favoriteTurn(deps(OTHER), { assetId: ASSETS.video, favorite: true })).status).toBe(200);
    expect((await watchedTurn(deps(OTHER), { assetId: ASSETS.video })).status).toBe(200);
    expect((await playbackTurn(deps(OTHER), save)).status).toBe(200);
    // A commons asset is every owner's to star.
    for (const owner of [LOCAL_LEARNER_ID, OTHER]) {
      expect((await favoriteTurn(deps(owner), { assetId: ASSETS.link, favorite: true })).status, owner).toBe(200);
    }
  });

  it("saves over a stored watchedAt that is not a date, answering 200 with the day it crosses (R3-1-04)", async () => {
    await scratch.pool.query(
      `insert into preference (learner_id, key, value) values ('${OTHER}', '${playbackKey(ASSETS.video)}', json('{"position":3,"duration":100,"ranges":[[0,3]],"watchedAt":"garbage"}'))`,
    );
    const answer = await playbackTurn(deps(OTHER), { ...save, position: 95, ranges: [[0, 95]] });
    expect(answer.status).toBe(200);
    const result = (answer.body as { result: { crossed: boolean; watchedAt: string | null; watchedDay: string | null } }).result;
    expect(result.crossed).toBe(true);
    expect(result.watchedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await readPreference(scratch.db, playbackKey(ASSETS.video), OTHER)).toMatchObject({ watchedAt: result.watchedAt });
  });

  it("refuses a confidence with no option chosen", async () => {
    const before = await events();
    const answer = await observeTurn(deps(LOCAL_LEARNER_ID), {
      conceptSlug: "alpha",
      correct: false,
      source: "probe",
      question: "What is alpha?",
      answer: "I don't know",
      chosen: null,
      confidence: 40,
      requestId: "req-1",
    });
    expect(answer.status).toBe(400);
    expect(JSON.stringify(answer.body)).toContain("confidence");
    expect(await events()).toBe(before);
  });
});
