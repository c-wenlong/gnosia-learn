import type { GraphEdge } from "@/lib/concept-graph";
import type { MapLayout } from "@/lib/concept-map";

/**
 * Walking the map with the keyboard (phase 4 of
 * docs/proposals/knowledge-map.md). Tab moves between islands, Enter enters
 * one at its first concept, and the arrows move from there: up to a
 * prerequisite, down to a dependant, left and right through the island in
 * reading order, so every concept is reachable. Nothing here crosses into
 * another island. Pure, so the rules are tested without a DOM.
 */

export type MapKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** An island's concepts row by row, top to bottom, then left to right. */
export function readingOrder(layout: MapLayout, islandId: string): string[] {
  const island = layout.islands.find((i) => i.id === islandId);
  if (island === undefined) return [];
  return [...island.nodes].sort((a, b) => {
    const p = layout.positions[a];
    const q = layout.positions[b];
    return p.y - q.y || p.x - q.x;
  });
}

/** Where Enter goes into an island: its top left concept. */
export function firstConcept(layout: MapLayout, islandId: string): string | null {
  return readingOrder(layout, islandId)[0] ?? null;
}

/** The concept a key moves to from `current`, or `current` when there is nowhere to go. */
export function keyTarget(layout: MapLayout, edges: readonly GraphEdge[], current: string, key: string): string {
  const island = layout.islandOf[current];
  const here = layout.positions[current];
  if (island === undefined || here === undefined) return current;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const order = readingOrder(layout, island);
    const i = order.indexOf(current);
    const next = key === "ArrowRight" ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
    return order[next] ?? current;
  }
  if (key !== "ArrowUp" && key !== "ArrowDown") return current;
  const candidates = edges
    .filter((e) => (key === "ArrowDown" ? e.from === current : e.to === current))
    .map((e) => (key === "ArrowDown" ? e.to : e.from))
    .filter((id) => layout.islandOf[id] === island && layout.positions[id] !== undefined);
  if (candidates.length === 0) return current;
  // The nearest across, then the nearest in height, then by name.
  return [...new Set(candidates)].sort((a, b) => {
    const p = layout.positions[a];
    const q = layout.positions[b];
    return Math.abs(p.x - here.x) - Math.abs(q.x - here.x) || Math.abs(p.y - here.y) - Math.abs(q.y - here.y) || (a < b ? -1 : 1);
  })[0];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What a screen reader hears about the map: its islands, how to move, and where the list is. */
export function mapSummary(layout: MapLayout): string {
  const islands = layout.islands.map((i) => `${i.title} (${plural(i.nodes.length, "concept")})`).join(", ");
  return (
    `The map has ${plural(layout.islands.length, "island")}: ${islands}. ` +
    "Tab and Shift Tab move between islands. Enter goes into an island at its first concept; the arrow keys then move " +
    "up to what a concept needs, down to what it leads to, and left and right through the island. Enter on a concept " +
    "shows its details; Escape goes back to the island. The table view lists every concept."
  );
}
