import type { ReactNode } from "react";

import { cx, PANEL_TITLE } from "./classes";

/**
 * Kit `Panel`: NotebookLM's workspace column. The surface colour at radius 16
 * with no border, sitting on the page colour with a 16px gutter between
 * panels. An optional 48px header with a hairline under it holds the panel's
 * name and its controls. `level` is the name's heading level, 2 unless the
 * panel sits under an `h2` of its own.
 */
export function Panel({
  title,
  actions,
  level = 2,
  as: Tag = "section",
  className,
  headerClassName,
  titleClassName,
  bodyClassName,
  children,
  ...rest
}: {
  title?: ReactNode;
  actions?: ReactNode;
  /** The title's heading level. */
  level?: 2 | 3 | 4;
  as?: "section" | "div" | "aside";
  className?: string;
  /**
   * Classes for the header, e.g. `ws-tabs:hidden` where a tab row above
   * already names the panel and the header would say it a second time.
   */
  headerClassName?: string;
  /**
   * Classes for the title alone, e.g. `ws-tabs:sr-only` where a tab row
   * names the panel but the header's actions still have to show.
   */
  titleClassName?: string;
  /** Classes for the body under the header, e.g. `overflow-y-auto`. */
  bodyClassName?: string;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  const header = title !== undefined || actions !== undefined;
  const Heading = `h${level}` as const;
  return (
    <Tag className={cx("flex min-h-0 min-w-0 flex-col rounded-2xl bg-surface", className)} {...rest}>
      {header && (
        <div className={cx("flex h-12 shrink-0 items-center gap-2 border-b border-hair px-4", headerClassName)}>
          {title !== undefined && (
            <Heading className={cx(PANEL_TITLE, "min-w-0 flex-1 truncate", titleClassName)}>{title}</Heading>
          )}
          {actions !== undefined && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cx("flex min-h-0 flex-1 flex-col gap-3 p-4", bodyClassName)}>{children}</div>
    </Tag>
  );
}
