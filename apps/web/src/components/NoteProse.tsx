import {
  headingIds,
  inlineText,
  isExternalHref,
  parseInline,
  parseNote,
  safeHref,
  slugify,
  standaloneFigure,
  type Block,
  type FigureNode,
  type Inline,
} from "@/components/markdown";
import { EmbedImage } from "@/components/EmbedImage";
import { cx } from "@/components/ui/classes";
import { DisplayMath, InlineMath } from "@/components/Math";
import { WidgetFailure } from "@/components/WidgetFailure";
import type { AssetProblemCode } from "@/lib/asset-problems";

/**
 * A concept note or a session log, read as prose instead of as source.
 *
 * `/library/[id]` used to put these files in a `<pre>`, hashes and brackets
 * and all. They are long: a session log runs past two hundred lines and is
 * meant to be read from top to bottom. So the whole job here is typographic,
 * and three decisions carry it.
 *
 * **A 72ch measure, at 15px on a 1.7 line.** These pages are wide so a video
 * can sit beside its transcript, and prose set across that whole column is
 * prose nobody finishes. 72ch is the measure the reading pages share, so a
 * note and a course page read at the same width.
 *
 * **Space above a heading, not below it.** The gap over an `##` is four times
 * the gap under it, which is what makes a heading look attached to the section
 * it opens rather than floating between two. It is the single thing most
 * markdown renderers get wrong, and in a document with twenty headings it is
 * the difference between a structure and a list.
 *
 * **One rendering in both themes, from the tokens.** Nothing here is a
 * `dark:` variant. Every colour is a token from `globals.css`, and the
 * callouts mix their one hue into `var(--surface)` and `var(--text)` with
 * `color-mix`, so a green "correct" panel is a pale green on the light theme
 * and a deep green on the dark one from the same declaration.
 *
 * ## Server component, and it stays that way
 *
 * There is no state, no effect and no event handler here, so nothing ships to
 * the browser: the markdown is parsed once on the server and the reader is
 * handed HTML. That is also the strongest argument against the alternative of
 * a client-side `react-markdown`, which would put its whole parser in the
 * bundle to produce a page that never changes after paint.
 *
 * The one exception is a picture. `EmbedImage` is a client island holding the
 * `<img>` and its `onError`, so a failed embed can say why; a note with no
 * pictures never renders it and still ships nothing.
 *
 * ## Sanitisation: safe because of what it cannot do, not because of what it strips
 *
 * These notes are written by the repo's owner and by the tutor, so they are not
 * hostile input, and it would be easy to use that as a reason to render raw
 * HTML. The reason not to is that the assumption is one paste away from being
 * false — a definition copied off a docs site, a snippet from a model's output
 * — and by then the code that trusted it is long since written.
 *
 * So there is no sanitiser here, because there is nothing to sanitise:
 *
 * 1. **No HTML ever becomes markup.** This renderer builds React elements and
 *    never an HTML string. A `<script>` in a note is text, and React escapes
 *    text. That is a property of the shape of the code, not a rule someone has
 *    to remember, which is exactly what a sanitiser is not: an allowlist is one
 *    bad configuration away from letting something through, and it has to be
 *    maintained. The one HTML string on the page is KaTeX's rendering of a
 *    formula, built from the LaTeX alone with untrusted commands switched off;
 *    `components/Math.tsx` says why that is safe.
 * 2. **The one attribute built from note text is checked.** `href` and `src`
 *    go through `safeHref`, which admits relative URLs and `http`, `https` and
 *    `mailto`, and refuses everything else — `javascript:` and `data:`
 *    included. A refused link stays on the page as the text it was written as.
 * 3. **Links the caller resolves are checked too.** `resolveNote` and
 *    `resolveEmbed` are app code and trusted, but they take an argument that
 *    came out of a note, so their output goes through the same gate.
 *
 * The residual risk is cosmetic. A hostile note can produce a wall of bold
 * text or a very wide code block. It cannot run anything.
 */
