import {
  isExternalHref,
  parseInline,
  parseNote,
  safeHref,
  standaloneFigure,
  type Block,
  type FigureNode,
  type Inline,
  type MathNode,
} from "@/components/markdown";
import { EmbedImage } from "@/components/EmbedImage";
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
 * prose nobody finishes. 72ch is what `.prose-docs` already uses for the
 * hand-written pages, so a note and a course page read at the same width.
 *
 * **Space above a heading, not below it.** The gap over an `##` is four times
 * the gap under it, which is what makes a heading look attached to the section
 * it opens rather than floating between two. It is the single thing most
 * markdown renderers get wrong, and in a document with twenty headings it is
 * the difference between a structure and a list.
 *
 * **One rendering in both themes, from the tokens.** Nothing here is a
 * `dark:` variant. Every colour is a token from `globals.css`, and the
 * callouts mix their one hue into `var(--surface)` and `var(--foreground)` with
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
 *    never an HTML string, so `dangerouslySetInnerHTML` appears nowhere in it.
 *    A `<script>` in a note is text, and React escapes text. That is a property
 *    of the shape of the code, not a rule someone has to remember, which is
 *    exactly what a sanitiser is not: an allowlist is one bad configuration
 *    away from letting something through, and it has to be maintained.
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
  className = "",
}: {
  /** The file as it is on disk, frontmatter and all. */
  source: string;
  /** `[[slug]]` to a URL. Without one, a wikilink renders as a marked-up name. */
  resolveNote?: (slug: string) => string | undefined;
  /** `![[name.svg]]` to a URL. Without one, the embed renders as a named gap. */
  resolveEmbed?: (name: string) => EmbedResolution | undefined;
  /** Merged onto the root, so a caller can give it padding or a scroll box. */
  className?: string;
}) {
  const { blocks } = parseNote(source);
  const links: Resolvers = { resolveNote, resolveEmbed };

  if (blocks.length === 0) {
    return (
      <p className={`text-sm text-[var(--muted)] ${className}`}>
        This note has no body yet, only the metadata at the top of the file.
      </p>
    );
  }

  return (
    <article
      className={`max-w-[72ch] text-[15px] leading-[1.7] text-[var(--foreground)] [&>*:first-child]:mt-0 ${className}`}
    >
      <Blocks blocks={blocks} links={links} />
    </article>
  );
}

interface Resolvers {
  resolveNote?: (slug: string) => string | undefined;
  resolveEmbed?: (name: string) => EmbedResolution | undefined;
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
  tight = false,
}: {
  blocks: Block[];
  links: Resolvers;
  tight?: boolean;
}) {
  const space = tight ? SPACE.tight : SPACE.normal;
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} links={links} space={space} tight={tight} />
      ))}
    </>
  );
}

function BlockView({
  block,
  links,
  space,
  tight,
}: {
  block: Block;
  links: Resolvers;
  space: Spacing;
  tight: boolean;
}) {
  switch (block.kind) {
    case "heading":
      return <Heading block={block} links={links} space={space} />;

    case "paragraph": {
      const nodes = parseInline(block.text);
      const figure = standaloneFigure(nodes);
      if (figure) return <Figure node={figure} links={links} className={space.figure} />;
      return (
        <p className={`${space.paragraph} text-pretty`}>
          <Inlines nodes={nodes} links={links} />
        </p>
      );
    }

    case "code":
      return <CodeBlock info={block.info} text={block.text} className={space.code} />;

    case "rule":
      return <hr className={`${space.rule} h-px border-0 bg-[var(--border)]`} />;

    case "list":
      return <ListView block={block} links={links} className={space.list} tight={tight} />;

    case "quote":
      return <QuoteView block={block} links={links} className={space.quote} tight={tight} />;
  }
}

/**
 * `h1` is the note's own title and appears once. `h2` carries a hairline,
 * because the documents that need this most are session logs where `## Probe`,
 * `## Teach` and `## Close` are the only way to find your place in two hundred
 * lines. Below that the steps are separated by weight alone; a second rule
 * would turn structure into stripes.
 */
