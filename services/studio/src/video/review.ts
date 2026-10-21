import { jobDiscard, videoPut } from "../data/catalog";
import { backendFor } from "./backend";
import { briefTool } from "./tools";
import type { VideoRunner, VideoStore } from "./runner";
import type { VideoJobRecord } from "./types";

/**
 * Accept and Discard for a video (docs/STUDIO-VIDEOS.md, "Accept").
 *
 * Accept is one catalog verb in one transaction: `catalog video put --job`
 * uploads the gate's copies (checked against the hashes the gate recorded),
 * writes the `video` row and its asset rows, and moves the job to `accepted`.
 * There is no state in which the video has landed and its job is still in
 * review. The runner writes `accepted` to `job.json` after the catalog
 * returns; if it dies in between, its reconcile at start adopts the row's
 * state. A repeated put for the same job and bytes is an idempotent own
 * retry, so a second press or a retry after a timeout is safe.
 *
 * With Postgres down, Accept refuses and the candidate waits (V15).
 */

export interface VideoReviewResult {
  ok: boolean;
  status: number;
  note: string;
  error?: string;
  landed?: string[];
  revision?: number;
}

/** One review action per job at a time: every verdict is a read-then-act over files and a subprocess. */
const locks = new Map<string, Promise<unknown>>();

function locked<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  locks.set(id, next.catch(() => undefined));
  return next;
}

export function acceptVideo(store: VideoStore, runner: VideoRunner, id: string): Promise<VideoReviewResult> {
  return locked(id, async () => {
    const record = store.get(id);
    if (record === undefined) return { ok: false, status: 404, note: `no job ${id}` };
    if (record.state !== "awaiting_review") {
      return { ok: false, status: 409, note: `job ${id} is ${record.state}; only a video in review can be accepted` };
    }
    const paths = await backendFor(briefTool(record.brief)).paths(record.id, record.slug);
    const put = await videoPut({
      jobId: record.id,
      slug: record.slug,
      dir: paths.candidate,
      base: record.targetRevisionBefore,
      reason: `Accepted studio video job ${record.id}: ${record.brief.title}`.slice(0, 500),
    });
    if (!put.ok) {
      const code = (put.json as { code?: unknown } | null)?.code;
      if (put.offline) {
        return { ok: false, status: 503, note: "the catalog is not answering, so nothing landed; the video waits in the job's workspace", error: "offline" };
      }
      return {
        ok: false,
        status: 409,
        note:
          code === "stale-base"
            ? `${record.slug} changed in the catalog while this job ran, so Accept was refused rather than writing over it`
            : `the video did not land: ${put.error ?? "no reason given"}`,
        error: typeof code === "string" ? code : "refused",
      };
    }
    const landed = put.json as { revision?: unknown; assets?: { id?: unknown }[] } | null;
    const written = (landed?.assets ?? []).flatMap((asset) => (typeof asset.id === "string" ? [asset.id] : []));
    const updated = await store.update(id, {
      state: "accepted",
      reviewedAt: new Date().toISOString(),
      written: written.length > 0 ? written : [`video:${record.slug}`],
      indexed: true,
    });
    await store.emit(id, { type: "done", state: "accepted", note: `accepted: ${updated.written.join(", ")} landed in the database` });
    await runner.cleanup(updated, { candidate: true });
    return {
      ok: true,
      status: 200,
      note: `accepted: the video, its sidecars and its poster landed as ${record.slug}`,
      landed: updated.written,
      ...(typeof landed?.revision === "number" ? { revision: landed.revision } : {}),
    };
  });
}

export function discardVideo(store: VideoStore, runner: VideoRunner, id: string): Promise<VideoReviewResult> {
  return locked(id, async () => {
    const record = store.get(id);
    if (record === undefined) return { ok: false, status: 404, note: `no job ${id}` };
    if (record.state !== "awaiting_review") {
      return { ok: false, status: 409, note: `job ${id} is ${record.state}; only a video in review is discarded` };
    }
    const discarded = await jobDiscard(record.id);
    if (!discarded.ok && !discarded.offline) {
      return { ok: false, status: 409, note: `the catalog would not discard job ${id}: ${discarded.error ?? ""}` };
    }
    const updated: VideoJobRecord = await store.update(id, {
      state: "discarded",
      reviewedAt: new Date().toISOString(),
      ...(discarded.ok ? {} : { catalogErrors: [...record.catalogErrors, discarded.error ?? ""].slice(-20) }),
    });
    await store.emit(id, { type: "done", state: "discarded", note: "discarded: the renders are deleted and the source is kept" });
    await runner.cleanup(updated, { candidate: true });
    return { ok: true, status: 200, note: "discarded: render/ and candidate/ are deleted, the source is kept, and nothing landed" };
  });
}