export function NoteProse({
  source,
  resolveNote,
  resolveEmbed,
  idPrefix = "",
  className = "",
  images = "show",
}: {
  /** The file as it is on disk, frontmatter and all. */
  source: string;
  /** `[[slug]]` to a URL. Without one, a wikilink renders as a marked-up name. */
  resolveNote?: (slug: string) => string | undefined;
  /** `![[name.svg]]` to a URL. Without one, the embed renders as a named gap. */
  resolveEmbed?: (name: string) => EmbedResolution | undefined;
  /**
   * Namespaces this note's heading ids away from another `NoteProse` on the
   * same page. Left empty, the default, a heading's id is just its own slug
   * (`#worked-example` rather than `#note-1-worked-example`), which is right
   * for the one call site that exists today and for any page that only ever
   * renders one note. A page holding two must pass each a distinct prefix,
   * typically the asset id or note slug it already has on hand, so `The idea`
   * in one note and `The idea` in the other resolve to different anchors.
   *
   * The prefix is used exactly as given, never folded or rewritten, so two
   * notes collide only when they are handed the identical string. That is the
   * one thing this module cannot catch, since it only ever sees one prefix at a
   * time: distinctness is the caller's job. What it does check is that a
   * non-empty prefix is usable as one: no whitespace, starting with a letter.
   * Outside production, a prefix that fails that throws immediately, so the
   * mistake shows up at the page that passed it rather than as a link that
   * lands on the wrong note.
   */
  idPrefix?: string;
  /** Merged onto the root, so a caller can give it padding or a scroll box. */
  className?: string;
  /**
   * `link` renders a markdown image (`![alt](url)`) as a link to it rather
   * than an `<img>`, so text nobody on this site wrote (a model's reply)
   * cannot make the browser fetch a URL of its choosing just by being shown.
   * A note keeps `show`: its author put the picture there.
   */
  images?: "show" | "link";
}) {
  const { blocks } = parseNote(source);
  const links: Resolvers = { resolveNote, resolveEmbed, imagesAsLinks: images === "link" };
  const ids = headingIds(blocks, idPrefix);

  if (blocks.length === 0) {
    // `leading-5` is `text-sm`'s own 20px line, written out so it stays when
    // a caller's size replaces `text-sm` (the note panel's `text-[14px]`).
    return (
      <p className={cx("text-sm leading-5 text-text2", className)}>
        This note has no body yet, only the metadata at the top of the file.
      </p>
    );
  }

  return (
    <article
      className={cx("max-w-[72ch] text-[15px] leading-[1.7] text-text [&>*:first-child]:mt-0", className)}
    >
      <Blocks blocks={blocks} links={links} ids={ids} />
    </article>
  );
}

interface Resolvers {
  resolveNote?: (slug: string) => string | undefined;
  resolveEmbed?: (name: string) => EmbedResolution | undefined;
  /** `NoteProse`'s `images="link"`. */
  imagesAsLinks?: boolean;
}

/**
 * What a caller's `resolveEmbed` may answer for one `![[name]]`.
 *
 * A bare URL, or a URL with the status route to ask when it fails, or a
 * problem the server already knows about (the file route switched off, the
 * file gone, a name the catalog has no row for). The last renders the failure
 * panel on the server, with no island and no request.
 */
export type EmbedResolution =
  | string
  | { src: string; statusHref?: string }
  | { problem: AssetProblemCode };

/** The margin every block kind takes, as Tailwind classes. */
interface Spacing {
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  paragraph: string;
  list: string;
  code: string;
  quote: string;
  figure: string;
  rule: string;
}

/**
 * The vertical rhythm, as one table rather than as numbers scattered through
 * the renderer.
 *
 * Every heading's top margin is several times its bottom one. That asymmetry
 * is what attaches a heading to the section it opens instead of leaving it
 * floating between two, and it is the thing most markdown renderers get wrong.
 *
 * `tight` is what a list item and a callout use: the same proportions, roughly
 * halved, so a nested list sits under its parent line rather than a
 * paragraph's worth of air away from it.
 */
