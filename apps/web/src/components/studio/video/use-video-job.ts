"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { useStudioJobs } from "@/components/studio/JobsProvider";
import type { TranscriptCue, VideoChapter } from "@/components/media";
import { isActive, type StudioEvent } from "@/lib/studio-jobs";
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
      try {
        const response = await fetch(`/studio/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const body = response.ok ? asVideoJob((await response.json()) as { kind?: string }) : null;
        if (!alive) return;
        setDetail({ id: jobId, job: body });
        // A job that has stopped has nothing more to say.
        if (timer !== null && (body === null || !isActive(body.state))) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        if (alive) setDetail((held) => (held?.id === jobId ? held : { id: jobId, job: null }));
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
  const [held, setHeld] = useState<{ job: string; events: StudioEvent[] }>({ job: "", events: [] });

  useEffect(() => {
    if (!own || jobId === null) return;
    // A finished job's stream replays its buffer and then stays open with
    // nothing to say, so it is read only while there is more to come, plus
    // once for a job that has stopped, for its log.
    const source = new EventSource(`/studio/api/jobs/${encodeURIComponent(jobId)}/events`);
    const receive = (message: MessageEvent<string>): void => {
      let event: StudioEvent;
      try {
        event = JSON.parse(message.data) as StudioEvent;
      } catch {
        return;
      }
      setHeld((prev) => {
        if (prev.job !== jobId) return { job: jobId, events: [event] };
        if (prev.events.some((seen) => seen.seq === event.seq)) return prev;
        return { job: jobId, events: [...prev.events, event].sort((a, b) => a.seq - b.seq) };
      });
    };
    for (const type of EVENT_TYPES) source.addEventListener(type, receive as EventListener);
    const closer = live ? null : setTimeout(() => source.close(), 3_000);
    return () => {
      if (closer !== null) clearTimeout(closer);
      for (const type of EVENT_TYPES) source.removeEventListener(type, receive as EventListener);
      source.close();
    };
  }, [own, jobId, live]);

  if (jobId === null) return EMPTY;
  if (!own) return events;
  return held.job === jobId ? held.events : EMPTY;
}

const EVENT_TYPES = ["phase", "step", "gate", "done", "error"] as const;
const EMPTY: StudioEvent[] = [];

function subscribeVisibility(change: () => void): () => void {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
}

/** Whether the tab is showing. Nothing polls in a hidden tab. */
export function usePageVisible(): boolean {
  return !useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
}

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
