import type { LineChange } from "./types";

/**
 * The brief's lines against the ones a source voices or shows (D47, D48 of
 * docs/STUDIO-VIDEOS.md): the part of the gate's script step every backend
 * shares, whatever its source is written in. A module of its own so a
 * backend's checks can use it without importing the gate, which imports them.
 */

/** Sequence the brief's lines for one scene against the voiced ones: equal lines anchor, gaps are changes. */
export function compareLines(scene: string, brief: readonly string[], voiced: readonly string[]): LineChange[] {
  // Longest common subsequence on exact equality.
  const n = brief.length;
  const m = voiced.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i]![j] = brief[i] === voiced[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const changes: LineChange[] = [];
  let gapBrief: string[] = [];
  let gapVoiced: string[] = [];
  const flush = (): void => {
    if (gapBrief.length === 1 && gapVoiced.length > 1) {
      changes.push({ scene, kind: "split", brief: gapBrief[0]!, voiced: gapVoiced });
    } else {
      const paired = Math.min(gapBrief.length, gapVoiced.length);
      for (let k = 0; k < paired; k += 1) changes.push({ scene, kind: "reworded", brief: gapBrief[k]!, voiced: [gapVoiced[k]!] });
      for (const line of gapBrief.slice(paired)) changes.push({ scene, kind: "dropped", brief: line, voiced: [] });
      for (const line of gapVoiced.slice(paired)) changes.push({ scene, kind: "added", brief: null, voiced: [line] });
    }
    gapBrief = [];
    gapVoiced = [];
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && brief[i] === voiced[j]) {
      flush();
      changes.push({ scene, kind: "unchanged", brief: brief[i]!, voiced: [voiced[j]!] });
      i += 1;
      j += 1;
    } else if (j < m && (i === n || table[i]![j + 1]! >= table[i + 1]![j]!)) {
      gapVoiced.push(voiced[j]!);
      j += 1;
    } else {
      gapBrief.push(brief[i]!);
      i += 1;
    }
  }
  flush();
  return changes;
}

/** Is `needle` in order, as whole literals, inside `haystack`? The first needle missing, or null when all are there. */
export function inOrder(needles: readonly string[], haystack: readonly string[]): string | null {
  let at = 0;
  for (const needle of needles) {
    while (at < haystack.length && haystack[at] !== needle) at += 1;
    if (at === haystack.length) return needle;
    at += 1;
  }
  return null;
}