const SPACE: { normal: Spacing; tight: Spacing } = {
  normal: {
    h1: "mt-10 mb-3",
    h2: "mt-10 mb-3",
    h3: "mt-7 mb-1.5",
    h4: "mt-6 mb-1",
    paragraph: "mt-4",
    list: "mt-4",
    code: "mt-5",
    quote: "mt-4",
    figure: "mt-5",
    rule: "my-9",
  },
  tight: {
    h1: "mt-5 mb-2",
    h2: "mt-5 mb-2",
    h3: "mt-4 mb-1",
    h4: "mt-4 mb-1",
    paragraph: "mt-2.5",
    list: "mt-2",
    code: "mt-3",
    quote: "mt-3",
    figure: "mt-3",
    rule: "my-5",
  },
};

function Blocks({
  blocks,
  links,
  ids,
  tight = false,
}: {
  blocks: Block[];
  links: Resolvers;
  ids: Map<Block, string>;
  tight?: boolean;
}) {
  const space = tight ? SPACE.tight : SPACE.normal;
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} links={links} ids={ids} space={space} tight={tight} />
      ))}
    </>
  );
}

function BlockView({
  block,
  links,
  ids,
  space,
  tight,
}: {
  block: Block;
  links: Resolvers;
  ids: Map<Block, string>;
  space: Spacing;
  tight: boolean;
}) {
  switch (block.kind) {
    case "heading":
      return <Heading block={block} links={links} ids={ids} space={space} />;

    case "paragraph": {
      const nodes = parseInline(block.text);
      const figure = standaloneFigure(nodes);
      if (figure) return <Figure node={figure} links={links} className={space.figure} />;
      return (
        <p className={cx(space.paragraph, "text-pretty")}>
          <Inlines nodes={nodes} links={links} />
        </p>
      );
    }

    case "code":
      return <CodeBlock info={block.info} text={block.text} className={space.code} />;

    case "rule":
      return <hr className={cx(space.rule, "h-px border-0 bg-border")} />;

    case "list":
      return <ListView block={block} links={links} ids={ids} className={space.list} tight={tight} />;

    case "quote":
      return <QuoteView block={block} links={links} ids={ids} className={space.quote} tight={tight} />;

    case "math":
      return <DisplayMath source={block.source} className={space.paragraph} />;
  }
}

/**
 * `h1` is the note's own title and appears once. `h2` carries a hairline,
 * because the documents that need this most are session logs where `## Probe`,
 * `## Teach` and `## Close` are the only way to find your place in two hundred
 * lines. Below that the steps are separated by weight alone; a second rule
 * would turn structure into stripes.
 *
 * Every level carries an `id`, so a link can drop a reader at this heading
 * instead of the top of the page, and `scroll-mt-20` on the element that
 * carries the id, not on the article around it, so the phone's sticky header
 * never covers what the link pointed at. `HeadingAnchor` is a second,
 * discoverable way to get that link (a small `#` a reader can copy), never
 * the only way: the id is on the heading whether or not anyone ever hovers it.
 */
function Heading({
  block,
  links,
  ids,
  space,
}: {
  block: Block & { kind: "heading" };
  links: Resolvers;
  ids: Map<Block, string>;
  space: Spacing;
}) {
  const nodes = parseInline(block.text);
  const text = inlineText(nodes);
  // `ids` covers every heading in the document this block came from, so the
  // lookup should never miss; slugifying on the spot is a safety net rather
  // than the expected path, in case a caller ever renders a heading block
  // `headingIds` did not see.
  const id = ids.get(block) ?? slugify(text);
  const children = <Inlines nodes={nodes} links={links} />;
  const anchor = <HeadingAnchor id={id} text={text} />;
  const balance = "text-balance tracking-[-0.02em]";

  switch (block.level) {
    case 1:
      return (
        <h1 id={id} className={cx(space.h1, "group scroll-mt-20 text-[1.625rem] font-semibold", balance)}>
          {children}
          {anchor}
        </h1>
      );
    case 2:
      return (
        <h2
          id={id}
          className={cx(space.h2, "group scroll-mt-20 border-b border-border pb-2 text-[1.25rem] font-semibold", balance)}
        >
          {children}
          {anchor}
        </h2>
      );
    case 3:
      return (
        <h3
          id={id}
          className={cx(space.h3, "group scroll-mt-20 text-[1.0625rem] font-semibold", balance)}
        >
          {children}
          {anchor}
        </h3>
      );
    default:
      return (
        <h4
          id={id}
          className={cx(space.h4, "group scroll-mt-20 text-[0.9375rem] font-semibold text-text2")}
        >
          {children}
          {anchor}
        </h4>
      );
  }
}

