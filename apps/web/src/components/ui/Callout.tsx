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
 * never squeezes its button. No state and no hooks, so a server component can
 * draw it; the motion of something that mounts (`animate-enter`) is the
 * caller's `className`.
 */
export function Callout({
  tone = "warn",
  title,
  actions,
  role,
  bordered = false,
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
  id?: string;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={calloutClasses({ tone, bordered, className })}
    >
      {title !== undefined && <p className="text-[14px] font-semibold text-text">{title}</p>}
      {children !== undefined && children !== null && children !== false && (
        <div className={cx("min-w-0 break-words", title !== undefined && "text-text2")}>{children}</div>
      )}
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}
