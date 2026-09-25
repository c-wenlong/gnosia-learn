/**
 * The markdown the knowledge base actually writes, parsed into a tree.
 *
 * This module is deliberately pure and React-free, for the same reason
 * `media.ts` is: the parsing is the part with edge cases, and it should be
 * testable without a DOM. `NoteProse.tsx` is the only thing that renders it.
 *
 * ## Why this is hand-written and not `remark`
 *
 * The notes under `learn/concepts/` and the logs under `learn/sessions/` are
 * not generic markdown. Three of the things they lean on hardest are Obsidian
 * extensions that no off-the-shelf parser understands without a custom plugin:
 *
 * - `[[wikilinks]]` and `![[embeds]]`, which carry every link between notes;
 * - `> [!question]` callouts, which are most of the body of a session log;
 * - ```` ```check ```` fences, which the `learn` CLI reads as quiz cards.
 *
 * So the choice was never "a parser or no parser". It was "a 150kB unified
 * pipeline plus three custom plugins" against "a block parser for the subset
 * these files use". The subset is small and closed — it is written by one
 * person and by the tutor, both following the same templates — and the repo's
 * standing rule is that a new runtime dependency has to earn itself
 * (CONTRIBUTING.md, guideline 1: the web app's whole dependency list is four
 * packages). `marked` was the other candidate and is the worst fit of the
 * three: it returns an HTML string, which means `dangerouslySetInnerHTML`,
 * which means a sanitiser as a second dependency and a correct configuration
 * of it forever after.
 *
 * ## What that costs, said plainly
 *
 * This parser does not implement CommonMark. It knows: YAML frontmatter, ATX
 * headings, paragraphs with soft wrapping, bullet and numbered lists with
 * nesting, fenced code, blockquotes and callouts, thematic breaks, and the
 * inline set below. It does not know tables, reference links, setext
 * headings, indented code blocks, footnotes, or HTML blocks. None of those
 * appear anywhere in the corpus today.
 *
 * The rule that keeps that honest: **anything unrecognised becomes visible
 * text, never nothing.** A table renders as the pipe characters its author
 * typed, which is ugly and readable; it never silently disappears. That is the
 * property to preserve if this grows.
 *
 * ## Backslash escapes are deliberately not supported
 *
 * CommonMark lets `\*` stand for a literal asterisk. Honouring that here would
 * mean eating backslashes, and a third of the concept notes are full of TeX —
 * `\log`, `\Theta`, `\le` — where the backslash is the content. Escapes are
 * worth less in this corpus than backslashes are, so a backslash is always
 * itself.
 */

/** One spoken-for piece of a line. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; label: string }
  /** `[[target]]` or `[[target|label]]`: a link to another note, resolved by the caller. */
  | { kind: "note"; target: string; label: string }
  /**
   * `![[name.svg]]`: an asset beside the note, resolved by the caller.
   * `caption` is the `|` alias, and is null when the note wrote none — a
   * filename is alt text, not something to print under a picture.
   */
  | { kind: "embed"; target: string; caption: string | null }
  /** `![alt](src)` with a src this module has already vetted. */
  | { kind: "image"; src: string; alt: string }
  /** `$...$`, transformed just enough to read as notation. */
  | { kind: "math"; nodes: MathNode[] };

/** The two inline nodes that are a picture, and so can stand as a `<figure>`. */
export type FigureNode = Extract<Inline, { kind: "embed" } | { kind: "image" }>;

/** A piece of a formula. `roman` marks a function name, which stays upright. */
export type MathNode =
  | { kind: "text"; text: string; roman?: boolean }
  | { kind: "sub"; nodes: MathNode[] }
  | { kind: "sup"; nodes: MathNode[] };

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  /** A fenced block. `info` is the word after the fence, `check` in these notes. */
  | { kind: "code"; info: string; text: string }
  | { kind: "rule" }
  | { kind: "list"; ordered: boolean; start: number; items: Block[][] }
  /** `callout` is null for a plain `>` quote and the lowercased kind otherwise. */
  | { kind: "quote"; callout: string | null; title: string; blocks: Block[] };

export interface NoteDocument {
  /** The YAML between the opening and closing `---`, verbatim, or null. */
  frontmatter: string | null;
  blocks: Block[];
}

