"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { ENTER } from "@/components/studio/motion";
import { PaneContext, usePaneLayout } from "@/components/studio/pane-context";
import { cx } from "@/components/ui/classes";
import { Dialog, DIALOG_CLOSE_MS, type DialogSize } from "@/components/ui/Dialog";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The studio's one centred surface: a `<dialog>` opened with `showModal()`
 * over the dimmed grid (D31, D37 of docs/STUDIO-CHAT-FIRST.md).
 *
 * It holds whichever of the things the URL names: an Extend press becoming
 * a conversation (`?extend=`), a job (`?job=`), a tile's panel (`?sel=`),
 * the settings (`?settings=1`) or a video's preview (`?play=`). The URL is the state, as it is for everything else on `/studio`,
 * so closing is a navigation that drops those parameters, and a reload with
 * one of them comes straight back here.
 *
 * The kit `Dialog` does the modal work: the top layer, the grid inert,
 * focus kept inside, Escape and a press on the backdrop asking to close, and
 * focus back to whatever opened the panel (the plus card, the tile) when it
 * goes. What is written here is the URL on top: every close, the panel's own
 * Close included, is a navigation.
 *
 * Widths are the kit's sizes: 720px from 1024px up, the width less 32px of
 * gutter down to 768px, and a full-screen sheet below that, where the header
 * and the composer stay pinned and the thread scrolls between them.
 *
 * Motion: the kit's rise and fade in. An in-app close (Close, Escape, a press
 * on the backdrop) fades the dialog and its backdrop out first and navigates
 * once they have gone (`CLOSE_MS`); the person's choice counts at once
 * (`isClosing`), so a panel about to hand over elsewhere does not undo it
 * meanwhile. Browser Back is not in-app: the dialog goes as the URL does.
 */

/** How long the dialog takes to fade out before Close navigates: the kit's beat. */
export const CLOSE_MS = DIALOG_CLOSE_MS;

interface DialogControls {
  /** Close the dialog, which navigates to its `closeHref`. */
  close: () => void;
  /**
   * Whether a close is on its way. A panel that is about to navigate the
   * dialog somewhere else (Extend handing over to its conversation) asks
   * first, so a person's Close is not undone by a navigation that finished
   * later.
   */
  isClosing: () => boolean;
}

const DialogContext = createContext<DialogControls | null>(null);

/** The surrounding dialog's controls. */
export function useStudioDialog(): DialogControls {
  const value = useContext(DialogContext);
  if (value === null) throw new Error("useStudioDialog is only usable inside StudioDialog");
  return value;
}

export function StudioDialog({
  closeHref,
  navigate,
  label,
  size = "default",
  tall = false,
  children,
}: {
  /** Where Close goes: the same view with the panel's parameters dropped. */
  closeHref: string;
  /**
   * How Close gets there. A router push by default, which renders the page on
   * the server again; the conversation passes `history.pushState`, since
   * nothing behind it changes when it closes (`PanelHost`).
   */
  navigate?: (href: string) => void;
  /** The dialog's accessible name. */
  label: string;
  /**
   * `compact` for a short panel (the settings) that would otherwise sit in a
   * mostly empty dialog, `wide` for a video's preview, whose picture is the
   * point (D85 of docs/STUDIO-CHAT-FIRST.md); the kit's `DialogSize`.
   */
  size?: Exclude<DialogSize, "reading">;
  /**
   * Take the whole height the panel is allowed, for a conversation whose
   * composer should sit at the foot rather than follow the last message.
   */
  tall?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement | null>(null);
  const closing = useRef(false);
  /** The fade before Close navigates, while it runs. */
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The dialog left the top layer before its navigation landed (`go`). */
  const shutEarly = useRef(false);
  /** Fading out: the kit dialog's `closing`. */
  const [leaving, setLeaving] = useState(false);

  // Where Close goes, as the last render had it: the fade outlives the render
  // that pressed it, and the navigation should use the URL as it is then.
  const target = useRef({ closeHref, navigate, router });
  useEffect(() => {
    target.current = { closeHref, navigate, router };
  });

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const go = () => {
      leaveTimer.current = null;
      const { closeHref: href, navigate: move, router: push } = target.current;
      if (move !== undefined) {
        move(href);
        return;
      }
      push.push(href, { scroll: false });
      // A router push renders the page on the server first, which can take a
      // second; the dialog has already faded, so it leaves the top layer now
      // rather than holding the page inert behind a backdrop nobody can see.
      if (ref.current?.open) {
        ref.current.close();
        shutEarly.current = true;
      }
    };
    if (prefersReducedMotion()) {
      go();
      return;
    }
    setLeaving(true);
    leaveTimer.current = setTimeout(go, CLOSE_MS);
  }, []);
  const isClosing = useCallback(() => closing.current, []);

  // The dialog stays mounted across a change of what it holds (a conversation
  // and the Extend press before it share one). If the URL moved and the
  // dialog is still here, whatever close was pending lost to that navigation,
  // and Close has to work again, on a dialog that is visible again. A close
  // still fading out has not navigated yet, so it is not the one that lost:
  // it goes ahead.
  const search = useSearchParams().toString();
  useEffect(() => {
    if (leaveTimer.current !== null) return;
    closing.current = false;
    // The URL is outside React: a close that lost to it shows the dialog again.
    setLeaving(false);
    const dialog = ref.current;
    if (shutEarly.current && dialog !== null && !dialog.open) dialog.showModal();
    shutEarly.current = false;
  }, [search]);

  // Gone before its fade ended (Back, or another panel's link): the close it
  // was fading out for is not wanted any more. The kit dialog closes itself
  // and gives focus back as it unmounts.
  useEffect(
    () => () => {
      if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    },
    [],
  );

  return (
    <DialogContext.Provider value={{ close, isClosing }}>
      <Dialog
        ref={ref}
        label={label}
        onClose={close}
        closing={leaving}
        size={size}
        tall={tall}
        // A reload with a panel open had no opener, and an opener the page
        // has since hidden is no place to land, so New chat takes it: it is
        // where the person would start again.
        returnFocus={() => document.querySelector<HTMLElement>("[data-studio-new]")}
      >
        {children}
      </Dialog>
    </DialogContext.Provider>
  );
}

