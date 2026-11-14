/**
 * The ordering rules the domain map and the Path layout share (D3 and D12 of
 * docs/proposals/domain-map.md): topics with their prerequisites first, and a
 * level for every id of a graph where a loop counts as one. Pure and free of
 * dagre, so a client component can import it.
 */

/**
 * Topics with their prerequisites first (D3). Topics that need each other
 * (a cycle, as asymptotic notation and analysis often are) count as one, so a
 * loop does not push them to the end. A topic's level is the longest chain of
 * topics it needs; topics are ordered by level, then the more topics that
 * need one the earlier it goes, then the vocabulary's order. So the
 * foundations come first, a standalone topic waits behind them, and the
 * picture reads the way the subject is learnt.
 */
export function topicOrder(groups: readonly { slug: string }[], topicOf: ReadonlyMap<string, string>, edges: readonly { from: string; to: string }[]): string[] {
  const slugs = groups.map((g) => g.slug);
  const needs = new Map<string, Set<string>>(slugs.map((t) => [t, new Set<string>()]));
  for (const e of edges) {
    const a = topicOf.get(e.from);
    const b = topicOf.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) needs.get(b)?.add(a);
  }
  const dependants = new Map<string, number>(slugs.map((t) => [t, 0]));
  for (const set of needs.values()) for (const t of set) dependants.set(t, (dependants.get(t) ?? 0) + 1);
  const level = levels(slugs, needs);
  const rank = new Map(slugs.map((t, i) => [t, i]));
  return [...slugs].sort(
    (a, b) =>
      (level.get(a) ?? 0) - (level.get(b) ?? 0) ||
      (dependants.get(b) ?? 0) - (dependants.get(a) ?? 0) ||
      (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
  );
}

/**
 * Each of `ids` with its level: the longest chain of others it needs, where
 * the ones that need each other (a strongly connected component) count as
 * one and share a level. Tarjan's algorithm over `needs`, visiting in the
 * order `ids` come in, numbers each component after every component it needs,
 * so one pass in that order sets every level.
 */
export function levels(ids: readonly string[], needs: ReadonlyMap<string, ReadonlySet<string>>): Map<string, number> {
  const order = new Map(ids.map((id, i) => [id, i]));
  const component = new Map<string, number>();
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let counter = 0;
  let components = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of [...(needs.get(v) ?? [])].sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0))) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v) as number, index.get(w) as number));
    }
    if (low.get(v) === index.get(v)) {
      let w: string;
      do {
        w = stack.pop() as string;
        onStack.delete(w);
        component.set(w, components);
      } while (w !== v);
      components++;
    }
  };
  for (const id of ids) if (!index.has(id)) visit(id);

  const level = new Array<number>(components).fill(0);
  const members = new Map<number, string[]>();
  for (const id of ids) members.set(component.get(id) as number, [...(members.get(component.get(id) as number) ?? []), id]);
  for (let c = 0; c < components; c++) {
    for (const id of members.get(c) ?? []) {
      for (const n of needs.get(id) ?? []) {
        const d = component.get(n) as number;
        if (d !== c) level[c] = Math.max(level[c], level[d] + 1);
      }
    }
  }
  return new Map(ids.map((id) => [id, level[component.get(id) as number]]));
}