/**
 * Split the leading YAML block off, if there is a complete one.
 *
 * The closing `---` is required. A file that opens with `---` and never closes
 * it is a truncated file, and swallowing all of it to the end would turn a
 * damaged note into a blank page. Frontmatter is metadata the page already has
 * from the catalog, so it is dropped rather than rendered.
 */
function splitFrontmatter(source: string): { frontmatter: string | null; body: string[] } {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { frontmatter: null, body: lines };
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      return { frontmatter: lines.slice(1, i).join("\n"), body: lines.slice(i + 1) };
    }
  }
  return { frontmatter: null, body: lines };
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(\S*).*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const QUOTE = /^ {0,3}>/;
const LIST_ITEM = /^(\s*)([-*+]|(\d{1,9})[.)])(\s+)(.*)$/;

/** Does this line end the paragraph above it by starting something else? */
function interrupts(line: string): boolean {
  return (
    line.trim() === "" ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line)
  );
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker}{${fence[1].length},}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      // An unclosed fence runs to the end of the file rather than throwing it
      // away: a half-written note should still show the half that exists.
      i += 1;
      blocks.push({ kind: "code", info: fence[2], text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].replace(/^ {0,3}> ?/, ""));
        i += 1;
      }
      blocks.push(...parseQuote(quoted));
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && !interrupts(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

const CALLOUT = /^\[!([A-Za-z][\w-]*)\][-+]?\s*(.*)$/;

/**
 * Turn the stripped body of a `>` run into one or more quote blocks.
 *
 * Obsidian only treats `[!kind]` as a callout on the *first* line of a
 * blockquote. This is deliberately more forgiving and starts a new callout
 * wherever such a line appears, because the corpus already contains a log
 * where the `> Live log.` preamble and the first `> [!question]` were written
 * without a blank line between them. Under the strict rule that whole session
 * opens as one grey quote with `[!question] Quiz` sitting in it as text. The
 * cost of being lenient is a quote that genuinely contains `[!something]` at
 * the start of a line getting split, which is a shape nobody writes.
 */
function parseQuote(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let callout: string | null = null;
  let title = "";
  let buffer: string[] = [];

  const flush = () => {
    const inner = parseBlocks(buffer);
    if (callout === null && inner.length === 0) return;
    blocks.push({ kind: "quote", callout, title, blocks: inner });
  };

  for (const line of lines) {
    const match = CALLOUT.exec(line);
    if (match) {
      flush();
      callout = match[1].toLowerCase();
      title = match[2].trim() || match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  flush();

  return blocks;
}

/**
 * Collect one list and everything nested under it.
 *
 * A line belongs to the item above it when it is indented at least as far as
 * that item's content started, which is how both the wrapped prose in
 * `## Failure modes` and the two-space nested list in a session's `## Close`
 * are held together. The content is dedented and parsed as its own document,
 * so an item can hold paragraphs, a nested list, or a code block without this
 * function knowing anything about them.
 */
function parseList(lines: string[], from: number): [Block, number] {
  const first = LIST_ITEM.exec(lines[from])!;
  const indent = first[1].length;
  const ordered = first[3] !== undefined;
  const start = ordered ? Number(first[3]) : 1;
  const items: Block[][] = [];
  let i = from;

  while (i < lines.length) {
    const match = LIST_ITEM.exec(lines[i]);
    if (!match || match[1].length !== indent) break;
    // A bullet list and a numbered list touching are two lists, not one.
    if ((match[3] !== undefined) !== ordered) break;

    const contentIndent = match[1].length + match[2].length + match[4].length;
    const buffer = [match[5]];
    i += 1;

    let blanks = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        blanks += 1;
        i += 1;
        continue;
      }
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent < Math.min(contentIndent, indent + 2)) break;
      for (; blanks > 0; blanks -= 1) buffer.push("");
      buffer.push(line.slice(Math.min(contentIndent, lineIndent)));
      i += 1;
    }

    items.push(parseBlocks(buffer));
  }

  return [{ kind: "list", ordered, start, items }, i];
}

/** Parse a whole note: frontmatter off the top, blocks out of the rest. */
export function parseNote(source: string): NoteDocument {
  const { frontmatter, body } = splitFrontmatter(source);
  return { frontmatter, blocks: parseBlocks(body) };
}

