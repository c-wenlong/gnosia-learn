/**
 * The video runner's numbers, with the reason each has the value it has
 * (docs/STUDIO-VIDEOS.md, "Cost and limits" and D54).
 *
 * By the owner's decision there is no per-video spend limit, no render-time
 * limit and no turn cap by default. What is left is one hang timer, the retry
 * policy and the concurrency, and every one of them is here so the first ten
 * real jobs can move them without a code read.
 */

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * How many video jobs run at once: two by default, and never two of one tool
 * (open question 1 of docs/STUDIO-VIDEO-TOOLS.md, measured 2026-10-04). Two
 * jobs of one tool would each size their renders for the whole machine
 * (`renderJobs` in sandbox.ts, two workers, concurrency three), so they still
 * wait for each other.
 *
 * Measured with the three accepted studio videos' own sources, built through
 * their jobs' wrappers inside the profiles: two builds of different tools
 * started together each took 1.0 to 1.6 times as long as alone, and the pair
 * finished 24 to 33% sooner than one after the other. A render is a fifth to
 * a third of a job's wall time (the rest is the agent thinking), so two jobs
 * share the cores for a fraction of their lives, and the second stops
 * waiting a whole job (ten to fifteen minutes) to start. All three at once
 * made manimkc's build three times as slow, which takes a long preview
 * toward the Bash tool's 600 s ceiling, so three is the owner's to set, not
 * the default. `STUDIO_VIDEO_CONCURRENCY=1` is one job at a time again. Read
 * per kick, so a test can set it.
 */
export function videoConcurrency(): number {
  return integer("STUDIO_VIDEO_CONCURRENCY", 2, 1, 3);
}

/**
 * The only timer (D54, amended): this long with no line from the agent
 * **and** no wrapper call ending or still running (`inflight/`, counted for
 * at most the Bash tool's 600 s ceiling). A render runs inside one Bash call,
 * so a long render is not a hang, whatever this is set to. Files under `render/` do not count, since a scene writes them.
 * Twenty minutes is a guess, to be reset against the first ten real jobs
 * (phase 3).
 */
export function videoHangMs(): number {
  return integer("STUDIO_VIDEO_HANG_MS", 20 * 60_000, 30_000, 6 * 3_600_000);
}

/**
 * Not passed unless the owner sets it. A hand-run session has no turn cap,
 * and the owner decided a background one has none either.
 */
export function videoMaxTurns(): number | null {
  const raw = process.env.STUDIO_VIDEO_MAX_TURNS?.trim();
  if (raw === undefined || raw === "" || !/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 ? Math.min(parsed, 10_000) : null;
}

/** Three attempts, as for diagrams: a gate failure resumes the agent with the findings. */
export const VIDEO_MAX_ATTEMPTS = integer("STUDIO_VIDEO_MAX_ATTEMPTS", 3, 1, 5);

/**
 * The Bash tool's own ceiling, which the agent's environment raises to the
 * tool's maximum: an uncached preview of a whole video took up to 131 seconds
 * in manimkc's timing log, past the tool's two-minute default.
 */
export const BASH_TIMEOUT_MS = 600_000;

/** The name the video runner claims jobs under. One runner per generator kind (D25). */
export const VIDEO_RUNNER_NAME = "studio-videos";

/**
 * How long the video doctor's answer is kept. `manimkc doctor` alone took
 * nine seconds (measured), and the fixture render and the hostile probe add
 * more, so it runs at start and every ten minutes, not per request.
 */
export const VIDEO_DOCTOR_TTL_MS = integer("STUDIO_VIDEO_DOCTOR_TTL_MS", 10 * 60_000, 10_000, 24 * 3_600_000);

/**
 * Whether this build carries the video kind, which decides whether a new
 * draft's planner prompt has the video section (D59 of docs/STUDIO-MENTIONS.md).
 * macOS only until the bubblewrap profile is measured on Linux (V4).
 * `STUDIO_VIDEO_KIND=off` turns it off here too, and `on` turns it on
 * elsewhere, for a test suite: built is not usable, and on a machine without
 * Seatbelt the video doctor fails, so every press there answers 503 (V2).
 */
export function videoKindBuilt(): boolean {
  const raw = process.env.STUDIO_VIDEO_KIND?.trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return false;
  if (raw === "on" || raw === "1" || raw === "true") return true;
  return process.platform === "darwin";
}
