"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useStudioJobs } from "@/components/studio/JobsProvider";
import { useJobEventStream } from "@/components/studio/use-job-events";
import type { TranscriptCue, VideoChapter } from "@/components/media";
import { getJob } from "@/lib/studio-job-read";
import { isActive, type StudioEvent } from "@/lib/studio-jobs";
import { usePageVisible } from "@/lib/use-page-visible";
import {
  asVideoJob,
  mediaFiles,
  mediaHref,
  parseVtt,
  readSheets,
  readTranscript,
  sheetsHref,
  SHEETS_POLL_MS,
  type ContactSheet,
  type VideoBrief,
  type VideoJob,
} from "@/lib/studio-video";

/**
 * The video job view's reads, each an HTTP call to the runner through the
 * web app's `/studio/api/*` route handler and nothing else (layering rule 1).
 * Every judgement about what comes back is in `lib/studio-video.ts`.
 */

/**
 * The job: the provider's cached row (the record, polled), and once per job
 * the full `GET /api/jobs/{id}`, which is the only read carrying the brief.
 * A job older than the provider's fifty is read from that route alone, and
 * polled while it is live.
 */
export function useVideoJob(
  jobId: string,
  /** The detail `JobPanel` already read, for a job the provider does not list. */
  initial?: unknown,
): { job: VideoJob | null; brief: VideoBrief | null; looking: boolean } {
  const { jobs } = useStudioJobs();
  const cached = useMemo(() => asVideoJob(jobs.find((entry) => entry.jobId === jobId)), [jobs, jobId]);
  const [detail, setDetail] = useState<{ id: string; job: VideoJob | null } | null>(
    initial === undefined ? null : { id: jobId, job: asVideoJob(initial as { kind?: string } | null) },
  );
  const state = cached?.state ?? null;
  // The first read is already done when `JobPanel` handed one down.
  const skipFirst = useRef(initial !== undefined);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = async (): Promise<void> => {
      const lookup = await getJob(jobId);
      if (!alive) return;
      // A read that failed says nothing about the job: what is held stays,
      // and the next poll asks again.
      if (lookup.kind === "failed") {
        setDetail((held) => (held?.id === jobId ? held : { id: jobId, job: null }));
        return;
      }
      const body = lookup.kind === "found" ? asVideoJob(lookup.body) : null;
      setDetail({ id: jobId, job: body });
      // A job that has stopped has nothing more to say.
      if (timer !== null && (body === null || !isActive(body.state))) {
        clearInterval(timer);
        timer = null;
      }
    };
    if (skipFirst.current) skipFirst.current = false;
    else void load();
    // Polled only when the provider does not hold the row: it polls the record
    // already. A change of `state` there (the gate passing, an accept) reads
    // the detail again, for the fields only it carries.
    const known = detail?.id === jobId ? detail.job : undefined;
    if (state === null && (known === undefined || (known !== null && isActive(known.state)))) {
      timer = setInterval(() => void load(), 5_000);
    }
    return () => {
      alive = false;
      if (timer !== null) clearInterval(timer);
    };
    // `detail` is read for its first value only; each answer must not start another read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, state]);

  const fetched = detail?.id === jobId ? detail.job : null;
  const job = cached ?? fetched;
  return { job, brief: fetched?.brief ?? cached?.brief ?? null, looking: cached === null && detail?.id !== jobId };
}

/**
 * The job's events: the provider's when it is watching this job, else a
 * stream of this panel's own while the job is live. Two jobs can run at once
 * (a diagram and a video), and the provider follows only one.
 */
export function useJobEvents(job: VideoJob | null): StudioEvent[] {
  const { watching, events } = useStudioJobs();
  const jobId = job?.jobId ?? null;
  const own = jobId !== null && watching !== jobId;
  const live = job !== null && isActive(job.state) && job.state !== "awaiting_review";
  // A finished job's stream replays its buffer and then stays open with
  // nothing to say, so it is read only while there is more to come, plus
  // once for a job that has stopped, for its log.
  const { events: held } = useJobEventStream(jobId, { enabled: own, closeAfterMs: live ? undefined : 3_000 });

  if (jobId === null) return EMPTY;
  if (!own) return events;
  return held;
}

const EMPTY: StudioEvent[] = [];

/**
 * The latest contact sheet per scene. Asked for every few seconds while the
 * job renders and the tab is showing, once otherwise. One request at a time,
 * and an answer to an older request than the one showing is dropped.
 */
export function useSheets(jobId: string | null, polling: boolean, enabled = true): { sheets: ContactSheet[]; loaded: boolean } {
  const [held, setHeld] = useState<{ job: string; sheets: ContactSheet[]; loaded: boolean }>({ job: "", sheets: [], loaded: false });
  const visible = usePageVisible();
  const issued = useRef(0);
  const ask = enabled && jobId !== null;
  const poll = ask && polling && visible;

  useEffect(() => {
    if (!ask || jobId === null) return;
    const controller = new AbortController();
    let busy = false;
    const tick = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      const seq = (issued.current += 1);
      try {
        const response = await fetch(sheetsHref(jobId), { cache: "no-store", signal: controller.signal });
        const sheets = response.ok ? readSheets(await response.json()) : [];
        if (controller.signal.aborted || seq !== issued.current) return;
        setHeld((prev) =>
          prev.job === jobId && prev.loaded && sameSheets(prev.sheets, sheets) ? prev : { job: jobId, sheets, loaded: true },
        );
      } catch {
        // The runner going away is said by the strip and the page, not here.
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = poll ? setInterval(() => void tick(), SHEETS_POLL_MS) : null;
    return () => {
      controller.abort();
      if (timer !== null) clearInterval(timer);
    };
  }, [ask, poll, jobId]);

  return held.job === jobId ? { sheets: held.sheets, loaded: held.loaded } : { sheets: [], loaded: false };
}

function sameSheets(a: readonly ContactSheet[], b: readonly ContactSheet[]): boolean {
  return a.length === b.length && a.every((sheet, i) => sheet.scene === b[i]?.scene && sheet.renderedAt === b[i]?.renderedAt && sheet.round === b[i]?.round);
}

/**
 * The finished video's transcript and chapters: manimkc's transcript file when
 * the runner serves it, else the captions file, which carries the lines and
 * their times but no chapters.
 */
export function useTranscript(
  jobId: string,
  slug: string,
  ready: boolean,
): { cues: TranscriptCue[] | undefined; chapters: VideoChapter[] | null } {
  const [held, setHeld] = useState<{ key: string; cues: TranscriptCue[] | undefined; chapters: VideoChapter[] | null } | null>(null);
  const key = `${jobId}:${slug}`;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const files = mediaFiles(slug);
    void (async () => {
      try {
        const rich = await fetch(mediaHref(jobId, files.transcript), { cache: "no-store" });
        const parsed = rich.ok ? readTranscript(await rich.json().catch(() => null)) : null;
        if (parsed !== null) {
          if (alive) setHeld({ key, cues: parsed.cues, chapters: parsed.chapters.length > 0 ? parsed.chapters : null });
          return;
        }
        const plain = await fetch(mediaHref(jobId, files.vtt), { cache: "no-store" });
        const cues = plain.ok ? parseVtt(await plain.text()) : undefined;
        if (alive) setHeld({ key, cues, chapters: null });
      } catch {
        if (alive) setHeld({ key, cues: undefined, chapters: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [jobId, slug, ready, key]);

  return held?.key === key ? { cues: held.cues, chapters: held.chapters } : { cues: undefined, chapters: null };
}