/**
 * The only URL check in this module, and the only place an attribute can be
 * built out of note text.
 *
 * Everything else this renderer produces is a React element with text
 * children, and React escapes those, so markup in a note is inert on its own.
 * An `href` is the exception: it is an attribute, and `javascript:` in one
 * executes. So a URL is admitted only when it has no scheme at all (a relative
 * path, a fragment, a query) or a scheme on this list. Anything else — `data:`,
 * `blob:`, `javascript:`, `vbscript:` — comes back null and the caller renders
 * the link as the text it was written as.
 *
 * Control characters are stripped before the scheme is read, because
 * `java\tscript:` is how a naive prefix test gets walked past; they are
 * stripped only for the test, since a browser ignores them in a real URL too.
 */
export function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (url === "") return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url.replace(/[\u0000-\u0020]/g, ""));
  if (scheme && !/^(?:https?|mailto)$/i.test(scheme[1])) return null;
  return url;
}

/** Does this href leave the app? Used to decide `target` and `rel`. */
export function isExternalHref(href: string): boolean {
  return /^https?:/i.test(href);
}

const MATH_SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  infty: "∞", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", equiv: "≡", sim: "∼", prec: "≺", succ: "≻", preceq: "⪯", succeq: "⪰",
  in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩",
  times: "×", cdot: "·", cdots: "⋯", ldots: "…", dots: "…", pm: "±", div: "÷",
  to: "→", rightarrow: "→", leftarrow: "←", mapsto: "↦", forall: "∀", exists: "∃",
  sum: "∑", prod: "∏", int: "∫", sqrt: "√", partial: "∂", nabla: "∇", ell: "ℓ",
};

/** Upright in real typesetting, so upright here. */
const MATH_FUNCTIONS = new Set([
  "log", "lg", "ln", "exp", "max", "min", "sin", "cos", "tan",
  "lim", "inf", "sup", "deg", "gcd", "det", "dim", "arg", "mod",
]);

/** Macros that are purely horizontal space. `\!` is negative space: nothing. */
const MATH_SPACING: Record<string, string> = {
  ",": "\u2009", ";": "\u2005", ":": "\u2009", " ": " ", "!": "",
  quad: "\u2003", qquad: "\u2003\u2003", thinspace: "\u2009", enspace: "\u2002",
};

/**
 * Turn a TeX fragment into something a reader can follow, with no dependency.
 *
 * This is not a typesetting engine and is not trying to be one. It maps the
 * greek letters, relations and function names these notes use to their Unicode
 * equivalents, turns `_` and `^` into real `<sub>` and `<sup>`, and collapses
 * the spacing macros. KaTeX was the alternative and would be strictly better
 * output: it can even run in a server component with zero client JavaScript.
 * It was passed over because it renders to an HTML string, so it would put
 * exactly one `dangerouslySetInnerHTML` into this renderer and undo the reason
 * the rest of it is safe by construction, and because it ships a stylesheet
 * and six font files to set `$f(n)$`.
 *
 * Anything it does not recognise is emitted verbatim, backslash and all. A
 * `\frac{a}{b}` looks unrendered because it is, which is the honest signal;
 * quietly printing `frac{a}{b}` would look like a rendering rather than a gap.
 */
function parseMath(src: string): MathNode[] {
  let i = 0;

  function group(): MathNode[] {
    if (src[i] === "{") {
      const start = (i += 1);
      let depth = 1;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") depth -= 1;
        i += 1;
      }
      return parseMath(src.slice(start, depth === 0 ? i - 1 : i));
    }
    if (src[i] === "\\") {
      const macro = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      if (macro) {
        i += macro[0].length;
        return [macroNode(macro[1])];
      }
    }
    const char = src[i];
    if (char === undefined) return [];
    i += 1;
    return [{ kind: "text", text: char }];
  }

  function macroNode(name: string): MathNode {
    const space = MATH_SPACING[name];
    if (space !== undefined) return { kind: "text", text: space };
    if (MATH_SYMBOLS[name]) return { kind: "text", text: MATH_SYMBOLS[name] };
    if (MATH_FUNCTIONS.has(name)) return { kind: "text", text: name, roman: true };
    return { kind: "text", text: `\\${name}` };
  }

  const nodes: MathNode[] = [];
  let text = "";
  const flush = () => {
    if (text !== "") nodes.push({ kind: "text", text });
    text = "";
  };

  while (i < src.length) {
    const char = src[i];
    if (char === "\\") {
      const macro = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      if (macro) {
        i += macro[0].length;
        const node = macroNode(macro[1]);
        if (node.kind === "text" && node.roman !== true) {
          text += node.text;
        } else {
          flush();
          nodes.push(node);
        }
        continue;
      }
    }
    if (char === "_" || char === "^") {
      flush();
      i += 1;
      nodes.push({ kind: char === "_" ? "sub" : "sup", nodes: group() });
      continue;
    }
    // Bare braces are TeX grouping and have no visible width.
    if (char === "{" || char === "}") {
      i += 1;
      continue;
    }
    text += char;
    i += 1;
  }
  flush();

  return nodes;
}