/**
 * The copyable link beside a heading: invisible until the heading is hovered
 * or the link itself is focused, so the page does not carry a faint hash mark
 * next to every one of twenty headings all the time. It comes after the
 * heading's own text in the markup, so a screen reader always meets the
 * heading before this, and it is purely a shortcut: the heading's `id` is
 * what a shared link actually lands on, with or without this element.
 *
 * `opacity-0` alone would make it undiscoverable on a touch screen, which has
 * no hover to reveal it and no keyboard to focus it: a reader could see the
 * heading was there and never learn it had a link. `(hover: none)` is true
 * exactly on that kind of device (a mouse, trackpad or pen reports `hover`),
 * so the link stays visible there from the start, and the hide-until-hover
 * behaviour is scoped to devices that can actually trigger hover.
 *
 * The padding plus the matching negative margin grow the tap target to at
 * least 24px on a side (measured on a phone: about 27x43px on an `h2`) without
 * moving the glyph or widening the gap it leaves in the heading's own text:
 * padding grows the box a finger can hit, the negative margin on the same
 * sides gives that growth straight back to the layout around it, so the
 * visible "#" sits exactly where it did before.
 */
function HeadingAnchor({ id, text }: { id: string; text: string }) {
  return (
    <a
      // Encoded, because a browser percent-decodes a fragment before it looks
      // for the element. An id holding a literal `%20` (a prefix taken from an
      // encoded note id) would otherwise be decoded to a space on the way in
      // and match nothing. Encoding makes the round trip land on the id as
      // written, whatever it contains; a Unicode id survives it the same way.
      href={`#${encodeURIComponent(id)}`}
      aria-label={`Link to "${text}"`}
      className="-m-2 ml-0.5 inline-block rounded-sm p-2 align-middle text-[0.8em] font-normal text-text2 no-underline opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:none)]:opacity-100"
    >
      #
    </a>
  );
}

/**
 * A fenced block, with its info string kept.
 *
 * ```` ```check ```` is not a code sample: it is a quiz card the `learn` CLI
 * parses out of the note. Labelling the fence is the only thing on the page
 * that says so, and it costs one line of chrome.
 */
function CodeBlock({ info, text, className }: { info: string; text: string; className: string }) {
  return (
    <div
      className={cx(className, "overflow-hidden rounded-lg border border-border bg-surface2")}
    >
      {info !== "" && (
        <p className="border-b border-border px-3 py-1.5 font-mono text-xs text-text2">
          {info}
        </p>
      )}
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-relaxed text-text2">
        <code>{text}</code>
      </pre>
    </div>
  );
}

/**
 * Items sit further apart in the body than inside a callout or another list.
 *
 * A note's `## Failure modes` is a list of paragraphs and needs the air. The
 * four options of a quiz are one line each and belong to one question; spacing
 * them like paragraphs makes four options look like four sections.
 */
function ListView({
  block,
  links,
  ids,
  className,
  tight,
}: {
  block: Block & { kind: "list" };
  links: Resolvers;
  ids: Map<Block, string>;
  className: string;
  tight: boolean;
}) {
  const shared = cx(className, tight ? "space-y-1" : "space-y-2", "pl-5 marker:text-text2");
  const items = block.items.map((item, i) => (
    <li key={i} className="pl-1 [&>*:first-child]:mt-0">
      <Blocks blocks={item} links={links} ids={ids} tight />
    </li>
  ));

  return block.ordered ? (
    <ol start={block.start} className={cx(shared, "list-decimal marker:tabular-nums")}>
      {items}
    </ol>
  ) : (
    <ul className={cx(shared, "list-disc")}>{items}</ul>
  );
}

