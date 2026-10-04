"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cardClasses } from "@/components/ui/classes";
import { Dialog, DIALOG_CLOSE_MS } from "@/components/ui/Dialog";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { usePresence } from "@/components/ui/use-presence";

/** How long the popup takes to fade away before it is gone: the kit dialog's beat. */
export const CLOSE_MS = DIALOG_CLOSE_MS;

/**
 * A card of words at a fixed height that scrolls, with an icon in its top
 * right corner that opens the same words as a popup at nearly the size of the
 * screen.
 *
 * A long note set in the page's flow pushed everything under it (the tabs of
 * the asset page) a screen or more down. Here the page keeps its shape and
 * the note scrolls inside its card; the popup is for reading it at length.
 *
 * The popup is the kit `Dialog` at its reading size, as the studio's panels
 * are: the top layer, the page inert, focus kept inside. Escape, the close
 * button (in the same corner as the icon that opened it) and a click outside
 * all close it, and focus goes back to that icon. A click only counts as
 * outside when the press started there too, so a text selection dragged out
 * of the note does not close it. The page under it does not scroll while it
 * is open (`lockScroll`).
 *
 * The content lives in one place at a time: in the card, or, while the popup
 * is open, in the popup. Two copies at once would give a note's headings the
 * same ids twice, and a heading link in the popup would jump to the card's.
 * The card keeps its height meanwhile, so the page under the popup does not
 * reflow, and the reading position goes with the words: the popup opens at
 * the place the card was scrolled to, and closing puts the card at the place
 * the popup was, each as a share of the way down.
 *
 * It opens with the kit's rise and fade, its backdrop fading in with it, and
 * closes the same way backwards: `usePresence` keeps the popup mounted for
 * `CLOSE_MS` while it fades (`leaving`, the dialog's `closing`), and only
 * then is it gone and the words back in the card. A second Escape or click
 * in that beat does nothing. Under reduced motion there is no beat.
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
  const openerRef = useRef<HTMLButtonElement | null>(null);
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

  // The popup opens at the place the card was scrolled to. After the kit
  // dialog's own effect has shown it, since it has no height until it is open.
  useEffect(() => {
    if (mounted && dialogBodyRef.current) scrollToShare(dialogBodyRef.current, readAt.current);
  }, [mounted]);

  return (
    <section className={cardClasses({ flush: true })}>
      <PanelHeader title={title} action={action}>
        <IconButton ref={openerRef} label={`Expand ${label}`} onClick={expand}>
          {/* Four corners pulled outward: open it larger. Only this panel draws it. */}
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            width={16}
            height={16}
            className="shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.5 3.5h4v4M7.5 16.5h-4v-4M16.5 3.5 11 9M3.5 16.5 9 11" />
          </svg>
        </IconButton>
      </PanelHeader>
      <div
        ref={cardBodyRef}
        style={mounted && heldHeight !== null ? { height: heldHeight } : undefined}
        className="max-h-[min(36rem,65dvh)] overflow-y-auto overscroll-contain px-5 pt-1 pb-5"
      >
        {mounted ? null : children}
      </div>

      {mounted && (
        <Dialog
          label={label}
          onClose={collapse}
          closing={leaving}
          size="reading"
          tall
          lockScroll
          // Focus goes back to the icon that opened it, wherever it was on
          // the press: Safari does not focus a button it clicks.
          opener={() => openerRef.current}
        >
          <PanelHeader title={title} action={action}>
            <IconButton label="Close" onClick={collapse}>
              <Glyph name="close" size={16} />
            </IconButton>
          </PanelHeader>
          <div ref={dialogBodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-6 md:px-8">
            {children}
          </div>
        </Dialog>
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
