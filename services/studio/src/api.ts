import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { BriefError, loadVocabulary, validateBrief, type ValidBrief } from "./brief";
import { canvas, doctor, doctorChecks, type DoctorCheck } from "./canvas";
import { status as catalogStatus } from "./catalog";
import { CLAUDE_BIN, CONCURRENCY, HOST, PORT, VERB_TIMEOUT_MS } from "./config";
import { recompare } from "./compare";
import { isDiagramName, listDiagrams, readDiagram } from "./diagrams";
import { MirrorRefused, type Mirrors } from "./mirrors";
import { absolute, shotPath, targetPath, targetSvgPath } from "./paths";
import { run } from "./proc";
import { accept, discard, reindex } from "./review";
import { JobRefused, noteFor, Runner } from "./runner";
import type { JobRecord, JobStore } from "./store";

/**
 * The HTTP surface: JSON in, JSON out, on `127.0.0.1:7250`.
 *
 * Route conventions follow `apps/web/src/app/api/`: an `{ error, detail }`
 * envelope on failure and the validate-then-act shape of `learner-api.ts`. The
 * rate-limit guard in `apps/web/src/lib/agent/guard.ts` is deliberately not
 * carried over: loopback binding means there is no anonymous internet to meter,
 * and A10's five cost guards are where a runaway is caught.
 *
 * The same-origin half **is** carried over, and `guard` below is why: loopback
 * binding is a boundary against the network and not against a browser running
 * on this machine, which is a distinction D10 did not draw and phase 1 had to.
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

/** The loopback names that are this machine, and nothing that merely resolves to it. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Is `value` an authority naming this very socket?
 *
 * The port comes from the socket rather than from `PORT`, so a server listening
 * on an ephemeral port — which is how the tests run it — is judged against the
 * port it actually got.
 */
function isOwnAuthority(value: string, localPort: number | undefined): boolean {
  const authority = value.includes("://") ? value.slice(value.indexOf("://") + 3) : value;
  const cut = authority.lastIndexOf(":");
  const host = (cut === -1 ? authority : authority.slice(0, cut)).toLowerCase();
  const port = cut === -1 ? "" : authority.slice(cut + 1);
  if (!LOOPBACK.has(host)) return false;
  return port === String(localPort ?? PORT);
}

/**
 * The one guard loopback binding does **not** replace: a web page in the user's
 * own browser.
 *
 * D10 says binding to loopback is a stronger boundary than the app's
 * same-origin and rate-limit guards, and against the network it is — nothing
 * off this machine can open the socket. It is not a boundary against a browser
 * *on* this machine, and that is the fourth thing phase 1 got wrong by
 * reasoning about the CLI instead of checking it. A page the user visits can
 * POST to `127.0.0.1:7250` and, while it cannot read the reply, the side effect
 * has already happened: a paid agent session, started by a site, with
 * filesystem access. `readJson` never looked at a header, so a `text/plain`
 * body — one of the three content types that need no preflight — went straight
 * through to `enqueue`.
 *
 * Three checks, each closing a different half of the same class:
 *
 * 1. **`Host` must be this server.** DNS rebinding is how a page reaches a
 *    loopback service while looking same-origin to the browser: a name the
 *    attacker controls, re-resolved to `127.0.0.1`. The browser sends that name
 *    in `Host`, and no name but ours is us.
 * 2. **A body-carrying method must be `application/json`.** That is not a
 *    safelisted content type, so a cross-origin `fetch` has to preflight, and
 *    this server answers no CORS headers at all — so the browser never sends
 *    the real request. An HTML form cannot send it in the first place.
 * 3. **`Origin`, when present, must be this server.** `curl` and the `learn`
 *    CLI send none; a browser sends one on every request that is not a plain
 *    GET. `Sec-Fetch-Site` is checked the same way where the browser sends it.
 *    Phase 2 measured what the app's side of this actually sends, because the
 *    original note here guessed: a `next.config.ts` rewrite is a server-side
 *    fetch and *still* forwards the browser's `Origin` verbatim, so a POST
 *    through one arrives as `http://localhost:3000` and is refused here — which
 *    is the guard working, since a transparent proxy is byte-identical to the
 *    page it proxies for. The app therefore proxies through a route handler
 *    that strips `Origin` and `Sec-Fetch-*` on purpose, and that deliberate
 *    strip is the statement "a program ran this", which is the one thing the
 *    guard is asking about.
 *
 * None of this is authentication and it is not meant to be. It is the
 * difference between "a program the user ran" and "a page the user visited",
 * which is the distinction that was missing.
 */
