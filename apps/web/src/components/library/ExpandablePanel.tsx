"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";

import { cx } from "@/components/ui/classes";
import { usePresence } from "@/components/ui/use-presence";

/** How long the popup takes to fade and shrink away before it is gone. */
export const CLOSE_MS = 200;

/**
 * A card of words at a fixed height that scrolls, with an icon in its top
 * right corner that opens the same words as a popup at nearly the size of the
 * screen.
 *
 * A long note set in the page's flow pushed everything under it (the tabs of
 * the asset page) a screen or more down. Here the page keeps its shape and
 * the note scrolls inside its card; the popup is for reading it at length.
 *
 * The popup is a `<dialog>` opened with `showModal()`, as the studio's is:
 * the platform puts it in the top layer, makes the page inert and traps
 * focus. Escape, the close button (in the same corner as the icon that
 * opened it) and a click outside all close it, and focus goes back to that
 * icon. A click only counts as outside when the press started there too, so
 * a text selection dragged out of the note does not close it. The page under
 * it does not scroll while it is open.
 *
 * The content lives in one place at a time: in the card, or, while the popup
 * is open, in the popup. Two copies at once would give a note's headings the
 * same ids twice, and a heading link in the popup would jump to the card's.
 * The card keeps its height meanwhile, so the page under the popup does not
 * reflow, and the reading position goes with the words: the popup opens at
 * the place the card was scrolled to, and closing puts the card at the place
 * the popup was, each as a share of the way down.
 *
 * It opens with a fade and a slight growth (`@starting-style`), its backdrop
 * fading in with it, and closes the same way backwards: `usePresence` keeps
 * the popup mounted for `CLOSE_MS` while it fades (`leaving`), and only then
 * is it gone and the words back in the card. A second Escape or click in
 * that beat does nothing. Under reduced motion there is no beat.
 */
export function ExpandablePanel({
  title,
  action,
  label,
  children,
}: {
  /** The card's heading: a filename, say. */
  title: ReactNode;
  /** A link beside the corner icon, such as the raw file. */
  action?: ReactNode;
  /** What the panel holds, for the icon's and the popup's names: "agent-failure-mode-analysis.md". */
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The popup is drawn while `mounted`, which outlasts `open` by the fade.
  const { mounted, leaving } = usePresence(open, CLOSE_MS);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const pressedOnBackdrop = useRef(false);
  const cardBodyRef = useRef<HTMLDivElement | null>(null);
  // The card's height when the popup opened, held while its words are away.
  const [heldHeight, setHeldHeight] = useState<number | null>(null);

  const dialogBodyRef = useRef<HTMLDivElement | null>(null);
  // How far down the reader was, from 0 to 1, carried between the two views.
  const readAt = useRef(0);

  function expand() {
    const body = cardBodyRef.current;
    setHeldHeight(body?.offsetHeight ?? null);
    readAt.current = body ? shareScrolled(body) : 0;
    setOpen(true);
  }

  function collapse() {
    // Closed already, or fading out: nothing more to do.
    if (!open) return;
    const body = dialogBodyRef.current;
    if (body) readAt.current = shareScrolled(body);
    setOpen(false);
  }

  // Back in the card: scroll it to where the reader was in the popup. A
  // layout effect, so the jump happens before the frame is painted. The popup
  // is scrolled in the effect below, since it has no height until it is open.
  useLayoutEffect(() => {
    if (!mounted && cardBodyRef.current) scrollToShare(cardBodyRef.current, readAt.current);
  }, [mounted]);

  // Keyed on `mounted`, not `open`: the dialog stays open, in the top layer,
  // while it fades, and closes when it unmounts.
  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    // The icon that opened it, to give focus back to on close.
    const opener = openerRef.current;
    if (!dialog.open) dialog.showModal();
    if (dialogBodyRef.current) scrollToShare(dialogBodyRef.current, readAt.current);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      if (dialog.open) dialog.close();
      opener?.focus({ preventScroll: true });
    };
  }, [mounted]);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border-2 border-border bg-surface">
      <PanelHeader title={title} action={action}>
        <CornerButton
          ref={openerRef}
          label={`Expand ${label}`}
          onClick={expand}
          path="M12.5 3.5h4v4M7.5 16.5h-4v-4M16.5 3.5 11 9M3.5 16.5 9 11"
        />
      </PanelHeader>
      <div
        ref={cardBodyRef}
        style={mounted && heldHeight !== null ? { height: heldHeight } : undefined}
        className="max-h-[min(36rem,65dvh)] overflow-y-auto overscroll-contain px-5 pt-1 pb-5"
      >
        {mounted ? null : children}
      </div>

      {mounted && (
        <dialog
          ref={dialogRef}
          aria-label={label}
          onCancel={(event) => {
            // Escape: closed through state, so the two cannot disagree.
            event.preventDefault();
            collapse();
          }}
          onPointerDown={(event) => {
            pressedOnBackdrop.current = event.target === event.currentTarget;
          }}
          onClick={(event) => {
            // The backdrop is the dialog element itself; everything inside is
            // the panel's own content, which fills it.
            const started = pressedOnBackdrop.current;
            pressedOnBackdrop.current = false;
            if (started && event.target === event.currentTarget) collapse();
          }}
          className={cx(
            "m-auto flex-col overflow-hidden bg-surface p-0 text-text open:flex",
            "backdrop:bg-page/70 backdrop:backdrop-blur-[2px]",
            // A phone gets the whole screen; anything wider a large card.
            "h-dvh max-h-none w-full max-w-none rounded-none",
            "md:h-[calc(100dvh-64px)] md:w-[min(64rem,calc(100vw-48px))] md:rounded-[20px] md:border-2 md:border-border",
            "transition-[opacity,scale] duration-200 ease-soft starting:open:scale-[0.98] starting:open:opacity-0",
            "backdrop:transition-opacity backdrop:duration-200 backdrop:ease-out starting:open:backdrop:opacity-0",
            leaving && "pointer-events-none scale-[0.98] opacity-0 backdrop:opacity-0",
            "motion-reduce:transition-none motion-reduce:backdrop:transition-none",
          )}
        >
          <PanelHeader title={title} action={action}>
            <CornerButton label="Close" onClick={collapse} path="M5 5l10 10M15 5 5 15" />
          </PanelHeader>
          <div ref={dialogBodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-6 md:px-8">
            {children}
          </div>
        </dialog>
      )}
    </section>
  );
}

/** How far down a scroller is, from 0 (top) to 1 (bottom). */
function shareScrolled(element: HTMLElement): number {
  const range = element.scrollHeight - element.clientHeight;
  return range > 0 ? element.scrollTop / range : 0;
}

function scrollToShare(element: HTMLElement, share: number) {
  element.scrollTop = share * Math.max(0, element.scrollHeight - element.clientHeight);
}

function PanelHeader({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 py-3 pr-3 pl-5">
      <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold leading-snug text-text">{title}</h2>
      {action}
      {children}
    </div>
  );
}

function CornerButton({
  ref,
  label,
  onClick,
  path,
}: {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  onClick: () => void;
  path: string;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text2 transition-colors hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </button>
  );
}
