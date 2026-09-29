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
 * One video job at a time, and never more. Scenes already render in parallel
 * inside a job (manimkc sizes that itself), so a second job would halve both
 * rather than finish anything sooner. A correctness choice, not a cost one.
 */
export const VIDEO_CONCURRENCY = integer("STUDIO_VIDEO_CONCURRENCY", 1, 1, 1);

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
