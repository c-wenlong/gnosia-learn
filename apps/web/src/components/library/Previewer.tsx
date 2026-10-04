"use client";

import { Suspense, startTransition, useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { previewAsset } from "@/app/(app)/library/preview-action";
import type { PreviewAnswer } from "@/components/library/preview-content";
import { LOADING_BLOCK } from "@/components/PageLoading";
import { Button } from "@/components/ui/Button";
import { cx, iconButtonClasses } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { usePresence } from "@/components/ui/use-presence";
import { assetHref } from "@/lib/library";
import {
  arrowStep,
  assetIdOfHref,
  neighbour,
  openFromSearch,
  previewTarget,
  withOpen,
  type PreviewHeader,
} from "@/lib/library-preview";

/** How long the panel and its mask take to fade away before they are gone. */
export const CLOSE_MS = 200;

/** How many bodies the panel keeps, so stepping back with an arrow is instant. */
const KEEP = 12;

/** Marks a history entry the panel pushed, so Close knows it can go back to the list. */
const PUSHED = "libraryPreview";

/** Where the arrow keys already mean something; the panel never takes the key from these. */
const ARROW_WIDGETS =
  "input, textarea, select, video, audio, [contenteditable], [role=slider], [role=tablist], [role=tab], [role=menu], [role=menuitem], [role=listbox], [role=option], [role=textbox]";

/** A control drawn inside a row's link (phase 2's more button); a press on it is not a press on the row. */
const ROW_CONTROLS = "button, [role=button], [role=menu], [role=menuitem], input, select, textarea, label";

type Answer = PreviewAnswer | { state: "failed"; id: string };

/**
 * The Library's previewer (L6 of docs/proposals/library-by-type-and-day.md,
 * Manus's `previewer`): pressing a row or a card opens the asset in a panel
 * over the page instead of leaving it.
 *
 * **It wraps the list rather than the rows.** A plain left click on any link
 * to an asset's page inside `children` is caught here, in the capture phase
 * (before the row's `next/link` turns it into a navigation), and opens the
 * panel; a click with a modifier, or one on a control drawn inside the row
 * (phase 2's more button), goes where it was going (`previewTarget` holds
 * the rule). So the rows stay plain links
 * that work without script and with Cmd-click, and know nothing of the panel.
 *
 * **The open asset is the URL**, `/library?open=<id>`, pushed with the
 * native History API (Next keeps its router in step without a server round
 * trip), so the back button closes the panel, forward reopens it, a reload
 * reopens it over the same view and a link can carry it. Close and Escape go
 * back when the panel pushed the entry, and otherwise (the panel opened from
 * a link) replace the URL without `?open=`, so they never leave the Library.
 * The arrow keys move to the previous or next row of the list as drawn,
 * replacing the entry rather than adding one.
 *
 * **The body is the asset page's**, `AssetBody`, rendered on the server by
 * `previewAsset` when the panel opens; until it arrives the panel shows a
 * skeleton, never a blank. "Open page" goes to `/library/<id>`, which keeps
 * the tabs and stays the deep link.
 *
 * The panel is a `<dialog>` opened with `showModal()`: the platform puts it
 * in the top layer over a dimmed, blurred mask, makes the page inert and
 * traps focus. It fades and grows in and out over 200ms on the kit's curve
 * (`usePresence` keeps it mounted while it leaves), and does neither under
 * reduced motion. On close, the page is scrolled back to where it was and
 * focus returns to the row that opened it (or, after an arrow, the row now
 * shown). On a phone the panel is the whole screen.
 */
export function Previewer({
  initialOpen,
  initial,
  children,
}: {
  /** The asset `?open=` named when the page was rendered. */
  initialOpen: string | null;
  /** Its content, rendered with the page, so a reload paints the body at once. */
  initial: PreviewAnswer | null;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const scrollAt = useRef<number | null>(null);
  const pressedOnBackdrop = useRef(false);

  // `openId` is what the URL says is open; `shownId` outlives it by the fade,
  // so the panel keeps its content while it leaves.
  // In the browser the URL is read rather than the prop: back from an asset's
  // page restores the Library from the router's cache, rendered before
  // `?open=` was set, so the prop says nothing is open when the URL does.
  // On a page load the two agree, so hydration does too.
  const [openId, setOpenId] = useState<string | null>(() =>
    typeof window === "undefined" ? initialOpen : openFromSearch(window.location.search),
  );
  const [shownId, setShownId] = useState<string | null>(openId);
  const [answers, setAnswers] = useState<ReadonlyMap<string, Answer>>(
    () => new Map(initial === null ? [] : [[initial.id, initial]]),
  );
  const [attempt, setAttempt] = useState(0);
  const { mounted, leaving } = usePresence(openId !== null, CLOSE_MS);
  // Read by the dialog's cleanup, which runs after the render that unmounts it.
  const shownIdRef = useRef(shownId);
  useEffect(() => {
    shownIdRef.current = shownId;
  }, [shownId]);

  const show = useCallback((id: string | null) => {
    setOpenId(id);
    if (id !== null) setShownId(id);
  }, []);

  // The body, asked of the server once per asset and kept for a while. An
  // answer for an asset no longer open is still kept: stepping back to it is
  // then instant. A request in flight is not sent twice.
  const asking = useRef(new Set<string>());
  useEffect(() => {
    if (openId === null || answers.has(openId) || asking.current.has(openId)) return;
    const id = openId;
    asking.current.add(id);
    previewAsset(id)
      .then((answer): Answer => answer)
      .catch((): Answer => ({ state: "failed", id }))
      .then((answer) => {
        asking.current.delete(id);
        // A transition, and the body in its own Suspense boundary below: the
        // answer's client components load their code on first use, and an
        // urgent update that suspended would fall back to the nearest
        // boundary above, the page's loading frame, blanking the Library
        // under the panel and scrolling it to the top.
        startTransition(() =>
          setAnswers((previous) => {
            const next = new Map(previous);
            next.set(id, answer);
            while (next.size > KEEP) next.delete(next.keys().next().value as string);
            return next;
          }),
        );
      });
    // `attempt` asks again after a failure.
  }, [openId, answers, attempt]);

  // Set while a close waits for `history.back()` to land, so a second Escape
  // in that beat does not go back a second time, out of the Library.
  const goingBack = useRef(false);

  // The back and forward buttons: the URL is the truth.
  useEffect(() => {
    const onPop = () => {
      goingBack.current = false;
      show(openFromSearch(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [show]);

  const rowLink = useCallback((id: string): HTMLElement | null => {
    const list = listRef.current;
    if (list === null) return null;
    return list.querySelector<HTMLElement>(`a[href="${CSS.escape(assetHref(id))}"]`);
  }, []);

  const open = useCallback(
    (id: string, from: HTMLElement) => {
      opener.current = from;
      scrollAt.current = window.scrollY;
      const url = `${window.location.pathname}${withOpen(window.location.search, id)}${window.location.hash}`;
      window.history.pushState({ [PUSHED]: true }, "", url);
      show(id);
    },
    [show],
  );

  const close = useCallback(() => {
    if (openId === null || goingBack.current) return;
    const state: unknown = window.history.state;
    if (typeof state === "object" && state !== null && (state as Record<string, unknown>)[PUSHED] === true) {
      // The entry the panel pushed: going back to the list closes it (popstate).
      goingBack.current = true;
      window.history.back();
      return;
    }
    const url = `${window.location.pathname}${withOpen(window.location.search, null)}${window.location.hash}`;
    window.history.replaceState(null, "", url);
    show(null);
  }, [openId, show]);

  const step = useCallback(
    (by: -1 | 1) => {
      const list = listRef.current;
      if (list === null || openId === null) return;
      const ids: string[] = [];
      for (const a of list.querySelectorAll("a[href]")) {
        const id = assetIdOfHref(a.getAttribute("href"));
        if (id !== null && !ids.includes(id)) ids.push(id);
      }
      const next = neighbour(ids, openId, by);
      if (next === null) return;
      const state: unknown = window.history.state;
      const pushed = typeof state === "object" && state !== null && (state as Record<string, unknown>)[PUSHED] === true;
      const url = `${window.location.pathname}${withOpen(window.location.search, next)}${window.location.hash}`;
      window.history.replaceState({ [PUSHED]: pushed }, "", url);
      // Focus goes back to the row now shown, wherever it is in the list.
      opener.current = rowLink(next);
      scrollAt.current = null;
      show(next);
    },
    [openId, rowLink, show],
  );

  function onListClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest("a");
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    const control = target?.closest(ROW_CONTROLS);
    const inControl = control != null && control !== anchor && anchor.contains(control);
    const id = previewTarget(
      event,
      { href: anchor.getAttribute("href"), target: anchor.getAttribute("target"), download: anchor.hasAttribute("download") },
      inControl,
    );
    if (id === null) return;
    // Before the row's `next/link` sees it, so there is no navigation to undo.
    event.preventDefault();
    event.stopPropagation();
    open(id, anchor);
  }

  // The dialog's life: shown modal while mounted (through the fade out), the
  // page held still under it, and on the way out the page scrolled back and
  // focus given back to the row.
  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    bodyRef.current?.focus({ preventScroll: true });
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      if (dialog.open) dialog.close();
      if (scrollAt.current !== null) window.scrollTo({ top: scrollAt.current, behavior: "instant" });
      const back = opener.current?.isConnected ? opener.current : shownIdRef.current === null ? null : rowLink(shownIdRef.current);
      if (back) {
        back.focus({ preventScroll: scrollAt.current !== null });
        if (scrollAt.current === null) back.scrollIntoView({ block: "nearest" });
      }
      opener.current = null;
      scrollAt.current = null;
    };
  }, [mounted, rowLink]);

  // A fresh asset starts at the top of the panel.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [shownId]);

  function onDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    const by = arrowStep({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      inWidget: target?.closest(ARROW_WIDGETS) != null,
    });
    if (by === null) return;
    event.preventDefault();
    step(by);
  }

  const answer = shownId === null ? undefined : answers.get(shownId);
  const header = answer?.state === "ok" ? answer.header : null;

  return (
    <>
      {/* `contents`: the wrapper only listens; the list lays out as before. */}
      <div ref={listRef} className="contents" onClickCapture={onListClick}>
        {children}
      </div>

      {mounted && shownId !== null && (
        <dialog
          ref={dialogRef}
          aria-label={header?.title ?? "Preview"}
          aria-busy={answer === undefined}
          onCancel={(event) => {
            // Escape: closed through the URL, so the two cannot disagree.
            event.preventDefault();
            close();
          }}
          onKeyDown={onDialogKeyDown}
          onPointerDown={(event) => {
            pressedOnBackdrop.current = event.target === event.currentTarget;
          }}
          onClick={(event) => {
            // The mask is the dialog element itself; a press that starts and
            // ends there closes it, so a text selection dragged out does not.
            const started = pressedOnBackdrop.current;
            pressedOnBackdrop.current = false;
            if (started && event.target === event.currentTarget) close();
          }}
          className={cx(
            "m-auto flex-col overflow-hidden bg-page p-0 text-text open:flex",
            "backdrop:bg-black/30 dark:backdrop:bg-black/60 backdrop:backdrop-blur-[4px]",
            // A phone gets the whole screen; anything wider Manus's 1200 by 820.
            "h-dvh max-h-none w-full max-w-none rounded-none",
            "md:h-[min(820px,calc(100dvh-80px))] md:w-[min(1200px,calc(100vw-96px))] md:rounded-[12px] md:border md:border-hair md:shadow-[0_0_8px_rgba(0,0,0,0.02)]",
            "transition-[opacity,scale] duration-200 ease-soft starting:open:scale-[0.98] starting:open:opacity-0",
            "backdrop:transition-opacity backdrop:duration-200 backdrop:ease-out starting:open:backdrop:opacity-0",
            leaving && "pointer-events-none scale-[0.98] opacity-0 backdrop:opacity-0",
            "motion-reduce:transition-none motion-reduce:backdrop:transition-none",
          )}
        >
          <PreviewerHeader header={header} id={shownId} onClose={close} />
          <div
            ref={bodyRef}
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-10 outline-none md:px-12"
          >
            <div
              className={cx("mx-auto w-full", header?.wide ? "max-w-[1000px]" : "max-w-[712px]")}
            >
              {answer === undefined ? (
                <BodySkeleton />
              ) : (
                // Keyed, so each asset's body fades in as it arrives.
                <div key={shownId} className="animate-fade-in motion-reduce:animate-none">
                  {answer.state === "ok" ? (
                    <Suspense fallback={<BodySkeleton />}>{answer.body}</Suspense>
                  ) : (
                    <NoBody
                      answer={answer}
                      page={assetHref(shownId)}
                      retry={() => {
                        setAnswers((previous) => {
                          const next = new Map(previous);
                          next.delete(shownId);
                          return next;
                        });
                        setAttempt((n) => n + 1);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}

/**
 * Manus's `previewer-header`: 48px, the kind's glyph, the title, the date in
 * grey, and at the right the tools, 28px each: the concept it explains (when
 * it explains one), Download (when there is a stored file), Open page and
 * Close. Until the body arrives, the title and the date are grey bars and
 * only Open page and Close are there, since they need nothing from the
 * server.
 */
function PreviewerHeader({ header, id, onClose }: { header: PreviewHeader | null; id: string; onClose: () => void }) {
  const tool = iconButtonClasses({ size: "sm", shape: "square", tone: "neutral" });
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-hair py-1.5 pr-3 pl-4 md:pl-5">
      {header === null ? (
        <div className="flex min-w-0 flex-1 items-center gap-3" aria-hidden>
          <span className={cx(LOADING_BLOCK, "size-[18px] shrink-0")} />
          <span className={cx(LOADING_BLOCK, "h-4 w-56 max-w-[50%]")} />
          <span className={cx(LOADING_BLOCK, "hidden h-3 w-16 sm:block")} />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 animate-fade-in items-center gap-2.5 motion-reduce:animate-none">
          <span className="shrink-0 text-text2" aria-hidden>
            <Glyph name={header.family} size={18} />
          </span>
          <h2
            className={cx(
              "min-w-0 truncate text-[16px] leading-[22px] font-medium",
              header.plainName ? "font-mono text-[14px] text-text2" : "text-text",
            )}
          >
            <span className="sr-only">{header.kindLabel}: </span>
            {header.title}
          </h2>
          {header.date !== null && (
            <time dateTime={header.dateTime} className="hidden shrink-0 text-[12px] leading-4 text-text3 sm:inline">
              {header.date}
            </time>
          )}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {header?.concept && (
          <IconButton label={`Open ${header.concept.title}`} size="sm" shape="square" href={header.concept.href}>
            <Glyph name="concepts" size={18} />
          </IconButton>
        )}
        {header?.download && (
          // A plain anchor with `download`: there is no page to go to.
          <a
            href={header.download.href}
            download={header.download.filename ?? ""}
            aria-label="Download"
            title="Download"
            className={tool}
          >
            <Glyph name="download" size={18} />
          </a>
        )}
        <IconButton label="Open page" size="sm" shape="square" href={header?.page ?? assetHref(id)}>
          {/* Four corners pulled outward: the full page. */}
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            width={18}
            height={18}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.5 3.5h4v4M7.5 16.5h-4v-4M16.5 3.5 11 9M3.5 16.5 9 11" />
          </svg>
        </IconButton>
        <span aria-hidden className="mx-1 h-4 w-px bg-hair" />
        <IconButton label="Close" size="sm" shape="square" onClick={onClose}>
          <Glyph name="close" size={18} />
        </IconButton>
      </div>
    </div>
  );
}

/** The first paint of the body, before the server's answer: grey where the words will be. */
function BodySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex gap-2.5">
        <span className={cx(LOADING_BLOCK, "h-8 w-28 rounded-full")} />
        <span className={cx(LOADING_BLOCK, "h-8 w-24 rounded-full")} />
      </div>
      <span className={cx(LOADING_BLOCK, "h-7 w-2/3")} />
      <span className={cx(LOADING_BLOCK, "h-3.5 w-full")} />
      <span className={cx(LOADING_BLOCK, "h-3.5 w-11/12")} />
      <span className={cx(LOADING_BLOCK, "h-3.5 w-4/5")} />
      <span className={cx(LOADING_BLOCK, "mt-2 h-48 w-full")} />
    </div>
  );
}

/** The server had no body to give: no such asset, a catalog that did not answer, or a request that failed. */
function NoBody({ answer, page, retry }: { answer: Exclude<Answer, { state: "ok" }>; page: string; retry: () => void }) {
  const [title, words] =
    answer.state === "missing"
      ? ["This asset is not in the library.", "The link names an asset the catalog does not hold, or no longer holds."]
      : answer.state === "unreachable"
        ? [
            "The catalog is unreachable.",
            "This asset could not be looked up, which is not the same as it not existing. The row is where it was.",
          ]
        : ["The preview did not load.", "The request did not come back. The page may still open."];
  return (
    <div role="status" className="flex flex-col items-start gap-3 py-10">
      <p className="text-[16px] font-medium text-text">{title}</p>
      <p className="max-w-[60ch] text-[14px] text-text2">{words}</p>
      <div className="flex flex-wrap gap-2.5">
        {answer.state !== "missing" && (
          <Button size="sm" variant="secondary" onClick={retry}>
            Try again
          </Button>
        )}
        <Button size="sm" variant="secondary" href={page}>
          Open page
        </Button>
      </div>
    </div>
  );
}
