/**
 * The `svg` kind's renderer (D105 of docs/STUDIO-MENTIONS.md): a fenced
 * `svg` block in a reply, a note or a tutor answer becomes an inline
 * picture — and while the reply is still streaming, the part of it that has
 * arrived is the part that draws.
 *
 * Two decisions carry the file.
 *
 * **Tolerant, by construction.** The stream cuts the markup anywhere — mid
 * tag, mid attribute, mid entity — and a reply that was cut off stays cut.
 * So the parser never throws: it takes every element whose markup completed
 * and drops the dangling tail whole, which is exactly the "top to bottom,
 * elements popping in" render the kind is for. An unclosed parent draws its
 * completed children; a start tag without its `>` is not yet an element at
 * all.
 *
 * **Safe, by allowlist, not by stripping.** The markup is model output, so
 * nothing reaches the DOM but the elements and attributes listed below: no
 * script, no event attribute, no `style` or `class`, no `<image>` or
 * `<foreignObject>`, no `href` but a `#` fragment inside the same picture, no
 * `url()` but `url(#id)`, no CSS escape and no function in a value but the
 * colour and transform ones. An animation may only change an attribute the
 * picture could have written itself, so it cannot bring back an `href` or a
 * `class` the rules took away. Every `id` is prefixed per picture, and every
 * reference to one with it, so two pictures in one thread never resolve each
 * other's `url(#arrow)`. What is not listed falls away, element and subtree
 * together.
 */

/** One element in the drawn picture, after sanitising. `children` hold elements or text. */
export interface SvgNode {
  tag: string;
  /** React-prop names and values: `stroke-width` arrives as `strokeWidth`, `xlink:href` as `href`, every `id` prefixed. */
  attrs: Record<string, string>;
  children: (SvgNode | string)[];
}

/** What a `svg` block's text compiles to. */
export type SvgCompile =
  | { kind: "figure"; root: SvgNode }
  /** It opens `<svg` but nothing has drawn yet: the stream is mid-picture. */
  | { kind: "drawing" }
  /** No `<svg` element in it at all: the caller shows the code. */
  | { kind: "not-svg" };

/** The elements that may draw, read lowercase and spelled back in the casing SVG needs: anything else — its whole subtree — goes. */
const ELEMENT_CASE = new Map<string, string>(
  [
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "textPath",
    "defs",
    "marker",
    "symbol",
    "use",
    "clipPath",
    "mask",
    "pattern",
    "linearGradient",
    "radialGradient",
    "stop",
    "title",
    "desc",
    "animate",
    "animateMotion",
    "animateTransform",
    "set",
    "mpath",
  ].map((tag) => [tag.toLowerCase(), tag]),
);

/** The animation elements whose `attributeName` names what they change. */
const RETARGETS = new Set(["animate", "animateTransform", "set"]);

/**
 * The attributes that may stay, keyed by the name lowercased with its
 * hyphens and colons taken out, and spelled back as the React prop SVG
 * needs. Model output writes `viewbox`, `view-box` and `marker-width` as
 * often as the camelCase spellings, and a DOM `setAttribute("viewbox")`
 * draws nothing, so every slip lands on the canonical name; the hyphenated
 * presentation attributes map to React's own prop names so dev stays quiet.
 *
 * It is an allowlist, as the elements are: geometry, paint, text and
 * animation timing. Anything else (an event handler, `style`, `class`,
 * React's own `dangerouslySetInnerHTML`, `ref` or `key`, a `cursor` or a
 * `filter` that could load a URL) is not on it. `href`, `id`,
 * `attributeName`, `aria-*` and the timing references are read on their own
 * rules below.
 */
