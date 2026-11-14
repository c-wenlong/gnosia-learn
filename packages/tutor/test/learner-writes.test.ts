import { COMMONS_OWNER, learner, LOCAL_LEARNER_ID, ownerScope, PREFERENCE_KEYS } from "@hermes/schema";
import { assetsByIds, readDisplayName, readPreference, readProgress } from "@hermes/catalog/state";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { favoriteKey } from "../src/favorite";
import { playbackKey } from "../src/playback";
import type { TutorDeps } from "../src/server/deps";
import {
  assetNameTurn,
  favoriteTurn,
  nameTurn,
  noteTurn,
  observeTurn,
  playbackTurn,
  progressTurn,
  rememberVisit,
  reviewGradeTurn,
  sessionCloseTurn,
  watchedTurn,
} from "../src/server/learner-writes";
import { migratedScratchDatabase, probe, type Scratch } from "../../../services/catalog/test/scratch-database";
import { ASSETS, seedAssets, seedContent } from "../../../services/catalog/test/state-fixture";

/**
 * The learner write turns the web routes call, against a
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
    // `event` is append-only, so each test counts the events it adds. The
    // rest is learner state a test could have left behind.
    await scratch.pool.query("delete from preference");
    await scratch.pool.query("delete from progress");
    await scratch.pool.query("delete from asset_name");
    await scratch.pool.query("update learner set display_name = null");
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

  it("writes them for the owner of the asset, storing the star, the event and the position", async () => {
    const before = await events();
    expect((await favoriteTurn(deps(OTHER), { assetId: ASSETS.video, favorite: true })).status).toBe(200);
    expect((await watchedTurn(deps(OTHER), { assetId: ASSETS.video })).status).toBe(200);
    expect((await playbackTurn(deps(OTHER), save)).status).toBe(200);
    expect(await readPreference(scratch.db, favoriteKey(ASSETS.video), OTHER)).toEqual({ at: expect.any(String) });
    expect(await readPreference(scratch.db, playbackKey(ASSETS.video), OTHER)).toMatchObject({ position: 10, duration: 100 });
    // The one `watched` press; a 10%-watched save crosses nothing.
    expect(await events()).toBe(before + 1);
    // A commons asset is every owner's to star.
    for (const owner of [LOCAL_LEARNER_ID, OTHER]) {
      expect((await favoriteTurn(deps(owner), { assetId: ASSETS.link, favorite: true })).status, owner).toBe(200);
      expect(await readPreference(scratch.db, favoriteKey(ASSETS.link), owner), owner).toEqual({ at: expect.any(String) });
    }
  });

  it("clears a star rather than writing a false one", async () => {
    await favoriteTurn(deps(OTHER), { assetId: ASSETS.video, favorite: true });
    expect(await readPreference(scratch.db, favoriteKey(ASSETS.video), OTHER)).toEqual({ at: expect.any(String) });
    const answer = await favoriteTurn(deps(OTHER), { assetId: ASSETS.video, favorite: false });
    expect(answer.status).toBe(200);
    expect((answer.body as { result: unknown }).result).toEqual({ assetId: ASSETS.video, favorite: false, at: null });
    expect(await readPreference(scratch.db, favoriteKey(ASSETS.video), OTHER)).toBeUndefined();
  });

  it("answers 503 when the store cannot take the write, and 400 for an id the catalog does not have", async () => {
    const missing = await favoriteTurn(deps(LOCAL_LEARNER_ID), { assetId: "fx:no-such-asset", favorite: true });
    expect(missing.status).toBe(400);
    // A payload's fault is a 400; the store's is a 503: `learner-api` answers them apart.
    const down = {
      db: Promise.reject(new Error("connect ECONNREFUSED")),
      owner: LOCAL_LEARNER_ID,
      env: {},
      scope: ownerScope(LOCAL_LEARNER_ID),
    } as unknown as TutorDeps;
    const answer = await favoriteTurn(down, { assetId: ASSETS.link, favorite: true });
    expect(answer.status).toBe(503);
    expect(answer.body).toMatchObject({ ok: false, code: "STORE_UNAVAILABLE" });
    expect(await readPreference(scratch.db, favoriteKey(ASSETS.link), LOCAL_LEARNER_ID)).toBeUndefined();
  });

  it("refuses a playback save on an asset that is not a video, storing nothing", async () => {
    const answer = await playbackTurn(deps(LOCAL_LEARNER_ID), { ...save, assetId: ASSETS.link });
    expect(answer.status).toBe(400);
    expect(JSON.stringify(answer.body)).toContain("not a video");
    expect(await readPreference(scratch.db, playbackKey(ASSETS.link), LOCAL_LEARNER_ID)).toBeUndefined();
  });

  it("ticks and unticks a curriculum item, with its note on the same row", async () => {
    expect((await progressTurn(deps(LOCAL_LEARNER_ID), { curriculumItemId: "fx-m1-t1", completed: true })).status).toBe(200);
    expect(await readProgress(scratch.db, LOCAL_LEARNER_ID)).toEqual([
      { curriculumItemId: "fx-m1-t1", completedAt: expect.any(String), note: null },
    ]);
    expect((await noteTurn(deps(LOCAL_LEARNER_ID), { curriculumItemId: "fx-m1-t1", note: "remember the priors" })).status).toBe(200);
    expect(await readProgress(scratch.db, LOCAL_LEARNER_ID)).toEqual([
      { curriculumItemId: "fx-m1-t1", completedAt: expect.any(String), note: "remember the priors" },
    ]);
    // Unticking keeps the note; clearing the note then prunes the row outright.
    await progressTurn(deps(LOCAL_LEARNER_ID), { curriculumItemId: "fx-m1-t1", completed: false });
    const cleared = await noteTurn(deps(LOCAL_LEARNER_ID), { curriculumItemId: "fx-m1-t1", note: "" });
    expect((cleared.body as { result: { cleared: boolean } }).result.cleared).toBe(true);
    expect(await readProgress(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);
  });

  it("stores the learner's own name for an asset, and gives the source's title back when cleared", async () => {
    const named = await assetNameTurn(deps(LOCAL_LEARNER_ID), { assetId: ASSETS.diagram, name: "My diagram" });
    expect(named.status).toBe(200);
    const [row] = await assetsByIds(scratch.db, [ASSETS.diagram], ownerScope(LOCAL_LEARNER_ID));
    expect(row?.title).toBe("My diagram");
    const cleared = await assetNameTurn(deps(LOCAL_LEARNER_ID), { assetId: ASSETS.diagram, name: null });
    expect(cleared.status).toBe(200);
    const [again] = await assetsByIds(scratch.db, [ASSETS.diagram], ownerScope(LOCAL_LEARNER_ID));
    expect(again?.title).toBe("Alpha, drawn");
  });

  it("stores what the learner asked to be called, and clears it", async () => {
    const answer = await nameTurn(deps(LOCAL_LEARNER_ID), { name: "  Kai  " });
    expect(answer.status).toBe(200);
    expect(await readDisplayName(scratch.db, LOCAL_LEARNER_ID)).toBe("Kai");
    await nameTurn(deps(LOCAL_LEARNER_ID), { name: null });
    expect(await readDisplayName(scratch.db, LOCAL_LEARNER_ID)).toBeNull();
  });

  it("grades a review, and a retried grade replays the first write, never a second event", async () => {
    const before = await events();
    const first = await reviewGradeTurn(deps(LOCAL_LEARNER_ID), { conceptId: "alpha", grade: 2, requestId: "req-g1" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, result: { concept: "alpha", rating: 2, grade: 4, replayed: false } });
    // A retry with a different rating still answers what the first write stood.
    const replay = await reviewGradeTurn(deps(LOCAL_LEARNER_ID), { conceptId: "alpha", grade: 3, requestId: "req-g1" });
    expect((replay.body as { result: { replayed: boolean; rating: number } }).result).toMatchObject({ replayed: true, rating: 2 });
    expect(await events()).toBe(before + 1);
  });

  it("closes an open session with its counts, and answers closed: false for one never opened", async () => {
    const never = await sessionCloseTurn(deps(LOCAL_LEARNER_ID), { sessionId: "web-s1" });
    expect((never.body as { result: { closed: boolean } }).result.closed).toBe(false);
    const opened = await observeTurn(deps(LOCAL_LEARNER_ID), {
      conceptSlug: "alpha",
      correct: true,
      source: "probe",
      requestId: "req-o1",
      sessionId: "web-s1",
      question: "What is alpha?",
      answer: "The first.",
      chosen: "The first.",
      confidence: 80,
    });
    expect(opened.status).toBe(200);
    const closed = await sessionCloseTurn(deps(LOCAL_LEARNER_ID), { sessionId: "web-s1" });
    expect((closed.body as { result: { closed: boolean; answered: number; correct: number; concepts: string[] } }).result).toMatchObject(
      { closed: true, answered: 1, correct: 1, concepts: ["alpha"] },
    );
  });

  it("remembers a module visit as an event and the front of the recent list", async () => {
    const before = await events();
    const visit = { courseSlug: "fx", moduleSlug: "m1", at: "2026-10-04T01:02:03.000Z" };
    await rememberVisit(scratch.db, visit, LOCAL_LEARNER_ID);
    expect(await readPreference(scratch.db, PREFERENCE_KEYS.lastVisited, LOCAL_LEARNER_ID)).toEqual(visit);
    expect(await readPreference(scratch.db, PREFERENCE_KEYS.recentModules, LOCAL_LEARNER_ID)).toEqual([visit]);
    expect(await events()).toBe(before + 1);
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
