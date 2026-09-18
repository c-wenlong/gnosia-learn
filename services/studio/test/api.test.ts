import type { AddressInfo } from "node:net";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { absolute, targetPath, targetSvgPath, candidatePath, candidateSvgPath } from "../src/paths";
import type { JobRecord } from "../src/store";
import type { Runner } from "../src/runner";

/**
 * The routes, over a real socket on an ephemeral port.
 *
 * Only the two that decide something rather than reporting it: `revise`, which
 * has to work out what mode a revision is, and the route table, which is what
 * tells a caller that `reindex` exists at all.
 */

const canvasMock = vi.hoisted(() => ({ doctor: vi.fn() }));
vi.mock("../src/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas")>();
  return { ...actual, doctor: canvasMock.doctor };
});

const { createApi } = await import("../src/api");
const { JobStore } = await import("../src/store");

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
    candidatePath: candidatePath(SLUG),
    candidateSvgPath: candidateSvgPath(SLUG),
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
let base: string;
const enqueued: { brief: Record<string, unknown>; parent?: Record<string, unknown> }[] = [];

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-api-${Date.now()}-${Math.random()}`);
  store = new JobStore();
  enqueued.length = 0;
  canvasMock.doctor.mockResolvedValue({ code: 0, signal: null, stdout: "", stderr: "", json: null, timedOut: false });

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
  } as unknown as Runner;

  server = createApi({ store, runner });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
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
    await mkdir(absolute("learn/assets"), { recursive: true });
    await writeFile(absolute(targetPath(SLUG)), "{}", "utf8");
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
    // curl and the Next rewrite (a server-side fetch) send no Origin at all.
    await store.create(record({ state: "discarded" }));
    const response = await fetch(`${base}/api/jobs/job-api/revise`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changes: "wider" }),
    });
    expect(response.status).toBe(201);
  });
});

describe("the route table", () => {
  it("names reindex, so a caller looking at a 404 can find the recovery", async () => {
    const response = await fetch(`${base}/api/nothing`);
    const body = (await response.json()) as { detail: { routes: string[] } };
    expect(response.status).toBe(404);
    expect(body.detail.routes.join(" ")).toContain("reindex");
  });
});
