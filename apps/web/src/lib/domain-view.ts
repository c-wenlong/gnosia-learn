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

/** Roughly how wide a topic's title is drawn, at 12.5px bold, with its inset either side. */
export const titleWidth = (title: string) => Math.ceil(title.length * 7.4 + 2 * 12);

/**
 * The box a topic's group is drawn in, from where its concepts' dots are: wide
 * enough for each label, at least `minWidth` (its title's width) and centred
 * on its concepts when that is wider, with the title band above the top row.
 * The server packs groups by this box and the browser redraws it as concepts
 * are dragged, so a group always follows its concepts.
 */
export function groupBox(points: readonly { x: number; y: number }[], minWidth = 0): Box {
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
  const left = minX - NODE_HALF_WIDTH - GROUP_PAD;
  const right = maxX + NODE_HALF_WIDTH + GROUP_PAD;
  const width = Math.max(right - left, minWidth);
  const x = (left + right) / 2 - width / 2;
  const y = minY - DOT_TOP - GROUP_PAD - GROUP_TITLE;
  return { x, y, width, height: maxY + LABEL_BELOW + GROUP_PAD - y };
}
