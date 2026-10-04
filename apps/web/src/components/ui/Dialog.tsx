"use client";

import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";

import { rememberFocus } from "@/lib/focus";

import { cx } from "./classes";

/**
 * How long a dialog takes to fade out (the Motion table's 200ms for a
 * dialog). A caller that closes in motion keeps it shown with `closing` for
 * this long, then unmounts it or navigates; under reduced motion it does so
 * at once (`prefersReducedMotion`).
 */
export const DIALOG_CLOSE_MS = 200;

/**
 * Widths from 768px up; below that every dialog is the whole screen.
 * `compact` 560px and as tall as its content (the studio's settings),
 * `default` 720px from 1024px (a studio panel), `wide` 960px from 1024px and
 * as tall as its content (a video's preview), `reading` 64rem (a note opened
 * to read at length).
 */
export type DialogSize = "compact" | "default" | "wide" | "reading";

const WIDTH: Record<DialogSize, string> = {
  compact: "md:w-[560px]",
  default: "md:w-[calc(100vw-32px)] lg:w-[720px]",
  wide: "md:w-[calc(100vw-32px)] lg:w-[min(960px,calc(100vw-64px))]",
  reading: "md:w-[min(64rem,calc(100vw-48px))]",
};

/**
 * How tall, from 768px up. A modal `<dialog>` with `height: auto` stretches
 * between its insets up to its max height, so `compact` and `wide` say
 * `fit-content` to stay as tall as what they hold.
 */
const HEIGHT: Record<DialogSize, string> = {
  compact: "md:h-fit md:max-h-[calc(100dvh-96px)]",
  default: "md:h-auto md:max-h-[calc(100dvh-96px)]",
  wide: "md:h-fit md:max-h-[calc(100dvh-96px)]",
  reading: "md:h-auto md:max-h-[calc(100dvh-64px)]",
};

/** The whole height a size allows, whatever it holds. */
const TALL: Record<DialogSize, string> = {
  compact: "md:h-[calc(100dvh-96px)] md:max-h-[calc(100dvh-96px)]",
  default: "md:h-[calc(100dvh-96px)] md:max-h-[calc(100dvh-96px)]",
  wide: "md:h-[calc(100dvh-96px)] md:max-h-[calc(100dvh-96px)]",
  reading: "md:h-[calc(100dvh-64px)] md:max-h-[calc(100dvh-64px)]",
};

/** The kit's classes for a modal dialog. Exported for the tests; a page renders `Dialog`. */
export function dialogClasses({ size = "default", tall = false, className }: { size?: DialogSize; tall?: boolean; className?: string } = {}): string {
  return cx(
    "m-auto flex-col overflow-hidden bg-surface p-0 text-text open:flex",
    // The page under it, dimmed to the page colour and softened (D37 of
    // docs/STUDIO-CHAT-FIRST.md).
    "backdrop:bg-page/60 backdrop:backdrop-blur-[2px]",
    // A phone gets the whole screen, a sheet with no edge of its own.
    "h-dvh max-h-none w-full max-w-none rounded-none",
    // 768px up: a panel (radius 16) with a hairline edge against the dimmed page.
    "md:rounded-2xl md:border md:border-hair",
    WIDTH[size],
    tall ? TALL[size] : HEIGHT[size],
    // In: a fade and an 8px rise, the backdrop fading with it. Out, while
    // `closing`: the same backwards, over `DIALOG_CLOSE_MS`, and no presses.
    "transition-[opacity,translate] duration-200 ease-soft starting:open:translate-y-2 starting:open:opacity-0",
    "backdrop:transition-opacity backdrop:duration-200 backdrop:ease-soft starting:open:backdrop:opacity-0",
    "data-closing:pointer-events-none data-closing:translate-y-2 data-closing:opacity-0 data-closing:backdrop:opacity-0",
    "motion-reduce:transition-none motion-reduce:backdrop:transition-none",
    className,
  );
}

type DialogName =
  /** The dialog's accessible name, as its `aria-label`. */
  | { label: string; labelledBy?: undefined }
  /** The id of the element that names it, such as its heading. */
  | { labelledBy: string; label?: undefined };

