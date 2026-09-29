import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { STUDIO_OWNER_HEADER } from "@self-learn/schema/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  absolute,
  candidatePath,
  candidateSvgPath,
  jobDir,
  scratchDir,
  shotPath,
  targetPath,
  targetSvgPath,
  workDir,
  workPath,
} from "../src/paths";
import type { JobRecord } from "../src/store";
import type { Runner } from "../src/runner";
import { fixtureDocument } from "./fixture-document";
import { topicListAnswer, topicListDown } from "./vocabulary";

/**
 * The routes, over a real socket on an ephemeral port.
 *
 * Only the two that decide something rather than reporting it: `revise`, which
 * has to work out what mode a revision is, and the route table, which is what
 * tells a caller that `reindex` exists at all.
 */

const canvasMock = vi.hoisted(() => ({
  doctor: vi.fn(),
  /** Set by a test that fakes a verb; every other test runs the real tool. */
  verb: null as null | ((args: string[]) => Promise<unknown>),
}));
vi.mock("../src/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas")>();
  return {
    ...actual,
    doctor: canvasMock.doctor,
    canvas: (args: string[], ...rest: unknown[]) =>
      canvasMock.verb === null ? (actual.canvas as (...a: unknown[]) => unknown)(args, ...rest) : canvasMock.verb(args),
  };
});

const catalogMock = vi.hoisted(() => ({
  diagramShow: vi.fn(),
  diagramCheckout: vi.fn(),
  diagramList: vi.fn(),
  diagramPut: vi.fn(),
  diagramCommit: vi.fn(),
  jobAccept: vi.fn(),
  jobDiscard: vi.fn(),
  topicList: vi.fn(),
  status: vi.fn(),
  preferenceGet: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/catalog")>();
  return { ...actual, ...catalogMock };
});

/** The diagram's latest revision as the fake catalog answers it. */
let latestRevision = 5;

const { createApi } = await import("../src/api");
const { JobStore } = await import("../src/store");
const { Mirrors } = await import("../src/mirrors");

const SLUG = "studio-api-fixture";

function record(over: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-api",
    kind: "diagram",
    state: "accepted",
    phase: null,
    brief: {
      intent: "show the projection",
      topic: "vector-and-linear-algebra-basics",
      slug: SLUG,
      title: "Dot product",
      mode: "new",
      elements: [{ label: "vector a" }],
      relations: [],
      concepts: [],
      model: "sonnet",
      idempotencyKey: "k",
    },
    targetPath: targetPath(SLUG),
    targetSvgPath: targetSvgPath(SLUG),
    candidatePath: candidatePath("job-api", SLUG),
    candidateSvgPath: candidateSvgPath("job-api", SLUG),
    topic: "vector-and-linear-algebra-basics",
    slug: SLUG,
    attempt: 1,
    sessionId: "studio-job-api",
    agentSessionId: "33333333-3333-4333-8333-333333333333",
    parentJobId: null,
    changes: null,
    idempotencyKey: "k",
    targetHashBefore: null,
    requestedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    reviewedAt: new Date().toISOString(),
    heartbeatAt: null,
    cancelRequestedAt: null,
    exitCode: 0,
    turns: 11,
    costUsd: 0.5,
    costSource: null,
    gate: null,
    errorKind: null,
    error: null,
    written: [targetPath(SLUG)],
    indexed: true,
    catalogErrors: [],
    ...over,
  };
}