const ATTRS = new Map<string, string>(
  [
    // Geometry.
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "fx",
    "fy",
    "fr",
    "dx",
    "dy",
    "d",
    "points",
    "width",
    "height",
    "transform",
    "viewBox",
    "preserveAspectRatio",
    "pathLength",
    "offset",
    "rotate",
    "orient",
    // Markers, gradients, patterns, clips and masks.
    "markerHeight",
    "markerUnits",
    "markerWidth",
    "refX",
    "refY",
    "gradientTransform",
    "gradientUnits",
    "spreadMethod",
    "patternContentUnits",
    "patternTransform",
    "patternUnits",
    "clipPathUnits",
    "maskContentUnits",
    "maskUnits",
    // Text.
    "textLength",
    "lengthAdjust",
    "startOffset",
    "method",
    "spacing",
    "side",
    // Animation.
    "attributeType",
    "begin",
    "dur",
    "end",
    "min",
    "max",
    "restart",
    "repeatCount",
    "repeatDur",
    "calcMode",
    "values",
    "keyTimes",
    "keySplines",
    "keyPoints",
    "from",
    "to",
    "by",
    "additive",
    "accumulate",
    "path",
    "type",
    // Presentation attributes, as React props.
    "fill",
    "stroke",
    "opacity",
    "color",
    "display",
    "visibility",
    "overflow",
    "mask",
    "alignmentBaseline",
    "baselineShift",
    "clipRule",
    "clipPath",
    "colorInterpolation",
    "colorRendering",
    "dominantBaseline",
    "fillOpacity",
    "fillRule",
    "floodColor",
    "floodOpacity",
    "fontFamily",
    "fontSize",
    "fontSizeAdjust",
    "fontStretch",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "imageRendering",
    "letterSpacing",
    "lightingColor",
    "markerEnd",
    "markerMid",
    "markerStart",
    "paintOrder",
    "pointerEvents",
    "shapeRendering",
    "stopColor",
    "stopOpacity",
    "strokeDasharray",
    "strokeDashoffset",
    "strokeLinecap",
    "strokeLinejoin",
    "strokeMiterlimit",
    "strokeOpacity",
    "strokeWidth",
    "textAnchor",
    "textDecoration",
    "textRendering",
    "transformOrigin",
    "unicodeBidi",
    "vectorEffect",
    "wordSpacing",
    "writingMode",
    // Accessibility.
    "role",
  ].map((name) => [name.toLowerCase(), name]),
);

/** A name lowercased with its hyphens and colons gone: `xlink:href`, `xlinkHref` and `XLINK-HREF` all read `xlinkhref`. */
const plain = (name: string) => name.toLowerCase().replace(/[-:]/g, "");

/** A fragment inside the same picture: `use`, `textPath`, `mpath` and the gradients carry it. */
const FRAGMENT = /^#([\w.-]+)$/;

/** What an `id` may be: the characters a fragment can name. */
const ID = /^[\w.-]+$/;

