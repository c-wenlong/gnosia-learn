import { concept, conceptPrerequisite } from "@gnosia/schema";
import { asc } from "drizzle-orm";

import { withDatabase } from "../db";
import { bytewise } from "../sql-order";

/**
 * `catalog path <from> <to>` — the prerequisite chain between two concepts.
 *
 * **Direction is learning order.** An edge runs from a prerequisite to the
 * thing that needs it, so `path comparing-growth-rates master-theorem` answers
 * "I know the first, what is between me and the second", and the chain comes
 * back in the order it should be studied. The `requires:` and `assumes:` lists
 * in a note point the other way — a note names what it depends on — and this
 * command reverses them, once, here, rather than making every caller think
 * about it.
 *
 * Shortest path, by breadth-first search. The graph is a few dozen nodes, so
 * the whole edge set is read in one query and walked in memory: two round trips
 * total, rather than one per hop.
 *
 * When there is no path, the answer says so *and* says whether swapping the
 * arguments would find one. That is the mistake this command invites, and
 * "no path" with nothing else is the least useful true thing it could say.
 */

export interface PathResult {
  from: string;
  to: string;
  /** The chain in learning order, `from` first and `to` last. Empty when there is none. */
  path: { slug: string; title: string; via: string | null }[];
  found: boolean;
  /** Set when there is no forward path but the reverse exists. */
  hint: string | null;
}

interface Edge {
  to: string;
  kind: string;
}

function link(graph: Map<string, Edge[]>, from: string, edge: Edge): void {
  const existing = graph.get(from);
  if (existing === undefined) graph.set(from, [edge]);
  else existing.push(edge);
}

export class UnknownConcept extends Error {
  constructor(slug: string) {
    super(`"${slug}" is not a concept. Try \`catalog search ${slug}\`.`);
    this.name = "UnknownConcept";
  }
}

export async function runPath(from: string, to: string): Promise<PathResult> {
  return withDatabase(async ({ db }) => {
    const concepts = await db
      .select({ slug: concept.slug, title: concept.title })
      .from(concept)
      .orderBy(asc(bytewise(concept.slug)));
    const titles = new Map(concepts.map((c) => [c.slug, c.title]));
    if (!titles.has(from)) throw new UnknownConcept(from);
    if (!titles.has(to)) throw new UnknownConcept(to);

    const edges = await db
      .select({
        dependent: conceptPrerequisite.conceptSlug,
        prerequisite: conceptPrerequisite.prerequisiteSlug,
        kind: conceptPrerequisite.kind,
      })
      .from(conceptPrerequisite);

    // Learning order: prerequisite → dependent. The reverse map is built at
    // the same time so the "you have the arguments backwards" hint costs no
    // second query.
    const forward = new Map<string, Edge[]>();
    const backward = new Map<string, Edge[]>();
    for (const edge of edges) {
      link(forward, edge.prerequisite, { to: edge.dependent, kind: edge.kind });
      link(backward, edge.dependent, { to: edge.prerequisite, kind: edge.kind });
    }

    const chain = search(forward, from, to);
    if (chain !== null) {
      return {
        from,
        to,
        found: true,
        hint: null,
        path: chain.map((step) => ({
          slug: step.slug,
          title: titles.get(step.slug) ?? step.slug,
          via: step.via,
        })),
      };
    }

    const reverse = search(backward, from, to);
    return {
      from,
      to,
      found: false,
      path: [],
      hint:
        reverse === null
          ? null
          : `"${to}" is a prerequisite of "${from}", not the other way round. ` +
            `Try \`catalog path ${to} ${from}\`.`,
    };
  });
}

/** Breadth-first, so the first chain found is a shortest one. */
function search(
  graph: ReadonlyMap<string, Edge[]>,
  from: string,
  to: string,
): { slug: string; via: string | null }[] | null {
  if (from === to) return [{ slug: from, via: null }];
  const cameFrom = new Map<string, { previous: string; kind: string }>();
  const seen = new Set([from]);
  let frontier = [from];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const edge of graph.get(node) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        cameFrom.set(edge.to, { previous: node, kind: edge.kind });
        if (edge.to === to) return rebuild(cameFrom, from, to);
        next.push(edge.to);
      }
    }
    frontier = next;
  }
  return null;
}

function rebuild(
  cameFrom: ReadonlyMap<string, { previous: string; kind: string }>,
  from: string,
  to: string,
): { slug: string; via: string | null }[] {
  const reversed: { slug: string; via: string | null }[] = [];
  let node = to;
  while (node !== from) {
    const step = cameFrom.get(node);
    if (step === undefined) break;
    reversed.push({ slug: node, via: step.kind });
    node = step.previous;
  }
  reversed.push({ slug: from, via: null });
  return reversed.reverse();
}

export function formatPath(result: PathResult): string {
  if (!result.found) {
    const lines = [`no path from ${result.from} to ${result.to}`];
    if (result.hint !== null) lines.push(result.hint);
    return lines.join("\n");
  }
  const lines = [`${result.path.length} steps, in learning order`, ""];
  for (const [i, step] of result.path.entries()) {
    const arrow = step.via === null ? " " : step.via === "requires" ? "→" : "⇢";
    lines.push(`  ${String(i + 1).padStart(2)}. ${arrow} ${step.slug}  ${step.title}`);
  }
  lines.push("", "→ requires, ⇢ assumes");
  return lines.join("\n");
}
