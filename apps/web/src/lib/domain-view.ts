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
 * enough for each label, at least `minWidth` (its title's width) and centred
 * on its concepts when that is wider, with a title band `band` tall above the
 * top row (`titleBand`). The server packs groups by this box with the band at
 * its largest (`TITLE_RESERVE`), and the browser redraws it with the band its
 * title is drawn at and as concepts are dragged, so a group always follows its
 * concepts and a larger title grows its band upward, into room kept for it.
 */
export function groupBox(points: readonly { x: number; y: number }[], minWidth = 0, band = GROUP_TITLE): Box {
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
  const y = minY - DOT_TOP - GROUP_PAD - band;
  return { x, y, width, height: maxY + LABEL_BELOW + GROUP_PAD - y };
}

/** Room kept round the picture, so a ring or a group's edge is not cut by the frame. */
export const VIEW_PAD = 8;

const padded = (b: Box): Box => ({ x: b.x - VIEW_PAD, y: b.y - VIEW_PAD, width: b.width + 2 * VIEW_PAD, height: b.height + 2 * VIEW_PAD });

/**
 * What the graph frames (D2, D3): the whole domain, or one topic's group when
 * a topic is open, either with a margin. `moved` holds the concepts dragged
 * from where the layout put them, so the frame keeps them in view. `band` is
 * the title band the groups are drawn with: the layout packs each row for the
 * largest, so a smaller one leaves the top row's boxes lower by the
 * difference, and the frame starts there rather than over an empty strip.
 * Only the height depends on `band`, so the scale measured from the width
 * does not.
 */
export function viewBoxFor(
  layout: {
    width: number;
    height: number;
    positions: Readonly<Record<string, { x: number; y: number }>>;
    groups: readonly { topic: string; title: string; concepts: readonly string[] }[];
  },
  topic: string | null,
  moved: Readonly<Record<string, { x: number; y: number }>> = {},
  band = GROUP_TITLE,
): Box {
  const at = (id: string) => moved[id] ?? layout.positions[id];
  const group = topic === null ? undefined : layout.groups.find((g) => g.topic === topic);
  if (group !== undefined) return padded(groupBox(group.concepts.map(at), titleWidth(group.title), band));
  const trim = layout.height > 0 ? Math.max(0, TITLE_RESERVE - band) : 0;
  const whole: Box = { x: 0, y: trim, width: layout.width, height: layout.height - trim };
  const ids = Object.keys(moved).filter((id) => id in layout.positions);
  if (ids.length === 0) return padded(whole);
  const reach = groupBox(ids.map(at), 0, band);
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

/** A concept's label size in layout units, as drawn when the picture is near full size. */
export const LABEL_SIZE = 12.5;
/** The smallest a label is drawn on screen, in pixels, however small the picture (D10). */
export const LABEL_MIN_PX = 11;
/** Room kept between two labels, in screen pixels. */
const LABEL_GAP_PX = 2;
/**
 * How wide each character of a label is drawn, in ems: Figtree at weight 500,
 * measured in the built app with canvas `measureText` and rounded up. Real
 * label lines run from 0.41 to 0.61 em a character, so a flat allowance
 * either wastes room or lets a line of wide letters overrun its box.
 */
const GLYPH_CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u2026\u2019";
const GLYPH_WIDTHS = [
  0.25, 0.31, 0.35, 0.63, 0.57, 0.8, 0.65, 0.22, 0.36, 0.36, 0.49, 0.63, 0.24, 0.42, 0.22, 0.41, 0.65, 0.42, 0.57, 0.55, 0.63, 0.58, 0.57, 0.55,
  0.62, 0.57, 0.27, 0.28, 0.63, 0.63, 0.63, 0.51, 0.99, 0.69, 0.62, 0.73, 0.7, 0.6, 0.55, 0.76, 0.76, 0.28, 0.53, 0.63, 0.53, 0.85, 0.78, 0.78,
  0.59, 0.79, 0.64, 0.62, 0.57, 0.71, 0.71, 0.97, 0.64, 0.62, 0.64, 0.33, 0.41, 0.33, 0.56, 0.44, 0.24, 0.52, 0.59, 0.55, 0.59, 0.55, 0.38, 0.6,
  0.57, 0.24, 0.28, 0.5, 0.23, 0.86, 0.57, 0.58, 0.6, 0.59, 0.35, 0.47, 0.39, 0.57, 0.53, 0.8, 0.5, 0.54, 0.49, 0.39, 0.26, 0.39, 0.6, 0.64, 0.2,
];
const GLYPH_EM = new Map([...GLYPH_CHARS].map((c, i) => [c, GLYPH_WIDTHS[i]]));
/** A character the table has no width for (an accented, Cyrillic or Greek letter): as wide as the wider capitals. */
const GLYPH_UNKNOWN = 0.78;
/**
 * A character of a wide script, drawn a full em by the fallback font: Chinese,
 * Japanese and Korean, the full-width forms and emoji, each measured at 1.0
 * em in the built app at weights 500 and 700.
 */
const GLYPH_WIDE = 1;
const WIDE: readonly [number, number][] = [
  [0x1100, 0x115f], // Hangul jamo
  [0x2e80, 0xa4cf], // CJK radicals, kana, ideographs, Yi
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xff60], // full-width forms
  [0xffe0, 0xffe6],
  [0x1f000, 0x1faff], // emoji and pictographs
  [0x20000, 0x3fffd], // CJK extensions
];
const isWide = (c: string) => {
  const code = c.codePointAt(0) ?? 0;
  return WIDE.some(([lo, hi]) => code >= lo && code <= hi);
};
/** Bold against weight 500: 1.035 on average over the table, 1.094 at the 90th percentile. */
const BOLD_EM = 1.1;

/** How wide `line` is drawn, in ems of the label's size: the sum of its characters' widths. */
export function textEm(line: string, bold = false): number {
  let em = 0;
  for (const c of line) em += GLYPH_EM.get(c) ?? (isWide(c) ? GLYPH_WIDE : GLYPH_UNKNOWN);
  return bold ? em * BOLD_EM : em;
}
/** Half the box a dot keeps clear of other labels: its radius and half its stroke. */
const DOT_CLEAR = 9;
/** How far a label's descenders reach below its last baseline, as a share of its size. */
const LABEL_DESCENT = 0.2;

/**
 * The smallest a domain's picture is drawn, in screen pixels per layout unit,
 * before it scrolls sideways in its card instead (D10). Labels hold their
 * size on screen by culling, so the floor is set by what does not scale with
 * them: at 0.35 a two-line 11px label still fits between one layer of a topic
 * and the next (98 units apart, from dot to dot) so a chain keeps its labels,
 * a concept's press area (112 units) is 39px wide, and the owner's widest
 * domains (about 900 units) fit a 390px phone.
 */
export const MIN_DRAW_SCALE = 0.35;

/**
 * The size a label is drawn at, in layout units, for a picture drawn at
 * `scale` screen pixels per layout unit (D10): never less than the layout
 * size, and never less than `LABEL_MIN_PX` on screen. A scale it cannot use
 * (none measured yet, or a picture with no width) draws at the layout size.
 */
export function labelFont(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return LABEL_SIZE;
  return Math.max(LABEL_SIZE, LABEL_MIN_PX / scale);
}

/** How far a topic's title starts from its group's left edge, and from its top edge to the top of its text. */
export const TITLE_INSET = 12;
export const TITLE_TOP = 7;
/** The least room kept between the end of a title and its group's right edge, when the title has grown with the scale. */
export const TITLE_END = 6;

/**
 * The size a topic's title is drawn at, in layout units, for a picture drawn
 * at `scale` (D10): as a label, the layout size or 11px on screen, whichever
 * is larger. The picture is never drawn below `MIN_DRAW_SCALE` (its minimum
 * width), so the title stops growing there, which bounds the band the layout
 * has to keep for it.
 */
export function titleFont(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return LABEL_SIZE;
  return labelFont(Math.max(scale, MIN_DRAW_SCALE));
}

/**
 * The band a title of size `font` takes at the top of its group: the inset,
 * then Figtree's ascent and descent (0.92 and 0.28 of the size, read from the
 * built app with `getBBox`). 22 at the layout size, as it always was.
 */
export const titleBand = (font: number) => TITLE_TOP + (font * 30) / 25;
/** From a group's top edge to its title's baseline, at size `font`. */
export const titleBaseline = (font: number) => TITLE_TOP + (font * 23) / 25;
/** The band at the top of a group that holds the topic's title, at the layout size. */
export const GROUP_TITLE = titleBand(LABEL_SIZE);
/**
 * The band the server packs every group with: the title at its largest, at
 * `MIN_DRAW_SCALE`, rounded up. A picture drawn larger draws a smaller band,
 * and the room it leaves goes above the group, between it and the row over it.
 */
export const TITLE_RESERVE = Math.ceil(titleBand(LABEL_MIN_PX / MIN_DRAW_SCALE));

/**
 * How wide a topic's group must be for its title at the layout size, with
 * its inset either side: the 7.4 units a letter the layout has always allowed,
 * or the measured glyph widths when a title of wide letters needs more. So a
 * title drawn at the layout size is never cut, and today's groups keep their
 * widths.
 */
export const titleWidth = (title: string) => Math.ceil(Math.max(title.length * 7.4, textEm(title, true) * LABEL_SIZE) + 2 * TITLE_INSET);

/** The room a title has across its group: from its inset to `TITLE_END` short of the right edge. */
export const titleRoom = (group: Box) => group.width - TITLE_INSET - TITLE_END;

/**
 * A title as drawn in `room` layout units at size `font` (D10): whole when it
 * fits, else as many of its letters as fit before an ellipsis, with no space
 * left in front of it. The full title stays in the title's tooltip and in the
 * list beside the picture.
 */
export function fitTitle(title: string, font: number, room: number): string {
  if (textEm(title, true) * font <= room) return title;
  const chars = [...title];
  for (let n = chars.length - 1; n > 0; n--) {
    const cut = `${chars.slice(0, n).join("").trimEnd()}\u2026`;
    if (textEm(cut, true) * font <= room) return cut;
  }
  return "\u2026";
}

/**
 * The box a topic's title takes in `group` at size `font`: from its inset, as
 * wide as the text drawn (`fitTitle`), and from the top inset to the foot of
 * the band. What the culling keeps labels clear of (D10).
 */
export function titleBox(group: Box, title: string, font: number): Box {
  const text = fitTitle(title, font, titleRoom(group));
  return { x: group.x + TITLE_INSET, y: group.y + TITLE_TOP, width: textEm(text, true) * font, height: titleBand(font) - TITLE_TOP };
}

/** From one line of a label to the next, at size `font`. */
export const labelLine = (font: number) => (font * 28) / 25;
/** From a dot's centre to the baseline of a label's line `k`, at size `font`. */
export const labelBaseline = (font: number, k: number) => 16 + (font * 24) / 25 + k * labelLine(font);
/**
 * From a dot's centre to just under a label of `lines` lines at size `font`,
 * where an edge leaving downward starts. A label not drawn (`lines` 0) leaves
 * the edge to start at the dot.
 */
export const labelFoot = (lines: number, font = LABEL_SIZE) =>
  lines <= 0 ? DOT_GAP : labelBaseline(font, lines - 1) + (font * 16) / 25;

/**
 * Where an edge between two concepts starts and ends, so it never runs
 * through a label: down from under the upper concept's label to just above
 * the lower one's dot, and side to side between two dots on one row.
 * `fromLines` and `toLines` are how many lines each label has (0 for a label
 * culled, D10), drawn at size `font`.
 */
export function edgeEnds(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromLines: number,
  toLines: number,
  font = LABEL_SIZE,
): [{ x: number; y: number }, { x: number; y: number }] {
  const dy = to.y - from.y;
  if (Math.abs(dy) < 20) {
    const side = Math.sign(to.x - from.x) || 1;
    return [
      { x: from.x + side * DOT_GAP, y: from.y },
      { x: to.x - side * DOT_GAP, y: to.y },
    ];
  }
  if (dy > 0) return [{ x: from.x, y: from.y + labelFoot(fromLines, font) }, { x: to.x, y: to.y - DOT_GAP }];
  return [{ x: from.x, y: from.y - DOT_GAP }, { x: to.x, y: to.y + labelFoot(toLines, font) }];
}

/** One concept's label, as the culling sees it (D10). */
export interface LabelItem {
  id: string;
  /** The dot's centre, in layout units. */
  x: number;
  y: number;
  /** How many lines the label wraps to, and how wide its widest line is in ems (`textEm`). */
  lines: number;
  em: number;
  /** From `labelRank`: lower is placed first. */
  rank: number;
  /** How many of the drawn edges leave this concept for one that needs it. */
  dependants: number;
}

/** The rank that is always drawn: the concept under the pointer or the list's focus. */
const HOVER_RANK = 0;

/**
 * Which labels are placed first when they collide (D10): the hovered concept,
 * the selected one, the ones the hover keeps lit, then mastered, learning and
 * ready to learn, then the rest.
 */
export function labelRank(c: {
  hover: boolean;
  selected: boolean;
  related: boolean;
  bucket: "mastered" | "learning" | "untouched";
  ready: boolean;
}): number {
  if (c.hover) return HOVER_RANK;
  if (c.selected) return 1;
  if (c.related) return 2;
  if (c.bucket === "mastered") return 3;
  if (c.bucket === "learning") return 4;
  if (c.ready) return 5;
  return 6;
}

/**
 * The box a label of `item` takes at size `font`, in layout units: under the
 * dot, centred on it, and pushed sideways to stay inside `frame` when one is
 * given, so the picture's edge does not cut it.
 */
export function labelBox(item: Pick<LabelItem, "x" | "y" | "lines" | "em">, font: number, frame?: Box): Box {
  const width = Math.max(0.5, item.em) * font;
  const top = item.y + 16;
  const bottom = item.y + labelBaseline(font, Math.max(1, item.lines) - 1) + font * LABEL_DESCENT;
  let x = item.x - width / 2;
  if (frame !== undefined) x = Math.max(frame.x, Math.min(x, frame.x + frame.width - width));
  return { x, y: top, width, height: bottom - top };
}

const overlaps = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

/**
 * The labels drawn, by greedy collision culling (D10, after ResearchRabbit's
 * graph): in priority order, each label's box is placed unless it overlaps a
 * label already placed, another concept's dot, or one of `clear` (a topic's
 * title), keeping the same 2px on screen from a title as from a label. Each box is where the label is drawn, inside `frame` when one is
 * given (`labelBox`). The hovered concept's label is always placed. Ties go to the concept
 * more of the drawn edges lead from, then to the lower id, so the answer does
 * not depend on the order `items` come in. `scale` is screen pixels per layout
 * unit, which sets the label size (`labelFont`) and the gap between labels.
 * Quadratic in the labels, which is a few thousand box tests for a domain.
 */
export function cullLabels(items: readonly LabelItem[], scale: number, clear: readonly Box[] = [], frame?: Box): Set<string> {
  const font = labelFont(scale);
  const gap = LABEL_GAP_PX / (Number.isFinite(scale) && scale > 0 ? scale : 1);
  const order = [...items].sort((a, b) => a.rank - b.rank || b.dependants - a.dependants || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const dots = items.map((i) => ({ id: i.id, box: { x: i.x - DOT_CLEAR, y: i.y - DOT_CLEAR, width: 2 * DOT_CLEAR, height: 2 * DOT_CLEAR } }));
  const placed: Box[] = [];
  const shown = new Set<string>();
  for (const item of order) {
    const box = labelBox(item, font, frame);
    const free =
      item.rank === HOVER_RANK ||
      (!placed.some((p) => overlaps(p, box, gap)) &&
        !dots.some((d) => d.id !== item.id && overlaps(d.box, box, 0)) &&
        !clear.some((c) => overlaps(c, box, gap)));
    if (!free) continue;
    placed.push(box);
    shown.add(item.id);
  }
  return shown;
}

/** A concept and every concept one edge away from it, either way: what hover keeps (D5). */
export function neighbours(edges: readonly { from: string; to: string }[], id: string): Set<string> {
  const out = new Set([id]);
  for (const e of edges) {
    if (e.from === id) out.add(e.to);
    if (e.to === id) out.add(e.from);
  }
  return out;
}

/** A pointer on the drawn picture, in the layout's coordinates (D6). */
export function toLayoutPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  view: Box,
): { x: number; y: number } {
  const sx = rect.width > 0 ? view.width / rect.width : 1;
  const sy = rect.height > 0 ? view.height / rect.height : 1;
  return { x: view.x + (clientX - rect.left) * sx, y: view.y + (clientY - rect.top) * sy };
}

/** Where a domain's moved concepts are kept for the session (D6). */
export const movedKey = (domain: string) => `learn-map:moved:${domain}`;

/** The positions a session saved, for concepts still in the domain; anything unreadable is dropped. */
export function readMoved(raw: string | null, known: ReadonlySet<string>): Record<string, { x: number; y: number }> {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, p] of Object.entries(parsed as Record<string, unknown>)) {
    if (!known.has(id) || p === null || typeof p !== "object") continue;
    const { x, y } = p as { x?: unknown; y?: unknown };
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) out[id] = { x, y };
  }
  return out;
}