/** `url(#id)` and only that: the fill/clip/marker/mask attributes' one way to name a node. CSS reads function names in any case. */
const FRAGMENT_URL = /^\s*url\(\s*(['"]?)#([\w.-]+)\1\s*\)\s*$/i;

/**
 * The functions a value may call. A presentation attribute is read by the
 * CSS parser, which fetches for `url()`, `image()`, `image-set()` and the
 * rest; a teaching picture needs a colour, a transform and a timing
 * `repeat(n)`, and nothing else.
 */
const CALLS = new Set(["rgb", "rgba", "hsl", "hsla", "url", "matrix", "translate", "scale", "rotate", "skewx", "skewy", "repeat"]);

/** `begin="a.end+1s; b.click"`: the element ids a timing value waits on, so they move with the prefix. */
const SYNCBASE = /^(\s*)([A-Za-z_][\w-]*)(\.)/;

/** The deepest a picture may nest and the most markup it may come from, so a runaway reply stays cheap. */
const MAX_DEPTH = 40;
const MAX_CHARS = 100_000;

/** A code point `String.fromCodePoint` takes and that is a character: not zero, not a lone surrogate, not past U+10FFFF. */
function character(code: number): boolean {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
}

/** `&amp;` and friends, numeric entities, and anything else left literal so it shows as typed. */
function decodeText(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, body: string) => {
    if (body === "amp") return "&";
    if (body === "lt") return "<";
    if (body === "gt") return ">";
    if (body === "quot") return '"';
    if (body === "apos") return "'";
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return character(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return character(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

interface RawNode {
  tag: string;
  attrs: Record<string, string>;
  children: (RawNode | string)[];
}

/**
 * The forgiving pass: markup in, a tree out, however far the stream got. A
 * tag that never saw its `>` does not exist yet; a close tag that matches
 * nothing open is ignored; a stray `<` is text. Comments, `<?xml?>`,
 * `<!DOCTYPE>` and friends are skipped, CDATA is text.
 */
function parseRaw(source: string): (RawNode | string)[] {
  const top: (RawNode | string)[] = [];
  const stack: RawNode[] = [];
  const push = (node: RawNode | string) => {
    (stack.length === 0 ? top : stack[stack.length - 1]!.children).push(node as never);
  };
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      const rest = decodeText(source.slice(i));
      if (rest.trim() !== "") push(rest);
      break;
    }
    if (lt > i) {
      const text = decodeText(source.slice(i, lt));
      // Whitespace between elements is layout noise, not a label.
      if (text.trim() !== "") push(text);
    }
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt + 9);
      push(end === -1 ? source.slice(lt + 9) : source.slice(lt + 9, end));
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", lt)) {
      const end = source.indexOf("?>", lt + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith("<!", lt)) {
      const end = source.indexOf(">", lt + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    const close = /^<\/\s*([A-Za-z][\w:.-]*)\s*>/.exec(source.slice(lt));
    if (close !== null) {
      const name = close[1]!.toLowerCase();
      for (let s = stack.length - 1; s >= 0; s -= 1) {
        if (stack[s]!.tag.toLowerCase() === name) {
          stack.length = s;
          break;
        }
      }
      i = lt + close[0].length;
      continue;
    }
    const open = /^<([A-Za-z][\w:.-]*)/.exec(source.slice(lt));
    if (open === null) {
      // A bare `<` a model meant as a less-than.
      push("<");
      i = lt + 1;
      continue;
    }
    // The start tag's attributes, ended only by `>` or `/>`; anything else
    // (the stream's tail most of all) leaves the element unborn.
    let j = lt + open[0].length;
    const attrs: Record<string, string> = {};
    let selfClose = false;
    let complete = false;
    while (j < source.length) {
      while (j < source.length && /\s/.test(source[j]!)) j += 1;
      if (j >= source.length) break;
      if (source[j] === ">") {
        complete = true;
        j += 1;
        break;
      }
      if (source[j] === "/" && source[j + 1] === ">") {
        complete = true;
        selfClose = true;
        j += 2;
        break;
      }
      const name = /^[^\s=/>"'<]+/.exec(source.slice(j));
      if (name === null) {
        j += 1;
        continue;
      }
      j += name[0].length;
      while (j < source.length && /\s/.test(source[j]!)) j += 1;
      if (source[j] === "=") {
        j += 1;
        while (j < source.length && /\s/.test(source[j]!)) j += 1;
        const quote = source[j];
        if (quote === '"' || quote === "'") {
          const end = source.indexOf(quote, j + 1);
          if (end === -1) {
            j = source.length;
            break;
          }
          attrs[name[0]] = decodeText(source.slice(j + 1, end));
          j = end + 1;
        } else {
          const bare = /^[^\s>"']+/.exec(source.slice(j));
          if (bare !== null) {
            attrs[name[0]] = decodeText(bare[0]);
            j += bare[0].length;
          }
        }
      } else {
        attrs[name[0]] = "";
      }
    }
    if (!complete) break;
    const node: RawNode = { tag: open[1]!, attrs, children: [] };
    push(node);
    if (!selfClose) stack.push(node);
    i = j;
  }
  return top;
}

/**
 * A value the CSS parser cannot turn into a fetch: no backslash (a CSS
 * escape spells `url` without the letters), every `(` opened by a listed
 * function, and a `url()` only as the whole `url(#id)`. Returns the value
 * with its `url(#id)` pointed at the prefixed id, or null.
 */
function cleanValue(text: string, prefix: string): string | null {
  if (text.includes("\\")) return null;
  for (let at = text.indexOf("("); at !== -1; at = text.indexOf("(", at + 1)) {
    const before = /([A-Za-z-]*)\s*$/.exec(text.slice(0, at));
    if (!CALLS.has((before?.[1] ?? "").toLowerCase())) return null;
  }
  if (/url\s*\(/i.test(text)) {
    const fragment = FRAGMENT_URL.exec(text);
    return fragment === null ? null : `url(#${prefix}${fragment[2]})`;
  }
  return text;
}

/** An attribute's name and value after the rules: the kept prop, or null. */
function cleanAttr(name: string, value: string, prefix: string): { name: string; value: string } | null {
  // An unquoted `=`-less name cannot smuggle anything either.
  if (!/^[A-Za-z][\w:.-]*$/.test(name)) return null;
  const key = plain(name);
  const text = value.replace(/[\u0000-\u001f]/g, "");
  if (key === "href" || key === "xlinkhref") {
    const fragment = FRAGMENT.exec(text.trim());
    return fragment === null ? null : { name: "href", value: `#${prefix}${fragment[1]}` };
  }
  if (key === "id") {
    return ID.test(text.trim()) ? { name: "id", value: `${prefix}${text.trim()}` } : null;
  }
  if (key === "ariadescribedby" || key === "arialabelledby") {
    const ids = text.trim().split(/\s+/).filter((id) => ID.test(id));
    return ids.length === 0 ? null : { name: key === "arialabelledby" ? "aria-labelledby" : "aria-describedby", value: ids.map((id) => prefix + id).join(" ") };
  }
  if (/^aria-[a-z]+$/i.test(name)) {
    const kept = cleanValue(text, prefix);
    return kept === null ? null : { name: name.toLowerCase(), value: kept };
  }
  if (key === "attributename") {
    // Read whole by `cleanNode`, which drops the animation when it names an
    // attribute the picture could not have written.
    return { name: "attributeName", value: text.trim() };
  }
  const prop = ATTRS.get(key);
  if (prop === undefined) return null;
  const kept = cleanValue(text, prefix);
  if (kept === null) return null;
  if (prop === "begin" || prop === "end") {
    return { name: prop, value: kept.split(";").map((part) => part.replace(SYNCBASE, (_, space: string, id: string, dot: string) => `${space}${prefix}${id}${dot}`)).join(";") };
  }
  return { name: prop, value: kept };
}

/** Whether an animation's `attributeName` names something on the allowlist: never `href`, `class`, `style`, an `id` or a handler. */
function animatable(attributeName: string): boolean {
  return ATTRS.has(plain(attributeName)) && plain(attributeName) !== "role";
}

/** The allowlist pass over a raw node, its subtree included; null where it falls away whole. */
function cleanNode(node: RawNode, depth: number, prefix: string): SvgNode | null {
  const tag = ELEMENT_CASE.get(node.tag.toLowerCase());
  if (tag === undefined || depth > MAX_DEPTH) return null;
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    const kept = cleanAttr(name, value, prefix);
    if (kept !== null) attrs[kept.name] = kept.value;
  }
  if (attrs.attributeName !== undefined && (!RETARGETS.has(tag) || !animatable(attrs.attributeName))) {
    if (RETARGETS.has(tag)) return null;
    delete attrs.attributeName;
  }
  const children: (SvgNode | string)[] = [];
  for (const child of node.children) {
    if (typeof child === "string") children.push(child);
    else {
      const clean = cleanNode(child, depth + 1, prefix);
      if (clean !== null) children.push(clean);
    }
  }
  return { tag, attrs, children };
}

/**
 * The per-picture `id` prefix: a hash of the block's text, so the server
 * render and the browser's agree, and two different pictures in one thread
 * never share an id. A generated id uses `_` after it, which a model's
 * (always `<prefix>-<id>`) cannot.
 */
function idPrefix(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `svg${(hash >>> 0).toString(36)}`;
}

/** The root's accessible name from its own `<title>`, when the markup gave it none of its own. */
function nameFromTitle(root: SvgNode, prefix: string): void {
  if (root.attrs["aria-label"] !== undefined || root.attrs["aria-labelledby"] !== undefined) return;
  const title = root.children.find((child): child is SvgNode => typeof child !== "string" && child.tag === "title");
  if (title === undefined) return;
  title.attrs.id ??= `${prefix}_title`;
  root.attrs["aria-labelledby"] = title.attrs.id;
}

function compile(source: string): SvgCompile {
  const text = source.length > MAX_CHARS ? source.slice(0, MAX_CHARS) : source;
  const top = parseRaw(text);
  const root = top.find((node) => typeof node !== "string" && node.tag.toLowerCase() === "svg");
  if (root === undefined || typeof root === "string") {
    return /<\s*svg(?=[\s/>]|$)/i.test(source) ? { kind: "drawing" } : { kind: "not-svg" };
  }
  const prefix = idPrefix(text);
  const clean = cleanNode(root, 0, `${prefix}-`);
  if (clean === null) return { kind: "not-svg" };
  nameFromTitle(clean, prefix);
  // A root that opened and saw nothing complete yet draws as it goes, not
  // "not yet": an empty picture is still the picture being drawn.
  return { kind: "figure", root: clean };
}

/**
 * What one `svg` block's text is: the picture when an `<svg>` element has
 * opened and closed enough to draw, `drawing` while only its opening is in,
 * and `not-svg` when no `<svg` ever arrived (the caller shows the code
 * instead, so nothing a note or a reply meant as text disappears). It never
 * throws: a note or a reply that trips something unforeseen shows its code
 * rather than taking the page down.
 */
export function compileSvg(source: string): SvgCompile {
  try {
    return compile(source);
  } catch {
    return { kind: "not-svg" };
  }
}
