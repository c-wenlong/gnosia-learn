/**
 * One in-flight write per target, in order.
 *
 * Every learner action fires its own POST, and `fetch` gives no ordering
 * guarantee. Two edits to the same note a few hundred milliseconds apart can
 * reach the server in the wrong order and leave the older text stored while
 * the UI shows the newer. `userResources` is worse, because each request
 * replaces the whole map: two overlapping adds, and one of them is simply
 * gone.
 *
 * So writes are chained per target. A request waits for the previous request
 * to the same target before it starts; different targets stay concurrent,
 * which is the point of keying it rather than serialising everything behind
 * one queue.
 *
 * This is a last-writer-wins order, not a merge. Two tabs still race, and the
 * fix for that is a version column rather than a queue — worth having when
 * there is more than one learner, and not worth the write amplification now.
 */

export interface WriteQueue<T> {
  /**
   * Run `task` after everything already queued for `key`. `onSettled` is
   * called only for the most recent task on that key, so an earlier request
   * finishing late cannot overwrite the outcome of a later one.
   *
   * Several keys make it a barrier: the task waits for all of them and then
   * holds all of them, which is what a reset needs. A reset deletes rows that
   * a note or a tick may still be queued to write, and a delayed write landing
   * after the delete would put back a row the learner just cleared while the
   * page went on showing it as gone.
   */
  run: (
    key: string | readonly string[],
    task: () => Promise<T>,
    onSettled: (result: T) => void,
  ) => void;
  /** How many keys have work outstanding. For tests. */
  readonly pending: number;
}

export function createWriteQueue<T>(): WriteQueue<T> {
  const chains = new Map<string, Promise<unknown>>();

  return {
    run(keyOrKeys, task, onSettled) {
      const keys = typeof keyOrKeys === "string" ? [keyOrKeys] : [...new Set(keyOrKeys)];
      // `allSettled`, so one failed predecessor on any key does not reject the
      // barrier and skip the task behind it.
      const previous =
        keys.length === 1
          ? (chains.get(keys[0] as string) ?? Promise.resolve())
          : Promise.allSettled(keys.map((k) => chains.get(k) ?? Promise.resolve()));
      // `.then(task, task)`, not `.then(task)`: a rejected predecessor must not
      // cancel the write behind it, or one network blip would strand every
      // later edit to that target.
      const next = previous.then(task, task);
      for (const key of keys) chains.set(key, next);
      void next.then(
        (result) => {
          // Superseded: a newer task for one of these keys was queued while
          // this one was in flight, and that one's outcome is the current one.
          // Reported once even when several keys still point at this task.
          let current = false;
          for (const key of keys) {
            if (chains.get(key) !== next) continue;
            chains.delete(key);
            current = true;
          }
          if (current) onSettled(result);
        },
        // A rejection handler, even though it only tidies up. Without one
        // `next` is an unhandled rejection whenever a task throws, which in a
        // browser is a console error the learner sees and in Node is a process
        // warning. Tasks here are expected to resolve with a result that says
        // it failed; one that throws instead is a bug in the caller, and the
        // queue's job is to keep going rather than to report it twice.
        () => {
          for (const key of keys) {
            if (chains.get(key) === next) chains.delete(key);
          }
        },
      );
    },
    get pending() {
      return chains.size;
    },
  };
}
