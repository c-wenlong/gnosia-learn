import type { ReactNode } from "react";

import { cx, LABEL } from "./classes";

/** One `label · value` pair. `false`, `null` and `undefined` in a list are skipped, so a fact can be conditional in place. */
export interface Fact {
  label: string;
  value: ReactNode;
  /** The row's React key, for a list whose facts move; the place and the label otherwise, so two rows with one label never collide. */
  key?: string;
}

/**
 * The kit's facts: labelled values as a description list, `<dt>` for the
 * label and `<dd>` for the value, each pair in its own `<div>` (which HTML
 * allows inside a `<dl>`), so a screen reader announces a list and pairs each
 * value with its name.
 *
 * Two densities, one per place that had its own copy before:
 *
 * - `comfortable` (the default) is the library's asset facts: 12px labels
 *   over 13px secondary values on a phone, and a 6rem label column beside
 *   them from `sm` up.
 * - `dense` is the studio inspector's rhythm: 32px rows split by a hairline,
 *   a 6rem label column at every width (the inspector is narrow wherever it
 *   is drawn), 12px text throughout.
 *
 * The facts are a list rather than children so the density is set once, on
 * the list, without a context (which a server component cannot read).
 */
export function FactList({
  facts,
  density = "comfortable",
  className,
}: {
  facts: ReadonlyArray<Fact | false | null | undefined>;
  density?: "comfortable" | "dense";
  className?: string;
}) {
  const dense = density === "dense";
  return (
    <dl className={cx("flex flex-col", !dense && "gap-2", className)}>
      {facts.map((fact, at) =>
        fact ? (
          <div
            key={fact.key ?? `${at}:${fact.label}`}
            className={
              dense
                ? "grid min-h-8 grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 border-b border-border py-1.5 last:border-b-0"
                : "grid grid-cols-1 gap-0.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4"
            }
          >
            <dt className={dense ? "text-xs text-text2" : cx(LABEL, "pt-0.5")}>{fact.label}</dt>
            <dd className={cx("min-w-0 break-words", dense ? "text-xs text-text" : "text-[13px] text-text2")}>
              {fact.value}
            </dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}
