import { createReadStream } from "node:fs";
import { pipeline } from "node:stream";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { BriefError, loadVocabulary, validateBrief, vocabularyStatusNow, type ValidBrief, type Vocabulary } from "./brief";
import { byokStatus, checkByokProvider, listByokModels, loadByok, saveByok, saveByokModels, setByokActive } from "./byok";
import { canvas, doctor, doctorChecks, type DoctorCheck } from "./canvas";
import { preferenceSet, videoList } from "./catalog";
import { STUDIO_OWNER_HEADER, studioAgentPreference } from "@self-learn/schema/shared";

import { agentAuthReport, CONCURRENCY, HOST, PORT, studioOwner, VERB_TIMEOUT_MS } from "./config";
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
  type DiagramListing,
} from "./diagrams";
import { studioBlobStore } from "./blobs";
import { DRAFT_SEARCH_LIMIT, type Drafts, type DraftStreamEvent } from "./drafts";
import { MirrorRefused, type Mirrors } from "./mirrors";
import { matchesTag, openNewestShot } from "./live-shot";
import { diagramPathProblem } from "./diagram-guard";
import { HealthProbes } from "./health-probes";
import { readListing, type ListingCache, type Listings } from "./listings";
import type { ProbeReading } from "./probe";
import { scratchDir, shotPath, studioHome, targetPath, workDir, workSvgPath } from "./paths";
import { accept, discard, reindex } from "./review";
import { JobRefused, noteFor, Runner } from "./runner";
import type { JobRecord, JobStore } from "./store";
import { offeredModels, resolveDiagramAgent, resolveVideoAgent } from "./agent-settings";
import { priceableAs, ratesFor } from "./cost";

/** What a studio spawn with no `--model` runs on under the seal, measured (D53). */
const CLI_DEFAULT_MODEL = "claude-opus-5";
import { EFFORTS, readClaudeDefaults } from "./video/agent-model";
import type { VideoDoctor } from "./video/doctor";
import { narrationHealth } from "./video/narration";
import { postVideoJob, videoJobRoutes, videoView, type VideoDeps } from "./video/routes";
import { toolsHealth, VIDEO_TOOL_NAMES } from "./video/tools";

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

  // Every method that carries a body. DELETE carries none here, and
  // `DELETE /api/mirrors` is sent bare.
  const method = request.method ?? "GET";
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    const type = (request.headers["content-type"] ?? "").toString().split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") {
      return (
        `${method} bodies here must be sent as application/json, and this one is "${type || "nothing"}". ` +
        `The three content types a browser can send without asking permission first are exactly ` +
        `the ones this refuses, which is the point: curl -H 'content-type: application/json' works.`
      );
    }
  }
  return null;
}

/**
 * Whether this request is for the owner this runner serves (phase 4 of
 * docs/CONTENT-MIGRATION.md), or null when it is.
 *
 * The web app names the signed-in owner in `STUDIO_OWNER_HEADER`, set by its
 * server from the session after stripping any value a page sent, so the header
 * is the app's word rather than the browser's. A request without it is a
 * program on this machine (curl, a test), which is who could already reach
 * every verb before owners existed, and is served as the runner's own owner.
 *
 * Another owner is refused outright rather than served a scoped view: the
 * runner's queue, checkouts, cache and agent account are this owner's
 * (`studioOwner` says why), so there is no view of them that belongs to
 * anybody else. The refusal names neither owner.
 */