/**
 * `$...$`, but only when it is really a formula.
 *
 * The delimiters have to hug their content — no space just inside either one —
 * and the content cannot hold another `$`. That is what keeps "it costs $5 and
 * saves $3" out of the maths renderer: the span between those two dollars ends
 * in a space, so it is not one.
 */
const MATH_SPAN = /^\$(\S(?:[^$\n]*\S)?)\$/;

const INLINE_CODE = /^(`+)([\s\S]*?)\1/;
const EMBED = /^!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/;
const WIKILINK = /^\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/;
const LINK = /^\[([^\]]+)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/;
const STRONG = /^\*\*(\S(?:[\s\S]*?\S)?)\*\*/;
const EM = /^\*(\S(?:[\s\S]*?\S)?)\*/;

/**
 * Split one line of prose into its inline pieces.
 *
 * Order matters: code spans win over everything, so a backticked `**x**` stays
 * literal, and `![[` is tried before `[[` so an embed is never read as a link
 * to a note called `!name.svg`. A marker that never closes falls through to
 * plain text, which is how an unmatched `*` renders as an asterisk instead of
 * eating the rest of the line.
 */
export function parseInline(src: string): Inline[] {
  const nodes: Inline[] = [];
  let text = "";
  let i = 0;

  const flush = () => {
    if (text !== "") nodes.push({ kind: "text", text });
    text = "";
  };
  const push = (node: Inline, length: number) => {
    flush();
    nodes.push(node);
    i += length;
  };

  while (i < src.length) {
    const rest = src.slice(i);
    const char = src[i];

    if (char === "`") {
      const code = INLINE_CODE.exec(rest);
      if (code && code[2].trim() !== "") {
        push({ kind: "code", text: code[2].trim() }, code[0].length);
        continue;
      }
    }

    if (char === "$") {
      const math = MATH_SPAN.exec(rest);
      if (math) {
        push({ kind: "math", nodes: parseMath(math[1]) }, math[0].length);
        continue;
      }
    }

    if (char === "!") {
      const embed = EMBED.exec(rest);
      if (embed) {
        const caption = embed[2]?.trim();
        push(
          {
            kind: "embed",
            target: embed[1].trim(),
            caption: caption === undefined || caption === "" ? null : caption,
          },
          embed[0].length,
        );
        continue;
      }
      const image = IMAGE.exec(rest);
      if (image) {
        const src2 = safeHref(image[2]);
        if (src2 !== null) {
          push({ kind: "image", src: src2, alt: image[1] }, image[0].length);
          continue;
        }
      }
    }

    if (char === "[") {
      const wiki = WIKILINK.exec(rest);
      if (wiki) {
        const target = wiki[1].trim();
        push({ kind: "note", target, label: (wiki[2] ?? target).trim() }, wiki[0].length);
        continue;
      }
      const link = LINK.exec(rest);
      if (link) {
        const href = safeHref(link[2]);
        // A rejected scheme is not dropped; the whole `[text](url)` stays on
        // the page as the text it was, so nothing goes missing silently.
        if (href !== null) {
          push({ kind: "link", href, label: link[1] }, link[0].length);
          continue;
        }
      }
    }

    if (char === "*") {
      const strong = STRONG.exec(rest);
      if (strong) {
        push({ kind: "strong", children: parseInline(strong[1]) }, strong[0].length);
        continue;
      }
      const em = EM.exec(rest);
      if (em) {
        push({ kind: "em", children: parseInline(em[1]) }, em[0].length);
        continue;
      }
    }

    text += char;
    i += 1;
  }

  flush();
  return nodes;
}

/**
 * Is this paragraph nothing but a picture?
 *
 * `![[diagram.svg]]` on a line of its own is the only way the notes embed
 * anything, and it wants a `<figure>`. A `<figure>` inside a `<p>` is invalid
 * HTML, so an embed that turns up mid-sentence is rendered inline instead.
 */
export function standaloneFigure(nodes: Inline[]): FigureNode | null {
  const meaningful = nodes.filter((node) => node.kind !== "text" || node.text.trim() !== "");
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  return only.kind === "embed" || only.kind === "image" ? only : null;
}

/**
 * The reader-visible text of a run of inline nodes, with all the markup gone.
 *
 * A heading's link id has to come from what a reader sees, not from the
 * markdown source, so this walks the same `Inline[]` tree the renderer walks
 * and keeps only the words: a link or a wikilink contributes its label, and
 * math the symbols `parseMath` already substituted. That is what makes
 * `` `softmax` `` and `**softmax**` slug the same: both reduce to the plain
 * word before `slugify` ever sees them.
 *
 * An embed or an image inside a heading never becomes the `<figure>` the same
 * node gets in a paragraph of its own: `InlineView` in `NoteProse.tsx` cannot
 * put a block element inside an `h1`..`h4` any more than it can inside a
 * `<p>`, so both render as their name in mono text instead - an embed's
 * `target`, an image's `alt` or, with none, its `src`. This mirrors exactly
 * that, not the figure's caption, because a reader looking at the actual page
 * sees the filename, never the alias the note wrote for the picture.
 */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node): string => {
      switch (node.kind) {
        case "text":
        case "code":
          return node.text;
        case "strong":
        case "em":
          return inlineText(node.children);
        case "link":
          return node.label;
        case "note":
          return node.label;
        case "embed":
          return node.target;
        case "image":
          return node.alt || node.src;
        case "math":
          return mathText(node.nodes);
      }
    })
    .join("");
}

