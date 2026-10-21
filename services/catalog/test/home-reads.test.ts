import { draft, learner, LOCAL_LEARNER_ID, session } from "@gnosia/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asRecentModules, appendEvent, readEvents, recentDrafts, recentTutorSessions, withRecentModule } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * The two reads Home's "Pick up where you left off" adds to the catalog
 * (docs/proposals/home-page.md): the `recentModules` list the preference
 * route keeps, and the owner's titled studio drafts.
 */

describe("withRecentModule", () => {
  const visit = (courseSlug: string, moduleSlug: string | undefined, at: string) => ({ courseSlug, moduleSlug, at });

  it("keeps the newest visit first by its own time, whatever order the posts arrived in", () => {
    const newer = visit("cs3230", "m6", "2026-10-03T10:00:00.000Z");
    const older = visit("cs4225", "m2", "2026-10-03T09:00:00.000Z");
    // The newer visit's post landed first, the older one's second.
    expect(withRecentModule(withRecentModule([], newer), older)).toEqual([newer, older]);
  });

  it("lists a module once, at the later of its two times, and a course page as its own entry", () => {
    const list = [visit("cs3230", "m6", "2026-10-03T10:00:00.000Z"), visit("cs3230", undefined, "2026-10-02T10:00:00.000Z")];
    const stale = visit("cs3230", "m6", "2026-10-01T10:00:00.000Z");
    expect(withRecentModule(list, stale)).toEqual(list);
    const fresh = visit("cs3230", undefined, "2026-10-04T10:00:00.000Z");
    expect(withRecentModule(list, fresh)).toEqual([fresh, list[0]]);
  });

  it("drops the oldest past five", () => {
    let list: ReturnType<typeof withRecentModule> = [];
    for (let day = 1; day <= 7; day += 1) list = withRecentModule(list, visit("c", `m${day}`, `2026-10-0${day}T00:00:00.000Z`));
    expect(list.map((v) => v.moduleSlug)).toEqual(["m7", "m6", "m5", "m4", "m3"]);
  });

  it("reads a stored list defensively, and no list as undefined", () => {
    expect(asRecentModules([{ courseSlug: "a", at: "2026-10-01T00:00:00.000Z" }, { nope: true }, "x"])).toEqual([
      { courseSlug: "a", moduleSlug: undefined, at: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(asRecentModules({ courseSlug: "a" })).toBeUndefined();
    expect(asRecentModules(undefined)).toBeUndefined();
  });
});

const reachable = await probe();

describe.skipIf(!reachable.ok)("recentDrafts", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: "owner-b" }]).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("lists one owner's titled drafts, newest first, with blank and abandoned ones refused before the limit", async () => {
    const row = (id: string, minutes: number, extra: Partial<typeof draft.$inferInsert> = {}) => ({
      id,
      plannerSessionId: `s-${id}`,
      transcriptPath: `drafts/${id}/transcript.ndjson`,
      title: id,
      updatedAt: new Date(Date.UTC(2026, 9, 3, 10, minutes)),
      ...extra,
    });
    await scratch.db.insert(draft).values([
      row("oldest", 1),
      row("titled", 2, { kind: "video", state: "done" }),
      row("untitled", 3, { title: null }),
      row("blank", 4, { title: "   " }),
      row("tabs", 4, { title: "\t\n\r" }),
      row("wide", 4, { title: "\u00a0\u3000\u2009\ufeff" }),
      row("abandoned", 5, { state: "abandoned" }),
      row("theirs", 6, { ownerId: "owner-b" }),
    ]);
    const drafts = await recentDrafts(scratch.db, LOCAL_LEARNER_ID, 2);
    // With a limit of two, the blank and untitled ones must not take a slot,
    // whichever whitespace a blank one is made of.
    expect(drafts.map((d) => [d.id, d.kind, d.state])).toEqual([
      ["titled", "video", "done"],
      ["oldest", "diagram", "open"],
    ]);
    expect(drafts[0]?.updatedAt).toBe("2026-10-03T10:02:00.000Z");
  });

  it("lists a draft the owner named before the planner titled it, and gives both words back as they are", async () => {
    await scratch.db.delete(draft);
    const row = (id: string, minutes: number, extra: Partial<typeof draft.$inferInsert> = {}) => ({
      id,
      plannerSessionId: `s-${id}`,
      transcriptPath: `drafts/${id}/transcript.ndjson`,
      title: null,
      updatedAt: new Date(Date.UTC(2026, 9, 4, 10, minutes)),
      ...extra,
    });
    await scratch.db.insert(draft).values([
      row("named", 1, { name: "Transport layer" }),
      row("both", 2, { name: "Mine", title: "Planner's" }),
      row("blank-name", 3, { name: "\u3000" }),
      row("neither", 4),
    ]);
    const drafts = await recentDrafts(scratch.db, LOCAL_LEARNER_ID, 5);
    expect(drafts.map((d) => [d.id, d.name, d.title])).toEqual([
      ["both", "Mine", "Planner's"],
      ["named", "Transport layer", null],
    ]);
  });
});

describe.skipIf(!reachable.ok)("recentTutorSessions and the visit event", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: "owner-b" }]).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("lists one learner's tutor sessions, newest first, leaving studio runs and other learners out", async () => {
    const row = (id: string, minutes: number, extra: Partial<typeof session.$inferInsert> = {}) => ({
      id,
      kind: "tutor",
      learnerId: LOCAL_LEARNER_ID,
      state: "closed",
      startedAt: new Date(Date.UTC(2026, 9, 3, 9)),
      endedAt: new Date(Date.UTC(2026, 9, 3, 9, 30)),
      updatedAt: new Date(Date.UTC(2026, 9, 3, 10, minutes)),
      ...extra,
    });
    await scratch.db.insert(session).values([
      row("older", 1, { title: "Older", goal: "dot-product" }),
      row("newer", 3),
      row("same-b", 2),
      row("same-a", 2),
      row("studio-run", 5, { kind: "studio" }),
      row("theirs", 6, { learnerId: "owner-b" }),
    ]);
    const sessions = await recentTutorSessions(scratch.db, LOCAL_LEARNER_ID, 4);
    // A tie on the instant is broken by id, so a page boundary is stable.
    expect(sessions.map((s) => s.id)).toEqual(["newer", "same-b", "same-a", "older"]);
    expect(sessions[3]).toMatchObject({ title: "Older", goal: "dot-product", logAssetId: null, updatedAt: "2026-10-03T10:01:00.000Z" });
  });

  it("takes a visit event, course and module in the payload, and reads it back as the CLI's flat record", async () => {
    await appendEvent(scratch.db, { type: "visit", course: "cs3230", module: "m1" }, LOCAL_LEARNER_ID);
    const events = await readEvents(scratch.db, LOCAL_LEARNER_ID);
    expect(events.filter((e) => e.type === "visit")).toEqual([expect.objectContaining({ type: "visit", course: "cs3230", module: "m1" })]);
  });
});