export function ownerRefusal(request: IncomingMessage, owner: string = studioOwner()): string | null {
  const raw = request.headers[STUDIO_OWNER_HEADER];
  if (raw === undefined) return null;
  const named = (Array.isArray(raw) ? raw : [raw]).map((value) => value.trim());
  if (named.length === 1 && named[0] === owner) return null;
  return (
    "this studio runs for one account, the one it was started for, and this request is from another. " +
    "Its diagrams, jobs and agent sessions are that account's alone."
  );
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 1);
  response.writeHead(status, { ...JSON_HEADERS, "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

function fail(response: ServerResponse, status: number, error: string, detail: unknown = null): void {
  send(response, status, { error, detail });
}

/**
 * The most the runner reads of one request body. A chat message has no cap of
 * its own (the apps it imitates publish none), so this is the only one it
 * meets: a megabyte, some 250,000 tokens of text.
 */
const BODY_LIMIT = 1_000_000;

/** A body over `BODY_LIMIT`, answered with 413 rather than as bad JSON. */
class BodyTooLarge extends Error {}

async function readJson(request: IncomingMessage, limit = BODY_LIMIT): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new BodyTooLarge(`the request is over ${limit / 1_000_000} MB, the most the runner reads at once`);
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** The refusal for a body `readJson` could not return. */
function badBody(response: ServerResponse, error: unknown): void {
  if (error instanceof BodyTooLarge) return fail(response, 413, error.message);
  return fail(response, 400, "the request body is not JSON", (error as Error).message);
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
    // The chat that asked for it (D35), or null.
    draftId: record.draftId ?? null,
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
    // The tldraw manual the agent ran with, by the hash that names its file.
    manualHash: record.manualHash ?? null,
    // The model and effort it was started with, each `{ requested, passed,
    // source }`, and the model its session said it was (D53). Null on a job
    // that has not started, or one recorded before the settings panel.
    agentModel: record.agentModel ?? null,
    agentEffort: record.agentEffort ?? null,
    resolvedModel: record.resolvedModel ?? null,
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
  /** The planner conversations. Absent in a test that serves only the job routes. */
  drafts?: Drafts;
  /**
   * The video runner (docs/STUDIO-VIDEOS.md): its store, its runner and its
   * doctor. Absent in a test that serves only diagrams, and then a video
   * brief is refused as a kind this studio does not run.
   */
  video?: VideoDeps & { doctor: VideoDoctor };
  /**
   * The checks `/api/health` reports on, kept by probes so a health call waits
   * on none of them. `npm run studio` makes one and warms it at start; a test
   * that passes none gets its own, cold, so its first health call checks.
   */
  probes?: HealthProbes;
  /**
   * The grid's three lists, kept so a page load waits on none of them
   * (`listings.ts`). `npm run studio` makes one and warms it; a test that
   * passes none reads the catalog on every call, as the routes always did.
   */
  listings?: Listings;
}

export function createApi({ store, runner, mirrors, drafts, video, probes = new HealthProbes(), listings }: ApiDeps): Server {
  return createServer((request, response) => {
    void handle(request, response, store, runner, mirrors, drafts, video, probes, listings).catch((error: unknown) => {
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
  drafts: Drafts | undefined,
  video: (VideoDeps & { doctor: VideoDoctor }) | undefined = undefined,
  probes: HealthProbes = new HealthProbes(),
  listings?: Listings,
): Promise<void> {
  const refused = guard(request);
  if (refused !== null) return fail(response, 403, refused);
  const foreign = ownerRefusal(request);
  if (foreign !== null) return fail(response, 403, foreign);

  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  const method = request.method ?? "GET";

  if (segments[0] !== "api") {
    return fail(response, 404, "this server serves /api only", { path: url.pathname });
  }

  /* /api/health */
  if (segments[1] === "health" && segments.length === 2) {
    return send(response, 200, await health(store, runner, probes, drafts, video));
  }

  /* /api/drafts — the planner conversations (docs/STUDIO-CHAT-FIRST.md). */
  if (segments[1] === "drafts") {
    if (drafts === undefined) return fail(response, 404, "this studio was started without drafts");
    return draftRoutes(request, response, segments, method, url, drafts);
  }

  /* /api/videos: the owner's landed studio videos, for the grid's poster tiles. */
  if (segments[1] === "videos" && segments.length === 2) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/videos does`);
    return videosRoute(response, listings);
  }

  /* /api/settings/agent: the two agents' model and effort (D53). */
  if (segments[1] === "settings" && segments[2] === "agent" && segments.length === 3) {
    return agentSettingsRoute(request, response, method, probes);
  }

  /* /api/settings/byok: the open harness's provider, key and model. */
  if (segments[1] === "settings" && segments[2] === "byok" && segments.length === 3) {
    return byokSettingsRoute(request, response, method, probes);
  }

  /* /api/settings/byok/models: POST lists the provider's models; PUT saves a provider's tier picks (D94). */
  if (segments[1] === "settings" && segments[2] === "byok" && segments[3] === "models" && segments.length === 4) {
    return byokModelsRoute(request, response, method);
  }

  /* /api/settings/byok/active: which connected provider a byok turn runs on (D94). */
  if (segments[1] === "settings" && segments[2] === "byok" && segments[3] === "active" && segments.length === 4) {
    return byokActiveRoute(request, response, method);
  }

  /* /api/vocabulary: the topics a brief is checked against, as the screens show them. */
  if (segments[1] === "vocabulary" && segments.length === 2) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/vocabulary does`);
    return vocabularyRoute(response, listings);
  }

  /* /api/diagrams — the corpus the browser screen lists. */
  if (segments[1] === "diagrams") {
    return diagrams(request, response, segments, method, mirrors, listings);
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
        "/api/jobs/{id}/shot?which=before|after|live",
        "/api/jobs/{id}/cancel|accept|discard|reindex|revise|resume|compare",
        "/api/drafts",
        "/api/drafts/{id}",
        "/api/drafts/{id}/messages|events|draw|abandon",
        "PUT /api/drafts/{id}/brief",
        "PUT /api/drafts/{id}/name|model|harness",
        "/api/settings/agent",
        "/api/settings/byok",
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
    if (method === "POST") {
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        return badBody(response, error);
      }
      // Dispatched on the brief's own kind, never on a draft's: one draft may
      // hold a diagram and a video in flight at once, each on its own queue.
      const kind = (body as { kind?: unknown } | null)?.kind;
      if (kind === "video") {
        if (video === undefined) return fail(response, 400, "this studio was started without the video runner");
        return postVideoJob(body, response, video);
      }
      if (kind !== undefined && kind !== "diagram") return fail(response, 400, `"kind" is diagram or video`);
      return postJob(body, response, runner, drafts);
    }
    if (method === "GET") {
      const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 25;
      const state = url.searchParams.get("state") ?? undefined;
      const filter = { limit, ...(state === undefined ? {} : { state }) };
      const jobs = [
        ...store.list(filter).map((record) => ({ at: record.requestedAt, view: view(record) })),
        ...(video?.store.list(filter) ?? []).map((record) => ({ at: record.requestedAt, view: videoView(record) })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit)
        .map((entry) => entry.view);
      return send(response, 200, { jobs, note: `${jobs.length} job${jobs.length === 1 ? "" : "s"}, newest first` });
    }
    return fail(response, 405, `${method} is not a thing /api/jobs does`);
  }

  const id = segments[2] ?? "";
  const videoRecord = video?.store.get(id);
  if (video !== undefined && videoRecord !== undefined) {
    return videoJobRoutes(request, response, segments, method, url, videoRecord, video, drafts);
  }
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
      const asked = url.searchParams.get("which");
      // `live` is the newest picture the agent took of its own work, for the
      // grid's preview while the job runs; the other two are the comparison.
      if (asked === "live") return liveShotBytes(request, response, record);
      return shotBytes(response, record, asked === "before" ? "before" : "after");
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
      return revise(request, response, runner, record, drafts);

    case "POST resume":
      return resume(response, runner, record, drafts);

    default:
      return fail(response, 404, `no route ${method} ${url.pathname}`);
  }
}

async function postJob(
  body: unknown,
  response: ServerResponse,
  runner: Runner,
  drafts: Drafts | undefined,
): Promise<void> {

  // A brief from a chat names its draft beside it (D35): the draft has to
  // exist and be briefed, and it moves to drawing once the job is queued.
  const draftId = typeof (body as { draftId?: unknown } | null)?.draftId === "string"
    ? ((body as { draftId: string }).draftId.trim() || null)
    : null;
  let release: () => void = () => undefined;
  if (draftId !== null) {
    if (drafts === undefined) return fail(response, 404, `no draft ${draftId}`);
    try {
      // Held until the job is recorded on the draft, as a Draw press is.
      release = drafts.claimForJob(draftId);
    } catch (error) {
      if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
      throw error;
    }
  }
  try {
    await enqueueChecked(response, body, runner, drafts, draftId);
  } finally {
    release();
  }
}

async function enqueueChecked(
  response: ServerResponse,
  body: unknown,
  runner: Runner,
  drafts: Drafts | undefined,
  draftId: string | null,
): Promise<void> {

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
    const { record, created, jobsAhead } = await runner.enqueue(brief, undefined, { draftId });
    // Pressed from the diagram brief in force, which the claim held still: the
    // seq it was drawn from, so a newer brief is known to be newer.
    if (draftId !== null && drafts !== undefined && created) {
      await drafts.markDrawing(draftId, record.id, "diagram", drafts.get(draftId)?.slots?.diagram?.briefSeq ?? null);
    }
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
 * The draft a Revise or a Resume carries: the parent job's, only while that
 * job is still the draft's newest and the draft is not drawing another. The
 * new job is then the draft's newest, and the draft follows it.
 *
 * Anything else queues the job standalone, with no draft, rather than
 * refusing it: a Resume or Revise of an older job is still a job a person
 * asked for, and carrying the draft would make it the one the conversation
 * follows while another drawing is in flight.
 */
function carriedDraft(record: JobRecord, drafts: Drafts | undefined): string | null {
  const id = record.draftId ?? null;
  if (id === null || drafts === undefined) return null;
  return drafts.carries(id, record.id, "diagram") ? id : null;
}

async function followedBy(drafts: Drafts | undefined, job: JobRecord): Promise<void> {
  if (drafts !== undefined && job.draftId !== null && job.draftId !== undefined) await drafts.markDrawing(job.draftId, job.id);
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
  drafts: Drafts | undefined,
): Promise<void> {
  let body: { changes?: unknown };
  try {
    body = (await readJson(request)) as { changes?: unknown };
  } catch (error) {
    return badBody(response, error);
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
      { draftId: carriedDraft(record, drafts) },
    );
    await followedBy(drafts, next);
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
  drafts: Drafts | undefined,
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
      { draftId: carriedDraft(record, drafts) },
    );
    await followedBy(drafts, next);
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
 * The SVG route streams the blob the row names, by the key in the cached
 * diagram list, so a tile still draws with Postgres down. The web app's
 * `/api/assets/{id}/file` would answer only while the database does, and only
 * for a diagram with an asset row; the studio keeps one gate of its own,
 * `STUDIO_ENABLED`, which is D11.
 */
async function diagrams(
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  method: string,
  mirrors: Mirrors,
  listings?: Listings,
): Promise<void> {
  if (segments.length === 2) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/diagrams does`);
    let listing: DiagramListing;
    let cache: ListingCache | undefined;
    if (listings === undefined) {
      listing = await listDiagrams();
    } else {
      const read = await readListing(listings.diagrams, (outcome) => !outcome.ok || outcome.value.stale === true);
      if (!read.value.ok) throw read.value.error;
      listing = read.value.value;
      cache = read.cache;
    }
    return send(response, 200, {
      ...listing,
      ...(cache === undefined ? {} : { cache }),
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
        return badBody(response, error);
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
  // As for the live picture: an abort or a read error closes the file.
  pipeline(createReadStream(file), response, () => undefined);
}

/**
 * The newest picture the drawing agent took, for the grid's live preview.
 *
 * Read from this job's own scratch directory and nowhere else: the id picks
 * the directory, the request names no path, and `newestShot` follows no
 * symlink (see `live-shot.ts`). The tile polls this every few seconds while
 * the job runs, so it answers a repeat with a 304 on the strong tag: an
 * unchanged directory costs a directory read and no bytes. No Chromium is
 * launched; the agent already took the picture for itself.
 *
 * A 404 before the first pass is the ordinary answer, and the tile keeps its
 * blurred thumbnail (or its blank card) until there is something to show.
 */
async function liveShotBytes(
  request: IncomingMessage,
  response: ServerResponse,
  record: JobRecord,
): Promise<void> {
  // Opened and checked once, and this handle is what is streamed: no second
  // open of the path, so nothing swapped in after the check is ever read.
  const shot = await openNewestShot(scratchDir(record.id));
  const cache = {
    // Revalidated on every poll: the tag is what makes that cheap.
    "cache-control": "private, no-cache",
    "x-content-type-options": "nosniff",
  };
  if (shot === null) {
    return fail(response, 404, `job ${record.id} has no picture yet`, { which: "live", state: record.state });
  }
  if (matchesTag(request.headers["if-none-match"], shot.etag)) {
    await shot.handle.close();
    response.writeHead(304, { ...cache, etag: shot.etag });
    response.end();
    return;
  }
  response.writeHead(200, {
    ...cache,
    "content-type": "image/png",
    "content-length": shot.size,
    etag: shot.etag,
    "last-modified": new Date(shot.mtimeMs).toUTCString(),
  });
  // `pipeline` rather than `pipe`: a client that goes away mid-picture, or a
  // read that fails, destroys both ends and closes the handle, where `pipe`
  // left the stream open and an error on it unhandled.
  pipeline(shot.handle.createReadStream({ start: 0 }), response, () => undefined);
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
    return badBody(response, error);
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
async function vocabularyRoute(response: ServerResponse, listings?: Listings): Promise<void> {
  try {
    let read: Vocabulary;
    let cache: ListingCache | undefined;
    if (listings === undefined) {
      read = await loadVocabulary();
    } else {
      const kept = await readListing(listings.vocabulary, (outcome) => !outcome.ok || outcome.value.stale);
      if (!kept.value.ok) throw kept.value.error;
      read = kept.value.value;
      cache = kept.cache;
    }
    return send(response, 200, {
      topics: read.entries,
      readAt: read.readAt,
      stale: read.stale,
      ...(read.staleReason === undefined ? {} : { error: read.staleReason }),
      ...(cache === undefined ? {} : { cache }),
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

/**
 * `/api/drafts`: create, list, read, talk, follow, draw, abandon, edit the
 * brief by hand, and name the conversation.
 *
 * Every refusal is a `JobRefused` from `drafts.ts` with the status the API
 * table in docs/STUDIO-CHAT-FIRST.md names, answered in the `{ error, detail }`
 * envelope every route here uses. Draw's refusals are `POST /api/jobs`'s, body
 * and all, since it is the same enqueue.
 */
async function draftRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  method: string,
  url: URL,
  drafts: Drafts,
): Promise<void> {
  const refusal = (error: unknown): void => {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  };
  const body = async (): Promise<Record<string, unknown> | null> => {
    try {
      const parsed = await readJson(request);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        fail(response, 400, "the request body must be a JSON object");
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      badBody(response, error);
      return null;
    }
  };

  if (segments.length === 2) {
    if (method === "GET") {
      const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 25;
      const state = url.searchParams.get("state") ?? undefined;
      const nonEmpty = ["1", "true"].includes(url.searchParams.get("nonEmpty") ?? "");
      // The next page: rows after the one named, newest first. Both or neither.
      const beforeUpdated = url.searchParams.get("before");
      const beforeId = url.searchParams.get("beforeId");
      const before = beforeUpdated !== null && beforeId !== null ? { updated: beforeUpdated, id: beforeId } : undefined;
      // Words to find in a draft's name, title, first message or concept title,
      // applied before the cursor and the limit. Empty is no search.
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length > DRAFT_SEARCH_LIMIT) return fail(response, 400, `"q" is at most ${DRAFT_SEARCH_LIMIT} characters`, { field: "q" });
      const list = drafts.list({
        limit,
        nonEmpty,
        ...(q === "" ? {} : { q }),
        ...(state === undefined || state === "" ? {} : { state }),
        ...(before === undefined ? {} : { before }),
      });
      return send(response, 200, { drafts: list, note: `${list.length} draft${list.length === 1 ? "" : "s"}, newest first` });
    }
    if (method !== "POST") return fail(response, 405, `${method} is not a thing /api/drafts does`);
    const input = await body();
    if (input === null) return;
    try {
      const { record, created } = await drafts.create({
        source: typeof input.source === "string" ? input.source : null,
        sourceKind: input.sourceKind === undefined || input.sourceKind === null ? null : (input.sourceKind as string),
        idempotencyKey: typeof input.idempotencyKey === "string" ? input.idempotencyKey : null,
        // A hand-off from the concept tutor (docs/STUDIO-TUTOR-HANDOFF.md):
        // checked in `drafts.ts`, and only ever placed in the planner's prompt
        // as fenced data.
        concept: input.concept,
        tutor: input.tutor,
        // The composer picker's pick (D90): checked in `drafts.ts`.
        model: input.model,
        // The pane picker's pick: `claude` when absent; checked in `drafts.ts`.
        harness: input.harness,
      });
      return send(response, created ? 201 : 200, {
        draftId: record.id,
        state: record.state,
        plannerKinds: record.plannerKinds ?? ["diagram"],
        sourceKind: record.sourceKind ?? "diagram",
        note: created
          ? record.concept != null
            ? `a conversation about the concept ${record.concept.slug}`
            : record.source === null
              ? "a new conversation: ask about an idea, or tag @diagram or @video to make one"
              : record.sourceKind === "video"
                ? `a conversation about changing the video ${record.source}`
                : `a conversation about extending ${record.source}`
          : `this idempotency key already belongs to draft ${record.id}`,
      });
    } catch (error) {
      return refusal(error);
    }
  }

  const id = segments[2] ?? "";
  if (drafts.get(id) === undefined) {
    return fail(response, 404, `no draft ${id}`, "This conversation is gone. Drafts are kept seven days.");
  }

  if (segments.length === 3) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/drafts/{id} does`);
    return send(response, 200, await drafts.view(id));
  }
  // /api/drafts/{id}/slots/{kind}/stop-waiting|use (D57, D60).
  if (segments.length === 6 && segments[3] === "slots") {
    if (method !== "POST") return fail(response, 405, `${method} is not a thing ${url.pathname} does`);
    const kind = segments[4];
    try {
      if (segments[5] === "stop-waiting") {
        const { changed } = await drafts.stopWaiting(id, kind);
        const view = await drafts.view(id);
        return send(response, 200, {
          draftId: id,
          kind,
          changed,
          slots: view.slots,
          waiting: view.waiting,
          note: changed ? `the ${kind} brief is no longer asked for` : `no ${kind} brief was being waited for`,
        });
      }
      if (segments[5] === "use") {
        const { changed } = await drafts.useBrief(id, kind, url.searchParams.get("base"));
        const view = await drafts.view(id);
        return send(response, 200, {
          draftId: id,
          kind,
          changed,
          slots: view.slots,
          pair: view.pair,
          note: changed ? `the ${kind} brief is back in force; the planner hears it on its next turn` : `the ${kind} brief was not on hold`,
        });
      }
    } catch (error) {
      return refusal(error);
    }
    return fail(response, 404, `no route ${method} ${url.pathname}`, { routes: ["POST slots/{kind}/stop-waiting", "POST slots/{kind}/use?base=<seq>"] });
  }
  if (segments.length !== 4) return fail(response, 404, `no route ${method} ${url.pathname}`);

  switch (`${method} ${segments[3]}`) {
    case "POST messages": {
      const input = await body();
      if (input === null) return;
      try {
        const { seq } = await drafts.send(id, input.text, input.mentions);
        return send(response, 202, { draftId: id, seq, note: "the planner is answering; follow /events for its reply" });
      } catch (error) {
        return refusal(error);
      }
    }
    case "GET events":
      return draftEvents(request, response, url, drafts, id);
    case "POST draw": {
      const input = await body();
      if (input === null) return;
      try {
        const answer = await drafts.draw(id, input);
        if (!answer.single) {
          return send(response, 200, {
            draftId: id,
            results: answer.results,
            note: answer.results
              .map((result) => ("jobId" in result ? `${result.kind}: job ${result.jobId}` : `${result.kind}: refused (${result.status})`))
              .join("; "),
          });
        }
        const { jobId, created, kind, replaces } = answer.result;
        return send(response, created ? 201 : 200, {
          draftId: id,
          jobId,
          kind,
          created,
          state: "drawing",
          replaces,
          note: created
            ? replaces === null
              ? `queued as job ${jobId}`
              : `queued as job ${jobId}, replacing ${replaces}, which was discarded in the same step`
            : `this press already queued job ${jobId}`,
        });
      } catch (error) {
        return refusal(error);
      }
    }
    case "POST abandon": {
      try {
        const record = await drafts.abandon(id);
        return send(response, 200, { draftId: id, state: record.state, note: "this conversation is closed" });
      } catch (error) {
        return refusal(error);
      }
    }
    case "PUT name": {
      // The owner's name for the conversation (the sidebar's Rename): every
      // page that reads the draft shows it before the planner's title.
      const input = await body();
      if (input === null) return;
      if (!("name" in input)) return fail(response, 400, `"name" is required: a string, or null to clear the name`, { field: "name" });
      try {
        const { record, changed } = await drafts.rename(id, input.name);
        return send(response, 200, {
          draftId: id,
          name: record.name ?? null,
          title: record.title,
          changed,
          note: !changed ? "the name is unchanged" : record.name == null ? "the name is cleared" : "the conversation is renamed",
        });
      } catch (error) {
        return refusal(error);
      }
    }
    case "PUT model": {
      // The composer picker's pick for the whole conversation (D90): turns
      // and the jobs its presses spawn all run on it.
      const input = await body();
      if (input === null) return;
      if (!("model" in input)) return fail(response, 400, `"model" is required: a model name, or null/"default" to clear`, { field: "model" });
      try {
        const { record, changed } = await drafts.setModel(id, input.model);
        return send(response, 200, {
          draftId: id,
          model: record.model ?? null,
          changed,
          note: !changed ? "the model is unchanged" : record.model == null ? "the model is cleared" : `the conversation runs on ${record.model}`,
        });
      } catch (error) {
        return refusal(error);
      }
    }
    case "PUT harness": {
      // The pane picker's pick: only a conversation that has not spoken yet
      // can move harnesses, which `setHarness` is the one gate on.
      const input = await body();
      if (input === null) return;
      if (!("harness" in input)) return fail(response, 400, `"harness" is required: "claude" or "byok"`, { field: "harness" });
      try {
        const { record, changed } = await drafts.setHarness(id, input.harness);
        return send(response, 200, {
          draftId: id,
          harness: record.harness ?? "claude",
          changed,
          note: !changed ? "the harness is unchanged" : `the conversation runs on ${record.harness ?? "claude"}`,
        });
      } catch (error) {
        return refusal(error);
      }
    }
    case "PUT brief": {
      const input = await body();
      if (input === null) return;
      try {
        const { record, changed, kind } = await drafts.editBrief(id, input, url.searchParams.get("base"), url.searchParams.get("kind"));
        const slot = record.slots?.[kind];
        return send(response, 200, {
          draftId: id,
          kind,
          state: record.state,
          brief: slot?.brief ?? null,
          briefSeq: slot?.brief === null || slot === undefined ? null : slot.briefSeq,
          pendingTopic: slot?.pendingTopic ?? null,
          note: changed
            ? "the brief is saved; the planner is told on its next turn, and Draw draws this one"
            : "the brief is unchanged",
        });
      } catch (error) {
        return refusal(error);
      }
    }
    default:
      return fail(response, 404, `no route ${method} ${url.pathname}`, {
        routes: ["POST messages", "GET events", "POST draw", "POST abandon", "PUT brief", "PUT name", "PUT model", "PUT harness", "POST slots/{kind}/stop-waiting", "POST slots/{kind}/use"],
      });
  }
}

/**
 * A draft's SSE stream. Transcript events carry `id:` (their seq), so a
 * reconnect replays from `Last-Event-ID`; a first connection, which cannot set
 * that header from `EventSource`, passes `?after=`. `delta` and `state` carry
 * no id: they are a cache of the reply in progress and the record, never the
 * record itself (rule 8).
 */
async function draftEvents(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  drafts: Drafts,
  id: string,
): Promise<void> {
  const header = request.headers["last-event-id"];
  const raw = (Array.isArray(header) ? header[0] : header) ?? url.searchParams.get("after") ?? "0";
  const parsed = Number.parseInt(raw, 10);
  const after = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const write = (event: DraftStreamEvent): void => {
    response.write(`${event.id === undefined ? "" : `id: ${event.id}\n`}event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
  };
  // The close handler is attached before the replay is read, so a client that
  // goes away during it does not leave its subscription and its keep-alive
  // behind: the subscription is dropped the moment it exists.
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  const keepAlive = setInterval(() => response.write(": keep-alive\n\n"), 20_000);
  response.on("close", () => {
    closed = true;
    clearInterval(keepAlive);
    unsubscribe?.();
  });
  const off = await drafts.subscribe(id, after, write);
  if (closed) off();
  else unsubscribe = off;
}

/** What is and is not working right now. */
/** One kind's row, as `GET /api/settings/agent` reports it. */
async function agentSettingView(kind: "video" | "diagram"): Promise<Record<string, unknown>> {
  const resolved = kind === "video" ? await resolveVideoAgent() : await resolveDiagramAgent();
  // A model the rate table cannot price still runs (the owner may pick a new
  // one); a job stopped before it reports its own cost is then estimated at
  // the rate `priceableAs` falls back to, which the menu says.
  const passed = resolved.model.passed;
  const pricedAs = priceableAs(passed ?? CLI_DEFAULT_MODEL);
  const priced = passed !== null && ratesFor(passed) !== null;
  return {
    key: kind === "video" ? "studioVideoAgent" : "studioDiagramAgent",
    price: { priced, pricedAs },
    warning: priced
      ? null
      : `${passed === null ? "The CLI's own default" : `"${passed}"`} has no price in the studio's rate table, so a job stopped before it reports its own cost is estimated at ${pricedAs}'s rates.`,
    stored: resolved.stored,
    // What the menus show as chosen: the row, else the kind's own default.
    value: resolved.stored ?? (kind === "video" ? { model: "default", effort: "default" } : { model: "sonnet", effort: "default" }),
    model: resolved.model,
    effort: resolved.effort,
  };
}

/** What `GET /api/settings/agent` answers, read fresh: `HealthProbes.settingsView` keeps it. */
export async function agentSettingsView(): Promise<Record<string, unknown>> {
  const [video, diagram, claude] = await Promise.all([agentSettingView("video"), agentSettingView("diagram"), readClaudeDefaults()]);
  return {
    video,
    diagram,
    defaults: claude,
    models: offeredModels(),
    efforts: EFFORTS,
  };
}

/**
 * `GET /api/settings/agent`: both rows, what a job started now would get, and
 * what "Claude Code default" resolves to. `PUT` with `{ kind, model, effort }`
 * stores one row through `catalog preference set`, owner-scoped, and answers
 * as `GET`. The web app's own server action writes the same row; either is
 * read by the runner at the next job's start.
 */
async function agentSettingsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  probes: HealthProbes,
): Promise<void> {
  // The last answer at once, renewed behind it once old; a PUT below forgets
  // it, so a save is never answered with the row it replaced.
  const kept = probes.settingsView(agentSettingsView);
  if (method === "GET") return send(response, 200, (await kept.read()).value);
  if (method !== "PUT") return fail(response, 405, `${method} is not a thing /api/settings/agent does`);
  let body: Record<string, unknown>;
  try {
    const parsed = await readJson(request);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail(response, 400, "the request body must be a JSON object");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return badBody(response, error);
  }
  if (body.kind !== "video" && body.kind !== "diagram") return fail(response, 400, `"kind" is video or diagram`, { field: "kind" });
  const value = { model: body.model, effort: body.effort };
  const clean = studioAgentPreference(value);
  if (clean.model !== value.model) return fail(response, 400, `"model" is "default" or a model name the claude CLI takes`, { field: "model" });
  if (clean.effort !== value.effort) return fail(response, 400, `"effort" is "default" or one of ${EFFORTS.join(", ")}`, { field: "effort" });
  const written = await preferenceSet(body.kind === "video" ? "studioVideoAgent" : "studioDiagramAgent", clean);
  // Health's copy of the settings is now wrong, whether or not the write took:
  // its next read asks again rather than reporting the row this replaced.
  probes.agent.forget();
  kept.forget();
  if (!written.ok) {
    return fail(response, written.offline ? 503 : 502, `the setting could not be stored: ${written.error ?? "no reason given"}`, {
      reason: written.offline ? "catalog-unreachable" : "catalog",
    });
  }
  return send(response, 200, await kept.fresh());
}

/**
 * `GET /api/settings/byok`: whether the open harness (`qwen`) can run and on
 * which provider and model, never the key. `PUT` with `{ provider, apiKey,
 * model }` writes `$STUDIO_HOME/byok.json` mode 0600 and answers as `GET`;
 * the key goes no further than that file and a spawn's env.
 */
async function byokSettingsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  probes: HealthProbes,
): Promise<void> {
  if (method === "GET") return send(response, 200, await byokStatus());
  if (method !== "PUT") return fail(response, 405, `${method} is not a thing /api/settings/byok does`);
  let body: Record<string, unknown>;
  try {
    const parsed = await readJson(request);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail(response, 400, "the request body must be a JSON object");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return badBody(response, error);
  }
  try {
    const saved = await saveByok(body);
    // Health's copy of the agent block is now wrong.
    probes.agent.forget();
    return send(response, 200, saved);
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/**
 * `POST /api/settings/byok/models` `{ provider, apiKey? }`: the provider's own
 * `/models` on the key the dialog holds — typed, or the stored one when the
 * field was left blank on that provider (D93's combobox). A POST rather than a
 * GET so the key is never in a URL. Answers `{ models: [{ value, label }] }`,
 * `label` null when the provider sends ids only.
 *
 * `PUT /api/settings/byok/models` `{ provider, models: { lite?, default?,
 * max? } }` (D94): a connected provider's tier picks, merged over what it
 * has — omitted keeps, empty clears.
 */
async function byokModelsRoute(request: IncomingMessage, response: ServerResponse, method: string): Promise<void> {
  let body: Record<string, unknown>;
  try {
    const parsed = await readJson(request);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail(response, 400, "the request body must be a JSON object");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return badBody(response, error);
  }
  try {
    if (method === "PUT") return send(response, 200, await saveByokModels(body));
    if (method !== "POST") return fail(response, 405, `${method} is not a thing /api/settings/byok/models does`);
    const provider = checkByokProvider(body.provider);
    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (apiKey === "") {
      const held = await loadByok();
      const entry = held === null ? undefined : held.providers[provider];
      if (entry === undefined) {
        throw new JobRefused(400, `"apiKey" is the provider's key, or the stored one when the field is left blank`, { field: "apiKey" });
      }
      apiKey = entry.apiKey;
    }
    return send(response, 200, { models: await listByokModels(provider, apiKey) });
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/**
 * `PUT /api/settings/byok/active` `{ provider }`: which connected provider a
 * `byok` turn runs on (D94). Answers as `GET /api/settings/byok` does.
 */
async function byokActiveRoute(request: IncomingMessage, response: ServerResponse, method: string): Promise<void> {
  if (method !== "PUT") return fail(response, 405, `${method} is not a thing /api/settings/byok/active does`);
  let body: Record<string, unknown>;
  try {
    const parsed = await readJson(request);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail(response, 400, "the request body must be a JSON object");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return badBody(response, error);
  }
  try {
    return send(response, 200, await setByokActive(body));
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/**
 * `GET /api/videos`: the owner's landed studio videos, from `catalog video
 * list` (owner-scoped there). `posterAssetId` is the video's own asset id,
 * which the web app's `/api/assets/{id}/poster` takes, or null when no poster
 * was stored. manimkc renders are the library's, not the studio grid's.
 */
async function videosRoute(response: ServerResponse, listings?: Listings): Promise<void> {
  const kept = listings === undefined ? null : await readListing(listings.videos, (result) => !result.ok);
  const listed = kept?.value ?? (await videoList());
  if (!listed.ok) {
    return fail(response, listed.offline ? 503 : 502, `the video list could not be read: ${listed.error ?? "no reason given"}`, {
      reason: listed.offline ? "catalog-unreachable" : "catalog",
    });
  }
  const raw = (listed.json as { videos?: unknown } | null)?.videos;
  const videos = (Array.isArray(raw) ? raw : [])
    .filter((video): video is Record<string, unknown> => typeof video === "object" && video !== null && video.origin === "studio" && typeof video.slug === "string")
    .map((video) => ({
      slug: video.slug as string,
      title: typeof video.title === "string" ? video.title : null,
      topic: typeof video.topic === "string" ? video.topic : null,
      concepts: Array.isArray(video.concepts) ? video.concepts : [],
      assetId: typeof video.assetId === "string" ? video.assetId : `video:${video.slug as string}`,
      posterAssetId: video.poster === null || video.poster === undefined ? null : typeof video.assetId === "string" ? video.assetId : `video:${video.slug as string}`,
      durationSeconds: typeof video.durationSeconds === "number" ? video.durationSeconds : null,
      narrated: video.narrated === true,
      revision: typeof video.revision === "number" ? video.revision : null,
      updated: typeof video.updatedAt === "string" ? video.updatedAt : null,
    }));
  return send(response, 200, {
    videos,
    note: `${videos.length} studio video${videos.length === 1 ? "" : "s"}`,
    ...(kept === null ? {} : { cache: kept.cache }),
  });
}

/** One probe's age, as health reports it. */
function freshness(read: ProbeReading<unknown>): Record<string, unknown> {
  return { checkedAt: read.checkedAt, stale: read.stale, refreshing: read.refreshing };
}

async function health(
  store: JobStore,
  runner: Runner,
  probes: HealthProbes,
  drafts?: Drafts,
  video?: VideoDeps & { doctor: VideoDoctor },
): Promise<Record<string, unknown>> {
  // Every answer is the last one each probe has, returned at once; an old one
  // starts a refresh for the next call (health-probes.ts has the measurements
  // that made this necessary). Only a probe that has never answered is waited
  // for, which `npm run studio` avoids by warming them all at start.
  const [doctorRead, claudeRead, qwenRead, codexRead, catalogRead, agentRead, vocabulary] = await Promise.all([
    probes.doctor.read(),
    probes.claude.read(),
    probes.qwen.read(),
    probes.codex.read(),
    probes.catalog.read(),
    probes.agent.read(),
    // The last read any route made, however old, rather than a `catalog topic
    // ls` on this call; an old one is refreshed behind it.
    vocabularyStatusNow(),
  ]);
  const checked = doctorRead.value.result;
  const claudeVersion = claudeRead.value;
  const qwenVersion = qwenRead.value;
  const codexVersion = codexRead.value;
  const catalog = catalogRead.value;
  const agent = agentRead.value;
  // The video doctor's cached answer: it takes seconds, so health never
  // waits for a fresh one (it refreshes at start and every ten minutes).
  const videoReport = video?.doctor.current() ?? null;
  // Each tool's own doctor (D75): a tool is available only on its verdict. A
  // stand-in runner with no doctors (a test's) reports none.
  const toolVerdicts = video === undefined ? undefined : Object.fromEntries(VIDEO_TOOL_NAMES.map((name) => [name, video.runner.doctorFor?.(name)?.current() ?? null]));
  const queueDepth = store.list({ state: "queued" }).length;
  // The same window and the same arithmetic the cap refuses on, rather than a
  // second implementation that agrees with it until it does not. It also moves
  // this figure off `requested_at`: spending happens when a runner claims a job
  // and launches an agent, so a job that sat queued for two days and ran an
  // hour ago spent an hour ago.
  const cap = runner.capStatus();
  const manualStatus = runner.manual?.status() ?? {
    state: "missing" as const,
    hash: null,
    chars: null,
    optionsSource: null,
    optionsFallback: [],
    reasons: [],
    snippets: null,
    snippetsPending: false,
    error: "this runner holds no manual source",
    builtAt: null,
  };

  const tldrawkc = checked !== null && checked.code === 0;
  const claude = claudeVersion !== null && claudeVersion.code === 0;
  const postgres = catalog !== null && catalog.ok;
  // U4 replaces the screen on a `fail` and U5 shows a banner on a `warn`, so the
  // two are reported apart. A stale bundle still works, which is `doctor`'s own
  // verdict and the reason it is a warning there too.
  const checks: DoctorCheck[] = checked === null ? [] : doctorChecks(checked);
  // The diagram agent's own precondition, apart from the tool's: a studio
  // home its Bash guard cannot carry refuses a job, not the grid or the canvas.
  const diagramAgentProblem = diagramPathProblem(studioHome());
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
    // The BYOK harness's binary (Qwen Code): absent does not warn, since the
    // picker's BYOK row is the only thing that uses it.
    qwen: qwenVersion !== null && qwenVersion.code === 0,
    qwenVersion: qwenVersion?.stdout.trim() ?? null,
    // OpenAI's harness (Codex CLI), the picker's Codex row: absent does not
    // warn for the same reason. `codex login` state is checked at pick time,
    // not here — the file check is cheap but health should not stat it.
    codex: codexVersion !== null && codexVersion.code === 0,
    codexVersion: codexVersion?.stdout.trim() ?? null,
    // Which credential the next agent will run on, and whether a key is in
    // the runner's environment at all. A job whose first request is refused
    // offers "doctor", and this is the line that answers it.
    agentAuth: agentAuthReport(),
    // The tldraw manual the next job would carry (D30, M2, M3 of
    // docs/STUDIO-CHAT-FIRST.md): `ok`, `stale` when the installed tool names a
    // lint rule the static table does not (or the reverse) or a worked snippet
    // stopped running clean, and `missing` when none could be built. The
    // detail says which rule or snippet.
    manual: manualStatus.state,
    manualDetail: manualStatus,
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
    // The planner's share of that figure: its turns are spend entries in the
    // same window (D36 of docs/STUDIO-CHAT-FIRST.md).
    plannerCostLast24h: cap.plannerUsd,
    plannerTurnsLast24h: cap.plannerTurns,
    plannerTurnsInFlight: drafts?.busy ?? 0,
    dailyCap: cap,
    // The video kind (docs/STUDIO-VIDEOS.md, "API"): whether a video job can
    // be queued now, from the doctor's last answer.
    video:
      video === undefined
        ? { ok: false, sandbox: false, metal: false, kokoro: false, checks: [], note: "this studio was started without the video runner", tools: toolsHealth(), narration: narrationHealth() }
        : videoReport === null
          ? { ok: false, sandbox: false, metal: false, kokoro: false, checks: [], note: "the video doctor has not finished its first check", tools: toolsHealth(toolVerdicts), narration: narrationHealth() }
          : { ...videoReport, running: video.runner.busy, queueDepth: video.store.list({ state: "queued" }).length, tools: toolsHealth(toolVerdicts), narration: narrationHealth() },
    agent,
    diagramAgent: { ok: diagramAgentProblem === null, problem: diagramAgentProblem },
    // When each answer above was checked. `stale` means it is older than that
    // check's own lifetime and a refresh is under way: the next call has it.
    // The video doctor carries its own `checkedAt`, and `vocabulary` its
    // `readAt`.
    freshness: {
      tldrawkc: freshness(doctorRead),
      claude: freshness(claudeRead),
      qwen: freshness(qwenRead),
      codex: freshness(codexRead),
      postgres: freshness(catalogRead),
      agent: freshness(agentRead),
    },
    note: !tldrawkc
      ? "tldrawkc cannot run, so no job can be queued. Build the submodule."
      : !claude
        ? "the claude CLI is not on PATH, so no job can be spawned."
        : diagramAgentProblem !== null
          ? `browsing, the canvas and commits work, but no diagram job can be queued: ${diagramAgentProblem}`
        : // Said here as well as in the 429, because a person who has just been
          // refused looks at health next and a green screen would be a lie.
          cap.exceeded
          ? `everything is answering, but $${cap.totalUsd.toFixed(2)} of the $${(cap.capUsd ?? 0).toFixed(2)} daily cap is spent, so a new job is refused until ${cap.oldestAgesOutAt ?? "some of it ages out"}`
          : postgres
          ? "everything is answering"
          : "not connected to the catalog: browsing and drawing still work, and accept will report indexed: false",
  };
}