/**
 * A conversation full screen, beside the sidebar: the dialog's controls
 * without the dialog (docs/STUDIO-CHAT-FIRST.md, "Home and the full-screen
 * conversation").
 *
 * The panels inside ask `useStudioDialog` for Close as they always have, and
 * here it goes home, to the composer and the grid. Nothing is modal: the
 * sidebar stays usable, so another conversation or New chat is one press
 * away, and Escape does nothing. The header has no Close of its own for the
 * same reason; on a phone it carries the sidebar's toggle instead
 * (`leading`).
 */
export function StudioPane({
  closeHref,
  navigate,
  label,
  leading = null,
  children,
}: {
  /** Where the panel's own Close goes: home, with the filters kept. */
  closeHref: string;
  navigate: (href: string) => void;
  /** The region's accessible name. */
  label: string;
  /** Drawn before the header's title. */
  leading?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const closing = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    navigate(closeHref);
  }, [closeHref, navigate]);
  const isClosing = useCallback(() => closing.current, []);

  const search = useSearchParams().toString();
  useEffect(() => {
    closing.current = false;
  }, [search]);

  useEffect(() => {
    // As the dialog does on open: a panel that wants its composer focused
    // marks it, unless the person already has focus somewhere in the pane.
    const pane = ref.current;
    if (pane === null || pane.contains(document.activeElement)) return;
    pane.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  return (
    <DialogContext.Provider value={{ close, isClosing }}>
      <PaneContext.Provider value={{ inline: true, leading }}>
        {/* Rises in from the home view it replaces (`PanelHost`). Filling
            backwards, so no transform stays behind to trap the composer's
            @ menu in a stacking context once it has arrived. */}
        <section ref={ref} aria-label={label} className={cx("flex min-h-0 min-w-0 flex-1 flex-col bg-page text-text", ENTER)}>
          {children}
        </section>
      </PaneContext.Provider>
    </DialogContext.Provider>
  );
}

/**
 * The panel's 48px header: the title, a label-role meta (the draft's running
 * cost), and Close. Pinned: the body under it scrolls. Full screen it has no
 * Close and no rule under it, and starts with the pane's `leading`.
 */
export function DialogHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  const { close } = useStudioDialog();
  const { inline, leading } = usePaneLayout();
  if (inline) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-2 px-3 md:px-5">
        {leading}
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">{title}</h2>
        {meta !== undefined && meta !== null && <span className="shrink-0 text-[12px] tabular-nums text-text3">{meta}</span>}
        {children}
      </div>
    );
  }
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-hair pl-5 pr-2 pt-[env(safe-area-inset-top)] md:pt-0">
      <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">{title}</h2>
      {meta !== undefined && meta !== null && <span className="shrink-0 text-[12px] tabular-nums text-text3">{meta}</span>}
      {children}
      <IconButton label="Close" onClick={close} data-dialog-close="">
        <Glyph name="close" size={16} />
      </IconButton>
    </div>
  );
}
