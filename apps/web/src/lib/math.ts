import katex from "katex";

import { mathSpanAt } from "@gnosia/tutor/markdown";

/**
 * LaTeX to typeset HTML, and a plain string split into its prose and its maths.
 *
 * React-free on purpose, like `@gnosia/tutor/markdown`: the edge cases are in
 * the splitting and the options, and both should be testable without a DOM.
 * `components/Math.tsx` is what puts the result on a page.
 *
 * ## Why KaTeX, after the notes did without it
 *
 * The first renderer mapped a table of TeX macros to Unicode and set the rest
 * in italics. That read fine for `$f(n) \le c\,g(n)$` and failed on everything
 * the table lacked: `\frac`, `\sum_{i=1}^{n}`, `\mathbb{R}`, a matrix, a hat.
 * Worse, the quiz questions and summaries were never parsed at all, so a
 * learner saw `$c>0, n_0$` with its dollars. KaTeX is the smallest real
 * typesetter: synchronous, no DOM needed, so the same call works in a server
 * component and in a client one, and the HTML it writes on the server is the
 * HTML the browser would have written.
 *
 * ## The options, and why each one
 *
 * - `throwOnError: false`: a formula KaTeX cannot parse is shown as its own
 *   source in `errorColor`, never a thrown render and never a blank.
 * - `strict: "ignore"`: LaTeX that KaTeX accepts but real LaTeX would warn
 *   about (a Unicode character in maths mode, say) renders quietly instead of
 *   logging on every request.
 * - `output: "htmlAndMathml"`: the visual HTML is marked `aria-hidden`, and a
 *   MathML copy beside it is what a screen reader reads. So no `role="math"`
 *   is added anywhere: the MathML already is the accessible tree.
 * - `trust: false` (KaTeX's default, stated so nobody flips it casually):
 *   `\href`, `\url`, `\includegraphics` and `\htmlClass` and friends are
 *   refused, which is what makes the HTML safe to inject; see `Math.tsx`.
 * - `maxSize: 20` and `maxExpand: 1000`: a `\rule{9999em}{9999em}` or a
 *   runaway macro cannot blow up the layout or the server.
 */
const OPTIONS = {
  throwOnError: false,
  strict: "ignore",
  output: "htmlAndMathml",
  trust: false,
  maxSize: 20,
  maxExpand: 1000,
  // A token rather than a hex, so the error colour follows the palette.
  errorColor: "var(--danger, currentColor)",
} as const;

/**
 * Rendered formulas by source. The same handful of expressions is rendered
 * over and over (a choice row re-renders on every keypress in a session), and
 * KaTeX's output for a given source never changes, so it is kept. Bounded, so
 * a long-lived server process cannot grow it forever.
 */
const cache = new Map<string, string>();
const CACHE_LIMIT = 500;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * One LaTeX expression as KaTeX HTML (with its MathML), inline or display.
 *
 * `throwOnError: false` only covers a parse error; anything else KaTeX throws
 * (none is known, but it is a dependency) falls back to the escaped source,
 * so a formula can cost its typesetting and never the page around it.
 */
export function renderMath(source: string, display: boolean): string {
  const key = `${display ? "D" : "I"}${source}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(source, { ...OPTIONS, displayMode: display });
  } catch {
    html = `<span class="katex-error">${escapeHtml(source)}</span>`;
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, html);
  return html;
}

/** One piece of a string: prose, or the LaTeX source of a formula. */
export interface MathPart {
  kind: "text" | "inline" | "display";
  value: string;
}

/**
 * A plain string cut into prose and maths, for the places that show a summary,
 * a question or a choice as text rather than as a markdown note.
 *
 * The rules are `mathSpanAt`'s, the same ones a note is parsed with: `$...$`
 * must hug its content and not be followed by a digit, `$$...$$` is display,
 * and `\$` is a literal dollar. So "$3 and $5" stays prose, and a summary
 * reads the same in the workspace as it does in the note it came from.
 * Adjacent prose is merged, so a string with no maths is one text part.
 */
export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let prose = "";
  let i = 0;
  const flush = () => {
    if (prose !== "") parts.push({ kind: "text", value: prose });
    prose = "";
  };

  while (i < text.length) {
    const char = text[i];
    if (char === "\\" && text[i + 1] === "$") {
      prose += "$";
      i += 2;
      continue;
    }
    if (char === "$") {
      const span = mathSpanAt(text.slice(i));
      if (span !== null) {
        flush();
        parts.push({ kind: span.display ? "display" : "inline", value: span.source });
        i += span.length;
        continue;
      }
      if (text[i + 1] === "$") {
        prose += "$$";
        i += 2;
        continue;
      }
    }
    prose += char;
    i += 1;
  }
  flush();
  return parts;
}
