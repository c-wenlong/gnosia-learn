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
 * nothing reaches the DOM but the set below: no script, no event attribute,
 * no `style`, no `<image>` or `<foreignObject>`, no `href` but a `#` fragment
 * inside the same picture, no `url()` but `url(#id)`. What is not listed
 * falls away, element and subtree together.
 */

/** One element in the drawn picture, after sanitising. `children` hold elements or text. */
export interface SvgNode {
  tag: string;
  /** React-prop names and values: `class` arrives as `className`, `xlink:href` as `href`. */
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
const ELEMENT_CASE: Record<string, string> = {
  svg: "svg",
  g: "g",
  path: "path",
  rect: "rect",
  circle: "circle",
  ellipse: "ellipse",
  line: "line",
  polyline: "polyline",
  polygon: "polygon",
  text: "text",
  tspan: "tspan",
  textpath: "textPath",
  defs: "defs",
  marker: "marker",
  symbol: "symbol",
  use: "use",
  clippath: "clipPath",
  mask: "mask",
  pattern: "pattern",
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  stop: "stop",
  title: "title",
  desc: "desc",
  animate: "animate",
  animatemotion: "animateMotion",
  animatetransform: "animateTransform",
  set: "set",
  mpath: "mpath",
};

/**
 * Attribute names whose spelling SVG and React both read case-sensitively,
 * read against the lowercased, hyphen-less name the markup carried. Model
 * output writes `viewbox`, `view-box` and `marker-width` as often as the
 * camelCase spellings, and a DOM `setAttribute("viewbox")` draws nothing —
 * so every slip lands on the canonical name. The hyphenated presentation
 * attributes map to React's own prop names so dev stays quiet.
 */
const ATTR_CASE: Record<string, string> = {
  // The camelCase SVG attributes (spec spelling).
  attributename: "attributeName",
  attributetype: "attributeType",
  basefrequency: "baseFrequency",
  calcmode: "calcMode",
  clippathunits: "clipPathUnits",
  gradienttransform: "gradientTransform",
  gradientunits: "gradientUnits",
  keypoints: "keyPoints",
  keysplines: "keySplines",
  keytimes: "keyTimes",
  lengthadjust: "lengthAdjust",
  markerheight: "markerHeight",
  markerunits: "markerUnits",
  markerwidth: "markerWidth",
  maskcontentunits: "maskContentUnits",
  maskunits: "maskUnits",
  pathlength: "pathLength",
  patterncontentunits: "patternContentUnits",
  patterntransform: "patternTransform",
  patternunits: "patternUnits",
  preservealpha: "preserveAlpha",
  preserveaspectratio: "preserveAspectRatio",
  refx: "refX",
  refy: "refY",
  repeatcount: "repeatCount",
  repeatdur: "repeatDur",
  requiredextensions: "requiredExtensions",
  requiredfeatures: "requiredFeatures",
  spreadmethod: "spreadMethod",
  startoffset: "startOffset",
  systemlanguage: "systemLanguage",
  textlength: "textLength",
  viewbox: "viewBox",
  viewtarget: "viewTarget",
  // The hyphenated presentation attributes, as React props.
  alignmentbaseline: "alignmentBaseline",
  baselineshift: "baselineShift",
  cliprule: "clipRule",
  clippath: "clipPath",
  colorinterpolation: "colorInterpolation",
  colorrendering: "colorRendering",
  dominantbaseline: "dominantBaseline",
  enablebackground: "enableBackground",
  fillopacity: "fillOpacity",
  fillrule: "fillRule",
  floodcolor: "floodColor",
  floodopacity: "floodOpacity",
  fontfamily: "fontFamily",
  fontsize: "fontSize",
  fontsizeadjust: "fontSizeAdjust",
  fontstretch: "fontStretch",
  fontstyle: "fontStyle",
  fontvariant: "fontVariant",
  fontweight: "fontWeight",
  glyphorientationhorizontal: "glyphOrientationHorizontal",
  glyphorientationvertical: "glyphOrientationVertical",
  horizadvx: "horizAdvX",
  imagerendering: "imageRendering",
  letterspacing: "letterSpacing",
  lightingcolor: "lightingColor",
  markerend: "markerEnd",
  markermid: "markerMid",
  markerstart: "markerStart",
  overlineposition: "overlinePosition",
  overlinethickness: "overlineThickness",
  paintorder: "paintOrder",
  pointerevents: "pointerEvents",
  shaperendering: "shapeRendering",
  stopcolor: "stopColor",
  stopopacity: "stopOpacity",
  strikethroughposition: "strikethroughPosition",
  strikethroughthickness: "strikethroughThickness",
  strokedasharray: "strokeDasharray",
  strokedashoffset: "strokeDashoffset",
  strokelinecap: "strokeLinecap",
  strokelinejoin: "strokeLinejoin",
  strokemiterlimit: "strokeMiterlimit",
  strokeopacity: "strokeOpacity",
  strokewidth: "strokeWidth",
  textanchor: "textAnchor",
  textdecoration: "textDecoration",
  textrendering: "textRendering",
  transformorigin: "transformOrigin",
  underlineposition: "underlinePosition",
  underlinethickness: "underlineThickness",
  unicodebidi: "unicodeBidi",
  wordspacing: "wordSpacing",
  writingmode: "writingMode",
  vectoreffect: "vectorEffect",
};

/** A fragment inside the same picture: `use`, `textPath`, `mpath` and nothing else may carry it. */
const FRAGMENT = /^#[\w.-]+$/;

/** `url(#id)` and only that: the fill/clip/marker/mask attributes' one way to name a node. */
const FRAGMENT_URL = /^\s*url\(\s*['"]?#[\w.-]+['"]?\s*\)\s*$/;

/** The deepest a picture may nest and the most markup it may come from, so a runaway reply stays cheap. */
const MAX_DEPTH = 40;
const MAX_CHARS = 100_000;

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
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
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

/** An attribute's name and value after the rules: the kept prop, or null. */
function cleanAttr(name: string, value: string): { name: string; value: string } | null {
  const lower = name.toLowerCase();
  if (lower.startsWith("on") || lower === "style" || lower === "srcdoc" || lower === "srcset" || lower === "src") return null;
  if (lower === "xmlns" || lower.startsWith("xmlns:") || lower.startsWith("xml:")) return null;
  // An unquoted `=`-less name cannot smuggle anything either.
  if (!/^[A-Za-z][\w:.-]*$/.test(name)) return null;
  const text = value.replace(/[-]/g, "");
  if (lower === "href" || lower === "xlink:href") {
    return FRAGMENT.test(text.trim()) ? { name: "href", value: text.trim() } : null;
  }
  if (text.includes("url(") && !FRAGMENT_URL.test(text)) return null;
  const cased = ATTR_CASE[lower] ?? ATTR_CASE[lower.replace(/-/g, "")];
  return { name: cased ?? (name === "class" ? "className" : name === "for" ? "htmlFor" : name), value: text };
}

/** The allowlist pass over a raw node, its subtree included; null where it falls away whole. */
function cleanNode(node: RawNode, depth: number): SvgNode | null {
  const tag = ELEMENT_CASE[node.tag.toLowerCase()];
  if (tag === undefined || depth > MAX_DEPTH) return null;
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    const kept = cleanAttr(name, value);
    if (kept !== null) attrs[kept.name] = kept.value;
  }
  const children: (SvgNode | string)[] = [];
  for (const child of node.children) {
    if (typeof child === "string") children.push(child);
    else {
      const clean = cleanNode(child, depth + 1);
      if (clean !== null) children.push(clean);
    }
  }
  return { tag, attrs, children };
}

/**
 * What one `svg` block's text is: the picture when an `<svg>` element has
 * opened and closed enough to draw, `drawing` while only its opening is in,
 * and `not-svg` when no `<svg` ever arrived (the caller shows the code
 * instead, so nothing a note or a reply meant as text disappears).
 */
export function compileSvg(source: string): SvgCompile {
  const top = parseRaw(source.length > MAX_CHARS ? source.slice(0, MAX_CHARS) : source);
  const root = top.find((node) => typeof node !== "string" && node.tag.toLowerCase() === "svg");
  if (root === undefined || typeof root === "string") {
    return /<\s*svg(?=[\s/>]|$)/i.test(source) ? { kind: "drawing" } : { kind: "not-svg" };
  }
  const clean = cleanNode(root, 0);
  if (clean === null) return { kind: "not-svg" };
  // A root that opened and saw nothing complete yet draws as it goes, not
  // "not yet": an empty picture is still the picture being drawn.
  return { kind: "figure", root: clean };
}