function mathText(nodes: MathNode[]): string {
  return nodes.map((node) => (node.kind === "text" ? node.text : mathText(node.nodes))).join("");
}

/**
 * A URL-fragment-safe id built from a heading's rendered text.
 *
 * `normalize("NFC")` composes rather than decomposes, so a precomposed é
 * (one codepoint) and an "e" followed by a combining acute accent (two
 * codepoints - the same visible word, and something a note copied from
 * somewhere else can easily contain) land on the same id. Lowercased, and
 * anything that is not a Unicode letter, digit or combining mark collapsed to
 * a single hyphen, so `The `softmax` step` and `The **softmax** step` land on
 * the same id once `inlineText` has reduced both to the same word.
 *
 * Keeping `\p{L}`, `\p{N}` and `\p{M}` rather than only `[a-z0-9]` is what
 * lets a note written in any script keep its own words as its id instead of
 * folding to the same meaningless `section` every ASCII-only rule would give
 * it. `\p{M}` matters on its own: this used to also fold Latin accents off by
 * decomposing and stripping them, which happened to make an accented word and
 * its plain version slug alike, but the same step silently deleted the vowel
 * signs out of a Devanagari word, since those are combining marks too, just
 * ones that carry meaning rather than decoration - a base consonant lost its
 * vowel sign and collided with the same consonant written alone. There is no
 * accent fold any more, so an accented Latin word keeps its own accent in the
 * id, which is still a real letter, a valid id, and a fragment a browser
 * percent-encodes without help. An HTML id may hold any non-space character,
 * which is what makes all of this legal in the first place.
 *
 * A heading can still fold to nothing: one that is pure punctuation, such as
 * `???` or a dash on its own, has no letter, digit or mark in it at all. That
 * would otherwise slug to the empty string, which is not a link anyone could
 * ever share. `section` is the fallback, and it goes through the same
 * duplicate counter as any other heading, so a second unreadable title
 * becomes `section-2` rather than silently reusing the first one's id.
 */
export function slugify(text: string): string {
  const folded = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return folded === "" ? "section" : folded;
}

