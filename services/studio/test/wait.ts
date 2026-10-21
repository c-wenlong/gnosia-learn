import type { Runner } from "../src/diagram/runner";
import type { JobStore } from "../src/data/store";

/**
 * The waits a studio test does, in one place, because `cap.test.ts` and
 * `queue.test.ts` were each growing their own copy.
 *
 * The rule they encode: wait for the thing, never for a duration. A fixed
 * sleep is a bet that the work landed inside it, and a bet that loses reads a
 * half-written record and asserts against it. Every helper here names what it
 * is waiting for, so a wait that times out says what never happened.
 */

/**
 * Poll `check` until it holds, then return. On the budget running out, throw
 * `what`, which is the name of the thing that never happened.
 *
 * The ten milliseconds is a poll interval, not a bet. It decides how late this
 * notices, never whether it notices, which is the whole difference between a
 * poll and a sleep. `what` may be a function so the message can be built at
 * the moment it is needed and say what the state actually was.
 */
export async function until(
  check: () => boolean,
  what: string | (() => string),
  budgetMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(typeof what === "function" ? what() : what);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Wait until the runner has written everything it is going to write, for every
 * job the store knows about.
 *
 * What a teardown needs before it deletes `STUDIO_HOME`. `drain` stops the
 * agents and returns; it does not wait for the verdicts, and `Runner.finish`
 * has four more writes to do after the state in the store's in-memory map
 * flips. Deleting the home inside that window is the test pulling the
 * directory out from under a live write.
 *
 * `Runner.settled` resolves immediately for a job the runner never started,
 * which is the right answer for one still sitting in the queue: nothing has
 * been written about it since `enqueue` returned.
 */
export async function allSettled(runner: Runner, store: JobStore): Promise<void> {
  await Promise.all(store.list().map((record) => runner.settled(record.id)));
}
