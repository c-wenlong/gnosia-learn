import Link from "next/link";

import { cx } from "./classes";

/**
 * Kit `Cite`: the citation chip under a tutor turn and under a review
 * answer. A numbered disc and the source's name in a 26px pill with a 1px
 * border (NotebookLM's numbered circle, grown into a pill that says what it
 * points at). The name truncates, so the whole of it is the pill's tooltip.
 *
 * A link when the source has somewhere to go (the note's workspace, a web
 * source), a plain label otherwise: a review answer's only source is the
 * check block's `source:` line, which goes nowhere. No hooks, so it is safe
 * on the server. Review drew its own copy (`CitePill`) until 2026-10-05.
 */
export function Cite({
  n,
  label,
  href,
  className,
}: {
  n: number;
  label: string;
  href?: string | null;
  className?: string;
}) {
  const classes = cx(
    "inline-flex h-[26px] max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface pr-2.5 pl-[3px] text-[12px] text-text2",
    href && "transition-colors duration-100 hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    className,
  );
  const body = (
    <>
      <span
        aria-hidden
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface2 text-[12px] font-bold text-text2"
      >
        {n}
      </span>
      <span className="sr-only">Source {n}: </span>
      <span className="min-w-0 truncate">{label}</span>
    </>
  );
  if (!href)
    return (
      <span title={label} className={classes}>
        {body}
      </span>
    );
  const external = /^https?:/.test(href);
  return (
    <Link
      href={href}
      title={label}
      className={classes}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      {body}
    </Link>
  );
}
