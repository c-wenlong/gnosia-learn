"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  activeJob,
  announcement,
  isActive,
  isTerminal,
  type Job,
  type StudioEvent,
} from "@/lib/studio-jobs";
import { asVideoJob, videoAnnouncement } from "@/lib/studio-video";

/**
 * Where the job state lives, and why it lives there.
 *
 * **The runner owns it.** Layering rule 1 says the UI never spawns an agent and
 * holds no job state of its own, and the design's own layer table repeats it for
 * `apps/web/src/app/studio/`. So there is no store here in any meaningful sense:
 * this is a cache of `GET /api/jobs`, refreshed on a timer and refined by the
 * event stream, and every button it offers is an HTTP call to
 * `127.0.0.1:7250`. Reload the page and the same screen comes back, because the
 * screen was never the record.
 *
 * **It is mounted in the studio layout, not in a page.** The job strip has to
 * persist across `/studio` and `/studio/d/<name>`: a job started from the canvas
 * must still be there after navigating back to the grid. Next keeps a layout
 * mounted across navigations within its segment, so a provider there keeps the
 * list, the events and the open `EventSource` through a route change — where the
 * same provider inside each page would tear the connection down and rebuild it
 * on every click. The URL carries which panel is open (`?job=`, `?draft=`), which
 * is the part a person navigates to and bookmarks; the connection is not that.
 *
 * **The stream is a cache and the polled GET is the record (D8, rule 8).** An
 * event moves the phase on screen immediately, because that is what a stream is
 * for; every terminal event and every ten seconds, the list is re-fetched and
 * the record wins. With the stream off or gone, the same screen is driven by
 * polling alone at a faster interval, which is the fallback and also the thing
 * `?stream=off` exists to make checkable by hand rather than only by accident.
 */

/** `live` is an open stream; `polling` is the fallback; `off` is nothing to watch. */
export type Connection = "live" | "polling" | "off";

export interface PostResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

interface JobsValue {
  jobs: Job[];
  active: Job | null;
  /** The job the stream is following, which is the active one or nothing. */
  watching: string | null;
  events: StudioEvent[];
  connection: Connection;
  streamEnabled: boolean;
  /**
   * Turn the stream off, which `?stream=off` does through the page below.
   *
   * A layout gets no `searchParams` — that is a page's argument — so the flag
   * cannot be read where the provider is mounted. The page reads it and pushes
   * it up through this, which is a smaller thing than moving the provider into
   * each page and losing the connection on every navigation.
   */
  setStreamEnabled: (on: boolean) => void;
  refresh: () => Promise<void>;
  post: (path: string, body?: unknown) => Promise<PostResult>;
  /**
   * The job this tab last watched run, once it has stopped running.
   *
   * The strip is "present only while a job is queued, running, or awaiting
   * review", and that leaves a job that fails with nothing on screen saying so:
   * the row vanishes and the panel that holds the reason is only open if
   * somebody had already opened it. So the strip keeps the job it was watching
   * until it is dismissed. Only this tab's own, and only one — an old failure
   * from yesterday is history, not news.
   */
  lastWatched: string | null;
  /**
   * Every job this tab saw stop running, in the order it saw them.
   *
   * `lastWatched` is one job, the active one; the grid can show several at
   * once (a queued job and a running one, a failure beside a new job), and a
   * failed card stays until it is dismissed only when this tab watched it
   * fail. Yesterday's failures are not in here, which is the point.
   */
  ended: string[];
  /** Dismissed terminal jobs, so a finished strip or card can be put away. */
  dismissed: string[];
  dismiss: (jobId: string) => void;
}

const JobsContext = createContext<JobsValue | null>(null);

/**
 * A POST to the studio runner, through the web app's proxy, without reading
 * the job list after it: what `post` sends, for a caller that has to act on
 * the answer before the list moves under it (the video panel's Revise). A
 * runner that does not answer is `status` 0 with an `error` and its `detail`.
 */
export async function postJob(path: string, body?: unknown): Promise<PostResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      // The proxy refuses anything that is not JSON before it strips the
      // headers that say a page sent it, so this is not decoration.
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    const data = ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        error: "the studio runner is not answering",
        detail: (error as Error).message,
      },
    };
  }
}

/** Every ten seconds even with a live stream: the record reconciles the cache. */
const POLL_LIVE_MS = 10_000;
/** The fallback, when the stream is off or gone and something is running. */
const POLL_FALLBACK_MS = 2_500;
/** Nothing is running, so this is only here to notice a job started elsewhere. */
const POLL_IDLE_MS = 15_000;

