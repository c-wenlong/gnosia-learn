import { draft, learner, LOCAL_LEARNER_ID } from "@self-learn/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrations";
import { asRecentModules, recentDrafts, withRecentModule } from "../src/state";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

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
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
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
      row("abandoned", 5, { state: "abandoned" }),
      row("theirs", 6, { ownerId: "owner-b" }),
    ]);
    const drafts = await recentDrafts(scratch.db, LOCAL_LEARNER_ID, 2);
    // With a limit of two, the blank and untitled ones must not take a slot.
    expect(drafts.map((d) => [d.id, d.kind, d.state])).toEqual([
      ["titled", "video", "done"],
      ["oldest", "diagram", "open"],
    ]);
    expect(drafts[0]?.updatedAt).toBe("2026-10-03T10:02:00.000Z");
  });
});
