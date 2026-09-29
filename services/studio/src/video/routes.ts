import { constants } from "node:fs";
import { open, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { BriefError, loadVocabulary } from "../brief";
import { JobRefused } from "../runner";
import { validateVideoBrief } from "./brief";
import { readCalls } from "./calls";
import { resolvedPaths } from "./checkout";
import { candidateNames, sheetPath } from "./paths";
import { acceptVideo, discardVideo } from "./review";
import type { Drafts } from "../drafts";
import { videoNote, type VideoRunner, type VideoStore } from "./runner";
import type { VideoJobRecord } from "./types";

/**
 * The video job routes (docs/STUDIO-VIDEOS.md, "API"), on the runner's one
 * server behind the same `guard` and owner check `api.ts` applies before it
 * dispatches here, and behind the web app's `/studio/api/*` route handler,
 * which already forwards `Range` and streams the body.
 *
 * Every file these routes serve is named from a fixed list or checked against
 * the brief's scene classes, never taken from the request, and a file under
 * `render/` (a sheet, written by sandboxed agent code) is opened with
 * `O_NOFOLLOW` and served only when it is a regular file with one link.
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

export interface VideoDeps {
  store: VideoStore;
  runner: VideoRunner;
}

/** One video job, as every route reports it. */
export function videoView(record: VideoJobRecord): Record<string, unknown> {
  return {
    jobId: record.id,
    kind: record.kind,
    state: record.state,
    phase: record.phase,
    title: record.brief.title,
    topic: record.topic,
    slug: record.slug,
    target: record.targetPath,
    classes: record.classes,
    draftId: record.draftId ?? null,
    parentJob: record.parentJobId,
    attempt: record.attempt,
    turns: record.turns,
    costUsd: record.costUsd,
    costSource: record.costSource,
    agentAuth: record.agentAuth ?? null,
    apiKeySource: record.apiKeySource ?? null,
    manualHash: record.manualHash ?? null,
    agentModel: record.agentModel ?? null,
    agentEffort: record.agentEffort ?? null,
    resolvedModel: record.resolvedModel ?? null,
    seeded: record.seeded ?? null,
    steps: record.steps,
    lineChanges: record.lineChanges.filter((change) => change.kind !== "unchanged"),
    gate: record.gate,
    exitCode: record.exitCode,
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
    note: videoNote(record),
  };
}

/** `POST /api/jobs` with `kind: "video"`: the brief is the body, beside `kind`. */
export async function postVideoJob(body: unknown, response: ServerResponse, deps: VideoDeps): Promise<void> {
  const raw = { ...(body as Record<string, unknown>) };
  delete raw.kind;
  if (raw.draftId !== undefined) {
    return fail(response, 400, "a video job from a draft's press arrives with the chat (phase 2); post the brief alone");
  }
  let vocabulary;
  try {
    vocabulary = await loadVocabulary();
  } catch (error) {
    return fail(response, 503, `the topic list cannot be read and there is no cached copy: ${(error as Error).message}`);
  }
  let brief;
  try {
    brief = validateVideoBrief(raw, vocabulary);
  } catch (error) {
    if (error instanceof BriefError) return fail(response, 400, error.message, { field: error.field });
    throw error;
  }
  try {
    const { record, created, jobsAhead } = await deps.runner.enqueue(brief);
    return send(response, created ? 201 : 200, {
      jobId: record.id,
      kind: "video",
      state: record.state,
      jobsAhead,
      created,
      note: created ? `queued on the video runner; ${jobsAhead} ahead of it` : `this idempotency key already belongs to job ${record.id}`,
    });
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/** `/api/jobs/{id}/...` for a video job. `segments` is the whole path, split. */
export async function videoJobRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  method: string,
  url: URL,
  record: VideoJobRecord,
  deps: VideoDeps,
  drafts?: Drafts,
): Promise<void> {
  const { store, runner } = deps;
  // T20: a Revise or Resume carries its draft and its kind while the job is
  // the video slot's newest; anything else queues standalone.
  const carried = record.draftId !== null && record.draftId !== undefined && drafts?.carries(record.draftId, record.id, "video") === true ? record.draftId : null;
  const id = record.id;
  if (segments.length === 3) {
    if (method !== "GET") return fail(response, 405, `${method} is not a thing /api/jobs/{id} does`);
    return send(response, 200, { ...videoView(record), brief: record.brief });
  }
  const action = segments[3] ?? "";
  try {
    switch (`${method} ${action}`) {
      case "GET events":
        return events(request, response, store, record);
      case "GET log": {
        const from = Math.max(0, Number.parseInt(url.searchParams.get("from") ?? "0", 10) || 0);
        const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2_000) : 200;
        return send(response, 200, await store.logWindow(id, from, limit));
      }
      case "POST cancel": {
        const cancelled = await runner.cancel(id);
        return send(response, 202, { jobId: id, state: cancelled.state, cancelRequestedAt: cancelled.cancelRequestedAt, note: videoNote(cancelled) });
      }
      case "POST accept": {
        const result = await acceptVideo(store, runner, id);
        if (!result.ok) return fail(response, result.status, result.note, { reason: result.error ?? null });
        return send(response, 200, { jobId: id, state: store.get(id)?.state, landed: result.landed ?? [], revision: result.revision ?? null, note: result.note });
      }
      case "POST discard": {
        const result = await discardVideo(store, runner, id);
        if (!result.ok) return fail(response, result.status, result.note);
        return send(response, 200, { jobId: id, state: store.get(id)?.state, note: result.note });
      }
      case "POST revise": {
        let body: { changes?: unknown };
        try {
          body = (await readJson(request)) as { changes?: unknown };
        } catch (error) {
          return fail(response, 400, "the request body is not JSON", (error as Error).message);
        }
        const changes = typeof body.changes === "string" ? body.changes.trim() : "";
        if (changes === "" || changes.length > 2_000) {
          return fail(response, 400, `"changes" is required, at most 2000 characters: what should look different`);
        }
        // From review, the parent is discarded in the child's own transaction
        // and marked `replacedBy` the child, which is how its draft tells the
        // discard from a verdict (D52).
        const next = await runner.revise(record, changes, carried);
        if (carried !== null) await drafts!.markDrawing(carried, next.id, "video");
        return send(response, 201, {
          jobId: next.id,
          state: next.state,
          parentJob: id,
          resuming: next.agentSessionId !== null,
          note: record.state === "awaiting_review" ? `queued as a change of ${id}, which was discarded in the same step` : `queued as a change of ${id}`,
        });
      }
      case "POST resume": {
        const next = await runner.resume(record, carried);
        if (carried !== null) await drafts!.markDrawing(carried, next.id, "video");
        return send(response, 201, { jobId: next.id, state: next.state, parentJob: id, note: `queued, continuing ${id}` });
      }
      case "GET sheets":
        if (segments.length === 4) return sheetList(response, record);
        if (segments.length === 5) return sheetBytes(response, record, segments[4] ?? "");
        return fail(response, 404, `no route ${method} ${url.pathname}`);
      case "GET media":
        if (segments.length === 5) return media(request, response, record, segments[4] ?? "");
        return fail(response, 404, `no route ${method} ${url.pathname}`);
      default:
        return fail(response, 404, `no route ${method} ${url.pathname}`, {
          routes: ["GET events|log|sheets|sheets/{scene}.png|media/{file}", "POST cancel|accept|discard|revise|resume"],
        });
    }
  } catch (error) {
    if (error instanceof JobRefused) return fail(response, error.status, error.message, error.detail);
    throw error;
  }
}

/** Where a scene's latest sheet is: the render's, or the copy kept after a verdict. */
async function sheetFile(record: VideoJobRecord, scene: string): Promise<string | null> {
  const paths = await resolvedPaths(record.id, record.slug);
  for (const file of [sheetPath(paths, scene), path.join(paths.job, "sheets", `${scene}.sheet.png`)]) {
    const facts = await stat(file).catch(() => null);
    if (facts !== null) return file;
  }
  return null;
}

function titleOf(record: VideoJobRecord, scene: string): string {
  const index = record.classes.indexOf(scene);
  const name = record.brief.scenes[index]?.name ?? scene;
  const words = name.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `GET /api/jobs/{id}/sheets`: the latest sheet per scene, in play order. */
async function sheetList(response: ServerResponse, record: VideoJobRecord): Promise<void> {
  const paths = await resolvedPaths(record.id, record.slug);
  const calls = await readCalls(paths.calls);
  const sheets = [];
  for (const scene of record.classes) {
    const file = await sheetFile(record, scene);
    if (file === null) continue;
    const facts = await stat(file).catch(() => null);
    const round = calls.filter((call) => call.verb === "preview" && (call.rendered ?? []).includes(scene)).length;
    sheets.push({
      scene,
      title: titleOf(record, scene),
      url: `/api/jobs/${record.id}/sheets/${scene}.png`,
      renderedAt: facts?.mtime.toISOString() ?? null,
      round,
    });
  }
  return send(response, 200, { sheets, note: `${sheets.length} of ${record.classes.length} scenes have a sheet` });
}

/**
 * Open a file under a job for serving: no link followed, a regular file with
 * one link only. Null when it is not there or not that.
 */
async function openServable(file: string): Promise<{ handle: import("node:fs/promises").FileHandle; size: number; mtime: Date } | null> {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return null;
  }
  const facts = await handle.stat();
  if (!facts.isFile() || facts.nlink !== 1) {
    await handle.close();
    return null;
  }
  return { handle, size: facts.size, mtime: facts.mtime };
}

/**
 * Send an opened file and close it however the response ends.
 *
 * `pipe` alone left the handle open when the browser aborted a range request
 * mid-body, which a video player does on every seek: the response closed, the
 * read stream was unpiped and paused rather than destroyed, and its `close`
 * never came, so the handle waited for the garbage collector (36 "Closing file
 * descriptor on garbage collection" warnings after one session of playing and
 * seeking, Phase 2 measured in docs/STUDIO-VIDEOS.md). `pipeline` destroys the
 * read stream when the response closes early, and the handle's own stream
 * closes the handle when it is destroyed or ends.
 */
function streamHandle(
  handle: import("node:fs/promises").FileHandle,
  response: ServerResponse,
  label: string,
  range: { start: number; end: number } | null = null,
): void {
  const stream = handle.createReadStream(range === null ? {} : { start: range.start, end: range.end });
  pipeline(stream, response).catch((error: unknown) => {
    // A client that went away is the ordinary end of a seek, not an error. A
    // read that failed is, and the runner's log is where it is looked for.
    if (clientWentAway(error)) return;
    console.error(`studio: serving ${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

/** Whether a failed pipeline only means the response was closed before the body was sent. */
export function clientWentAway(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ERR_STREAM_PREMATURE_CLOSE" || code === "ECONNRESET" || code === "EPIPE";
}

async function sheetBytes(response: ServerResponse, record: VideoJobRecord, name: string): Promise<void> {
  const scene = name.endsWith(".png") ? name.slice(0, -4) : "";
  if (!record.classes.includes(scene)) return fail(response, 404, "no such scene in this job's brief");
  const file = await sheetFile(record, scene);
  const opened = file === null ? null : await openServable(file);
  if (opened === null) return fail(response, 404, `${scene} has no sheet yet`);
  response.writeHead(200, {
    "content-type": "image/png",
    "content-length": opened.size,
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache",
    "last-modified": opened.mtime.toUTCString(),
  });
  streamHandle(opened.handle, response, `the sheet of ${scene} for job ${record.id}`);
}

/**
 * `GET /api/jobs/{id}/media/{file}`: the gate's copies, named from a fixed
 * list (the mp4, the `.vtt`, the `.transcript.json` and the poster), every one
 * with `Range`, as the mp4 has always had.
 */
async function media(request: IncomingMessage, response: ServerResponse, record: VideoJobRecord, name: string): Promise<void> {
  const names = candidateNames(record.slug);
  const types: Record<string, string> = {
    [names.mp4]: "video/mp4",
    [names.vtt]: "text/vtt; charset=utf-8",
    [names.transcript]: "application/json; charset=utf-8",
    "poster.jpg": "image/jpeg",
  };
  const type = types[name];
  if (type === undefined) return fail(response, 404, "not one of this job's media files", { files: Object.keys(types) });
  const paths = await resolvedPaths(record.id, record.slug);
  const opened = await openServable(path.join(paths.candidate, name));
  if (opened === null) return fail(response, 404, `${name} is not there: the gate has not passed, or the job was reviewed`);
  const { size } = opened;
  const range = request.headers.range;
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (typeof range === "string" && size > 0) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match === null || (match[1] === "" && match[2] === "")) {
      await opened.handle.close();
      response.writeHead(416, { "content-range": `bytes */${size}` });
      return void response.end();
    }
    if (match[1] === "") {
      start = Math.max(0, size - Number(match[2]));
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (start > end || start >= size) {
      await opened.handle.close();
      response.writeHead(416, { "content-range": `bytes */${size}` });
      return void response.end();
    }
    status = 206;
  }
  response.writeHead(status, {
    "content-type": type,
    "content-length": end - start + 1,
    "accept-ranges": "bytes",
    ...(status === 206 ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache",
  });
  streamHandle(opened.handle, response, `${name} for job ${record.id}`, { start, end });
}

function events(request: IncomingMessage, response: ServerResponse, store: VideoStore, record: VideoJobRecord): void {
  const header = request.headers["last-event-id"];
  const after = Number.parseInt(Array.isArray(header) ? (header[0] ?? "0") : (header ?? "0"), 10);
  response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" });
  const write = (event: { seq: number; type: string }): void => {
    response.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const { replay, omitted, unsubscribe } = store.subscribe(record.id, Number.isFinite(after) ? after : 0, write);
  if (omitted > 0) response.write(`: ${omitted} events omitted, the buffer only keeps the most recent\n\n`);
  for (const event of replay) write(event);
  const keepAlive = setInterval(() => response.write(": keep-alive\n\n"), 20_000);
  request.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}
