/**
 * One check the runner keeps an answer to, so that reporting it costs nothing.
 *
 * `/api/health` used to await every check it reports on each call: the canvas
 * `doctor` (a Chromium launch), `claude --version`, `catalog status` and two
 * `catalog preference get`, each a subprocess. On an idle machine that was half
 * a second a call and a second and a half every thirty; on a loaded one it was
 * the slowest subprocess, and a Chromium launch under load measured 15 to 23
 * seconds. The /studio page awaits health before it renders, so every page load
 * took that long.
 *
 * A probe answers in one of two ways, and the caller picks which by what it is
 * about to do with the answer:
 *
 * - `read()`, for reporting: the last answer at once, however old, with when it
 *   came. An answer older than the TTL starts a refresh in the background and is
 *   returned anyway, so the next read gets the new one. Only the very first read,
 *   when there is no answer at all, waits for a check: an empty verdict would be
 *   read as a failing one, and a screen that says "tldrawkc cannot run" for the
 *   first second after a start is a lie.
 * - `fresh()`, for gating: an answer younger than the TTL, or it waits for a new
 *   one. Something about to refuse or admit work decides on a current answer.
 *
 * Concurrent callers share one check either way, and the stamp is when the check
 * answered, not when it was asked for, so a check slower than its own TTL still
 * caches (the two ways the first `doctor` cache leaked, in `canvas.ts`).
 *
 * A check should not throw: a missing CLI or a database that does not answer is
 * an answer, and the caller wraps the check so it says so. If one does throw, no
 * answer is stored and the error reaches whoever is waiting on it.
 */

export interface ProbeReading<T> {
  value: T;
  /** When the check that produced `value` answered. */
  checkedAt: string;
  ageMs: number;
  /** Older than the TTL: a refresh has been started, and this is the last answer until it lands. */
  stale: boolean;
  /** A check is running now. */
  refreshing: boolean;
}

export class Probe<T> {
  private last: { value: T; at: number } | null = null;
  private inFlight: Promise<T> | null = null;
  /** Bumped by `forget`, so a check that started before it cannot store what it read. */
  private generation = 0;

  constructor(
    private readonly check: () => Promise<T>,
    readonly ttlMs: number,
    // Read through a closure, so a test's fake clock is the one consulted.
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Start a check unless one is running, and return it. */
  refresh(): Promise<T> {
    if (this.inFlight !== null) return this.inFlight;
    const generation = this.generation;
    const running = (async () => {
      try {
        // Behind a resolved promise, so a check that throws before its first
        // await still settles after `inFlight` is assigned below, and clears it.
        const value = await Promise.resolve().then(() => this.check());
        if (generation === this.generation) this.last = { value, at: this.now() };
        return value;
      } finally {
        // A `forget` since this started has already let go of it, and may have
        // started a newer check that is not this one's to clear.
        if (generation === this.generation) this.inFlight = null;
      }
    })();
    this.inFlight = running;
    return running;
  }

  /** An answer younger than the TTL, waiting for a check when there is none. For a gate. */
  async fresh(): Promise<T> {
    if (this.last !== null && this.now() - this.last.at < this.ttlMs) return this.last.value;
    return this.refresh();
  }

  /** The last answer at once, refreshing it in the background when it is old. For a report. */
  async read(): Promise<ProbeReading<T>> {
    if (this.last === null) {
      const value = await this.refresh();
      // A `forget` while this read waited leaves nothing stored; report what
      // the check said, stamped now, rather than nothing.
      if (this.last === null) this.last = { value, at: this.now() };
    } else if (this.now() - this.last.at >= this.ttlMs) {
      // Nobody awaits this one; a failure leaves the last answer standing and
      // the next read tries again.
      this.refresh().catch(() => undefined);
    }
    // `refresh` resolved, so `last` is set.
    const last = this.last as unknown as { value: T; at: number };
    const ageMs = Math.max(0, this.now() - last.at);
    return {
      value: last.value,
      checkedAt: new Date(last.at).toISOString(),
      ageMs,
      stale: ageMs >= this.ttlMs,
      refreshing: this.inFlight !== null,
    };
  }

  /** Start the first check without waiting for it: at start, so the first read finds an answer. */
  warm(): void {
    this.refresh().catch(() => undefined);
  }

  /** Drop the answer, so the next read waits for a new one: after a write that changes it. */
  forget(): void {
    this.last = null;
    this.inFlight = null;
    this.generation += 1;
  }
}
