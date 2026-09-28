import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { BriefError, loadVocabulary, validateBrief, type ValidBrief } from "./brief";
import { canvas, doctor, doctorChecks, type DoctorCheck } from "./canvas";
import { status as catalogStatus } from "./catalog";
import { agentAuthReport, CLAUDE_BIN, CONCURRENCY, HOST, PORT, VERB_TIMEOUT_MS } from "./config";
import { recompare } from "./compare";
import { diagramCommit } from "./catalog";
import {
  checkoutOf,
  ensureCheckout,
  forgetDiagramList,
  isDiagramName,
  listDiagrams,
  readDiagram,
  svgKeyOf,
  type CheckoutView,
} from "./diagrams";
import { studioBlobStore } from "./blobs";
import { MirrorRefused, type Mirrors } from "./mirrors";
import { shotPath, targetPath, workDir, workSvgPath } from "./paths";
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
    // `result` is the agent's own figure and `stream` is the runner's estimate
    // from the intermediate usage events. Reported beside the number rather
    // than folded into it: a panel showing "$0.04" for a cancelled job should
    // be able to say that is an estimate, and it cannot if the shape does not
    // carry the difference.
    costSource: record.costSource,
    // Which credential the agent ran on, as the runner chose it and as the CLI
    // reported it. The failure panel names the second when the agent's first
    // request failed, because that is the fact a person needs to fix it.
    agentAuth: record.agentAuth ?? null,
    apiKeySource: record.apiKeySource ?? null,
    exitCode: record.exitCode,
    gate: record.gate,
    // The finished-job screen's whole content, computed by the runner when the
    // gate ran and read here. The panel never recomputes it: the two `inspect`
    // runs behind these numbers happened once, and asking again would be two
    // more Chromium launches for an answer already on disk.
    comparison: record.comparison ?? null,
    written: record.written,
    // The files an accept's put also wrote into the tree, while the files
    // still owned diagrams: the only ones a person has to commit.
    files: record.files ?? [],
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

  /* /api/vocabulary: the topics a brief is checked against, as the screens show them. */
  if (segments[1] === "vocabulary" && segments.length === 2) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/vocabulary does`);
    return vocabularyRoute(response);
  }

  /* /api/diagrams — the corpus the browser screen lists. */
  if (segments[1] === "diagrams") {
    return diagrams(request, response, segments, method, mirrors);
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
        "/api/vocabulary",
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
      /* A6: an open canvas on the diagram has to be closed before it lands.
       *
       * `serve` holds the document as the tab last loaded it, and Cmd+S in that
       * tab writes the whole thing back to the checkout, which accept refreshes
       * to the landed revision. A save after that would put the old drawing
       * back on the canvas as an edit nobody made.
       *
       * Handed to `accept` as a capability rather than done here, because
       * *when* is the whole question: this route cannot tell a refusal from an
       * acceptance until `accept` has checked the state, the candidate, the
       * base, the export and the verify, and closing first meant a stale tab
       * pressing Accept on a job somebody already discarded disconnected the
       * canvas its owner was drawing on and then got a 409. It is still the
       * runner that does it rather than the browser: a close a page is
       * responsible for is one a curl or a reload can skip.
       *
       * `accept` also writes the record itself, between the put and the job
       * row, so the route neither repeats nor reorders that. */
      const result = await accept(store, record, {
        closeMirror: () => mirrors.stop(record.targetPath),
      });
      if (!result.ok) {
        return fail(response, 409, result.note, {
          reason: result.error ?? null,
          mirrorClosed: result.mirrorClosed ?? false,
          // The refusal a person most needs to act on. S4: the diagram was
          // committed while the job ran, and re-running the comparison is the
          // offer, never a second accept, which would write over the commit.
          recompare: result.error === "target-moved",
        });
      }
      return send(response, 200, {
        jobId: id,
        state: store.get(id)?.state ?? "accepted",
        // What the accept wrote into the tree (nothing once the database
        // owns diagrams), and what landed in the database.
        written: result.written,
        landed: result.landed ?? [],
        indexed: result.indexed,
        mirrorClosed: result.mirrorClosed ?? false,
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
      // The one recovery accept needs. Its diagram landed and its job row did
      // not record it, which leaves a terminal `accepted` record no second
      // accept can re-enter, so this re-runs `job accept` alone.
      const result = await reindex(store, record);
      if (!result.ok) return fail(response, 409, result.note, result.error ?? null);
      return send(response, 200, {
        jobId: id,
        state: store.get(id)?.state ?? "accepted",
        written: result.written,
        landed: result.landed ?? [],
        indexed: result.indexed,
        note: result.note,
      });
    }

    case "GET shot": {
      const which = url.searchParams.get("which") === "before" ? "before" : "after";
      return shotBytes(response, record, which);
    }

    case "POST compare": {
      /* Only a job that is still waiting to be reviewed.
       *
       * This launches two Chromium instances, overwrites the before picture and
       * persists a new comparison, so on a `running` job it would race the
       * runner's own writes to the same field, and on a terminal one it would
       * replace the record of what was reviewed with a description of a file
       * nobody compared. Neither is a recovery; both are damage. The refusal it
       * exists behind only happens in `awaiting_review`. Caught in review on
       * this PR. */
      if (record.state !== "awaiting_review") {
        return fail(
          response,
          409,
          `job ${record.id} is ${record.state}, and comparing again is for a job still waiting to ` +
            `be reviewed. The comparison on a finished job is the record of what was reviewed, and ` +
            `rewriting it would describe a file nobody looked at.`,
          { state: record.state },
        );
      }

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

  // Read apart from the validation, because failing to read it is not the
  // brief's fault: with the catalog down and no cached copy (D13), nothing can
  // say whether a topic exists, and that is a 503 rather than a bad request.
  let vocabulary: Awaited<ReturnType<typeof loadVocabulary>>;
  try {
    vocabulary = await loadVocabulary();
  } catch (error) {
    return fail(
      response,
      503,
      `the topic list cannot be read and there is no cached copy, so a brief cannot be checked: ${(error as Error).message}`,
      { readAt: null, stale: true },
    );
  }

  let brief: ValidBrief;
  try {
    brief = validateBrief(body, vocabulary);
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

  const targetExists = (await runner.startingPoint(record.slug)).exists;

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
  // whether there is a diagram to build on, and that is a fact about the
  // catalog now rather than a property of the brief that was posted.
  const targetExists = (await runner.startingPoint(record.slug)).exists;

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
 * The corpus: `catalog diagram list`, and the verbs over one diagram.
 *
 * A diagram lives in the database (Track D of docs/CONTENT-MIGRATION.md), so
 * the list is its rows, served from the studio's cache with a stale flag when
 * Postgres is down (D13). Every `canvas` verb takes a file, so each one runs
 * on the diagram's checkout under `$STUDIO_HOME/work/`, refreshed first unless
 * it holds edits nobody committed; `commit` is how such edits reach the
 * database, with the base check (edge case 18).
 *
 * The SVG route streams the blob the row names. `/api/assets/{id}/file` is
 * gated on `ASSET_FILES_ENABLED` as well, so borrowing it for thumbnails would
 * tie the studio to a second switch; one gate, `STUDIO_ENABLED`, which is D11.
 */
async function diagrams(
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  method: string,
  mirrors: Mirrors,
): Promise<void> {
  if (segments.length === 2) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/diagrams does`);
    const listing = await listDiagrams();
    return send(response, 200, {
      ...listing,
      note:
        `${listing.counts.total} diagram${listing.counts.total === 1 ? "" : "s"}, ` +
        `${listing.counts.withTopic} with a topic` +
        (listing.stale ? `, read from the copy of ${listing.readAt} because the catalog is unreachable` : ""),
    });
  }

  const name = segments[2] ?? "";
  // A name is one path segment and matches a slug pattern, so no request can
  // name a file outside the checkout directory however it is spelled or escaped.
  if (!isDiagramName(name)) {
    return fail(response, 400, `"${name}" is not a diagram name`, "Names are slugs: letters, digits and hyphens.");
  }

  if (segments.length === 3) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/diagrams/{name} does`);
    const diagram = await readDiagram(name);
    if (diagram === null) return fail(response, 404, `no diagram ${name} in the catalog`);
    return send(response, 200, { ...diagram, note: noteForDiagram(diagram.svgState, diagram.checkout ?? null) });
  }

  if (segments.length !== 4) return fail(response, 404, `no route ${method} /api/diagrams/${name}`);

  if (segments[3] === "svg") {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing a thumbnail does`);
    return svgBytes(response, name);
  }

  if (method !== "POST") {
    return fail(response, 405, `${segments[3]} is a POST: it changes the checkout or the database`);
  }

  const checkout = await ensureCheckout(name, { canvasOpen: mirrors.isOpen(targetPath(name)) });
  if (checkout.failed) return fail(response, 502, checkout.note);
  if (!checkout.exists) return fail(response, 404, `no diagram ${name} in the catalog`, checkout.note);
  const file = checkout.path;
  const svg = workSvgPath(name);

  switch (segments[3]) {
    case "export": {
      // Asked before the export, since the export itself writes a new SVG
      // into the checkout, and a checkout whose SVG changed reads as edited.
      const before = await checkoutOf(name);
      const edited = before !== null && before.dirty;
      const result = await canvas(["export", file, "--svg", svg], VERB_TIMEOUT_MS);
      if (result.code !== 0) {
        return verbResult(response, "export", result.code, result.json, result.stderr || result.stdout);
      }
      // A fresh SVG of a document nobody edited is the stored document's
      // export, so it goes straight to the database: that is what pressing
      // the pill asks for. Over edits nobody committed it waits in the
      // checkout, and the next commit takes the two together.
      if (edited) {
        return send(response, 200, {
          verb: "export",
          ok: true,
          exitCode: 0,
          result: result.json,
          detail: null,
          note: "export finished; the canvas holds edits nobody committed, so the SVG waits for the next commit",
        });
      }
      const stored = await diagramCommit(name, workDir(), "Export the SVG again from the stored document");
      forgetDiagramList();
      return send(response, stored.ok ? 200 : 502, {
        verb: "export",
        ok: stored.ok,
        exitCode: 0,
        result: stored.json ?? result.json,
        detail: stored.ok ? null : (stored.error ?? "").split("\n").slice(-6),
        note: stored.ok ? "export finished and the SVG is stored" : "export finished and the SVG could not be stored",
      });
    }
    case "inspect": {
      // Exit 3 is "finished, with lints remaining" and not a failure (D4), so
      // it is reported with the lint list rather than as an error.
      const result = await canvas(["inspect", file, "--json"], VERB_TIMEOUT_MS);
      return verbResult(response, "inspect", result.code, result.json, result.stderr || result.stdout, [0, 3]);
    }
    case "verify": {
      if ((await stat(svg).catch(() => null)) === null) {
        return fail(response, 409, `${name} has no exported SVG, so there is nothing to verify`, {
          fix: "Export SVG first.",
        });
      }
      const result = await canvas(["verify", svg, "--json"], VERB_TIMEOUT_MS);
      return verbResult(response, "verify", result.code, result.json, result.stderr || result.stdout);
    }
    case "commit": {
      let body: { reason?: unknown };
      try {
        body = (await readJson(request)) as { reason?: unknown };
      } catch (error) {
        return fail(response, 400, "the request body is not JSON", (error as Error).message);
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason === "") {
        return fail(response, 400, `"reason" is required: it is what the commit message used to say`);
      }
      const result = await diagramCommit(name, workDir(), reason.slice(0, 500));
      forgetDiagramList();
      const refused = (result.json ?? {}) as { code?: unknown };
      if (!result.ok) {
        return fail(
          response,
          result.offline ? 503 : refused.code === "stale-base" ? 409 : 502,
          refused.code === "stale-base"
            ? `${name} changed in the database since this canvas was checked out, so the commit was refused. ` +
                `Your drawing is still on the canvas; nothing was merged.`
            : `the commit did not land: ${result.error ?? "no reason given"}`,
          { code: refused.code ?? null },
        );
      }
      const landed = result.json as { revision?: number; changed?: boolean };
      return send(response, 200, {
        verb: "commit",
        ok: true,
        exitCode: 0,
        result: landed,
        detail: null,
        note: landed.changed === false ? "nothing had changed, so nothing was written" : `committed as revision ${landed.revision}`,
      });
    }
    default:
      return fail(response, 404, `no verb ${segments[3]}`, {
        verbs: ["export", "inspect", "verify", "commit"],
      });
  }
}