let store: InstanceType<typeof JobStore>;
let server: ReturnType<typeof createApi>;
let mirrors: InstanceType<typeof Mirrors>;
let base: string;
const enqueued: { brief: Record<string, unknown>; parent?: Record<string, unknown> }[] = [];

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-api-${Date.now()}-${Math.random()}`);
  store = new JobStore();
  enqueued.length = 0;
  canvasMock.doctor.mockResolvedValue({ code: 0, signal: null, stdout: "", stderr: "", json: null, timedOut: false });
  latestRevision = 5;
  canvasMock.verb = null;
  catalogMock.diagramCommit.mockReset();
  const answer = (json: unknown) => ({ ok: true, json, error: null, offline: false });
  catalogMock.diagramShow.mockImplementation(async () =>
    answer({ ok: true, diagram: { revision: latestRevision, revisionJob: null }, checkout: null }),
  );
  catalogMock.diagramCheckout.mockImplementation(async () => answer({ ok: true, exists: false, revision: null, note: "no diagram" }));
  catalogMock.diagramList.mockResolvedValue(answer({ ok: true, diagrams: [] }));
  catalogMock.diagramPut.mockResolvedValue(answer({ ok: true, revision: 6, changed: true }));
  catalogMock.jobAccept.mockResolvedValue(answer({}));
  catalogMock.jobDiscard.mockResolvedValue(answer({}));
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.status.mockResolvedValue(answer({}));
  // No stored agent preference: the defaults, and never the machine's own row.
  catalogMock.preferenceGet.mockReset().mockResolvedValue(answer({ ok: true, value: null, updatedAt: null }));

  const runner = {
    enqueue: (brief: Record<string, unknown>, parent?: Record<string, unknown>) => {
      enqueued.push({ brief, ...(parent === undefined ? {} : { parent }) });
      return Promise.resolve({
        record: { ...record({ id: "job-revision", state: "queued" }), brief },
        created: true,
        jobsAhead: 0,
      });
    },
    busy: 0,
    // What `/api/health` reads about spend; nothing has been spent here.
    capStatus: () => ({ capUsd: null, exceeded: false, totalUsd: 0, jobs: 0, oldestCountedAt: null, oldestAgesOutAt: null }),
    // Whether there is a diagram to extend: the checkout on disk stands in for
    // the catalog's answer here, as it does in the runner with Postgres down.
    startingPoint: async (slug: string) => ({
      exists: existsSync(workPath(slug)),
      revision: null,
      hash: null,
    }),
  } as unknown as Runner;

  mirrors = new Mirrors();
  server = createApi({ store, runner, mirrors });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(absolute(targetPath(SLUG)), { force: true });
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  delete process.env.STUDIO_HOME;
});

describe("revising a diagram that was accepted", () => {
  it("queues it as an extend, because accepting it put a file at the target path", async () => {
    // The commonest revision there is: "change the diagram I just made". The
    // brief said `new`, and re-posting `new` walks into the guard that refuses
    // a `new` brief over an existing target — so the route was unreachable for
    // exactly the case it exists for.
    await mkdir(workDir(), { recursive: true });
    await writeFile(workPath(SLUG), fixtureDocument(), "utf8");
    await store.create(record());

    const response = await fetch(`${base}/api/jobs/job-api/revise`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changes: "make the arrow labels bigger" }),
    });

    expect(response.status).toBe(201);
    expect(enqueued[0]?.brief.mode).toBe("extend");
    // And it continues the parent's session rather than redrawing from nothing.
    expect(enqueued[0]?.parent).toMatchObject({
      jobId: "job-api",
      agentSessionId: "33333333-3333-4333-8333-333333333333",
      changes: "make the arrow labels bigger",
    });
  });

  it("stays a new job when the target is not there, which is what a discard leaves", async () => {
    await store.create(record({ state: "discarded" }));

    const response = await fetch(`${base}/api/jobs/job-api/revise`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changes: "try again, wider" }),
    });

    expect(response.status).toBe(201);
    expect(enqueued[0]?.brief.mode).toBe("new");
  });

  it("refuses a revision with nothing to change", async () => {
    await store.create(record());
    const response = await fetch(`${base}/api/jobs/job-api/revise`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    expect(enqueued).toHaveLength(0);
  });
});

describe("resuming a job the runner died under", () => {
  /**
   * A7's Resume button, and the reason it is not `revise`.
   *
   * `revise` refuses a request with nothing to change, which is correct and
   * which makes it the wrong route for an interruption: nothing about the job
   * was wrong, so a Resume routed through it had to invent a change request and
   * record it as one a person made.
   */
  it("continues the interrupted job's session with no change request", async () => {
    await store.create(record({ state: "interrupted", errorKind: "interrupted" }));

    const response = await fetch(`${base}/api/jobs/job-api/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(201);
    expect(enqueued[0]?.parent).toMatchObject({
      jobId: "job-api",
      agentSessionId: "33333333-3333-4333-8333-333333333333",
      changes: null,
    });
    // No `Change requested:` line appended to the brief's notes, because
    // nobody requested one.
    expect(enqueued[0]?.brief.notes).toBeUndefined();
  });

  it("is a new job when the target is not there, and an extend when it is", async () => {
    await mkdir(workDir(), { recursive: true });
    await writeFile(workPath(SLUG), fixtureDocument(), "utf8");
    await store.create(record({ state: "interrupted" }));

    const response = await fetch(`${base}/api/jobs/job-api/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(201);
    expect(enqueued[0]?.brief.mode).toBe("extend");
  });

  /**
   * Two clicks on Resume must not buy two agents.
   *
   * The state check cannot serialise concurrent requests on its own — both see
   * an `interrupted` parent — so the key they carry has to be the same one, and
   * `job.idempotency_key` is unique. A timestamped key made every press a new
   * paid job against the same candidate. Caught in review on the phase 3 PR.
   */
  it("carries the same idempotency key however many times it is pressed", async () => {
    await store.create(record({ state: "interrupted", finishedAt: "2026-09-18T15:32:00.000Z" }));

    const press = (): Promise<Response> =>
      fetch(`${base}/api/jobs/job-api/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
    const [first, second] = await Promise.all([press(), press()]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(enqueued).toHaveLength(2);
    expect(enqueued[0]?.brief.idempotencyKey).toBe(enqueued[1]?.brief.idempotencyKey);
    // And it is derived from the interruption rather than from the clock.
    expect(String(enqueued[0]?.brief.idempotencyKey)).toContain("resume:2026-09-18T15:32:00.000Z");
  });

  it.each(["failed", "cancelled", "awaiting_review", "accepted"] as const)(
    "refuses a %s job, which has a verdict on it rather than a half-finished attempt",
    async (state) => {
      await store.create(record({ state }));
      const response = await fetch(`${base}/api/jobs/job-api/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      expect(response.status).toBe(409);
      expect(enqueued).toHaveLength(0);
    },
  );
});

describe("a page in the user's own browser", () => {
  /**
   * Loopback binding stops the network and not a browser on this machine. A
   * site the user visits can POST here; it cannot read the reply, but a paid
   * agent session with filesystem access has already started by then.
   */
  it("cannot enqueue with a content type that needs no preflight", async () => {
    const response = await fetch(`${base}/api/jobs`, {
      method: "POST",
      // One of the three types a browser sends without asking permission first,
      // which is what made this a fire-and-forget POST from any page.
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ intent: "x", topic: "vector-and-linear-algebra-basics" }),
    });
    expect(response.status).toBe(403);
    expect(enqueued).toHaveLength(0);
  });

  it("cannot enqueue while carrying a site's Origin", async () => {
    const response = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ intent: "x" }),
    });
    expect(response.status).toBe(403);
    expect(enqueued).toHaveLength(0);
  });

  it("cannot reach it through a name that merely resolves to 127.0.0.1", async () => {
    // DNS rebinding: the attacker's own name, re-pointed at loopback, which is
    // how a page reaches a local service while looking same-origin to itself.
    // Raw `http`, because `fetch` will not let a caller set Host — a browser
    // sets it from the URL, which is exactly what makes the attack work.
    const { request } = await import("node:http");
    const { port } = server.address() as AddressInfo;
    const status = await new Promise<number>((resolve, reject) => {
      const call = request(
        { host: "127.0.0.1", port, path: "/api/health", headers: { host: `rebind.example:${port}` } },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      call.on("error", reject);
      call.end();
    });
    expect(status).toBe(403);
  });

  it("refuses a cross-site request even when every other header looks right", async () => {
    const response = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ intent: "x" }),
    });
    expect(response.status).toBe(403);
    expect(enqueued).toHaveLength(0);
  });

  it("lets a program through, which is the caller this API is for", async () => {
    // curl sends no Origin, and neither does the app's proxy route handler,
    // which strips it deliberately. A `next.config.ts` rewrite would *not*
    // qualify: measured in phase 2, it forwards the browser's Origin verbatim
    // and this guard refuses it. See `app/studio/api/[...segments]/route.ts`.
    await store.create(record({ state: "discarded" }));
    const response = await fetch(`${base}/api/jobs/job-api/revise`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changes: "wider" }),
    });
    expect(response.status).toBe(201);
  });
});

describe("a job's two screenshots", () => {
  it("streams the after picture as a PNG", async () => {
    await store.create(record({ state: "awaiting_review" }));
    await mkdir(jobDir("job-api"), { recursive: true });
    await writeFile(shotPath("job-api", "after"), "not really a png, but bytes", "utf8");

    const response = await fetch(`${base}/api/jobs/job-api/shot?which=after`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    // Never sniffed into something executable: these bytes are written by a
    // tool and served back to an `<img>`, and that is all they are for.
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  /**
   * The commonest 404 here is not an error, and the panel already said so in
   * words: a `new` job had no diagram to photograph.
   */
  it("404s the before picture of a job that had no before", async () => {
    await store.create(record({ state: "awaiting_review" }));
    const response = await fetch(`${base}/api/jobs/job-api/shot?which=before`);
    expect(response.status).toBe(404);
  });

  it("reads anything but `before` as the after picture rather than as a path", async () => {
    // `which` never becomes a filename. A request naming something else gets
    // the after picture, which is the safe reading of a parameter with two
    // legal values.
    await store.create(record({ state: "awaiting_review" }));
    await mkdir(jobDir("job-api"), { recursive: true });
    await writeFile(shotPath("job-api", "after"), "bytes", "utf8");
    const response = await fetch(`${base}/api/jobs/job-api/shot?which=../../etc/passwd`);
    expect(response.status).toBe(200);
  });
});

describe("the live picture", () => {
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("pixels", "utf8"),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
  ]);

  it("is a 404 before the agent has taken a picture, which the tile reads as blank", async () => {
    await store.create(record({ state: "running" }));
    const response = await fetch(`${base}/api/jobs/job-api/shot?which=live`);
    expect(response.status).toBe(404);
  });

  it("streams the newest PNG in the job's scratch, and answers a repeat with a 304", async () => {
    await store.create(record({ state: "running" }));
    await mkdir(scratchDir("job-api"), { recursive: true });
    await writeFile(path.join(scratchDir("job-api"), "pass1.png"), PNG);

    const first = await fetch(`${base}/api/jobs/job-api/shot?which=live`);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/png");
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    expect(Buffer.from(await first.arrayBuffer()).equals(PNG)).toBe(true);
    const etag = first.headers.get("etag");
    expect(etag).toMatch(/^"live-/);

    const again = await fetch(`${base}/api/jobs/job-api/shot?which=live`, {
      headers: { "if-none-match": etag ?? "" },
    });
    expect(again.status).toBe(304);
    expect(again.headers.get("etag")).toBe(etag);
  });

  it("never reads the comparison pictures or another job's scratch as live", async () => {
    await store.create(record({ state: "running" }));
    await mkdir(jobDir("job-api"), { recursive: true });
    await writeFile(shotPath("job-api", "after"), PNG);
    await mkdir(scratchDir("other-job"), { recursive: true });
    await writeFile(path.join(scratchDir("other-job"), "pass1.png"), PNG);
    const response = await fetch(`${base}/api/jobs/job-api/shot?which=live`);
    expect(response.status).toBe(404);
  });

  it("is refused to any owner but the one this runner serves", async () => {
    await store.create(record({ state: "running" }));
    await mkdir(scratchDir("job-api"), { recursive: true });
    await writeFile(path.join(scratchDir("job-api"), "pass1.png"), PNG);
    const response = await fetch(`${base}/api/jobs/job-api/shot?which=live`, {
      headers: { [STUDIO_OWNER_HEADER]: "somebody-else" },
    });
    expect(response.status).toBe(403);
  });
});

describe("accepting", () => {
  /**
   * A6: the writer goes before the rename, and **only** before a rename.
   *
   * `serve` holds the document as its tab last loaded it and Cmd+S PUTs the
   * whole thing back, so a human save landing after the rename would silently
   * revert the accepted diagram. Closed by the runner rather than by the page,
   * because a close the browser is responsible for is one a curl can skip.
   */
  it("closes an open mirror on the target when the accept is going to happen", async () => {
    await mkdir(path.dirname(candidatePath("job-api", SLUG)), { recursive: true });
    await writeFile(candidatePath("job-api", SLUG), fixtureDocument(), "utf8");
    await store.create(record({ state: "awaiting_review", targetHashBefore: null }));
    const stop = vi.spyOn(mirrors, "stop").mockResolvedValue({ found: true, gone: true });

    const response = await fetch(`${base}/api/jobs/job-api/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const body = (await response.json()) as { mirrorClosed?: boolean };

    expect(response.status).toBe(200);
    expect(stop).toHaveBeenCalledWith(targetPath(SLUG));
    expect(body.mirrorClosed).toBe(true);
  });

  /**
   * And a refusal leaves it open.
   *
   * Closing at the top of the route meant a stale tab pressing Accept on a job
   * somebody had already discarded disconnected the canvas its owner was
   * drawing on, and then answered 409 about a job that never moved a file.
   * Caught in review on the phase 4 PR.
   */
  it.each(["discarded", "accepted", "failed"] as const)(
    "leaves the mirror alone when the job is %s and nothing can move",
    async (state) => {
      await store.create(record({ state }));
      const stop = vi.spyOn(mirrors, "stop").mockResolvedValue({ found: true, gone: true });

      const response = await fetch(`${base}/api/jobs/job-api/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(409);
      expect(stop).not.toHaveBeenCalled();
    },
  );

  it("leaves the mirror alone when the candidate is gone", async () => {
    await store.create(record({ state: "awaiting_review" }));
    const stop = vi.spyOn(mirrors, "stop").mockResolvedValue({ found: true, gone: true });

    const response = await fetch(`${base}/api/jobs/job-api/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(409);
    expect(stop).not.toHaveBeenCalled();
  });

  it("flags a moved diagram as one the UI should offer to re-compare, not retry", async () => {
    // The candidate is there and the diagram was committed under it, which is S4.
    await mkdir(path.dirname(candidatePath("job-api", SLUG)), { recursive: true });
    await writeFile(candidatePath("job-api", SLUG), fixtureDocument(), "utf8");
    latestRevision = 9;
    await store.create(record({ state: "awaiting_review", targetRevisionBefore: 5 }));

    const response = await fetch(`${base}/api/jobs/job-api/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const body = (await response.json()) as { error: string; detail: { recompare: boolean } };

    expect(response.status).toBe(409);
    expect(body.error).toContain("has changed since this job started");
    expect(body.detail.recompare).toBe(true);
  });
});

describe("comparing again", () => {
  /**
   * Two Chromium launches, a screenshot overwritten and a comparison persisted.
   * On a `running` job that races the runner's own writes to the same field; on
   * a terminal one it replaces the record of what was reviewed with a
   * description of a file nobody looked at. Neither is a recovery. Caught in
   * review on the phase 4 PR.
   */
  it.each(["queued", "running", "accepted", "discarded", "failed"] as const)(
    "refuses a %s job rather than rewriting its comparison",
    async (state) => {
      await store.create(record({ state, comparison: null }));
      const response = await fetch(`${base}/api/jobs/job-api/compare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      expect(response.status).toBe(409);
      // And nothing was written over the record on the way to refusing.
      expect(store.get("job-api")?.comparison ?? null).toBeNull();
    },
  );
});

describe("the vocabulary", () => {
  const get = async (route: string) => {
    const response = await fetch(`${base}${route}`);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  it("is the catalog's topic list, titles and domains included, and fresh", async () => {
    const { status, body } = await get("/api/vocabulary");
    expect(status).toBe(200);
    expect(catalogMock.topicList).toHaveBeenCalled();
    expect(body.stale).toBe(false);
    expect(typeof body.readAt).toBe("string");
    expect(body.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "tcp-congestion-control", title: "TCP congestion control", domain: "networking" }),
      ]),
    );
  });

  it("answers from the cached copy, stale since it was read, when the catalog is down", async () => {
    const fresh = await get("/api/vocabulary");
    catalogMock.topicList.mockResolvedValue(topicListDown());
    const { status, body } = await get("/api/vocabulary");
    expect(status).toBe(200);
    expect(body.stale).toBe(true);
    expect(body.readAt).toBe(fresh.body.readAt);
    expect(String(body.error)).toContain("exited 3");
    expect((body.topics as unknown[]).length).toBe(2);
  });

  it("is a 503 with readAt null when there is no copy either", async () => {
    catalogMock.topicList.mockResolvedValue(topicListDown());
    const { status, body } = await get("/api/vocabulary");
    expect(status).toBe(503);
    expect(body.detail).toEqual({ readAt: null, stale: true });
  });

  it("is what /api/health reports on: fresh, then stale with the copy's readAt, then no copy", async () => {
    // Health reuses the last read any route made, so each step is a read by
    // the vocabulary route and then the health line that reports it.
    await get("/api/vocabulary");
    const fresh = (await get("/api/health")).body.vocabulary as { stale: boolean; readAt: string };
    expect(fresh.stale).toBe(false);
    catalogMock.topicList.mockResolvedValue(topicListDown());
    await get("/api/vocabulary");
    const stale = (await get("/api/health")).body.vocabulary as { stale: boolean; readAt: string; error: string };
    expect(stale).toMatchObject({ stale: true, readAt: fresh.readAt });
    expect(stale.error).toContain("ECONNREFUSED");
    await rm(path.join(process.env.STUDIO_HOME ?? "", "cache"), { recursive: true, force: true });
    await get("/api/vocabulary");
    const none = (await get("/api/health")).body.vocabulary as { stale: boolean; readAt: string | null };
    expect(none).toMatchObject({ stale: true, readAt: null });
  }, 60_000);

  it("reports a studio home the diagram agent cannot use as a diagram-agent problem, and nothing else", async () => {
    const saved = process.env.STUDIO_HOME;
    const ok = (await get("/api/health")).body;
    expect(ok.diagramAgent).toEqual({ ok: true, problem: null });
    process.env.STUDIO_HOME = `${saved}-$dollar`;
    try {
      const body = (await get("/api/health")).body;
      expect(body.diagramAgent).toMatchObject({ ok: false, problem: expect.stringContaining('"$"') });
      // The tool is as healthy as it was: only queueing a job is refused.
      expect(body.tldrawkc).toBe(ok.tldrawkc);
      if (ok.tldrawkc === true && ok.claude === true) expect(body.note).toContain("no diagram job can be queued");
    } finally {
      process.env.STUDIO_HOME = saved;
    }
  }, 60_000);

  it("does not spawn a topic listing per health call, and reads again once the last read is old", async () => {
    await get("/api/vocabulary");
    const calls = catalogMock.topicList.mock.calls.length;
    await get("/api/health");
    await get("/api/health");
    expect(catalogMock.topicList.mock.calls.length).toBe(calls);
    // Past the reuse window: concurrent callers share one read.
    const { vocabularyStatus } = await import("../src/brief");
    const [first, second] = await Promise.all([vocabularyStatus(0), vocabularyStatus(0)]);
    expect(catalogMock.topicList.mock.calls.length).toBe(calls + 1);
    expect(first).toEqual(second);
    expect(first.stale).toBe(false);
  }, 60_000);

  it("checks a brief against the catalog's topics, and refuses one it does not list", async () => {
    const post = (topic: string) =>
      fetch(`${base}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "show the window halving",
          topic,
          slug: SLUG,
          title: "Congestion window",
          mode: "new",
          elements: [{ label: "window" }],
          relations: [],
        }),
      });
    const refused = await post("not-in-the-catalog");
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain("catalog's vocabulary");
    const queued = await post("tcp-congestion-control");
    expect(queued.status).toBe(201);
    expect(enqueued.at(-1)?.brief.topic).toBe("tcp-congestion-control");
  });

  it("refuses a brief with a 503 when the topics cannot be read at all", async () => {
    catalogMock.topicList.mockResolvedValue(topicListDown());
    const response = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "x", topic: "tcp-congestion-control" }),
    });
    expect(response.status).toBe(503);
    expect(enqueued).toHaveLength(0);
  });
});

describe("the agent's model and effort", () => {
  const savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  afterEach(() => {
    if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  });

  it("are on the job, beside the model its session said it was", async () => {
    await store.create(
      record({
        agentModel: { requested: "opus", passed: "opus", source: "panel" },
        agentEffort: { requested: "default", passed: "high", source: "claude-settings" },
        resolvedModel: "claude-opus-5",
      }),
    );
    const body = (await (await fetch(`${base}/api/jobs/job-api`)).json()) as Record<string, unknown>;
    expect(body.agentModel).toEqual({ requested: "opus", passed: "opus", source: "panel" });
    expect(body.agentEffort).toEqual({ requested: "default", passed: "high", source: "claude-settings" });
    expect(body.resolvedModel).toBe("claude-opus-5");
  });

  it("are null on a job recorded before the settings panel", async () => {
    await store.create(record());
    const body = (await (await fetch(`${base}/api/jobs/job-api`)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ agentModel: null, agentEffort: null, resolvedModel: null });
  });

  it("are what health says a diagram job started now would get, from the panel's row", async () => {
    const dir = path.join(process.env.STUDIO_HOME ?? "", "claude-config");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "settings.json"), JSON.stringify({ model: "claude-fable-5-1", effortLevel: "high" }), "utf8");
    process.env.CLAUDE_CONFIG_DIR = dir;
    catalogMock.preferenceGet.mockImplementation(async (key: string) => ({
      ok: true,
      json: { ok: true, value: key === "studioDiagramAgent" ? { model: "opus", effort: "default" } : null, updatedAt: null },
      error: null,
      offline: false,
    }));
    const body = (await (await fetch(`${base}/api/health`)).json()) as { agent: Record<string, unknown> };
    expect(body.agent.diagram).toEqual({
      model: { requested: "opus", passed: "opus", source: "panel" },
      effort: { requested: "default", passed: "high", source: "claude-settings" },
    });
    expect(body.agent.video).toEqual({
      model: { requested: "default", passed: "claude-fable-5-1", source: "claude-settings" },
      effort: { requested: "default", passed: "high", source: "claude-settings" },
    });
  });
});

describe("the route table", () => {
  it("names reindex, so a caller looking at a 404 can find the recovery", async () => {
    const response = await fetch(`${base}/api/nothing`);
    const body = (await response.json()) as { detail: { routes: string[] } };
    expect(response.status).toBe(404);
    expect(body.detail.routes.join(" ")).toContain("reindex");
  });

  it("names the diagram and mirror routes phase 2 added", async () => {
    const response = await fetch(`${base}/api/nothing`);
    const body = (await response.json()) as { detail: { routes: string[] } };
    expect(body.detail.routes.join(" ")).toContain("/api/diagrams");
    expect(body.detail.routes.join(" ")).toContain("/api/mirrors");
    expect(body.detail.routes.join(" ")).toContain("/api/vocabulary");
  });
});

describe("naming a diagram", () => {
  it.each(["..%2Fsecrets", "a..b", "a b"])(
    "refuses %j before it builds a path from it",
    async (name) => {
      // The route joins this onto `learn/assets`, so a name that is not one
      // slug-shaped segment is refused rather than cleaned up: there is no
      // correct file for it, and a sanitiser that guesses is the bug.
      const response = await fetch(`${base}/api/diagrams/${name}/svg`);
      expect(response.status).toBe(400);
    },
  );

  it("404s a well-formed name with no file, rather than streaming nothing", async () => {
    const response = await fetch(`${base}/api/diagrams/not-a-real-diagram/svg`);
    expect(response.status).toBe(404);
  });

  it("refuses a verb sent as a GET, because a verb writes a file", async () => {
    const response = await fetch(`${base}/api/diagrams/${SLUG}/export`);
    expect(response.status).toBe(405);
  });
});

describe("Export SVG", () => {
  const answer = (json: unknown) => ({ ok: true, json, error: null, offline: false });
  /** The checkout as `diagram show` reports it: clean before the export, edited after it, as the new SVG makes it. */
  function checkoutReads(...dirty: boolean[]) {
    for (const d of dirty) {
      catalogMock.diagramShow.mockResolvedValueOnce(
        answer({ ok: true, diagram: { revision: 5 }, checkout: { record: { revision: 5 }, dirty: d, behind: false } }),
      );
    }
  }

  beforeEach(() => {
    catalogMock.diagramCheckout.mockImplementation(async () => answer({ ok: true, exists: true, revision: 5, note: "checked out" }));
    canvasMock.verb = async () => ({ code: 0, signal: null, stdout: "", stderr: "", json: { ok: true }, timedOut: false });
    catalogMock.diagramCommit.mockResolvedValue(answer({ ok: true, revision: 6, changed: true }));
  });

  it("stores the fresh SVG when the document held no edits before it, though the export itself changed the checkout", async () => {
    checkoutReads(false, true);
    const response = await fetch(`${base}/api/diagrams/${SLUG}/export`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await response.json()) as { note: string };
    expect(response.status).toBe(200);
    expect(body.note).toBe("export finished and the SVG is stored");
    expect(catalogMock.diagramCommit).toHaveBeenCalledTimes(1);
  });

  it("leaves the SVG for the next commit when the canvas held edits nobody committed", async () => {
    checkoutReads(true, true);
    const response = await fetch(`${base}/api/diagrams/${SLUG}/export`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await response.json()) as { note: string };
    expect(response.status).toBe(200);
    expect(body.note).toMatch(/waits for the next commit/);
    expect(catalogMock.diagramCommit).not.toHaveBeenCalled();
  });

  it("refuses to run a verb on a checkout the catalog could not bring up to date", async () => {
    catalogMock.diagramCheckout.mockImplementation(async () => ({
      ok: false,
      json: { ok: false, code: "unreadable", error: "blob sha mismatch" },
      error: "blob sha mismatch",
      offline: false,
    }));
    const response = await fetch(`${base}/api/diagrams/${SLUG}/export`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(response.status).toBe(502);
    expect(catalogMock.diagramCommit).not.toHaveBeenCalled();
  });
});

describe("the mirror routes", () => {
  it("answers an empty list before anything is open", async () => {
    const response = await fetch(`${base}/api/mirrors`);
    const body = (await response.json()) as { mirrors: unknown[]; note: string };
    expect(response.status).toBe(200);
    expect(body.mirrors).toEqual([]);
    expect(body.note).toBe("no canvas is open");
  });

  it("refuses a file outside learn/assets, whatever it is spelled as", async () => {
    const response = await fetch(`${base}/api/mirrors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "../../etc/passwd" }),
    });
    expect(response.status).toBe(400);
  });

  it("needs the file named on a DELETE rather than closing everything", async () => {
    const response = await fetch(`${base}/api/mirrors`, { method: "DELETE" });
    expect(response.status).toBe(400);
  });

  it("says nothing was mirroring a file that was not open", async () => {
    const response = await fetch(
      `${base}/api/mirrors?file=${encodeURIComponent("learn/assets/never-opened.tldr")}`,
      { method: "DELETE" },
    );
    const body = (await response.json()) as { stopped: boolean };
    expect(response.status).toBe(200);
    expect(body.stopped).toBe(false);
  });
});
