import type { ReactNode } from "react";

import { cx } from "./classes";

/**
 * Kit `StatTile`, after Duolingo's lesson-complete cards: a coloured frame, an
 * uppercase strip naming the metric, and the value in a surface box. One
 * colour per metric on the close screen: right is `ok`, mastery `accent`,
 * review cards `violet`, target `streak`.
 */
export type StatTone = "ok" | "accent" | "violet" | "streak";

const TONE: Record<StatTone, string> = {
  ok: "var(--ok-text)",
  accent: "var(--accent)",
  violet: "var(--violet)",
  streak: "var(--streak)",
};

export function StatTile({
  value,
  label,
  tone,
  className,
}: {
  value: ReactNode;
  label: string;
  tone: StatTone;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-1 flex-col rounded-2xl p-[3px]", className)} style={{ background: TONE[tone] }}>
      <p className="flex h-[26px] items-center justify-center text-[11px] font-bold uppercase tracking-[0.05em] text-btn-text">
        {label}
      </p>
      <p className="flex h-16 items-center justify-center rounded-[13px] bg-surface text-[26px] font-bold text-text tabular-nums">
        {value}
      </p>
    </div>
  );
}
