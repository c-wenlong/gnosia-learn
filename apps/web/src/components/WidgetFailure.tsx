import type { ReactNode } from "react";

import { buttonClasses, cx } from "@/components/ui/classes";
import { assetProblem, type AssetProblemCode } from "@gnosia/tutor/asset-problems";

/**
 * The failure state of the Widget placeholder.
 *
 * `docs/design/DESIGN.md` names the Widget placeholder as the box an asset or
 * an interactive renders into: a panel-coloured rectangle, a hairline border,
 * a small radius, muted text centred in it. This is that same box when the
 * asset could not be shown, so a failure keeps the footprint and the
 * vocabulary of the thing it replaces and the hi-fi pass restyles one
 * component, not four. Every surface that shows an asset uses it: the video
 * player, the diagram view, a card's thumbnail and an embed in a note.
 *
 * **Three things, in reading order.** What failed (the caller's headline), why
 * in plain words (from the code), and the one next step when there is one: a
 * command to type, a sentence, or Try again. The words live in
 * `@/lib/asset-problems`, keyed by code, so a failure reads the same wherever
 * it happens.
 *
 * **Calm, not red.** A missing render on a laptop is a state with a fix, not
 * an alarm, and most of these are the ordinary look of a fresh clone. The
 * panel stays in the neutral tokens; the command is the only thing set apart,
 * because it is the one thing to act on.
 *
 * **No `"use client"`, no hooks.** The detail page and `NoteProse` render it
 * on the server for everything decidable before render, and the client
 * islands render it after a probe. A module with no directive can be both.
 * `onRetry` is the one function prop, and only a client parent passes one.
 *
 * `inset` is for a panel that fills a frame which already has a border, such
 * as the diagram view's figure or a note's embedded figure, so the failure
 * does not draw a box inside a box.
 *
 * `compact` is for a card's thumbnail: the short label instead of the
 * sentence (the full one is its tooltip), a smaller glyph, and never a button, because the card is a link
 * and a button inside a link is invalid and unreachable.
 */
export function WidgetFailure({
  headline,
  code,
  compact = false,
  inset = false,
  onRetry,
  sourceRepo,
  className,
}: {
  /** What failed, as a full phrase: "This video did not load." */
  headline: ReactNode;
  /** Why. Null while the reason is still being asked for. */
  code: AssetProblemCode | null;
  compact?: boolean;
  /** Fills a frame that already has its own border. */
  inset?: boolean;
  /** Offered only for a code where asking again could work. */
  onRetry?: () => void;
  /** The tool that made the asset, when the caller knows it, so a fix names that tool's command. */
  sourceRepo?: string | null;
  /** Sizing from the caller, so the panel takes the footprint of its widget. */
  className?: string;
}) {
  const problem = code === null ? null : assetProblem(code, sourceRepo);
  const fix = problem?.fix;
  const canRetry = !compact && onRetry !== undefined && problem?.retry === true;

  if (compact) {
    return (
      <div
        role="status"
        data-problem={code ?? "checking"}
        className={cx("flex animate-fade-in flex-col items-center justify-center gap-1 px-3 py-2 text-center motion-reduce:animate-none", className)}
      >
        <BrokenGlyph className="h-5 w-5 text-text3" />
        <p className="text-[12px] font-medium text-text">{headline}</p>
        <p key={code ?? "checking"} className="animate-fade-in text-[12px] leading-snug text-text2 motion-reduce:animate-none" title={problem?.reason}>
          {problem === null ? "Checking why…" : problem.label}
        </p>
        {(fix?.kind === "command" || fix?.kind === "env") && (
          <code
            title={fix.text}
            className="max-w-full truncate rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[12px] text-text2"
          >
            {fix.text}
          </code>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      data-problem={code ?? "checking"}
      className={cx(
        "flex animate-fade-in flex-col items-center justify-center gap-2 bg-surface2 px-5 py-8 text-center motion-reduce:animate-none",
        !inset && "rounded-xl border-2 border-border",
        className,
      )}
    >
      <BrokenGlyph className="h-6 w-6 text-text3" />
      <p className="text-sm font-medium text-balance text-text">{headline}</p>
      {/* Keyed on the answer, so the reason fades in over "Checking why…" rather than snapping. */}
      <p
        key={code ?? "checking"}
        className="max-w-[52ch] animate-fade-in text-[13px] leading-relaxed text-pretty text-text2 motion-reduce:animate-none"
      >
        {problem === null ? "Checking why…" : problem.reason}
      </p>
      {(fix?.kind === "command" || fix?.kind === "env") && (
        <div className="mt-1 flex max-w-full flex-col items-center gap-1">
          <span className="text-[12px] text-text3">
            {fix.kind === "env" ? "To fix it, start the server with" : "To fix it, run"}
          </span>
          <code className="max-w-full overflow-x-auto whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text select-all">
            {fix.text}
          </code>
        </div>
      )}
      {fix?.kind === "note" && (
        <p className="max-w-[52ch] text-xs text-text2">{fix.text}</p>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-1" })}
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** A frame with a break through it: "something should be here". */
function BrokenGlyph({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M13 5h5.5A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5H15" />
      <path d="M11 19H5.5A2.5 2.5 0 0 1 3 16.5v-9A2.5 2.5 0 0 1 5.5 5H9" />
      <path d="m13 3-2 18" />
    </svg>
  );
}
