"use client";

import { useState } from "react";

/**
 * A picker bound to a value the runner's record owns (the model, D90, and the
 * harness). The chip shows the pick at once; the record's own value lands on
 * the state event's reload. The render clears the stand-in as soon as the
 * record shows it, and `pick` clears it when its request settles, so a record
 * set elsewhere never leaves a stale pick standing in.
 *
 * `recorded` is the record's value, its default filled in. `write` sends the
 * pick and answers null, or the sentence to show when it was refused.
 */
export function useOptimisticPick<P extends string>(
  recorded: string,
  write: (next: P) => Promise<string | null>,
): { shown: string; busy: boolean; error: string | null; pick: (next: P) => Promise<void> } {
  /** The pick sent to the runner and not yet seen in the record. */
  const [held, setHeld] = useState<P | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (held !== null && recorded === held) {
    setHeld(null);
  }

  async function pick(next: P) {
    setHeld(next);
    setError(null);
    const refused = await write(next);
    if (refused !== null) setError(refused);
    // Settled: the record's own value takes over on the next reload, whatever
    // it now is, so a pick that never matched it does not stand in forever.
    // A pick made since is newer; this request may not clear it.
    setHeld((current) => (current === next ? null : current));
  }

  return { shown: held ?? recorded, busy: held !== null, error, pick };
}
