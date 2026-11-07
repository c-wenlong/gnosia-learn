import type { ReactNode, Ref } from "react";

import { calloutClasses, cx, type CalloutTone } from "./classes";

/**
 * Kit `Callout`: a tinted box inside a page, a card or a thread, saying one
 * thing that is not the content itself: a request that failed and what to do,
 * a caveat, a status, a confirm. One shape for every tone (`calloutClasses`);
 * the full-width strip across a region is `Banner`, and a state that takes
 * the whole region is `Notice`.
 *
 * With a `title`, the title is the verdict (14px semibold) and the words under
 * it are the detail, in `--text2`. Without one the words are the verdict and
 * stay `--text`. `actions` go in a row under the words, so a long message
 * never squeezes its button; `actionsAt="end"` puts them at the end of the
 * words' line instead, wrapping under them when the line is too narrow.
 * `dense` is the small box for a side panel or a list row. No state and no hooks, so a server component can
 * draw it; the motion of something that mounts (`animate-enter`) is the
 * caller's `className`.
 */
export function Callout({
  tone = "warn",
  title,
  actions,
  role,
  bordered = false,
  dense = false,
  actionsAt = "below",
  id,
  className,
  children,
  ref,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  /** Buttons or links, in a wrapping row under the words. */
  actions?: ReactNode;
  /** `alert` for a failure the person just caused, `status` for a standing state, `group` for a confirm. */
  role?: "status" | "alert" | "group" | "note";
  /** A 2px ring in the tone, for a box on a ground as pale as its own. */
  bordered?: boolean;
  /** The small box: radius 6, padding 8, 12px words, a 1px ring when bordered. */
  dense?: boolean;
  /** `end` puts the actions on the words' line, after them; `below` (the default) in a row under them. */
  actionsAt?: "below" | "end";
  id?: string;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const end = actionsAt === "end";
  return (
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={calloutClasses({ tone, bordered, dense, actionsAt, className })}
    >
      {title !== undefined && (
        <p className={cx(dense ? "font-semibold" : "text-[14px] font-semibold", "text-text", end && "basis-full")}>{title}</p>
      )}
      {children !== undefined && children !== null && children !== false && (
        <div className={cx("min-w-0 break-words", title !== undefined && "text-text2", end && "flex-1")}>{children}</div>
      )}
      {actions !== undefined && <div className={cx("flex flex-wrap items-center gap-2", !end && "pt-1")}>{actions}</div>}
    </div>
  );
}
