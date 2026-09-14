import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { BriefError, loadVocabulary, validateBrief, type ValidBrief } from "./brief";
import { doctor } from "./canvas";
import { status as catalogStatus } from "./catalog";
import { CLAUDE_BIN, CONCURRENCY, HOST, PORT } from "./config";
import { run } from "./proc";
import { accept, discard } from "./review";
import { JobRefused, noteFor, Runner } from "./runner";
import type { JobRecord, JobStore } from "./store";

/**
 * The HTTP surface: JSON in, JSON out, on `127.0.0.1:7250`.
 *
 * Route conventions follow `apps/web/src/app/api/`: an `{ error, detail }`
 * envelope on failure and the validate-then-act shape of `learner-api.ts`. The
 * same-origin and rate-limit guards in `apps/web/src/lib/agent/guard.ts` are
 * deliberately **not** carried over, and that is not an omission: this server
 * binds loopback only, which is a stronger boundary than either of them.
 *
 * Every response carries a `note` — the plain-English line manimkc's
 * `_enrich_status` adds — for the same reason it does there: a caller should
 * never have to guess what a state means, and the first caller here is a model.
 *
 * `GET /api/jobs/{id}` is authoritative and the SSE stream is a cache (D8).
 * Everything the stream pushes has already been written to the ndjson, so a
 * browser that never connects sees the same job a browser watching it live saw.
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 1);
  response.writeHead(status, { ...JSON_HEADERS, "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

function fail(response: ServerResponse, status: number, error: string, detail: unknown = null): void {
  send(response, status, { error, detail });
}

async function readJson(request: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error(`the request body is larger than ${limit} bytes`);
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** One job, as every route reports it. */
function view(record: JobRecord): Record<string, unknown> {
  return {
    jobId: record.id,
    kind: record.kind,
    state: record.state,
    phase: record.phase,
    title: record.brief.title,
    topic: record.topic,
    target: record.targetPath,
    candidate: record.candidatePath,
    attempt: record.attempt,
    turns: record.turns,
    costUsd: record.costUsd,
    exitCode: record.exitCode,
    gate: record.gate,
    written: record.written,
    indexed: record.indexed,
    error: record.error,
    errorKind: record.errorKind,
    requested: record.requestedAt,
    started: record.startedAt,
    finished: record.finishedAt,
    updated: record.heartbeatAt ?? record.finishedAt ?? record.requestedAt,
    cancelRequestedAt: record.cancelRequestedAt,
    catalogErrors: record.catalogErrors,
    note: noteFor(record),
  };
}

export interface ApiDeps {
  store: JobStore;
  runner: Runner;
}