function guard(request: IncomingMessage): string | null {
  const port = request.socket.localPort;
  const host = request.headers.host ?? "";
  if (!isOwnAuthority(host, port)) {
    return (
      `this server answers to 127.0.0.1:${port ?? PORT} and nothing else, and this request arrived ` +
      `addressed to "${host}". A name that resolves here is not this server: that is what DNS ` +
      `rebinding looks like from the inside.`
    );
  }

  const origin = request.headers.origin;
  if (
    typeof origin === "string" &&
    origin !== "" &&
    origin !== "null" &&
    !isOwnAuthority(origin, port)
  ) {
    return (
      `this request carries Origin "${origin}", so it came from a page rather than from a ` +
      `program. The studio starts paid agent sessions with filesystem access; a website does not ` +
      `get to do that, whatever the user happens to have open in another tab.`
    );
  }

  const site = request.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") {
    return `this request is ${site} according to the browser that sent it, and only same-origin is taken`;
  }

  if (request.method === "POST") {
    const type = (request.headers["content-type"] ?? "").toString().split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") {
      return (
        `POST bodies here must be sent as application/json, and this one is "${type || "nothing"}". ` +
        `The three content types a browser can send without asking permission first are exactly ` +
        `the ones this refuses, which is the point: curl -H 'content-type: application/json' works.`
      );
    }
  }
  return null;
}

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
    // The finished-job screen's whole content, computed by the runner when the
    // gate ran and read here. The panel never recomputes it: the two `inspect`
    // runs behind these numbers happened once, and asking again would be two
    // more Chromium launches for an answer already on disk.
    comparison: record.comparison ?? null,
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
  mirrors: Mirrors;
}

