import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";
import { ITEMS, seedContent } from "../../../../../../services/catalog/test/state-fixture";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

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
  let readLearnerSnapshot: typeof import("@gnosia/catalog/state").readLearnerSnapshot;
  let recentGet: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    process.env.DATABASE_URL = scratch.url;

    const [progress, note, reset, recap, preference, importRoute, name, avatar, assetName, recent, state] = await Promise.all([
      import("./progress/route"),
      import("./note/route"),
      import("./reset/route"),
      import("./recap/route"),
      import("./preference/route"),
      import("./import/route"),
      import("./name/route"),
      import("./avatar/route"),
      import("./asset-name/route"),
      import("./recent/route"),
      import("@gnosia/catalog/state"),
    ]);
    routes = {
      progress: progress.POST,
      note: note.POST,
      reset: reset.POST,
      recap: recap.POST,
      preference: preference.POST,
      import: importRoute.POST,
      name: name.POST,
      avatar: avatar.POST,
      assetName: assetName.POST,
      recent: recent.POST,
    };
    recentGet = recent.GET;
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

    it("takes all six theme modes, and names them when it refuses one", async () => {
      for (const mode of ["light", "gnosia", "dark", "system", "gnosia-dark", "gnosia-system"]) {
        expect((await call("preference", { key: "theme", value: mode })).status).toBe(200);
        expect((await snapshot()).theme).toBe(mode);
      }
      const { status, body } = await call("preference", { key: "theme", value: "classic" });
      expect(status).toBe(400);
      expect(String(body.error)).toBe(
        '"value" must be one of "light", "gnosia", "dark", "system", "gnosia-dark", "gnosia-system".',
      );
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

    it("writes the Settings page's keys, and no longer the habit's", async () => {
      for (const [key, value] of [
        ["tutorStyle", "socratic"],
        ["reducedMotion", "always"],
      ] as const) {
        expect((await call("preference", { key, value })).status).toBe(200);
      }
      // The daily target and the leeway went with the habit layer (H1 of
      // docs/proposals/home-page.md): their rows may exist, nothing writes them.
      expect((await call("preference", { key: "dailyTarget", value: { concepts: 2, reviews: false } })).status).toBe(400);
      expect((await call("preference", { key: "dailyLeeway", value: 3 })).status).toBe(400);
      const { rows } = await scratch.db.execute<{ key: string; value: unknown }>(
        "select key, value from preference order by key",
      );
      expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual({
        reducedMotion: "always",
        tutorStyle: "socratic",
      });
    });

    it("keeps recentModules beside every lastVisited, newest first, without repeats", async () => {
      const visit = (courseSlug: string, moduleSlug: string, at: string) =>
        call("preference", { key: "lastVisited", value: { courseSlug, moduleSlug, at } });
      expect((await visit("cs3230", "m1", "2026-10-01T00:00:00.000Z")).status).toBe(200);
      await visit("cs4225", "m2", "2026-10-02T00:00:00.000Z");
      await visit("cs3230", "m1", "2026-10-03T00:00:00.000Z");
      const stored = async (key: string) => {
        const { rows } = await scratch.db.execute<{ value: unknown }>(
          `select value from preference where key = '${key}'`,
        );
        return rows[0]?.value;
      };
      expect(await stored("recentModules")).toEqual([
        { courseSlug: "cs3230", moduleSlug: "m1", at: "2026-10-03T00:00:00.000Z" },
        { courseSlug: "cs4225", moduleSlug: "m2", at: "2026-10-02T00:00:00.000Z" },
      ]);
      // lastVisited stays one object: the course list resumes from it.
      expect(await stored("lastVisited")).toEqual({ courseSlug: "cs3230", moduleSlug: "m1", at: "2026-10-03T00:00:00.000Z" });
      // Written by the route only: a browser cannot set the list directly.
      expect((await call("preference", { key: "recentModules", value: [] })).status).toBe(400);
    });

    it("appends one visit event per visit, with the server's time and no concept", async () => {
      const before = Date.now();
      await call("preference", { key: "lastVisited", value: { courseSlug: "cs9001", moduleSlug: "m1", at: "2020-01-01T00:00:00.000Z" } });
      await call("preference", { key: "lastVisited", value: { courseSlug: "cs9001", at: "2020-01-01T00:00:00.000Z" } });
      await call("preference", { key: "lastVisited", value: { courseSlug: "cs9001", moduleSlug: "m1", at: "2020-01-01T00:00:00.000Z" } });
      const { rows } = await scratch.db.execute<{ type: string; payload: Record<string, unknown>; concept_slug: string | null; at: Date }>(
        "select type, payload, concept_slug, at from event where type = 'visit' and payload->>'course' = 'cs9001' order by id",
      );
      // One row each, a repeat included: the log keeps every visit.
      expect(rows.map((r) => r.payload)).toEqual([{ course: "cs9001", module: "m1" }, { course: "cs9001" }, { course: "cs9001", module: "m1" }]);
      expect(rows.every((r) => r.concept_slug === null)).toBe(true);
      // The browser's `at` is the preference's; the log's is the server's.
      expect(rows.every((r) => new Date(r.at).getTime() >= before - 1_000)).toBe(true);
    });

    it("starts recentModules from the visit lastVisited held before the list existed", async () => {
      await scratch.db.execute(
        `insert into preference (learner_id, key, value) values ('local', 'lastVisited', '{"courseSlug":"cs4223","moduleSlug":"m5","at":"2026-09-01T00:00:00.000Z"}')`,
      );
      await call("preference", { key: "lastVisited", value: { courseSlug: "cs3230", moduleSlug: "m6", at: "2026-10-03T00:00:00.000Z" } });
      const { rows } = await scratch.db.execute<{ value: unknown }>(
        "select value from preference where key = 'recentModules'",
      );
      expect(rows[0]?.value).toEqual([
        { courseSlug: "cs3230", moduleSlug: "m6", at: "2026-10-03T00:00:00.000Z" },
        { courseSlug: "cs4223", moduleSlug: "m5", at: "2026-09-01T00:00:00.000Z" },
      ]);
    });

    it("stores the courses set aside, deduplicated, and refuses anything but slugs", async () => {
      expect((await call("preference", { key: "inactiveCourses", value: ["cs2111", "cs2111", "cs3230"] })).status).toBe(
        200,
      );
      const { rows } = await scratch.db.execute<{ value: unknown }>(
        "select value from preference where key = 'inactiveCourses'",
      );
      expect(rows[0]?.value).toEqual(["cs2111", "cs3230"]);

      expect((await call("preference", { key: "inactiveCourses", value: "cs2111" })).status).toBe(400);
      const blank = await call("preference", { key: "inactiveCourses", value: ["cs2111", ""] });
      expect(blank.status).toBe(400);
      expect(String(blank.body.error)).toContain("value[1]");
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

  describe("asset-name", () => {
    const ID = "link:route-asset";

    beforeAll(async () => {
      await scratch.db.execute(
        `insert into asset (id, kind, url, title, source_repo, owner_id) values ('${ID}', 'link', 'https://example.com/r', 'lec03 v2 final', 'gnosia', 'local') on conflict do nothing`,
      );
    });

    it("names an asset, answers with both names, and clears it with null", async () => {
      const set = await call("assetName", { assetId: ID, name: "  Master   theorem " });
      expect(set.status).toBe(200);
      expect(set.body.result).toEqual({ title: "Master theorem", name: "Master theorem", original: "lec03 v2 final" });

      const cleared = await call("assetName", { assetId: ID, name: null });
      expect(cleared.body.result).toEqual({ title: "lec03 v2 final", name: null, original: "lec03 v2 final" });
    });

    it("refuses an unknown asset, a long name and a missing id with a 400", async () => {
      expect((await call("assetName", { assetId: "link:nowhere", name: "x" })).status).toBe(400);
      expect((await call("assetName", { assetId: ID, name: "x".repeat(201) })).status).toBe(400);
      expect((await call("assetName", { name: "x" })).status).toBe(400);
      expect((await call("assetName", { assetId: ID, name: 42 })).status).toBe(400);
    });
  });

  describe("recent", () => {
    const stored = async (key: string) => {
      const { rows } = await scratch.db.execute<{ value: unknown }>(`select value from preference where key = '${key}'`);
      return rows[0]?.value;
    };
    const row = { key: "concept:dot-product", kind: "concept", title: "Dot product", href: "/learn/dot-product" };

    it("pins a row at the top, once, and unpins it", async () => {
      expect((await call("recent", { action: "pin", row })).status).toBe(200);
      expect((await call("recent", { action: "pin", row: { ...row, key: "video:v1", kind: "video", href: "/library/v1" } })).status).toBe(200);
      expect((await call("recent", { action: "pin", row })).status).toBe(200);
      expect(((await stored("pinned")) as { key: string }[]).map((p) => p.key)).toEqual(["concept:dot-product", "video:v1"]);
      expect((await call("recent", { action: "unpin", key: "video:v1" })).status).toBe(200);
      expect(((await stored("pinned")) as { key: string }[]).map((p) => p.key)).toEqual(["concept:dot-product"]);
    });

    it("refuses a pin that links off the app, or whose key is not of its kind", async () => {
      expect((await call("recent", { action: "pin", row: { ...row, href: "//evil.example/x" } })).status).toBe(400);
      expect((await call("recent", { action: "pin", row: { ...row, href: "https://evil.example" } })).status).toBe(400);
      expect((await call("recent", { action: "pin", row: { ...row, kind: "video" } })).status).toBe(400);
      expect((await call("recent", { action: "pin", row: { ...row, title: "   " } })).status).toBe(400);
      expect((await call("recent", { action: "drop" })).status).toBe(400);
      expect(await stored("pinned")).toBeUndefined();
    });

    it("names nothing: a conversation's name is kept on its draft, by the studio runner", async () => {
      expect((await call("recent", { action: "rename", key: "draft:d1", name: "Transport layer" })).status).toBe(400);
      expect(await stored("recentNames")).toBeUndefined();
    });

    it("refuses a write from another origin", async () => {
      expect((await call("recent", { action: "unpin", key: "concept:x" }, "https://evil.example")).status).toBe(403);
    });

    it("reads Recent back for the owner, the pins with it", async () => {
      await call("recent", { action: "pin", row });
      await call("preference", { key: "lastVisited", value: { courseSlug: "cs3230", moduleSlug: "m1" } });
      const response = await recentGet(new Request(`${ORIGIN}/api/learner/recent?pages=1&drafts=0`, { headers: { host: "localhost:3000" } }));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { recent: { reachable: boolean; pinned: { key: string }[] } };
      expect(body.recent.reachable).toBe(true);
      expect(body.recent.pinned.map((p) => p.key)).toEqual(["concept:dot-product"]);
    });
  });

  describe("name", () => {
    it("stores a name cleaned, answers with it, and clears it with an empty one", async () => {
      const set = await call("name", { name: "  Ada \t Lovelace " });
      expect(set.status).toBe(200);
      expect(set.body.result).toBe("Ada Lovelace");
      expect((await snapshot()).displayName).toBe("Ada Lovelace");
      expect((await call("name", { name: "" })).status).toBe(200);
      expect((await snapshot()).displayName).toBeUndefined();
      expect((await call("name", { name: null })).status).toBe(200);
    });

    it("refuses a name that is too long or not a string, and keeps the one stored", async () => {
      await call("name", { name: "Ada" });
      expect((await call("name", { name: "x".repeat(61) })).status).toBe(400);
      expect((await call("name", { name: 42 })).status).toBe(400);
      expect((await snapshot()).displayName).toBe("Ada");
      // The catalog's writer holds the limit too, for a caller that is not this route.
      const { writeDisplayName } = await import("@gnosia/catalog/state");
      await expect(writeDisplayName(scratch.db, "x".repeat(61))).rejects.toThrow(RangeError);
      expect((await snapshot()).displayName).toBe("Ada");
      await call("name", { name: null });
    });
  });

  describe("avatar", () => {
    it("has one from the start, stores a new one, and answers with it", async () => {
      const { AVATARS } = await import("@gnosia/schema/shared");
      expect(AVATARS).toContain((await snapshot()).avatar);
      const set = await call("avatar", { avatar: "fox" });
      expect(set.status).toBe(200);
      expect(set.body.result).toBe("fox");
      expect((await snapshot()).avatar).toBe("fox");
    });

    it("refuses a name outside the list, or none, and keeps the one stored", async () => {
      await call("avatar", { avatar: "owl" });
      expect((await call("avatar", { avatar: "dragon" })).status).toBe(400);
      expect((await call("avatar", { avatar: null })).status).toBe(400);
      expect((await call("avatar", {})).status).toBe(400);
      expect((await snapshot()).avatar).toBe("owl");
      // The catalog's writer refuses too, for a caller that is not this route.
      const { writeAvatar } = await import("@gnosia/catalog/state");
      await expect(writeAvatar(scratch.db, "dragon")).rejects.toThrow(RangeError);
      expect((await snapshot()).avatar).toBe("owl");
    });
  });

  describe("export", () => {
    it("hands back the snapshot, the model chain and the event log as a download", async () => {
      await call("progress", { curriculumItemId: ITEMS[0], completed: true });
      await call("preference", { key: "tutorStyle", value: "direct" });
      const { addTutorModel } = await import("../../../../../../services/catalog/src/state");
      await addTutorModel(scratch.db, "local", "gemini", "gemini-2.5-flash");
      const { GET } = await import("./export/route");
      const response = await GET(new Request(`${ORIGIN}/api/learner/export`, { headers: { host: "localhost:3000" } }));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="gnosia-\d{4}-\d{2}-\d{2}\.json"$/);
      const body = (await response.json()) as {
        format: string;
        learner: { completed: Record<string, true> };
        preferences: Record<string, unknown>;
        tutorModels: unknown;
        events: unknown[];
      };
      expect(body.format).toBe("gnosia-export");
      // Owner configuration, no secret (docs/TUTOR-MODELS.md, T6).
      expect(body.tutorModels).toEqual([{ provider: "gemini", model: "gemini-2.5-flash" }]);
      // Every preference row, not only the ones the snapshot folds in.
      expect(body.preferences).toMatchObject({ tutorStyle: "direct" });
      expect(body.learner.completed).toEqual({ [ITEMS[0]]: true });
      expect(Array.isArray(body.events)).toBe(true);
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
