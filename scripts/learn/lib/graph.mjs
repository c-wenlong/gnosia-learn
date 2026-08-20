/**
 * The concept DAG.
 *
 * Every concept declares the concepts it `requires`. That turns the corpus
 * into a dependency graph, which is what makes "teach at the edge of
 * understanding" computable rather than a vibe: the frontier is exactly the
 * set of concepts whose prerequisites are all mastered but which are not
 * themselves mastered.
 */

import { GAP_THRESHOLD, MASTERY_THRESHOLD, isMastered } from "./bkt.mjs";

/** Index concepts by id, with normalized prerequisite lists. */
export function buildGraph(concepts) {
  const nodes = new Map();
  for (const concept of concepts) {
    nodes.set(concept.id, {
      ...concept,
      requires: normalizeList(concept.requires),
      tags: normalizeList(concept.tags),
      topics: normalizeList(concept.topics),
    });
  }

  const dependents = new Map();
  for (const [id, node] of nodes) {
    for (const dep of node.requires) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep).push(id);
    }
  }

  return { nodes, dependents };
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/** Prerequisites named by a concept but absent from the corpus. */
export function danglingEdges(graph) {
  const out = [];
  for (const [id, node] of graph.nodes) {
    for (const dep of node.requires) {
      if (!graph.nodes.has(dep)) out.push({ from: id, missing: dep });
    }
  }
  return out;
}

/**
 * Every dependency cycle, via iterative DFS with a colour marking.
 * A cycle means the curriculum is unlearnable, so this is a hard error.
 */
export function findCycles(graph) {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map([...graph.nodes.keys()].map((id) => [id, WHITE]));
  const cycles = [];

  for (const start of graph.nodes.keys()) {
    if (colour.get(start) !== WHITE) continue;

    const stack = [{ id: start, path: [start], index: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index === 0) colour.set(frame.id, GREY);

      const node = graph.nodes.get(frame.id);
      const deps = node ? node.requires : [];

      if (frame.index >= deps.length) {
        colour.set(frame.id, BLACK);
        stack.pop();
        continue;
      }

      const dep = deps[frame.index];
      frame.index += 1;
      if (!graph.nodes.has(dep)) continue;

      if (colour.get(dep) === GREY) {
        const cut = frame.path.indexOf(dep);
        cycles.push([...frame.path.slice(cut === -1 ? 0 : cut), dep]);
      } else if (colour.get(dep) === WHITE) {
        stack.push({ id: dep, path: [...frame.path, dep], index: 0 });
      }
    }
  }

  return dedupeCycles(cycles);
}

function dedupeCycles(cycles) {
  const seen = new Set();
  const out = [];
  for (const cycle of cycles) {
    const key = [...cycle].sort().join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cycle);
  }
  return out;
}

/**
 * Kahn topological sort, prerequisites first. Ties break alphabetically so
 * the same corpus always produces the same plan.
 */
export function topoSort(graph, ids = [...graph.nodes.keys()]) {
  const subset = new Set(ids.filter((id) => graph.nodes.has(id)));
  const indegree = new Map();

  for (const id of subset) {
    const deps = graph.nodes.get(id).requires.filter((d) => subset.has(d));
    indegree.set(id, deps.length);
  }

  const ready = [...subset].filter((id) => indegree.get(id) === 0).sort();
  const order = [];

  while (ready.length > 0) {
    const id = ready.shift();
    order.push(id);
    for (const dependent of graph.dependents.get(id) ?? []) {
      if (!subset.has(dependent)) continue;
      const next = indegree.get(dependent) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }

  // A short order means the remainder sits in a cycle.
  return { order, incomplete: order.length !== subset.size };
}

/** Transitive closure of a concept's prerequisites, nearest first. */
export function ancestors(graph, id) {
  const seen = new Set();
  const queue = [...(graph.nodes.get(id)?.requires ?? [])];
  const out = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current) || !graph.nodes.has(current)) continue;
    seen.add(current);
    out.push(current);
    queue.push(...graph.nodes.get(current).requires);
  }
  return out;
}

/**
 * Every prerequisite reachable from `id`, mapped to its shortest hop distance.
 *
 * Breadth-first, so each concept appears exactly once even when many routes
 * reach it. That matters: `transformer-block` reaches `vector-as-a-list-of-numbers`
 * by six separate paths, and BKT treats each update as independent evidence.
 * Walking the routes rather than the set would count one answer six times and
 * promote a concept the learner was never asked about.
 */
export function prerequisiteDistances(graph, id) {
  const distances = new Map();
  const seen = new Set([id]);
  const queue = [[id, 0]];

  while (queue.length > 0) {
    const [current, depth] = queue.shift();
    for (const dep of graph.nodes.get(current)?.requires ?? []) {
      if (!graph.nodes.has(dep) || seen.has(dep)) continue;
      seen.add(dep);
      distances.set(dep, depth + 1);
      queue.push([dep, depth + 1]);
    }
  }

  return distances;
}

export function masteryOf(model, id) {
  const entry = model.concepts?.[id];
  return typeof entry?.pL === "number" ? entry.pL : (model.params?.pL0 ?? 0.25);
}

/**
 * The frontier: concepts that are not yet mastered but whose prerequisites
 * all are. This is the only place teaching should happen — below it the
 * learner already knows the material, above it they cannot yet follow.
 */
export function frontier(graph, model, { goal = null } = {}) {
  const scope = goal ? new Set([goal, ...ancestors(graph, goal)]) : null;
  const out = [];

  for (const [id, node] of graph.nodes) {
    if (scope && !scope.has(id)) continue;
    const pL = masteryOf(model, id);
    if (isMastered(pL)) continue;

    const unmetPrereqs = node.requires.filter(
      (dep) => graph.nodes.has(dep) && !isMastered(masteryOf(model, dep)),
    );
    if (unmetPrereqs.length > 0) continue;

    out.push({ id, title: node.title ?? id, pL, requires: node.requires });
  }

  // Weakest first — the biggest gap at the edge is the best place to teach.
  return out.sort((a, b) => a.pL - b.pL || a.id.localeCompare(b.id));
}

/**
 * An ordered teaching path from what the learner knows to the goal.
 * Mastered prerequisites are dropped: never teach what is already held.
 */
export function planPath(graph, model, goal) {
  if (!graph.nodes.has(goal)) {
    throw new Error(`Unknown concept: ${goal}`);
  }

  const scope = [goal, ...ancestors(graph, goal)];
  const { order, incomplete } = topoSort(graph, scope);

  const steps = order
    .map((id) => {
      const pL = masteryOf(model, id);
      return {
        id,
        title: graph.nodes.get(id).title ?? id,
        pL,
        mastered: isMastered(pL),
        gap: pL <= GAP_THRESHOLD,
        requires: graph.nodes.get(id).requires,
      };
    })
    .filter((step) => !step.mastered || step.id === goal);

  return { goal, steps, incomplete, skipped: order.length - steps.length };
}

/** Counts for a quick status read-out. */
export function summarize(graph, model) {
  let mastered = 0;
  let learning = 0;
  let untouched = 0;

  for (const id of graph.nodes.keys()) {
    const entry = model.concepts?.[id];
    if (!entry || entry.observations === 0) {
      untouched += 1;
    } else if (entry.pL >= MASTERY_THRESHOLD) {
      mastered += 1;
    } else {
      learning += 1;
    }
  }

  return { total: graph.nodes.size, mastered, learning, untouched };
}