/**
 * The tone of each callout kind, as one hue.
 *
 * A callout is a full 1px border plus a wash of its hue, never a thick
 * coloured rule down the left side. The hue is set once as `--tone` and mixed
 * three ways: into the border, into a nearly transparent wash for the ground,
 * and, for the title, into `var(--text)`, which is what makes the
 * label legible in both themes without a second declaration. Mixing toward the
 * page's own text colour means the label lands dark green on the light theme
 * and pale green on the dark one, always at a readable contrast against the
 * wash behind it.
 *
 * `question` deliberately borrows the app's accent rather than inventing a
 * fifth colour: a quiz is the neutral state of a session log, and most of a
 * log is quizzes.
 */
const CALLOUT_TONE: Record<string, string> = {
  question: "var(--accent)",
  note: "var(--accent)",
  info: "var(--accent)",
  tip: "var(--accent)",
  abstract: "var(--accent)",
  success: "var(--ok-text)",
  check: "var(--ok-text)",
  done: "var(--ok-text)",
  failure: "var(--danger)",
  danger: "var(--danger)",
  error: "var(--danger)",
  bug: "var(--danger)",
  warning: "var(--warn-text)",
  caution: "var(--warn-text)",
  attention: "var(--warn-text)",
  example: "var(--violet)",
  quote: "var(--text2)",
};

function QuoteView({
  block,
  links,
  ids,
  className,
  tight,
}: {
  block: Block & { kind: "quote" };
  links: Resolvers;
  ids: Map<Block, string>;
  className: string;
  tight: boolean;
}) {
  if (block.callout === null) {
    return (
      <blockquote
        className={cx(className, "border-l border-border pl-4 text-text2 [&>*:first-child]:mt-0")}
      >
        <Blocks blocks={block.blocks} links={links} ids={ids} tight={tight} />
      </blockquote>
    );
  }

  // An unknown kind gets the neutral tone and keeps its own name as the title,
  // so a callout this app has never heard of still reads as a callout.
  const tone = CALLOUT_TONE[block.callout] ?? "var(--text2)";

  return (
    <aside
      style={{ "--tone": tone } as React.CSSProperties}
      className={cx(
        className,
        "rounded-xl border border-[color-mix(in_srgb,var(--tone)_32%,var(--border))] bg-[color-mix(in_srgb,var(--tone)_8%,transparent)] px-4 py-3",
      )}
    >
      <p className="text-[13px] font-semibold tracking-[-0.01em] text-[color-mix(in_srgb,var(--tone)_55%,var(--text))]">
        {block.title}
      </p>
      <div className="mt-1.5 [&>*:first-child]:mt-0">
        <Blocks blocks={block.blocks} links={links} ids={ids} tight />
      </div>
    </aside>
  );
}

/**
 * An embedded asset, framed like a plate in a book.
 *
 * An SVG gets the same constant near-white mat `DiagramView` uses, and for the
 * same reason: a tldrawkc export bakes its own colours in for a light ground,
 * and a diagram is the one picture where colour carries meaning, so it is
 * never recoloured or inverted to suit the theme.
 *
 * The frame and the caption are server markup. Inside it goes one of three
 * things: the failure panel, when the caller already knows the embed cannot
 * load; the `EmbedImage` island, which holds the `<img>` and asks why if it
 * fails; or, with no resolver at all, a line naming the gap.
 */