function Heading({
  block,
  links,
  space,
}: {
  block: Block & { kind: "heading" };
  links: Resolvers;
  space: Spacing;
}) {
  const children = <Inlines nodes={parseInline(block.text)} links={links} />;
  const balance = "text-balance tracking-[-0.02em]";

  switch (block.level) {
    case 1:
      return <h1 className={`${space.h1} text-[1.625rem] font-semibold ${balance}`}>{children}</h1>;
    case 2:
      return (
        <h2
          className={`${space.h2} border-b border-[var(--border)] pb-2 text-[1.25rem] font-semibold ${balance}`}
        >
          {children}
        </h2>
      );
    case 3:
      return (
        <h3 className={`${space.h3} text-[1.0625rem] font-semibold ${balance}`}>{children}</h3>
      );
    default:
      return (
        <h4 className={`${space.h4} text-[0.9375rem] font-semibold text-[var(--muted-strong)]`}>
          {children}
        </h4>
      );
  }
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
      className={`${className} overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)]`}
    >
      {info !== "" && (
        <p className="border-b border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {info}
        </p>
      )}
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-relaxed text-[var(--muted-strong)]">
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
  className,
  tight,
}: {
  block: Block & { kind: "list" };
  links: Resolvers;
  className: string;
  tight: boolean;
}) {
  const shared = `${className} ${tight ? "space-y-1" : "space-y-2"} pl-5 marker:text-[var(--muted)]`;
  const items = block.items.map((item, i) => (
    <li key={i} className="pl-1 [&>*:first-child]:mt-0">
      <Blocks blocks={item} links={links} tight />
    </li>
  ));

  return block.ordered ? (
    <ol start={block.start} className={`${shared} list-decimal marker:tabular-nums`}>
      {items}
    </ol>
  ) : (
    <ul className={`${shared} list-disc`}>{items}</ul>
  );
}

/**
 * The tone of each callout kind, as one hue.
 *
 * A callout is a full 1px border plus a wash of its hue, never a thick
 * coloured rule down the left side. The hue is set once as `--tone` and mixed
 * three ways: into the border, into a nearly transparent wash for the ground,
 * and — for the title — into `var(--foreground)`, which is what makes the
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
  success: "#16a34a",
  check: "#16a34a",
  done: "#16a34a",
  failure: "#dc2626",
  danger: "#dc2626",
  error: "#dc2626",
  bug: "#dc2626",
  warning: "#d97706",
  caution: "#d97706",
  attention: "#d97706",
  example: "#7c3aed",
  quote: "var(--muted)",
};

function QuoteView({
  block,
  links,
  className,
  tight,
}: {
  block: Block & { kind: "quote" };
  links: Resolvers;
  className: string;
  tight: boolean;
}) {
  if (block.callout === null) {
    return (
      <blockquote
        className={`${className} border-l border-[var(--border)] pl-4 text-[var(--muted-strong)] [&>*:first-child]:mt-0`}
      >
        <Blocks blocks={block.blocks} links={links} tight={tight} />
      </blockquote>
    );
  }

  // An unknown kind gets the neutral tone and keeps its own name as the title,
  // so a callout this app has never heard of still reads as a callout.
  const tone = CALLOUT_TONE[block.callout] ?? "var(--muted)";

  return (
    <aside
      style={{ "--tone": tone } as React.CSSProperties}
      className={`${className} rounded-xl border border-[color-mix(in_srgb,var(--tone)_32%,var(--border))] bg-[color-mix(in_srgb,var(--tone)_8%,transparent)] px-4 py-3`}
    >
      <p className="text-[13px] font-semibold tracking-[-0.01em] text-[color-mix(in_srgb,var(--tone)_55%,var(--foreground))]">
        {block.title}
      </p>
      <div className="mt-1.5 [&>*:first-child]:mt-0">
        <Blocks blocks={block.blocks} links={links} tight />
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
        className={`${className} rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-xs text-[var(--muted)]`}
      >
        Embedded asset <span className="font-mono text-[var(--muted-strong)]">{name}</span> is not
        available on this page.
      </p>
    );
  }

  const isVector = /\.svgz?(?:[?#]|$)/i.test(src ?? name);

  return (
    <figure className={`${className} overflow-hidden rounded-xl border border-[var(--border)]`}>
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
        <figcaption className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-strong)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

const LINK_CLASS =
  "rounded-sm text-[var(--accent-strong)] underline decoration-1 underline-offset-2 transition-colors duration-150 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

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
        <strong className="font-semibold text-[var(--foreground)]">
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
        <code className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--foreground)]">
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
          className="text-[var(--muted-strong)] underline decoration-dotted decoration-[var(--muted)] underline-offset-2"
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
        <span className="font-mono text-[0.85em] text-[var(--muted)]">
          {node.kind === "image" ? node.alt || node.src : node.target}
        </span>
      );

    case "math":
      return (
        <span className="italic">
          <MathNodes nodes={node.nodes} />
        </span>
      );
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

function MathNodes({ nodes }: { nodes: MathNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.kind === "sub") {
          return (
            <sub key={i}>
              <MathNodes nodes={node.nodes} />
            </sub>
          );
        }
        if (node.kind === "sup") {
          return (
            <sup key={i}>
              <MathNodes nodes={node.nodes} />
            </sup>
          );
        }
        // Variables lean, function names stand up: the one convention that
        // makes `n log n` look like notation rather than like a typo.
        return node.roman === true ? (
          <span key={i} className="not-italic">
            {node.text}
          </span>
        ) : (
          <span key={i}>{node.text}</span>
        );
      })}
    </>
  );
}