function noteForDiagram(svgState: string, checkout: CheckoutView | null): string {
  const svg =
    svgState === "missing"
      ? "no SVG has been exported"
      : svgState === "stale"
        ? "the SVG was exported from an earlier version of the document"
        : "the SVG is current";
  if (checkout === null) return svg;
  return checkout.dirty
    ? `${svg}; the canvas holds edits nobody committed`
    : checkout.behind
      ? `${svg}; the checkout is behind the database and is refreshed when a verb runs`
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

/**
 * The stored SVG's bytes, for a thumbnail and for the inspector's preview:
 * the blob the diagram's row names, streamed out of the store. The key comes
 * from the (cached) list, so a thumbnail still draws with Postgres down.
 */
async function svgBytes(response: ServerResponse, name: string): Promise<void> {
  const { key } = await svgKeyOf(name);
  if (key === null) {
    return fail(response, 404, `${name} has no exported SVG`, "Export one from its canvas.");
  }
  let read;
  try {
    read = await studioBlobStore().get(key);
  } catch (error) {
    return fail(response, 404, `${name}'s SVG is not in the blob store`, (error as Error).message);
  }
  response.writeHead(200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "content-length": read.size,
    // An `<img>` never runs script in an SVG, and these two say so out loud for
    // anything that later reaches for the same bytes a different way.
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    "x-content-type-options": "nosniff",
    // The key is the hash of the bytes, so it is the honest validator, and a
    // tile for the same key never needs fetching twice.
    etag: `"${key.slice(key.indexOf("/") + 1, key.lastIndexOf("."))}"`,
    "cache-control": "no-cache",
  });
  read.body.pipe(response);
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
    const { found, gone } = await mirrors.stop(named);
    return send(response, 200, {
      file: named,
      stopped: found,
      gone,
      note: !found
        ? "nothing was mirroring that file"
        : gone
          ? "the canvas was closed"
          : "the canvas was told to close and its process is still running",
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

  // The mirror edits the checkout, so bring it up to date first, unless it
  // holds edits nobody committed, which are the canvas's own to show, or a
  // canvas is already open on it and could save while the refresh writes.
  const checkout = await ensureCheckout(name, { canvasOpen: mirrors.isOpen(targetPath(name)) });
  if (checkout.failed) return fail(response, 502, checkout.note);
  if (!checkout.exists) {
    return fail(response, 404, `no diagram ${name} in the catalog`, checkout.note);
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

/**
 * The vocabulary, for the web studio's chips and brief form.
 *
 * The web app reads content from the database only, so with Postgres down its
 * own topic read throws, and U3 says the studio still browses and draws. This
 * is the same read a brief is checked against, with the same D13 cache behind
 * it, so the form offers exactly the topics a submit will accept, and the
 * copy it shows carries `stale` and `readAt` like `/api/health` does. With no
 * copy at all it answers 503 with the reason, and the screen falls back to
 * slugs.
 */
async function vocabularyRoute(response: ServerResponse): Promise<void> {
  try {
    const read = await loadVocabulary();
    return send(response, 200, {
      topics: read.entries,
      readAt: read.readAt,
      stale: read.stale,
      ...(read.staleReason === undefined ? {} : { error: read.staleReason }),
    });
  } catch (error) {
    return fail(
      response,
      503,
      `the catalog could not list the topics and there is no cached copy: ${(error as Error).message}`,
      { readAt: null, stale: true },
    );
  }
}

/** What is and is not working right now. */
async function health(store: JobStore, runner: Runner): Promise<Record<string, unknown>> {
  const [checked, claudeVersion, catalog, vocabulary] = await Promise.all([
    doctor().catch(() => null),
    run(CLAUDE_BIN, ["--version"], { timeoutMs: 30_000 }).catch(() => null),
    catalogStatus().catch(() => null),
    loadVocabulary().then(
      (read) => ({
        readAt: read.readAt,
        stale: read.stale,
        ...(read.staleReason === undefined ? {} : { error: read.staleReason }),
      }),
      (error: unknown) => ({ readAt: null, stale: true, error: (error as Error).message }),
    ),
  ]);
  const queueDepth = store.list({ state: "queued" }).length;
  // The same window and the same arithmetic the cap refuses on, rather than a
  // second implementation that agrees with it until it does not. It also moves
  // this figure off `requested_at`: spending happens when a runner claims a job
  // and launches an agent, so a job that sat queued for two days and ran an
  // hour ago spent an hour ago.
  const cap = runner.capStatus();

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
    // Which credential the next agent will run on, and whether a key is in
    // the runner's environment at all. A job whose first request is refused
    // offers "doctor", and this is the line that answers it.
    agentAuth: agentAuthReport(),
    postgres,
    // Where the topic list a brief is checked against stands (D13): `stale`
    // with the `readAt` of the cached copy when the source could not be read,
    // so a screen can say "stale since" instead of passing it off as current.
    // `readAt: null` means there is no copy either, and a brief cannot be
    // validated at all.
    vocabulary,
    queueDepth,
    running: runner.busy,
    costLast24h: cap.totalUsd,
    dailyCap: cap,
    note: !tldrawkc
      ? "tldrawkc cannot run, so no job can be queued. Build the submodule."
      : !claude
        ? "the claude CLI is not on PATH, so no job can be spawned."
        : // Said here as well as in the 429, because a person who has just been
          // refused looks at health next and a green screen would be a lie.
          cap.exceeded
          ? `everything is answering, but $${cap.totalUsd.toFixed(2)} of the $${(cap.capUsd ?? 0).toFixed(2)} daily cap is spent, so a new job is refused until ${cap.oldestAgesOutAt ?? "some of it ages out"}`
          : postgres
          ? "everything is answering"
          : "not connected to the catalog: browsing and drawing still work, and accept will report indexed: false",
  };
}
