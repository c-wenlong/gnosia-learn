/**
 * Sparse positions (D22 of docs/CONTENT-MIGRATION.md).
 *
 * A position that orders separate entities (the topics in `topics.yaml`, the
 * items in a module, the concepts under a topic) is part of each entity's
 * snapshot, so numbering them densely made one insertion at the top of a list
 * a revision of every entity below it: adding a topic wrote 87 topic
 * revisions. Stored positions are therefore sparse, in steps of
 * {@link POSITION_STEP}, and a row keeps the position it has for as long as
 * its place relative to the rows around it is unchanged. Only a row that moved
 * or is new gets a number, taken from the gap it landed in.
 *
 * Positions that order the links inside one entity's snapshot (a topic's
 * `relations:`, a course's `tags:`, an item's `concepts:`) stay dense: any
 * change to such a list is a revision of that one entity whatever the numbers
 * are, so sparseness would buy nothing there.
 *
 * Everything here is pure. The importer (`index/writer.ts`) and the
 * `catalog renumber` command are the two callers, and a phase 1 writer that
 * appends or inserts a row takes its number from {@link placePositions} too,
 * so every writer agrees on what a gap is.
 */

/** The distance between two neighbours when nothing forces them closer. */
export const POSITION_STEP = 1000;

/**
 * Thrown when rows must go between two neighbours whose positions leave no
 * whole number free. Renumbering is not done silently: it is a revision of
 * every row it moves, so it is a command a person runs on purpose
 * (`catalog renumber`), and the message says which.
 */
export class PositionGapError extends Error {
  constructor(
    /** The row before the gap, or null at the head of the list. */
    readonly after: string | null,
    /** The row after the gap, or null at the tail. */
    readonly before: string | null,
    /** The rows that needed a place there. */
    readonly rows: readonly string[],
  ) {
    super(
      `no room for ${rows.map((r) => `"${r}"`).join(", ")} between ` +
        `${after === null ? "the head of the list" : `"${after}"`} and ` +
        `${before === null ? "its end" : `"${before}"`}: their positions are adjacent`,
    );
    this.name = "PositionGapError";
  }
}

/**
 * The stored position of every key in `order`, which is the list as authored.
 *
 * `existing` holds the positions of keys already stored in this list; a key
 * absent from it is new here. The keys whose stored positions already
 * increase in authored order, as many of them as possible (a longest
 * increasing subsequence), keep those positions. The rest are placed in the
 * gaps between their kept neighbours: evenly spread inside a gap, one
 * {@link POSITION_STEP} apart past either end. A list with nothing kept is
 * numbered `STEP, 2 * STEP, ...`.
 *
 * A position two keys share says nothing about their order, so neither keeps
 * it. That is also what a list looks like before it was ever positioned
 * (every row at the column's default), which is therefore numbered afresh.
 *
 * Throws {@link PositionGapError} when a gap is too narrow for the rows that
 * must go in it. Pure and deterministic: the same input places the same way.
 */
export function placePositions(
  order: readonly string[],
  existing: ReadonlyMap<string, number>,
): Map<string, number> {
  if (new Set(order).size !== order.length) {
    throw new Error(`a list names a key twice: ${order.filter((k, i) => order.indexOf(k) !== i).join(", ")}`);
  }
  const counts = new Map<number, number>();
  for (const key of order) {
    const at = existing.get(key);
    if (at !== undefined) counts.set(at, (counts.get(at) ?? 0) + 1);
  }
  const usable = (key: string): number | null => {
    const at = existing.get(key);
    return at === undefined || !Number.isSafeInteger(at) || counts.get(at) !== 1 ? null : at;
  };

  const kept = keptIndices(order.map(usable));
  const out = new Map<string, number>();
  for (const index of kept) out.set(order[index] as string, usable(order[index] as string) as number);

  // Walk the gaps between kept rows, head and tail included.
  const anchors = [-1, ...kept, order.length];
  for (let a = 0; a + 1 < anchors.length; a += 1) {
    const from = anchors[a] as number;
    const to = anchors[a + 1] as number;
    const gap = order.slice(from + 1, to);
    if (gap.length === 0) continue;
    const low = from < 0 ? null : (out.get(order[from] as string) as number);
    const high = to >= order.length ? null : (out.get(order[to] as string) as number);
    const placed = fill(low, high, gap.length);
    if (placed === null) {
      throw new PositionGapError(from < 0 ? null : (order[from] as string), to >= order.length ? null : (order[to] as string), gap);
    }
    gap.forEach((key, i) => out.set(key, placed[i] as number));
  }
  return out;
}

/**
 * Positions for `count` rows strictly between `low` and `high`, either of
 * which may be open. Null when a closed gap has too few whole numbers.
 */
function fill(low: number | null, high: number | null, count: number): number[] | null {
  const steps = Array.from({ length: count }, (_, i) => i + 1);
  if (low === null && high === null) return steps.map((i) => i * POSITION_STEP);
  if (high === null) return steps.map((i) => (low as number) + i * POSITION_STEP);
  if (low === null) return steps.map((i) => high - (count + 1 - i) * POSITION_STEP);
  const width = high - low;
  if (width - 1 < count) return null;
  // Evenly spread. With width >= count + 1 each step is at least 1, so the
  // floors strictly increase and stay inside (low, high).
  return steps.map((i) => low + Math.floor((width * i) / (count + 1)));
}

/**
 * Indices of a longest strictly increasing subsequence of the non-null
 * values, in index order: the most rows that can keep their positions.
 * O(n log n); ties between equally long answers go to the earliest ending,
 * which is deterministic.
 */
function keptIndices(values: readonly (number | null)[]): number[] {
  /** tails[k]: index of the smallest last value of an increasing run of length k + 1. */
  const tails: number[] = [];
  const previous = new Array<number>(values.length).fill(-1);
  values.forEach((value, index) => {
    if (value === null) return;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((values[tails[mid] as number] as number) < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[index] = tails[lo - 1] as number;
    tails[lo] = index;
  });
  const out: number[] = [];
  for (let at = tails.at(-1) ?? -1; at >= 0; at = previous[at] as number) out.push(at);
  return out.reverse();
}

/**
 * Fresh positions for a whole list, `STEP, 2 * STEP, ...`, in the order given:
 * what `catalog renumber` writes, and what a list with no history gets.
 */
export function renumbered(order: readonly string[]): Map<string, number> {
  return new Map(order.map((key, i) => [key, (i + 1) * POSITION_STEP]));
}
