import { checkDistractor, learner, LOCAL_LEARNER_ID } from "@gnosia/schema";
import { readCheckDistractors } from "@gnosia/catalog/state";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConceptCheck } from "../src/concept-note-core";
import type { ConceptWorkspace } from "../src/concept-workspace-core";
import type { CompleteOutcome } from "../src/providers";
import { checkHash, readWrittenOptions } from "../src/server/check-options";
import type { TutorDeps } from "../src/server/deps";
import { checkOptionsTurn } from "../src/server/turns";
import { migratedScratchDatabase, probe, type Scratch } from "../../../services/catalog/test/scratch-database";
import { seedContent } from "../../../services/catalog/test/state-fixture";

/**
 * `checkOptionsTurn` against a real scratch catalog, with the model a
 * stand-in: the tutor writes a check's wrong options once, they are stored
 * under the learner who asked and the check's hash, a second ask reads them
 * with no model call, an edited check is written again, a reply that could
 * put a second right answer among the options is refused and stores
 * nothing, and one learner's options are never another's.
 */

const reachable = await probe();
const OTHER = "owner-b";
const ANSWER = "The cosine of the angle between them.";
const GOOD = ["The sine of the angle between them.", "The length of their sum.", "The area of the parallelogram they span."];

function workspaceWith(checks: ConceptCheck[]): ConceptWorkspace {
  return {
    slug: "alpha",
    title: "Alpha",
    summary: "Measures alignment.",
    domain: "fixtures",
    bucket: "untouched",
    pL: 0.25,
    mastery: "gap",
    observations: 0,
    correct: 0,
    lastSeen: null,
    place: null,
    note: { available: true, path: "learn/concepts/fixtures/alpha.md", source: "---\nid: alpha\n---\nThe body." },
    sources: [],
    tags: [],
    requires: [],
    assumes: [],
    dependants: [],
    backlinks: [],
    checks,
    history: [],
    review: null,
    assets: [],
    graph: { nodes: [], edges: [] },
    frontier: true,
  } as unknown as ConceptWorkspace;
}

const ok = (content: string): CompleteOutcome => ({
  ok: true,
  result: { content, model: "m", provider: "nvidia", providerLabel: "NVIDIA NIM" },
  attempts: [],
});