const EVENT_TYPES = ["phase", "step", "gate", "done", "error"] as const;

/** One array, so "no events for this job" is the same value on every render. */
const EMPTY: StudioEvent[] = [];

export function JobsProvider({
  initialJobs,
  streamEnabled: initialStream,
  children,
}: {
  initialJobs: Job[];
  streamEnabled: boolean;
  children: ReactNode;
}) {
  const [streamEnabled, setStreamEnabled] = useState(initialStream);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [lastWatched, setLastWatched] = useState<string | null>(null);
  const [ended, setEnded] = useState<string[]>([]);
  /**
   * The events, tagged with the job they belong to.
   *
   * Tagged rather than cleared when the watched job changes, because clearing
   * them would mean setting state from inside the effect that opens the stream,
   * and state set synchronously in an effect is a cascading render — the thing
   * React's own lint rule is about. Tagging makes "whose events are these"
   * something a render can answer instead.
   */
  const [stream, setStream] = useState<{ job: string; events: StudioEvent[] }>({
    job: "",
    events: [],
  });
  /** The job whose stream is currently open. Set only from the source's own callbacks. */
  const [liveFor, setLiveFor] = useState<string | null>(null);

  const active = useMemo(() => activeJob(jobs), [jobs]);
  const watching = active?.jobId ?? null;
  const events = useMemo(
    () => (stream.job === watching ? stream.events : EMPTY),
    [stream, watching],
  );
  // Derived, not stored: nothing to watch is `off`, an open stream for *this*
  // job is `live`, and everything else — not yet open, dropped, turned off — is
  // the polling fallback, which is the state the screen is still correct in.
  const connection: Connection =
    watching === null ? "off" : liveFor === watching && streamEnabled ? "live" : "polling";

  /**
   * The last list this tab saw, so a transition can be noticed in a callback.
   *
   * A ref rather than an effect comparing renders: `refresh` is where a new
   * list arrives, so it is also the honest place to notice that the job this
   * tab was watching has stopped running.
   */
  const previous = useRef<Job[]>(initialJobs);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/studio/api/jobs?limit=50", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { jobs?: Job[] };
      if (!Array.isArray(body.jobs)) return;
      const next = body.jobs;
      const was = activeJob(previous.current);
      const stopped = previous.current
        .filter((before) => isActive(before.state))
        .filter((before) => {
          const now = next.find((job) => job.jobId === before.jobId);
          return now !== undefined && !isActive(now.state);
        })
        .map((before) => before.jobId);
      previous.current = next;
      setJobs(next);
      if (stopped.length > 0) {
        setEnded((held) => [...held, ...stopped.filter((id) => !held.includes(id))]);
      }
      if (was !== null) {
        const now = next.find((job) => job.jobId === was.jobId);
        if (now !== undefined && !isActive(now.state)) setLastWatched(was.jobId);
      }
    } catch {
      // The runner going away is not an error this component reports. The
      // server-rendered screen says so on the next navigation, and a toast per
      // failed poll would say it every two and a half seconds.
    }
  }, []);

  const post = useCallback(
    async (path: string, body?: unknown): Promise<PostResult> => {
      const result = await postJob(path, body);
      // A request that never got an answer changed nothing to read back.
      if (result.status !== 0) await refresh();
      return result;
    },
    [refresh],
  );

  /* ---------------------------------------------------------------- */
  /* The stream                                                        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // Nothing to watch, or `?stream=off`: no connection opens and the poll
    // below is the whole mechanism. `connection` says `polling` on its own,
    // because it is derived rather than assigned here.
    if (watching === null || !streamEnabled) return;

    // `EventSource` reconnects by itself and re-sends `Last-Event-ID` when it
    // does, which is what the runner replays from — so the reconnect contract
    // is the browser's own and not a timer written here. What is written here
    // is what happens *while* it is down: `onerror` drops `liveFor`, the poll
    // below speeds up, and the next `onopen` puts it back.
    const job = watching;
    const source = new EventSource(`/studio/api/jobs/${encodeURIComponent(job)}/events`);
    source.onopen = () => setLiveFor(job);
    source.onerror = () => setLiveFor(null);

    const receive = (message: MessageEvent<string>): void => {
      let event: StudioEvent;
      try {
        event = JSON.parse(message.data) as StudioEvent;
      } catch {
        return;
      }
      setLiveFor(job);
      setStream((held) => {
        // A reconnect replays from the last id that connection saw, and a
        // fresh one replays the runner's whole buffer, so the same seq can
        // arrive twice. Keyed by seq, in seq order.
        if (held.job !== job) return { job, events: [event] };
        if (held.events.some((seen) => seen.seq === event.seq)) return held;
        return { job, events: [...held.events, event].sort((a, b) => a.seq - b.seq) };
      });
      if (event.type === "done" || event.type === "error" || event.type === "gate") {
        // The stream said the job ended; the record says what it ended as.
        void refresh();
      }
    };
    for (const type of EVENT_TYPES) source.addEventListener(type, receive as EventListener);

    return () => {
      for (const type of EVENT_TYPES) source.removeEventListener(type, receive as EventListener);
      source.close();
    };
  }, [watching, streamEnabled, refresh]);

  /* ---------------------------------------------------------------- */
  /* The poll, which is the record                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const every =
      connection === "live" ? POLL_LIVE_MS : watching === null ? POLL_IDLE_MS : POLL_FALLBACK_MS;
    const timer = setInterval(() => void refresh(), every);
    return () => clearInterval(timer);
  }, [connection, watching, refresh]);

  useEffect(() => {
    // A tab that was in the background has been running on a throttled timer,
    // so the first thing it does on return is ask rather than show what it has.
    const wake = (): void => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, [refresh]);

  /* ---------------------------------------------------------------- */
  /* The title and the notification                                    */
  /* ---------------------------------------------------------------- */

  useAnnouncements(jobs);

  const value = useMemo<JobsValue>(
    () => ({
      jobs,
      active,
      watching,
      events,
      connection,
      streamEnabled,
      setStreamEnabled,
      refresh,
      post,
      lastWatched,
      ended,
      dismissed,
      dismiss: (jobId: string) => setDismissed((held) => (held.includes(jobId) ? held : [...held, jobId])),
    }),
    [jobs, active, watching, events, connection, streamEnabled, refresh, post, lastWatched, ended, dismissed],
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useStudioJobs(): JobsValue {
  const value = useContext(JobsContext);
  if (value === null) {
    throw new Error("useStudioJobs is only usable inside the studio layout's JobsProvider");
  }
  return value;
}

/**
 * Say a job finished, when the person is not looking at the tab.
 *
 * Both halves, and in this order. `document.title` changes whatever happens,
 * because a notification is behind a permission that can be refused and often
 * is, and a tab title is the one channel nobody has to grant. The notification
 * is posted only when permission has already been given — asking here would
 * pop a browser prompt minutes after the click that led to it, which is the
 * pattern browsers warn about and people deny. The ask is on the Start button,
 * where a gesture is.
 *
 * The map of what each job was seen as is initialised from the first render
 * without announcing, so opening the studio on a screen full of yesterday's
 * failed jobs is silent.
 */
function useAnnouncements(jobs: readonly Job[]): void {
  const seen = useRef(new Map<string, string>());
  const started = useRef(false);
  const originalTitle = useRef<string | null>(null);

  useEffect(() => {
    if (!started.current) {
      for (const job of jobs) seen.current.set(job.jobId, job.state);
      started.current = true;
      return;
    }

    for (const job of jobs) {
      const before = seen.current.get(job.jobId);
      seen.current.set(job.jobId, job.state);
      if (before === undefined || before === job.state) continue;
      const settled = isTerminal(job.state) || job.state === "awaiting_review";
      if (!settled) continue;

      const video = asVideoJob(job);
      const said = video === null ? announcement(job) : videoAnnouncement(video);
      if (said === null) continue;
      const watching = !document.hidden && document.hasFocus();
      if (watching) continue;

      originalTitle.current ??= document.title;
      document.title = said.title;
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(said.title, { body: said.body, tag: job.jobId });
        }
      } catch {
        // Safari throws on `new Notification` rather than returning null. The
        // title is already changed, which was the half that always works.
      }
    }
  }, [jobs]);

  useEffect(() => {
    const restore = (): void => {
      if (originalTitle.current !== null) {
        document.title = originalTitle.current;
        originalTitle.current = null;
      }
    };
    window.addEventListener("focus", restore);
    return () => window.removeEventListener("focus", restore);
  }, []);
}

/**
 * Ask for notification permission, from inside the click that starts a job.
 *
 * Exported so the Start button owns the prompt: a permission request with no
 * gesture behind it is the thing browsers rate-limit and people refuse out of
 * hand. A refusal costs nothing here — the title still changes.
 */
export async function askToNotify(): Promise<void> {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    await Notification.requestPermission();
  } catch {
    // An older Safari returns a callback API rather than a promise, and a
    // page in an iframe may not be allowed to ask at all.
  }
}
