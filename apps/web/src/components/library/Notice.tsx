import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/classes";

/**
 * A state the library says once rather than per card: the catalog is
 * unreachable, empty, or holds rows whose files this deployment does not
 * serve. A `Card` with a heading, a sentence or two, and the one command or
 * setting that fixes it, printed so it can be copied.
 */
export function Notice({
  title,
  command,
  role,
  className,
  children,
}: {
  title: ReactNode;
  /** The exact thing to run or set. Rendered as code, on one line. */
  command?: string;
  role?: "status" | "alert";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role={role}>
      <Card className={cx("items-start gap-2", className)}>
        <h2 className="text-[16px] font-bold text-text">{title}</h2>
        {children !== undefined && (
          <div className="max-w-prose text-[14px] leading-relaxed text-text2">{children}</div>
        )}
        {command !== undefined && (
          <code className="max-w-full overflow-x-auto whitespace-nowrap rounded-lg bg-surface2 px-3 py-1.5 font-mono text-[12px] text-text select-all">
            {command}
          </code>
        )}
      </Card>
    </div>
  );
}