describe.skipIf(!reachable.ok)("checkOptionsTurn", () => {
  let scratch: Scratch;
  let checks: ConceptCheck[];
  const complete = vi.fn<(...args: unknown[]) => Promise<CompleteOutcome>>();

  const deps = (owner: string): TutorDeps => ({
    db: Promise.resolve(scratch.db),
    owner,
    scope: { owner, readable: [owner, "commons"] },
    source: {} as TutorDeps["source"],
    blobStore: {} as TutorDeps["blobStore"],
    env: {},
    seams: {
      readWorkspace: async () => ({ state: "ok", workspace: workspaceWith(checks) }),
      credentials: async () => [],
      complete: (messages, steps) => complete(messages, steps),
    },
  });

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.db.delete(checkDistractor);
    checks = [{ id: "c1", question: "What does the dot product of unit vectors measure?", answer: ANSWER, why: "", source: "" }];
    complete.mockReset();
    complete.mockResolvedValue(ok(JSON.stringify({ wrong: GOOD })));
  });

  it("writes on a miss, once for two asks at the same time, and reads the store after that", async () => {
    const [first, second] = await Promise.all([
      checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" }),
      checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" }),
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ status: 200, body: { options: GOOD, answer: ANSWER, cached: false, model: "m" } });
    expect(second.body).toEqual(first.body);

    const [messages] = complete.mock.calls[0] as [{ role: string; content: string }[]];
    expect(messages[0]?.content).toContain(ANSWER);
    expect(messages[0]?.content).toContain("The body.");

    const rows = await readCheckDistractors(scratch.db, LOCAL_LEARNER_ID, ["alpha"]);
    expect(rows).toMatchObject([{ checkId: "c1", checkHash: checkHash(checks[0] as ConceptCheck), options: GOOD, provider: "nvidia" }]);

    const hit = await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" });
    expect(hit).toMatchObject({ status: 200, body: { options: GOOD, cached: true } });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("writes an edited check again, and the page's read skips the stale row meanwhile", async () => {
    await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" });
    checks = [{ ...(checks[0] as ConceptCheck), answer: "The cosine of the angle, for unit vectors." }];
    expect((await readWrittenOptions(scratch.db, LOCAL_LEARNER_ID, [{ slug: "alpha", checks }])).size).toBe(0);

    const edited = ["The sine of the angle, for unit vectors.", "The sum of their lengths.", "Their cross product's length."];
    complete.mockResolvedValue(ok(JSON.stringify({ wrong: edited })));
    const again = await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" });
    expect(again).toMatchObject({ status: 200, body: { options: edited, cached: false } });
    expect(complete).toHaveBeenCalledTimes(2);
    expect((await readWrittenOptions(scratch.db, LOCAL_LEARNER_ID, [{ slug: "alpha", checks }])).get("alpha")).toEqual({ c1: edited });
  });

  it("refuses a reply that repeats the answer, and stores nothing", async () => {
    complete.mockResolvedValue(ok(JSON.stringify({ wrong: [GOOD[0], GOOD[1], ANSWER] })));
    const refused = await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" });
    expect(refused).toMatchObject({ status: 502, body: { code: "UNSTRUCTURED_REPLY" } });
    expect(await readCheckDistractors(scratch.db, LOCAL_LEARNER_ID, ["alpha"])).toEqual([]);
  });

  it("passes on no key and a failed chain, so the page keeps the notes' options", async () => {
    complete.mockResolvedValue({ ok: false, attempts: [], code: "MISSING_API_KEY" });
    expect(await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" })).toMatchObject({
      status: 503,
      body: { code: "MISSING_API_KEY" },
    });
    complete.mockResolvedValue({ ok: false, attempts: [], code: "ALL_PROVIDERS_FAILED" });
    expect(await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" })).toMatchObject({
      status: 502,
      body: { code: "ALL_PROVIDERS_FAILED" },
    });
    expect(await readCheckDistractors(scratch.db, LOCAL_LEARNER_ID, ["alpha"])).toEqual([]);
  });

  it("keeps one learner's options from another's, for the same note", async () => {
    await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c1" });
    const theirs = await checkOptionsTurn(deps(OTHER), { conceptSlug: "alpha", checkId: "c1" });
    expect(theirs).toMatchObject({ status: 200, body: { cached: false } });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(await readCheckDistractors(scratch.db, OTHER, ["alpha"])).toHaveLength(1);
  });

  it("refuses a bad body, an unknown check and a concept it cannot read, before any model call", async () => {
    expect((await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "x1" })).status).toBe(400);
    expect((await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "../x", checkId: "c1" })).status).toBe(400);
    expect(await checkOptionsTurn(deps(LOCAL_LEARNER_ID), { conceptSlug: "alpha", checkId: "c9" })).toMatchObject({
      status: 404,
      body: { code: "CHECK_NOT_FOUND" },
    });
    const hidden: TutorDeps = { ...deps(LOCAL_LEARNER_ID), seams: { ...deps(LOCAL_LEARNER_ID).seams, readWorkspace: async () => ({ state: "not-found" }) } };
    expect((await checkOptionsTurn(hidden, { conceptSlug: "alpha", checkId: "c1" })).status).toBe(404);
    expect(complete).not.toHaveBeenCalled();
  });

  it("still answers when the store cannot be written, and the store being down reads as no rows", async () => {
    const down = Promise.reject(new Error("down"));
    down.catch(() => undefined);
    const offline: TutorDeps = { ...deps(LOCAL_LEARNER_ID), db: down };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(await checkOptionsTurn(offline, { conceptSlug: "alpha", checkId: "c1" })).toMatchObject({
        status: 200,
        body: { options: GOOD, cached: false },
      });
      expect((await readWrittenOptions(down, LOCAL_LEARNER_ID, [{ slug: "alpha", checks }])).size).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });
});