/**
 * Refuses a `headingIds` prefix that cannot be a namespace: one with
 * whitespace in it (an id cannot hold any at all), or one that does not open
 * with a letter. Only runs outside production, the same trade-off React's own
 * dev-mode checks make: the cost of the check is not worth paying on every
 * request once the call sites are known good, but a caller who gets this
 * wrong should see it immediately, as a thrown error at the page that passed
 * a bad prefix, rather than as two notes' headings quietly landing on the
 * same link with no error anywhere.
 */
function assertIdSafe(prefix: string): void {
  if (process.env.NODE_ENV === "production") return;
  if (/\s/.test(prefix)) {
    throw new Error(
      `headingIds: idPrefix ${JSON.stringify(prefix)} contains whitespace, which an id cannot hold.`,
    );
  }
  if (!/^\p{L}/u.test(prefix)) {
    throw new Error(`headingIds: idPrefix ${JSON.stringify(prefix)} must start with a letter.`);
  }
}

/**
 * A stable id for every heading in a document, keyed by the block object so
 * the renderer can look one up without recomputing it.
 *
 * Two things make a shared link outlive the session that made it. First, the
 * same note always produces the same ids: they are assigned by walking the
 * document once, top to bottom, into list items and quotes as well as the
 * top level, so the order never depends on anything but the file's own
 * content. Second, a repeated heading (and session logs repeat headings
 * constantly, one `## Probe` per question) gets a distinct id rather than
 * clobbering the first: `the-idea`, then `the-idea-2`, then `the-idea-3`,
 * counted from first occurrence.
 *
 * That counter alone is not enough to promise every id is distinct: a
 * document with both `## Probe` and a later, literal `## Probe-2` would slug
 * both of them to `probe-2`, one from the counter and one from the text
 * itself, and the second would silently steal the first's link. `claim`
 * checks the id it is about to hand out against every id already issued, in
 * either form, and keeps incrementing until it finds one that is free - the
 * way GitHub's own heading slugger does it - rather than only counting how
 * many times the base word has been seen.
 *
 * `prefix` namespaces one note's ids away from another's, for a page that
 * renders more than one `NoteProse`. It is taken verbatim, not slugified:
 * `slugify` is lossy on purpose - `A, B` and `A - B` are meant to read as the
 * same heading - and that is exactly wrong for a prefix, whose only job is
 * telling two notes apart. Making a prefix "nicer" by collapsing its
 * separators can only destroy the distinction it exists to carry (`a/b` and
 * `a-b` both becoming the namespace `a-b` is not a hypothetical, it is what
 * `slugify(prefix)` used to do here), and no transform this function runs on
 * one prefix can know what another `NoteProse` on the same page was given, so
 * uniqueness across notes is the caller's job, not this one's. `assertIdSafe`
 * only checks the shape a caller must already be able to guarantee - id-safe,
 * not empty, no whitespace, starting with a letter - and, outside production,
 * throws on a bad one so the mistake surfaces at the call site instead of as
 * two notes' links silently landing on each other. Left empty, the default, a
 * page with exactly one note (the only case that exists today) gets plain ids
 * straight off the heading text, which is what makes `#worked-example` a link
 * worth sharing instead of `#note-1-worked-example`.
 */
export function headingIds(blocks: Block[], prefix = ""): Map<Block, string> {
  const ids = new Map<Block, string>();
  const issued = new Set<string>();
  // The next suffix to try for a given base, so a long run of repeats does
  // not re-scan every earlier number it has already learned is taken.
  const next = new Map<string, number>();

  function claim(id: string): string {
    if (!issued.has(id)) {
      issued.add(id);
      return id;
    }
    let n = next.get(id) ?? 2;
    let candidate = `${id}-${n}`;
    while (issued.has(candidate)) {
      n += 1;
      candidate = `${id}-${n}`;
    }
    next.set(id, n + 1);
    issued.add(candidate);
    return candidate;
  }

  if (prefix !== "") assertIdSafe(prefix);
  const namespace = prefix;

  function walk(list: Block[]): void {
    for (const block of list) {
      if (block.kind === "heading") {
        const text = inlineText(parseInline(block.text));
        const own = slugify(text);
        ids.set(block, claim(namespace === "" ? own : `${namespace}-${own}`));
        continue;
      }
      if (block.kind === "list") {
        for (const item of block.items) walk(item);
        continue;
      }
      if (block.kind === "quote") {
        walk(block.blocks);
      }
    }
  }

  walk(blocks);
  return ids;
}
