import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../../../../services/catalog/src/migrations";
import {
  createScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";
import { ITEMS, seedContent } from "../../../../../../services/catalog/test/state-fixture";

/**
 * The `/api/learner/*` handlers, against a scratch database.
 *
 * The routes are the only way the browser can change anything now, so what
 * they refuse matters as much as what they store. Three things are checked
 * here and nowhere else: the same-origin guard actually rejects, a payload
 * naming something the catalog does not have comes back 400 rather than 500,
 * and the preference allow-list holds.
 *
 * `DATABASE_URL` is set before the modules are imported, because
 * `learner-store` opens one pool for the process on first use and reads the
 * connection string then. The imports are therefore dynamic, inside
 * `beforeAll`, rather than at the top of the file.
 */

const reachable = await probe();

const ORIGIN = "http://localhost:3000";

function request(body: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", host: "localhost:3000" };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}/api/learner/x`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

type Handler = (req: Request) => Promise<Response>;

describe.skipIf(!reachable.ok)("learner API routes", () => {
  let scratch: Scratch;
  let routes: Record<string, Handler>;
  let readLearnerSnapshot: typeof import("@self-learn/catalog/state").readLearnerSnapshot;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await seedContent(scratch.db);
    process.env.DATABASE_URL = scratch.url;

    const [progress, note, reset, recap, preference, importRoute, state] = await Promise.all([
      import("./progress/route"),
      import("./note/route"),
      import("./reset/route"),
      import("./recap/route"),
      import("./preference/route"),
      import("./import/route"),
      import("@self-learn/catalog/state"),
    ]);
    routes = {
      progress: progress.POST,
      note: note.POST,
      reset: reset.POST,
      recap: recap.POST,
      preference: preference.POST,
      import: importRoute.POST,
    };
    readLearnerSnapshot = state.readLearnerSnapshot;
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.db.execute(
      "alter table event disable trigger event_no_update; " +
        "alter table event disable trigger event_no_delete; " +
        "truncate event, mastery, review, progress, recap, preference; " +
        "alter table event enable trigger event_no_update; " +
        "alter table event enable trigger event_no_delete;",
    );
  });

  const call = async (name: string, body: unknown, origin?: string | null) => {
    const handler = routes[name];
    if (handler === undefined) throw new Error(`no route ${name}`);
    const response = await handler(request(body, origin));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const snapshot = async () => readLearnerSnapshot(scratch.db);

  it("refuses a request that did not come from a page on this host", async () => {
    const cross = await call("progress", { curriculumItemId: ITEMS[0], completed: true }, "https://evil.example");
    expect(cross.status).toBe(403);
    const none = await call("progress", { curriculumItemId: ITEMS[0], completed: true }, null);
    expect(none.status).toBe(403);
    expect((await snapshot()).completed).toEqual({});
  });

  it("ticks and unticks", async () => {
    expect((await call("progress", { curriculumItemId: ITEMS[0], completed: true })).status).toBe(200);
    expect((await snapshot()).completed).toEqual({ [ITEMS[0]]: true });

    await call("progress", { curriculumItemId: ITEMS[0], completed: false });
    expect((await snapshot()).completed).toEqual({});
  });

  it("writes and clears a note", async () => {
    await call("note", { curriculumItemId: ITEMS[0], note: "a thought" });
    expect((await snapshot()).notes[ITEMS[0]]).toBe("a thought");

    await call("note", { curriculumItemId: ITEMS[0], note: "" });
    expect((await snapshot()).notes).toEqual({});
  });

  it("clamps a recap server-side, whatever the browser sent", async () => {
    const { body } = await call("recap", {
      curriculumItemId: ITEMS[0],
      summary: "x".repeat(5_000),
      keyPoints: Array.from({ length: 30 }, (_, i) => `point ${i}`),
      source: "manual",
    });
    const result = body.result as { recap: { summary: string; keyPoints: string[] } };
    expect(result.recap.summary).toHaveLength(1_200);
    expect(result.recap.keyPoints).toHaveLength(8);
  });

  it("clears a recap with an empty one", async () => {
    await call("recap", { curriculumItemId: ITEMS[0], summary: "there", source: "manual" });
    const { body } = await call("recap", {
      curriculumItemId: ITEMS[0],
      summary: "",
      keyPoints: [],
      misconceptions: [],
      openQuestions: [],
      source: "manual",
    });
    expect(body.result).toMatchObject({ cleared: true });
    expect((await snapshot()).knowledge).toEqual({});
  });

  it("resets progress and bumps the epoch, leaving recaps alone", async () => {
    await call("progress", { curriculumItemId: ITEMS[0], completed: true });
    await call("recap", { curriculumItemId: ITEMS[0], summary: "kept", source: "manual" });

    const { body } = await call("reset", { curriculumItemIds: [ITEMS[0]] });
    expect(body.result).toMatchObject({ cleared: 1, epoch: 1 });

    const after = await snapshot();
    expect(after.completed).toEqual({});
    expect(after.knowledge[ITEMS[0]]?.summary).toBe("kept");
    expect(after.epoch).toBe(1);
  });

  it("moves the epoch on every reset, one increment at a time", async () => {
    // Incremented in SQL rather than read and written back, so two resets
    // cannot read the same number and write the same increment.
    for (const expected of [1, 2, 3]) {
      const { body } = await call("reset", { curriculumItemIds: [ITEMS[0]] });
      expect(body.result).toMatchObject({ epoch: expected });
    }
    expect((await snapshot()).epoch).toBe(3);
  });

  describe("preference", () => {
    it("writes the keys on the list", async () => {
      expect((await call("preference", { key: "theme", value: "dark" })).status).toBe(200);
      expect((await snapshot()).theme).toBe("dark");
    });

    it("refuses a key that is not", async () => {
      const epoch = await call("preference", { key: "epoch", value: 99 });
      expect(epoch.status).toBe(400);
      const params = await call("preference", { key: "bktParams", value: { pL0: 0.9 } });
      expect(params.status).toBe(400);
      const anything = await call("preference", { key: "../../etc/passwd", value: "x" });
      expect(anything.status).toBe(400);
    });

    it("refuses a key inherited from Object.prototype", async () => {
      // `key in WRITABLE` would pass these, and for "constructor" the
      // inherited `Object` would then stand in as the validator.
      for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
        expect((await call("preference", { key, value: "x" })).status).toBe(400);
      }
      const { rows } = await scratch.db.execute<{ n: number }>(
        "select count(*)::int as n from preference",
      );
      expect(rows[0]?.n).toBe(0);
    });

    it("refuses a resource URL that is not http(s)", async () => {
      const { status, body } = await call("preference", {
        key: "userResources",
        value: { "fx-m1": [{ id: "r", title: "t", url: "javascript:alert(1)" }] },
      });
      expect(status).toBe(400);
      expect(String(body.error)).toContain("http(s)");
    });
  });

  describe("failure modes", () => {
    it("is a 400, not a 500, when the payload names something unknown", async () => {
      const { status, body } = await call("progress", {
        curriculumItemId: "gone-m9-t9",
        completed: true,
      });
      expect(status).toBe(400);
      expect(body.code).toBe("BAD_REQUEST");
      expect(String(body.error)).toContain("gone-m9-t9");
    });

    it("rejects a malformed body", async () => {
      expect((await call("progress", { curriculumItemId: ITEMS[0] })).status).toBe(400);
      expect((await call("progress", { curriculumItemId: "", completed: true })).status).toBe(400);
      expect((await call("note", { curriculumItemId: ITEMS[0], note: 42 })).status).toBe(400);
    });
  });

  describe("import", () => {
    it("carries a legacy payload over and skips what the catalog lost", async () => {
      const { status, body } = await call("import", {
        theme: "dark",
        completed: { [ITEMS[0]]: true, "gone-m9-t9": true },
        notes: { [ITEMS[1]]: "from the browser" },
        knowledge: {
          [ITEMS[0]]: { summary: "carried", keyPoints: [], source: "manual", sessions: 3 },
        },
      });

      expect(status).toBe(200);
      expect(body.result).toMatchObject({
        progress: 1,
        notes: 1,
        recaps: 1,
        unknownItems: ["gone-m9-t9"],
      });

      const after = await snapshot();
      expect(after.completed).toEqual({ [ITEMS[0]]: true });
      expect(after.notes[ITEMS[1]]).toBe("from the browser");
      expect(after.knowledge[ITEMS[0]]?.sessions).toBe(3);
      expect(after.theme).toBe("dark");
    });

    it("refuses a payload whose fields are the wrong shape", async () => {
      expect((await call("import", { completed: ["a", "b"] })).status).toBe(400);
    });
  });
});