export type DialogProps = DialogName & {
  /**
   * Asked to close: Escape, or a press that started and ended on the
   * backdrop. The caller decides how (a state, a navigation); a close button
   * of its own calls the same thing. Not called again while `closing`.
   */
  onClose: () => void;
  /** On its way out: the exit motion runs, and presses are ignored. */
  closing?: boolean;
  size?: DialogSize;
  /** Take the whole height the size allows, for a body that should fill it. */
  tall?: boolean;
  /** Keep the page under it from scrolling while it is open (`<html>`'s overflow). */
  lockScroll?: boolean;
  /**
   * The control that opened it, which takes focus back on close while it is
   * still in the document, whatever had focus on open: a button Safari did
   * not focus when it was clicked, say.
   */
  opener?: () => HTMLElement | null;
  /**
   * Where focus goes on close when there is no `opener` and whatever had it
   * on open is gone or hidden (`rememberFocus`), or nothing had it.
   */
  returnFocus?: () => HTMLElement | null;
  /** The `<dialog>` element, for a caller that closes or shows it early. */
  ref?: Ref<HTMLDialogElement | null>;
  className?: string;
  children: ReactNode;
};

/**
 * Kit `Dialog`: a `<dialog>` opened with `showModal()` while it is mounted,
 * and closed when it unmounts. The platform does the modal work: the top
 * layer, the page inert behind it, focus kept inside.
 *
 * What is written here is the rest, the same for every dialog in the app:
 * Escape (the `cancel` event, prevented so the caller's state and the
 * element cannot disagree) and a press on the backdrop ask `onClose`; a
 * press only counts as on the backdrop when it started there too, so a text
 * selection dragged out of the content does not close it. On open it
 * remembers where focus was and moves it to a `[data-autofocus]` inside, if
 * any (otherwise `showModal()` has put it on the first control); on close it
 * gives it to `opener` if there is one, and otherwise back where it was
 * (`rememberFocus`, falling back to `returnFocus`).
 *
 * Motion: it rises and fades in with its backdrop (`@starting-style`), and a
 * caller closing in motion sets `closing` for `DIALOG_CLOSE_MS` before it
 * unmounts it (`usePresence(open, DIALOG_CLOSE_MS)`) or navigates away
 * (`StudioDialog`). Nothing moves under reduced motion.
 *
 * Its content fills it: a click on the dialog element itself counts as a
 * click on the backdrop, so a body that left part of the box empty would
 * close on a press there. A header over a `flex-1` body is the usual shape.
 */
export function Dialog({
  label,
  labelledBy,
  onClose,
  closing = false,
  size = "default",
  tall = false,
  lockScroll = false,
  opener,
  returnFocus,
  ref,
  className,
  children,
}: DialogProps) {
  const inner = useRef<HTMLDialogElement | null>(null);
  useImperativeHandle(ref, () => inner.current as HTMLDialogElement, []);
  const pressedOnBackdrop = useRef(false);

  // The latest of each, for the handlers and the effect's cleanup, which
  // outlive the render that set them.
  const latest = useRef({ onClose, closing, opener, returnFocus });
  useEffect(() => {
    latest.current = { onClose, closing, opener, returnFocus };
  });
  // Read once, on open: the lock is taken and given back by the same effect.
  const lock = useRef(lockScroll);

  const ask = () => {
    if (!latest.current.closing) latest.current.onClose();
  };

  useEffect(() => {
    const dialog = inner.current;
    if (dialog === null) return;
    const focused = rememberFocus();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    const locked = lock.current;
    if (locked) root.style.overflow = "hidden";
    return () => {
      if (locked) root.style.overflow = overflow;
      if (dialog.open) dialog.close();
      const named = latest.current.opener?.() ?? null;
      if (named !== null && named.isConnected) named.focus({ preventScroll: true });
      else focused.restore(() => latest.current.returnFocus?.() ?? null);
    };
  }, []);

  return (
    <dialog
      ref={inner}
      aria-label={label}
      aria-labelledby={labelledBy}
      data-closing={closing ? "" : undefined}
      onCancel={(event) => {
        // Escape. The dialog would close itself, behind the caller's back.
        event.preventDefault();
        ask();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself. The
        // press has to start there too: a selection dragged out of the
        // content ends on the backdrop and reports a click on the dialog.
        const started = pressedOnBackdrop.current;
        pressedOnBackdrop.current = false;
        if (started && event.target === event.currentTarget) ask();
      }}
      className={dialogClasses({ size, tall, className })}
    >
      {children}
    </dialog>
  );
}
