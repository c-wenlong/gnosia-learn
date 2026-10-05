import { cx } from "@/components/ui/classes";
import { renderMath, splitMath } from "@/lib/math";

/**
 * Typeset maths, as React: one expression inline, one on its own line, or a
 * whole string with its `$...$` spans set and its prose left as prose.
 *
 * No hooks, no state and no `"use client"`, so these render in a server
 * component (a note, a summary) and inside a client one (a quiz question, a
 * choice row) alike. KaTeX is synchronous, so the HTML a server writes is the
 * HTML hydration expects.
 *
 * ## Why `dangerouslySetInnerHTML` is safe here
 *
 * It is the only way to put KaTeX's output on the page, since KaTeX returns an
 * HTML string. What makes that string safe is how it is built, not a sanitiser:
 *
 * 1. **Only the LaTeX goes in.** The prose around a formula is never handed to
 *    KaTeX; `MathText` renders it as React text, which React escapes.
 * 2. **KaTeX escapes what it is given.** A `<script>` inside `$...$` comes out
 *    as the characters `<script>` in a text node, or, when the source does not
 *    parse, as the escaped source in an error span. There is no path by which
 *    source text becomes a tag or an attribute name.
 * 3. **The commands that would build a link or pull in a resource are off.**
 *    `trust: false` in `lib/math.ts` refuses `\href`, `\url`,
 *    `\includegraphics` and the `\html...` family, so a formula cannot carry a
 *    `javascript:` URL or an arbitrary class or attribute.
 *
 * The source is the app's own content and the tutor's replies. The residual
 * risk from a hostile formula is cosmetic (an ugly or very wide expression,
 * capped by `maxSize`), the same bar `NoteProse` sets for itself.
 *
 * Colour is never set here: KaTeX's glyphs are `currentColor`, so maths takes
 * the colour of the text around it in every palette, a choice row's green or
 * yellow included. The size is the `.katex` rule in `globals.css`.
 */

export function InlineMath({ source, className }: { source: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderMath(source, false) }} />;
}

/**
 * A display formula, centred, on its own line. A `span` with `display: block`
 * rather than a `div`, so it is valid inside a `<p>` or a `<button>` as well
 * as between blocks. A formula wider than the column scrolls sideways inside
 * its own box instead of pushing the page wider, which on a phone is the
 * difference between a scrollable matrix and a page that pans.
 */
export function DisplayMath({ source, className }: { source: string; className?: string }) {
  return (
    <span
      className={cx("block max-w-full overflow-x-auto overflow-y-hidden py-1 [&>.katex-display]:m-0", className)}
      dangerouslySetInnerHTML={{ __html: renderMath(source, true) }}
    />
  );
}

/**
 * A plain string with its maths typeset: `$...$` inline, `$$...$$` display,
 * `\$` a literal dollar, and everything else exactly as written.
 *
 * With no `className` it renders bare children, so it drops into a `<p>`, a
 * heading or a button without adding a wrapper to style around.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = splitMath(text);
  const children = parts.map((part, i) =>
    part.kind === "text" ? (
      part.value
    ) : part.kind === "inline" ? (
      <InlineMath key={i} source={part.value} />
    ) : (
      <DisplayMath key={i} source={part.value} />
    ),
  );
  return className === undefined ? <>{children}</> : <span className={className}>{children}</span>;
}