export function createApi({ store, runner, mirrors }: ApiDeps): Server {
  return createServer((request, response) => {
    void handle(request, response, store, runner, mirrors).catch((error: unknown) => {
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
  mirrors: Mirrors,
): Promise<void> {
  const refused = guard(request);
  if (refused !== null) return fail(response, 403, refused);

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

  /* /api/diagrams — the corpus the browser screen lists. */
  if (segments[1] === "diagrams") {
    return diagrams(request, response, segments, method);
  }

  /* /api/mirrors — one `canvas serve` per document, held open while looked at. */
  if (segments[1] === "mirrors" && segments.length === 2) {
    return mirrorRoutes(request, response, mirrors, url, method);
  }

  if (segments[1] !== "jobs") {
    return fail(response, 404, `no route ${method} ${url.pathname}`, {
      routes: [
        "/api/jobs",
        "/api/jobs/{id}",
        "/api/jobs/{id}/events",
        "/api/jobs/{id}/log",
        "/api/jobs/{id}/shot?which=before|after",
        "/api/jobs/{id}/cancel|accept|discard|reindex|revise|resume|compare",
        "/api/diagrams",
        "/api/diagrams/{name}",
        "/api/diagrams/{name}/svg",
        "/api/diagrams/{name}/export|verify|inspect",
        "/api/mirrors",
        "/api/health",
      ],
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
      /* A6: an open mirror on the target is closed before anything is renamed.
       *
       * `serve` holds the document as the tab last loaded it, and Cmd+S in that
       * tab PUTs the whole thing back. A human save landing after the rename
       * would silently revert the accepted diagram to the version that was on
       * screen before it — no error anywhere, and the only evidence a `git
       * diff` nobody is looking at. So the writer goes first.
       *
       * Closed here rather than in the browser, even though the UI knows which
       * mirrors are open: a close the page is responsible for is a close a
       * curl, a reload mid-request or a second tab can skip, and this is the
       * one route in the studio that replaces a committed file. The UI is told
       * it happened so it can put the canvas back. */
      const mirrorClosed = await mirrors.stop(record.targetPath);

      // `accept` writes the record itself, between the renames and the catalog
      // call, so the route neither repeats nor reorders that.
      const result = await accept(store, record);
      if (!result.ok) {
        return fail(response, 409, result.note, {
          reason: result.error ?? null,
          mirrorClosed,
          // The refusal a person most needs to act on. S4: the committed file
          // moved under the job, and re-running the comparison is the offer —
          // never a second accept, which would overwrite the edit.
          recompare: result.error === "target-moved",
        });
      }
      return send(response, 200, {
        jobId: id,
        state: store.get(id)?.state ?? "accepted",
        written: result.written,
        indexed: result.indexed,
        mirrorClosed,
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

    case "POST reindex": {
      // The one recovery accept needs and did not have. Its files landed and
      // its catalog call did not, which leaves a terminal `accepted` record no
      // second accept can re-enter, so this re-runs the catalog half alone.
      const result = await reindex(store, record);
      if (!result.ok) return fail(response, 409, result.note, result.error ?? null);
      return send(response, 200, {
        jobId: id,
        state: store.get(id)?.state ?? "accepted",
        written: result.written,
        indexed: result.indexed,
        note: result.note,
      });
    }

    case "GET shot": {
      const which = url.searchParams.get("which") === "before" ? "before" : "after";
      return shotBytes(response, record, which);
    }

    case "POST compare": {
      // The offer S4 names, and deliberately not a second accept.
      //
      // When the committed file has moved under a job, accept refuses and keeps
      // refusing: `targetHashBefore` is the lease and nothing here rewrites it,
      // so the edit cannot be overwritten by pressing a button twice. What this
      // does is re-read the *before* side against the file as it is now, so the
      // two thumbnails and the counts describe the choice that actually exists
      // — the candidate, against what is on disk today.
      const refreshed = await recompare(store, record);
      return send(response, 200, {
        jobId: id,
        comparison: refreshed,
        note:
          refreshed.before === null
            ? `${record.targetPath} is not there any more, so there is nothing left to compare against`
            : `the before side now reads ${record.targetPath} as it is on disk. Accept still refuses ` +
              `while the file differs from the one this job started against: discard this candidate ` +
              `and run the brief again over the current file.`,
      });
    }

    case "POST revise":
      return revise(request, response, runner, record);

    case "POST resume":
      return resume(response, runner, record);

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
      doctor: doctorChecks(checked).filter((check) => check.status !== "pass"),
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
 *
 * **`mode` is re-derived from what is on disk rather than copied from the
 * parent's brief**, which is the difference between this route working and this
 * route being unreachable for the commonest case there is. The parent of a
 * revision is usually an accepted `mode: "new"` job — that is what "change the
 * diagram I just made" means — and accepting it put a file at the target path,
 * so re-posting `new` walks straight into the guard that refuses a `new` brief
 * over an existing target. The mode was never a property of the brief anyway:
 * it says whether there is something there to build on, and after an accept
 * there is.
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

  const targetExists = (await stat(absolute(record.targetPath)).catch(() => null)) !== null;

  try {
    const { record: next } = await runner.enqueue(
      {
        ...record.brief,
        mode: targetExists ? "extend" : "new",
        notes: [record.brief.notes, `Change requested: ${changes}`].filter(Boolean).join("\n\n"),
        idempotencyKey: `${record.idempotencyKey}:revise:${Date.now()}`,
      },
      { jobId: record.id, agentSessionId: record.agentSessionId, changes },
    );
    return send(response, 201, {
      jobId: next.id,
      state: next.state,
      parentJob: record.id,
      mode: next.brief.mode,
      resuming: next.agentSessionId !== null,
      note:
        `queued as a revision of ${record.id}` +
        (next.agentSessionId === null
          ? `; the parent kept no session, so this one draws from the brief`
          : `, continuing its session`),
    });
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/**
 * `resume`: continue a job the runner died under, and nothing else.
 *
 * A7 and D15 describe the button this is behind. On start the reconcile pass
 * marks every `running` row `interrupted` and stops, because a person is
 * sitting in front of this and an app that starts paid agent sessions on launch
 * is a surprise. So the job is listed, and Resume is the person saying yes.
 *
 * **Why this is not `revise`.** Phase 1 pointed A7's button at `revise`, and
 * `revise` requires a change request — deliberately, since a revise with
 * nothing to change is a re-run. An interruption is exactly the case with
 * nothing to change: the brief was fine, the gate never ran, the runner simply
 * died. Routed through `revise`, the button had to invent a sentence and file
 * it on the new job as `Change requested: …`, which puts words on the record
 * that nobody said. This takes no body, carries the parent's session, and the
 * agent's opening prompt says what actually happened.
 *
 * Interrupted only. A failed or cancelled job has a verdict on it and a reason
 * somebody should read before paying for another attempt; `revise` is the route
 * for those, and it asks what to change.
 */
async function resume(
  response: ServerResponse,
  runner: Runner,
  record: JobRecord,
): Promise<void> {
  if (record.state !== "interrupted") {
    return fail(
      response,
      409,
      `job ${record.id} is ${record.state}, and resume is for a job the runner died under. ` +
        `Nothing was interrupted here, so there is nothing to pick up half-way through.`,
      { state: record.state, instead: "POST /api/jobs/{id}/revise with a change request" },
    );
  }

  // The same re-derivation `revise` makes, for the same reason: mode says
  // whether there is something at the target to build on, and that is a fact
  // about disk now rather than a property of the brief that was posted.
  const targetExists = (await stat(absolute(record.targetPath)).catch(() => null)) !== null;

  try {
    const { record: next } = await runner.enqueue(
      {
        ...record.brief,
        mode: targetExists ? "extend" : "new",
        // Derived from the parent and the moment it was interrupted, never
        // from `Date.now()`. "Resume this interruption" is one operation, so
        // two clicks — or two requests in flight at once, which the state
        // check above cannot serialise on its own — carry the same key: the
        // second resolves to the first's job instead of starting a second paid
        // agent on the same candidate. The `job.idempotency_key` unique index
        // is what makes that atomic rather than merely likely.
        idempotencyKey: `${record.idempotencyKey}:resume:${record.finishedAt ?? record.id}`,
      },
      { jobId: record.id, agentSessionId: record.agentSessionId, changes: null },
    );
    return send(response, 201, {
      jobId: next.id,
      state: next.state,
      parentJob: record.id,
      mode: next.brief.mode,
      resuming: next.agentSessionId !== null,
      note:
        next.agentSessionId === null
          ? `queued as a fresh attempt at ${record.id}: that job kept no session, so this one ` +
            `draws from the brief again`
          : `queued, continuing ${record.id}'s session from wherever it stopped`,
    });
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/**
 * The corpus: `canvas list --json` plus the one fact it does not report.
 *
 * Every read the browser screen makes goes through here rather than through the
 * `asset` table, and that is not an accident. The indexer refuses a `.tldr`
 * with no topic *by name*, so such a file has no asset row at all — and it is
 * exactly the file the studio exists to put in front of a person, because
 * nothing else in the repo will ever mention it. `/library` reads the table;
 * this reads the directory. The two answers differ on purpose.
 *
 * The SVG route is here for the same reason. `/api/assets/{id}/file` is gated
 * on `ASSET_FILES_ENABLED` *and* on the asset being indexed, so borrowing it
 * for thumbnails would leave a blank tile on precisely the untopiced diagram
 * whose tile matters most. One gate — `STUDIO_ENABLED`, which is D11 — and one
 * directory it can read from.
 */
async function diagrams(
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  method: string,
): Promise<void> {
  if (segments.length === 2) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/diagrams does`);
    const listing = await listDiagrams();
    return send(response, 200, {
      ...listing,
      note:
        `${listing.counts.total} diagram${listing.counts.total === 1 ? "" : "s"}, ` +
        `${listing.counts.withTopic} with a topic` +
        (listing.counts.unreadable > 0 ? `, ${listing.counts.unreadable} unreadable` : ""),
    });
  }

  const name = segments[2] ?? "";
  // A name is one path segment and matches a slug pattern, so no request can
  // name a file outside `learn/assets` however it is spelled or escaped.
  if (!isDiagramName(name)) {
    return fail(response, 400, `"${name}" is not a diagram name`, "Names are slugs: letters, digits and hyphens.");
  }

  if (segments.length === 3) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/diagrams/{name} does`);
    const diagram = await readDiagram(name);
    if (diagram === null) return fail(response, 404, `no diagram ${name} in learn/assets`);
    return send(response, 200, { ...diagram, note: noteForDiagram(diagram.svgState, diagram.topic) });
  }

  if (segments.length !== 4) return fail(response, 404, `no route ${method} /api/diagrams/${name}`);

  if (segments[3] === "svg") {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing a thumbnail does`);
    return svgBytes(response, name);
  }

  if (method !== "POST") {
    return fail(response, 405, `${segments[3]} is a POST: it changes a file on disk`);
  }

  const file = absolute(targetPath(name));
  if ((await stat(file).catch(() => null)) === null) {
    return fail(response, 404, `no diagram ${name} in learn/assets`);
  }

  switch (segments[3]) {
    case "export": {
      const result = await canvas(["export", file, "--svg", absolute(targetSvgPath(name))], VERB_TIMEOUT_MS);
      return verbResult(response, "export", result.code, result.json, result.stderr || result.stdout);
    }
    case "inspect": {
      // Exit 3 is "finished, with lints remaining" and not a failure (D4), so
      // it is reported with the lint list rather than as an error.
      const result = await canvas(["inspect", file, "--json"], VERB_TIMEOUT_MS);
      return verbResult(response, "inspect", result.code, result.json, result.stderr || result.stdout, [0, 3]);
    }
    case "verify": {
      const svg = absolute(targetSvgPath(name));
      if ((await stat(svg).catch(() => null)) === null) {
        return fail(response, 409, `${name} has no exported SVG, so there is nothing to verify`, {
          fix: "Export SVG first.",
        });
      }
      const result = await canvas(["verify", svg, "--json"], VERB_TIMEOUT_MS);
      return verbResult(response, "verify", result.code, result.json, result.stderr || result.stdout);
    }
    default:
      return fail(response, 404, `no verb ${segments[3]}`, {
        verbs: ["export", "inspect", "verify"],
      });
  }
}

function noteForDiagram(svgState: string, topic: string | null): string {
  const svg =
    svgState === "missing"
      ? "no SVG has been exported"
      : svgState === "stale"
        ? "the SVG is older than the document"
        : "the SVG is current";
  return topic === null
    ? `${svg}, and it carries no topic, so the indexer refuses it by name`
    : svg;
}

/**
 * A verb's outcome, with the tool's own exit code kept rather than flattened.
 *
 * `ok` is membership of the codes that mean the work happened, which is not
 * always `0`: `inspect` exits 3 when lints remain and the document is still
 * perfectly readable. D4 is the reason the gate cannot check for zero, and the
 * same reasoning applies to a button a person pressed.
 */
function verbResult(
  response: ServerResponse,
  verb: string,
  code: number | null,
  json: unknown,
  output: string,
  okCodes: number[] = [0],
): void {
  const ok = code !== null && okCodes.includes(code);
  return send(response, ok ? 200 : 502, {
    verb,
    ok,
    exitCode: code,
    result: json,
    detail: ok ? null : output.trim().split("\n").slice(-6),
    note: ok ? `${verb} finished` : `${verb} exited ${code ?? "on a signal"}`,
  });
}

/**
 * One of a job's two screenshots, straight off the job workspace.
 *
 * The files live under `$STUDIO_HOME/jobs/<id>/`, which is gitignored and
 * outside `learn/assets/` — a picture taken so two versions can be compared is
 * not a deliverable. `which` is checked against the two literals rather than
 * used as a filename, so no request can name a path of its own.
 *
 * A missing picture is a 404 and the tile says so in words. The commonest
 * reason is the honest one: a `new` job has no before, because there was no
 * diagram to photograph.
 */
async function shotBytes(
  response: ServerResponse,
  record: JobRecord,
  which: "before" | "after",
): Promise<void> {
  const file = shotPath(record.id, which);
  const info = await stat(file).catch(() => null);
  if (info === null || !info.isFile()) {
    return fail(
      response,
      404,
      which === "before"
        ? `job ${record.id} has no before picture: ${record.targetPath} did not exist when it started`
        : `job ${record.id} has no after picture yet`,
      { which, state: record.state },
    );
  }
  response.writeHead(200, {
    "content-type": "image/png",
    "content-length": info.size,
    "x-content-type-options": "nosniff",
    // A job's pictures never change once written — the after shot is taken
    // once per attempt and the before once per job — but an attempt that loops
    // rewrites the after one, so this is revalidated rather than held.
    "cache-control": "no-cache",
    "last-modified": info.mtime.toUTCString(),
  });
  createReadStream(file).pipe(response);
}

/** The committed SVG's bytes, for a thumbnail and for the inspector's preview. */
async function svgBytes(response: ServerResponse, name: string): Promise<void> {
  const file = absolute(targetSvgPath(name));
  const info = await stat(file).catch(() => null);
  if (info === null || !info.isFile()) {
    return fail(response, 404, `${name} has no exported SVG`, "Run export --svg over it.");
  }
  response.writeHead(200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "content-length": info.size,
    // An `<img>` never runs script in an SVG, and these two say so out loud for
    // anything that later reaches for the same bytes a different way.
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache",
    // The mtime is what the freshness pill compares, so it is also the honest
    // validator for a tile the browser may have cached.
    "last-modified": info.mtime.toUTCString(),
  });
  createReadStream(file).pipe(response);
}

/**
 * `/api/mirrors`: start one, list them, stop one.
 *
 * `POST` takes `{ file }` and is idempotent — the canvas screen calls it on
 * every render and a second `serve` on one document would be a second writer.
 * `DELETE ?file=` is a courtesy rather than the lifecycle: a browser that goes
 * away cannot be relied on to say so, which is why the idle sweep exists.
 */
async function mirrorRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  mirrors: Mirrors,
  url: URL,
  method: string,
): Promise<void> {
  const named = url.searchParams.get("file");

  if (method === "GET") {
    const list = mirrors.list(named ?? undefined);
    const healthy = named === null ? null : await mirrors.health(named);
    return send(response, 200, {
      mirrors: named === null ? list : list.map((mirror) => ({ ...mirror, healthy })),
      note:
        list.length === 0
          ? "no canvas is open"
          : `${list.length} canvas${list.length === 1 ? "" : "es"} open`,
    });
  }

  if (method === "DELETE") {
    if (named === null) return fail(response, 400, "name the file to stop mirroring: ?file=learn/assets/x.tldr");
    const stopped = await mirrors.stop(named);
    return send(response, 200, {
      file: named,
      stopped,
      note: stopped ? "the canvas was closed" : "nothing was mirroring that file",
    });
  }

  if (method !== "POST") return fail(response, 405, `${method} is not a thing /api/mirrors does`);

  let body: { file?: unknown };
  try {
    body = (await readJson(request)) as { file?: unknown };
  } catch (error) {
    return fail(response, 400, "the request body is not JSON", (error as Error).message);
  }
  const file = typeof body.file === "string" ? body.file.trim() : "";
  const name = file.startsWith("learn/assets/") ? file.slice("learn/assets/".length).replace(/\.tldr$/, "") : file;
  if (!isDiagramName(name)) {
    return fail(response, 400, `"${file}" is not a diagram in learn/assets`, {
      shape: "learn/assets/<name>.tldr, or just <name>",
    });
  }

  try {
    const mirror = await mirrors.start(targetPath(name));
    const healthy = await mirrors.health(targetPath(name));
    return send(response, 200, {
      ...mirror,
      healthy,
      note: healthy
        ? `mirroring ${name} on port ${mirror.port}`
        : `serve is on port ${mirror.port} and did not answer its own health check yet`,
    });
  } catch (error) {
    if (error instanceof MirrorRefused) return fail(response, error.status, error.message, error.detail);
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
  // U4 replaces the screen on a `fail` and U5 shows a banner on a `warn`, so the
  // two are reported apart. A stale bundle still works, which is `doctor`'s own
  // verdict and the reason it is a warning there too.
  const checks: DoctorCheck[] = checked === null ? [] : doctorChecks(checked);
  return {
    ok: tldrawkc && claude,
    tldrawkc,
    checks,
    stale: checks.some((check) => check.status === "warn"),
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