export function createApi({ store, runner }: ApiDeps): Server {
  return createServer((request, response) => {
    void handle(request, response, store, runner).catch((error: unknown) => {
      if (!response.headersSent) {
        fail(response, 500, "the studio threw handling this request", (error as Error).message);
      } else {
        response.end();
      }
    });
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  store: JobStore,
  runner: Runner,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  const method = request.method ?? "GET";

  if (segments[0] !== "api") {
    return fail(response, 404, "this server serves /api only", { path: url.pathname });
  }

  /* /api/health */
  if (segments[1] === "health" && segments.length === 2) {
    return send(response, 200, await health(store, runner));
  }

  /* /api/mirrors — phase 2 owns the canvas and the ServeHandle behind it. */
  if (segments[1] === "mirrors") {
    return fail(
      response,
      501,
      "mirrors are phase 2",
      "the runner holds no ServeHandle yet, so there is no canvas to open or close.",
    );
  }

  if (segments[1] !== "jobs") {
    return fail(response, 404, `no route ${method} ${url.pathname}`, {
      routes: ["/api/jobs", "/api/jobs/{id}", "/api/jobs/{id}/events", "/api/jobs/{id}/log", "/api/health"],
    });
  }

  /* /api/jobs */
  if (segments.length === 2) {
    if (method === "POST") return postJob(request, response, runner);
    if (method === "GET") {
      const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 25;
      const state = url.searchParams.get("state") ?? undefined;
      const jobs = store
        .list({ limit, ...(state === undefined ? {} : { state }) })
        .map((record) => view(record));
      return send(response, 200, { jobs, note: `${jobs.length} job${jobs.length === 1 ? "" : "s"}, newest first` });
    }
    return fail(response, 405, `${method} is not a thing /api/jobs does`);
  }

  const id = segments[2] ?? "";
  const record = store.get(id);
  if (record === undefined) {
    return fail(response, 404, `no job ${id}`, "GET /api/jobs lists what there is.");
  }

  /* /api/jobs/{id} */
  if (segments.length === 3) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/jobs/{id} does`);
    return send(response, 200, { ...view(record), brief: record.brief });
  }

  switch (`${method} ${segments[3]}`) {
    case "GET events":
      return events(request, response, store, record);

    case "GET log": {
      const from = Math.max(0, Number.parseInt(url.searchParams.get("from") ?? "0", 10) || 0);
      const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2_000) : 200;
      const window = await store.logWindow(id, from, limit);
      return send(response, 200, { ...window, note: `${window.total} lines on disk` });
    }

    case "POST cancel": {
      const cancelled = await runner.cancel(id);
      return send(response, 202, {
        jobId: id,
        state: cancelled.state,
        cancelRequestedAt: cancelled.cancelRequestedAt,
        note: noteFor(cancelled),
      });
    }

    case "POST accept": {
      // `accept` writes the record itself, between the renames and the catalog
      // call, so the route neither repeats nor reorders that.
      const result = await accept(store, record);
      if (!result.ok) return fail(response, 409, result.note, result.error ?? null);
      return send(response, 200, {
        jobId: id,
        state: store.get(id)?.state ?? "accepted",
        written: result.written,
        indexed: result.indexed,
        note: result.note,
      });
    }

    case "POST discard": {
      const result = await discard(store, record);
      if (!result.ok) return fail(response, 409, result.note, result.error ?? null);
      return send(response, 200, {
        jobId: id,
        state: store.get(id)?.state ?? "discarded",
        note: result.note,
      });
    }

    case "POST revise":
      return revise(request, response, runner, record);

    default:
      return fail(response, 404, `no route ${method} ${url.pathname}`);
  }
}

async function postJob(
  request: IncomingMessage,
  response: ServerResponse,
  runner: Runner,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch (error) {
    return fail(response, 400, "the request body is not JSON", (error as Error).message);
  }

  let brief: ValidBrief;
  try {
    brief = validateBrief(body, await loadVocabulary());
  } catch (error) {
    if (error instanceof BriefError) {
      return fail(response, 400, error.message, { field: error.field });
    }
    throw error;
  }

  // A8: no tldrawkc build refuses the job outright, because every job would
  // fail identically and a queue of them is a queue of identical failures.
  const checked = await doctor();
  if (checked.code !== 0) {
    return fail(response, 503, "tldrawkc cannot run on this machine, so nothing was queued", {
      doctor: checked.stdout.trim().split("\n").slice(-8),
      fix: ["git submodule update --init tools/tldrawkc", "(cd tools/tldrawkc && npm ci && npm run build)"],
    });
  }

  try {
    const { record, created, jobsAhead } = await runner.enqueue(brief);
    return send(response, created ? 201 : 200, {
      jobId: record.id,
      state: record.state,
      jobsAhead,
      created,
      note: created
        ? `queued. ${jobsAhead === 0 ? "Nothing is ahead of it" : `${jobsAhead} ahead of it`}; the runner takes ${CONCURRENCY} at a time.`
        : `this idempotency key already belongs to job ${record.id}, so nothing was queued twice`,
    });
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/**
 * `revise` makes a new job that resumes the old one's agent session.
 *
 * Not a transition on the old row, because there is no edge back to `queued`
 * from any terminal state and inventing one would make the state machine a
 * suggestion. The new job carries the parent's `agentSessionId`, so the first
 * attempt continues the stored session with a change request rather than paying
 * for the whole drawing again.
 */
async function revise(
  request: IncomingMessage,
  response: ServerResponse,
  runner: Runner,
  record: JobRecord,
): Promise<void> {
  let body: { changes?: unknown };
  try {
    body = (await readJson(request)) as { changes?: unknown };
  } catch (error) {
    return fail(response, 400, "the request body is not JSON", (error as Error).message);
  }
  const changes = typeof body.changes === "string" ? body.changes.trim() : "";
  if (changes === "") {
    return fail(response, 400, `"changes" is required: a revise with nothing to change is a re-run`);
  }
  if (record.state === "awaiting_review" || record.state === "queued" || record.state === "running") {
    return fail(
      response,
      409,
      `job ${record.id} is ${record.state} and still holds ${record.targetPath}. Accept or discard ` +
        `it first: two jobs cannot hold one committed path.`,
    );
  }

  try {
    const { record: next } = await runner.enqueue({
      ...record.brief,
      notes: [record.brief.notes, `Change requested: ${changes}`].filter(Boolean).join("\n\n"),
      idempotencyKey: `${record.idempotencyKey}:revise:${Date.now()}`,
    });
    return send(response, 201, {
      jobId: next.id,
      state: next.state,
      parentJob: record.id,
      note: `queued as a revision of ${record.id}`,
    });
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/**
 * The SSE stream. A subscription to something the runner already holds, so it
 * costs nothing, and a reconnect replays from `Last-Event-ID`.
 */
function events(
  request: IncomingMessage,
  response: ServerResponse,
  store: JobStore,
  record: JobRecord,
): void {
  const header = request.headers["last-event-id"];
  const after = Number.parseInt(Array.isArray(header) ? (header[0] ?? "0") : (header ?? "0"), 10);
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  const write = (event: { seq: number; type: string }): void => {
    response.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const { replay, omitted, unsubscribe } = store.subscribe(
    record.id,
    Number.isFinite(after) ? after : 0,
    write,
  );
  if (omitted > 0) {
    response.write(`: ${omitted} events omitted, the buffer only keeps the most recent\n\n`);
  }
  for (const event of replay) write(event);

  // A comment line every twenty seconds, so a proxy or a sleeping laptop does
  // not silently drop a stream that is simply waiting for a slow turn.
  const keepAlive = setInterval(() => response.write(": keep-alive\n\n"), 20_000);
  request.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}

/** What is and is not working right now. */
async function health(store: JobStore, runner: Runner): Promise<Record<string, unknown>> {
  const [checked, claudeVersion, catalog] = await Promise.all([
    doctor().catch(() => null),
    run(CLAUDE_BIN, ["--version"], { timeoutMs: 30_000 }).catch(() => null),
    catalogStatus().catch(() => null),
  ]);
  const queueDepth = store.list({ state: "queued" }).length;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const costLast24h = store
    .list()
    .filter((record) => Date.parse(record.requestedAt) >= since)
    .reduce((total, record) => total + (record.costUsd ?? 0), 0);

  const tldrawkc = checked !== null && checked.code === 0;
  const claude = claudeVersion !== null && claudeVersion.code === 0;
  const postgres = catalog !== null && catalog.ok;
  return {
    ok: tldrawkc && claude,
    tldrawkc,
    // `doctor` checks Chromium as one of its lines, so a separate probe would
    // be a second answer to a question the tool already answers.
    chromium: tldrawkc,
    claude,
    claudeVersion: claudeVersion?.stdout.trim() ?? null,
    postgres,
    queueDepth,
    running: runner.busy,
    costLast24h: Number(costLast24h.toFixed(4)),
    note: !tldrawkc
      ? "tldrawkc cannot run, so no job can be queued. Build the submodule."
      : !claude
        ? "the claude CLI is not on PATH, so no job can be spawned."
        : postgres
          ? "everything is answering"
          : "not connected to the catalog: browsing and drawing still work, and accept will report indexed: false",
  };
}
