/**
 * Kit `Cite`: a numbered circle and the source's locator in a small pill,
 * `[1] Lecture 3, slide 8`. The review answer's only citation is the check
 * block's `source:` line, so it is always number 1.
 *
 * Local to review for now: the concept workspace (phase 1c) owns the tutor's
 * citation pill, and when it lands in `components/ui/` this should become it.
 */
export function CitePill({ n, label }: { n: number; label: string }) {
  return (
    <span
      title={label}
      className="inline-flex h-[26px] max-w-full min-w-0 shrink items-center gap-1.5 rounded-full border border-border bg-surface pr-2 pl-1"
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface2 text-[11px] font-bold text-text2"
      >
        {n}
      </span>
      <span className="sr-only">Source {n}: </span>
      <span className="truncate text-[12px] text-text2">{label}</span>
    </span>
  );
}