function Figure({
  node,
  links,
  className,
}: {
  node: FigureNode;
  links: Resolvers;
  className: string;
}) {
  if (node.kind === "image" && links.imagesAsLinks === true) {
    const href = safeHref(node.src);
    return (
      <p className={cx(className, "text-sm text-text2")}>
        Image:{" "}
        {href === null ? (
          <span className="font-mono">{node.alt || node.src}</span>
        ) : (
          <Anchor href={href}>{node.alt || node.src}</Anchor>
        )}
      </p>
    );
  }
  const resolved: EmbedResolution | null =
    node.kind === "image" ? node.src : (links.resolveEmbed?.(node.target) ?? null);
  const name = node.kind === "image" ? node.alt || node.src : node.target;
  // The alt text falls back to the file's own name, which is a real
  // description in this corpus: `vector-as-a-list-of-numbers.svg` says what the
  // drawing is about. A caption is a different question, and a filename is not
  // one, so only text the note actually wrote gets printed under the picture.
  const alt = node.kind === "image" ? node.alt || node.src : node.target;
  const caption = node.kind === "image" ? node.alt : node.caption;

  const problem =
    resolved !== null && typeof resolved !== "string" && "problem" in resolved
      ? resolved.problem
      : null;
  const target =
    resolved === null || typeof resolved === "string"
      ? { src: resolved, statusHref: undefined }
      : "src" in resolved
        ? resolved
        : { src: null, statusHref: undefined };
  // Both URLs came out of a note by way of the caller, so both pass the gate.
  const src = target.src === null ? null : safeHref(target.src);
  const statusHref =
    target.statusHref === undefined ? undefined : (safeHref(target.statusHref) ?? undefined);

  if (problem === null && src === null) {
    return (
      <p
        className={cx(className, "rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-text2")}
      >
        Embedded asset <span className="font-mono text-text">{name}</span> is not
        available on this page.
      </p>
    );
  }

  const isVector = /\.svgz?(?:[?#]|$)/i.test(src ?? name);

  return (
    <figure className={cx(className, "overflow-hidden rounded-xl border border-border")}>
      {problem !== null ? (
        <WidgetFailure
          inset
          headline={
            <>
              <span className="font-mono">{name}</span> cannot be shown here.
            </>
          }
          code={problem}
          className="min-h-40"
        />
      ) : (
        src !== null && (
          <EmbedImage src={src} statusHref={statusHref} alt={alt} name={name} vector={isVector} />
        )
      )}
      {caption !== null && caption !== "" && (
        <figcaption className="border-t border-border px-3 py-2 text-xs text-text2">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

const LINK_CLASS =
  "rounded-sm text-accent-text underline decoration-1 underline-offset-2 transition-colors duration-150 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Inlines({ nodes, links }: { nodes: Inline[]; links: Resolvers }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineView key={i} node={node} links={links} />
      ))}
    </>
  );
}

function InlineView({ node, links }: { node: Inline; links: Resolvers }) {
  switch (node.kind) {
    case "text":
      return <>{node.text}</>;

    case "strong":
      return (
        <strong className="font-semibold text-text">
          <Inlines nodes={node.children} links={links} />
        </strong>
      );

    case "em":
      return (
        <em className="italic">
          <Inlines nodes={node.children} links={links} />
        </em>
      );

    case "code":
      return (
        <code className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[0.85em] text-text">
          {node.text}
        </code>
      );

    case "link":
      return <Anchor href={node.href}>{node.label}</Anchor>;

    case "note": {
      const href = links.resolveNote?.(node.target);
      const safe = href === undefined ? null : safeHref(href);
      if (safe !== null) return <Anchor href={safe}>{node.label}</Anchor>;
      // No resolver, so no link. The name still has to read as a reference to
      // another note rather than as a stray run of hyphens, hence the dotted
      // underline: the shape of a link, without claiming to be one.
      return (
        <span
          title={`Note: ${node.target}`}
          className="text-text2 underline decoration-dotted decoration-text2 underline-offset-2"
        >
          {node.label}
        </span>
      );
    }

    case "embed":
    case "image":
      // A picture in the middle of a sentence cannot be a figure without
      // putting a block element inside a `<p>`, so it is named instead.
      return (
        <span className="font-mono text-[0.85em] text-text2">
          {node.kind === "image" ? node.alt || node.src : node.target}
        </span>
      );

    case "math":
      return node.display ? <DisplayMath source={node.source} /> : <InlineMath source={node.source} />;
  }
}

function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
  const external = isExternalHref(href);
  return (
    <a
      href={href}
      className={LINK_CLASS}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
