import type { CSSProperties, ReactNode } from "react";

import { cx } from "./classes";

/**
 * Kit `Placeholder`: a labelled `--surface2` box where an asset, a cover or
 * an interactive widget will render. `label` lines split on "|", as in the kit.
 */
export function Placeholder({
  label,
  height = 120,
  className,
  children,
}: {
  label?: string;
  /** Any CSS length; a number is px. */
  height?: number | string;
  className?: string;
  children?: ReactNode;
}) {
  const style: CSSProperties = { height };
  return (
    <div
      className={cx("flex w-full flex-col items-center justify-center gap-1 rounded-xl bg-surface2 px-3 text-center text-[12px] text-text3", className)}
      style={style}
    >
      {label?.split("|").map((line, i) => <span key={i}>{line.trim()}</span>)}
      {children}
    </div>
  );
}
