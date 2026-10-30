/**
 * The learner's last turn when the tutor never answered it (a failed turn,
 * or a request a reload cut off), shared by every tutor chat so each offers
 * Try again the same way and none sends two learner turns in a row.
 *
 * `turn` is the unanswered turn itself, past any studio hand-off marker after
 * it, and `rest` the thread without it. Try again sends `turn` back as it is,
 * verdict and all, so an answer keeps its row and its request id; a new
 * question goes onto `rest` in its place. Null when the last turn is the
 * tutor's, or the thread is empty.
 */
export function takeUnanswered<T extends { role: string }>(items: readonly T[]): { turn: T; rest: T[] } | null {
  const at = items.findLastIndex((item) => item.role !== "studio");
  const turn = items[at];
  if (turn?.role !== "user") return null;
  return { turn, rest: [...items.slice(0, at), ...items.slice(at + 1)] };
}
