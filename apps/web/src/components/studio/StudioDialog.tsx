"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

import { cx } from "@/components/ui/classes";

/**
 * The studio's one centred surface: a `<dialog>` opened with `showModal()`
 * over the dimmed grid (D31, D37 of docs/STUDIO-CHAT-FIRST.md).
 *
 * It holds whichever of four things the URL names: a conversation
 * (`?draft=`), an Extend press becoming one (`?extend=`), a job (`?job=`) or
 * a tile's panel (`?sel=`). The URL is the state, as it is for everything else on `/studio`,
 * so closing is a navigation that drops those parameters, and a reload with
 * one of them comes straight back here.
 *
 * The platform does the modal work: `showModal()` puts the dialog in the top
 * layer, makes the grid inert and traps focus. What is written here is the
 * rest of the doc's list: Escape, Close and a backdrop click all close, and
 * focus goes back to whatever opened the panel, the plus card or the tile.
 *
 * Widths: 720px from 1024px up, the width less 32px of gutter down to 768px,
 * and a full-screen sheet below that, where the header and the composer stay
 * pinned and the thread scrolls between them.
 */

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
  tall = false,
  compact = false,
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
   * Take the whole height the panel is allowed, for a conversation whose
   * composer should sit at the foot rather than follow the last message.
   */
  tall?: boolean;
  /**
   * As tall as its content and 560px wide from 768px up, for a short panel
   * (the settings) that would otherwise sit in a mostly empty dialog: a
   * modal `<dialog>` with `height: auto` stretches between its insets.
   */
  compact?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closing = useRef(false);
  const pressedOnBackdrop = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (navigate !== undefined) navigate(closeHref);
    else router.push(closeHref, { scroll: false });
  }, [router, closeHref, navigate]);
  const isClosing = useCallback(() => closing.current, []);

  // The dialog stays mounted across a change of what it holds (a conversation
  // and the Extend press before it share one). If the URL moved and the
  // dialog is still here, whatever close was pending lost to that navigation,
  // and Close has to work again.
  const search = useSearchParams().toString();
  useEffect(() => {
    closing.current = false;
  }, [search]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    closing.current = false;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    if (!dialog.open) dialog.showModal();
    // `showModal()` focuses the first focusable thing, which is Close in the
    // header. A panel that wants its composer focused marks it, and a panel
    // whose composer arrives after a fetch focuses it itself.
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    return () => {
      if (dialog.open) dialog.close();
      // Back to whatever opened the panel. A reload with `?draft=` had no
      // opener, so the plus card takes it: it is where the person would start
      // again.
      const back =
        opener.current !== null && opener.current.isConnected
          ? opener.current
          : document.querySelector<HTMLElement>("[data-studio-plus]");
      back?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <DialogContext.Provider value={{ close, isClosing }}>
      <dialog
        ref={ref}
        aria-label={label}
        onCancel={(event) => {
          // Escape. The dialog would close itself and leave the URL saying it
          // is open; closing through the URL keeps the two in step.
          event.preventDefault();
          close();
        }}
        onPointerDown={(event) => {
          pressedOnBackdrop.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself, since
          // everything inside it is the panel's own content. The press has to
          // start there too: a text selection dragged out of the thread ends
          // on the backdrop and reports a click on the dialog.
          const started = pressedOnBackdrop.current;
          pressedOnBackdrop.current = false;
          if (started && event.target === event.currentTarget) close();
        }}
        className={cx(
          "m-auto flex-col overflow-hidden bg-surface p-0 text-text open:flex",
          "backdrop:bg-page/60 backdrop:backdrop-blur-[2px]",
          // Phone: a sheet, the whole screen.
          "h-dvh max-h-none w-full max-w-none rounded-none",
          // 768px up: the width less 32px of gutter, then 720px from 1024px.
          "md:max-h-[calc(100dvh-96px)] md:rounded-2xl md:border md:border-hair",
          compact ? "md:h-fit md:w-[560px]" : "md:h-auto md:w-[calc(100vw-32px)] lg:w-[720px]",
          tall && "md:h-[calc(100dvh-96px)]",
          "transition-[opacity,translate] duration-150 ease-out starting:open:translate-y-2 starting:open:opacity-0",
          "motion-reduce:transition-none",
        )}
      >
        {children}
      </dialog>
    </DialogContext.Provider>
  );
}

/**
 * The panel's 48px header: the title, a label-role meta (the draft's running
 * cost), and Close. Pinned: the body under it scrolls.
 */
export function DialogHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  const { close } = useStudioDialog();
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-hair pl-5 pr-2 pt-[env(safe-area-inset-top)] md:pt-0">
      <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">{title}</h2>
      {meta !== undefined && meta !== null && <span className="shrink-0 text-[12px] tabular-nums text-text3">{meta}</span>}
      {children}
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        data-dialog-close=""
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text2 transition-colors hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}
