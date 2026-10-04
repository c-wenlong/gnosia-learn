/**
 * The parts of the domain map a browser needs: titles, the box a topic's
 * group is drawn in, and the geometry the server's layout and the client's
 * drawing must agree on. Pure, and free of dagre, so a client component can
 * import it (docs/proposals/domain-map.md). The layout itself is
 * `domain-map.ts`, which only the server runs.
 */

/** Half the width a concept takes: its dot and up to two lines of label centred under it. */
export const NODE_HALF_WIDTH = 56;
/** Room kept above a dot, for the hover ring. */
export const DOT_TOP = 12;
/** From a dot's centre to the foot of its two-line label. */
export const LABEL_BELOW = 46;
/** Space between a group's edge and the concepts in it. */
export const GROUP_PAD = 10;
/** The band at the top of a group that holds the topic's title. */
export const GROUP_TITLE = 22;

const ACRONYMS = new Set(["ai", "hci", "llm", "llms", "ml", "ui", "ux", "gpu", "cpu", "os", "nlp", "rl"]);

/** A domain slug as words: `classical-ai` reads "Classical AI", `hci` reads "HCI". */
export function domainTitle(slug: string): string {
  const words = slug.split(/[-_\s]+/).filter((w) => w.length > 0);
  if (words.length === 0) return "Other";
  return words
    .map((w, i) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The box a topic's group is drawn in, from where its concepts' dots are: wide
 * enough for each label, with the title band above the top row. The server
 * packs groups by this box and the browser redraws it as concepts are
 * dragged, so a group always follows its concepts.
 */
export function groupBox(points: readonly { x: number; y: number }[]): Box {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x = minX - NODE_HALF_WIDTH - GROUP_PAD;
  const y = minY - DOT_TOP - GROUP_PAD - GROUP_TITLE;
  return { x, y, width: maxX + NODE_HALF_WIDTH + GROUP_PAD - x, height: maxY + LABEL_BELOW + GROUP_PAD - y };
}

/** Room kept round the picture, so a ring or a group's edge is not cut by the frame. */
export const VIEW_PAD = 8;

const padded = (b: Box): Box => ({ x: b.x - VIEW_PAD, y: b.y - VIEW_PAD, width: b.width + 2 * VIEW_PAD, height: b.height + 2 * VIEW_PAD });

/**
 * What the graph frames (D2, D3): the whole domain, or one topic's group when
 * a topic is open, either with a margin. `moved` holds the concepts dragged
 * from where the layout put them, so the frame keeps them in view.
 */
export function viewBoxFor(
  layout: {
    width: number;
    height: number;
    positions: Readonly<Record<string, { x: number; y: number }>>;
    groups: readonly { topic: string; concepts: readonly string[] }[];
  },
  topic: string | null,
  moved: Readonly<Record<string, { x: number; y: number }>> = {},
): Box {
  const at = (id: string) => moved[id] ?? layout.positions[id];
  const group = topic === null ? undefined : layout.groups.find((g) => g.topic === topic);
  if (group !== undefined) return padded(groupBox(group.concepts.map(at)));
  const whole: Box = { x: 0, y: 0, width: layout.width, height: layout.height };
  const ids = Object.keys(moved).filter((id) => id in layout.positions);
  if (ids.length === 0) return padded(whole);
  const reach = groupBox(ids.map(at));
  const x = Math.min(whole.x, reach.x);
  const y = Math.min(whole.y, reach.y);
  return padded({
    x,
    y,
    width: Math.max(whole.x + whole.width, reach.x + reach.width) - x,
    height: Math.max(whole.y + whole.height, reach.y + reach.height) - y,
  });
}

/** Each concept's domain, from the tree the page sent. */
export function domainOfConcepts(tree: readonly { slug: string; concepts: readonly string[] }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of tree) for (const id of d.concepts) out[id] = d.slug;
  return out;
}

/** How many of each domain's concepts the search and the filter leave showing (D8). */
export function matchCounts(
  tree: readonly { slug: string; concepts: readonly string[] }[],
  shown: ReadonlySet<string>,
): Record<string, number> {
  return Object.fromEntries(tree.map((d) => [d.slug, d.concepts.filter((id) => shown.has(id)).length]));
}

/** How far from a dot's centre an edge stops: past the knock-out round the dot. */
export const DOT_GAP = 14;
/** From a dot's centre to just under a label of `lines` lines. */
export const labelFoot = (lines: number) => 28 + (lines - 1) * 14 + 8;

/**
 * Where an edge between two concepts starts and ends, so it never runs
 * through a label: down from under the upper concept's label to just above
 * the lower one's dot, and side to side between two dots on one row.
 * `fromLines` and `toLines` are how many lines each label has.
 */
export function edgeEnds(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromLines: number,
  toLines: number,
): [{ x: number; y: number }, { x: number; y: number }] {
  const dy = to.y - from.y;
  if (Math.abs(dy) < 20) {
    const side = Math.sign(to.x - from.x) || 1;
    return [
      { x: from.x + side * DOT_GAP, y: from.y },
      { x: to.x - side * DOT_GAP, y: to.y },
    ];
  }
  if (dy > 0) return [{ x: from.x, y: from.y + labelFoot(fromLines) }, { x: to.x, y: to.y - DOT_GAP }];
  return [{ x: from.x, y: from.y - DOT_GAP }, { x: to.x, y: to.y + labelFoot(toLines) }];
}
