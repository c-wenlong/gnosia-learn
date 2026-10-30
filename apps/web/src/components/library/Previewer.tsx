"use client";

import { Suspense, startTransition, useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { previewAsset } from "@/app/(app)/library/preview-action";
import { LibraryMoreContext, type MoreRows } from "@/components/library/library-more";
import type { PreviewAnswer } from "@/components/library/preview-content";
import { PreviewerHeader } from "@/components/library/PreviewerHeader";
import { SKELETON } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Dialog, DIALOG_CLOSE_MS } from "@/components/ui/Dialog";
import { cx } from "@/components/ui/classes";
import { usePresence } from "@/components/ui/use-presence";
import { assetHref } from "@/lib/library";
import {
  arrowStep,
  assetIdOfHref,
  neighbour,
  openFromSearch,
  previewTarget,
  withOpen,
} from "@/lib/library-preview";

/** Marks a history entry the panel pushed, so Close knows it can go back to the list. */
const PUSHED = "libraryPreview";

/** Where the arrow keys already mean something; the panel never takes the key from these. */
const ARROW_WIDGETS =
  "input, textarea, select, video, audio, [contenteditable], [role=slider], [role=tablist], [role=tab], [role=menu], [role=menuitem], [role=listbox], [role=option], [role=textbox]";

/** A control drawn inside a row's link (phase 2's more button); a press on it is not a press on the row. */
const ROW_CONTROLS = "button, [role=button], [role=menu], [role=menuitem], input, select, textarea, label";

/** A row's own menu, and any dialog it opens: a press there is the menu's, never the row's. */
const OWN_SURFACES = "[role=menu], dialog";

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
 * replacing the entry rather than adding one; the right arrow on the last
 * row drawn loads the Library's next page (`LibraryMoreContext`) and goes on
 * into it.
 *
 * **The body is the asset page's**, `AssetBody`, rendered on the server by
 * `previewAsset` when the panel opens; until it arrives the panel shows a
 * skeleton, never a blank. "Open page" goes to `/library/<id>`, which keeps
 * the tabs and stays the deep link.
 *
 * The panel is the kit's `Dialog` at its `preview` size, Manus's 1200 by
 * 820 at 1440 and the whole screen on a phone, with the kit's one look and
 * motion (a fade and an 8px rise with its backdrop, the same backwards while
 * `usePresence` keeps it for `DIALOG_CLOSE_MS`, nothing under reduced
 * motion). It holds the page still while open; on close the page is
 * scrolled back to where it was and focus returns to the row that opened it
 * (or, after an arrow, the row now shown).
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
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const scrollAt = useRef<number | null>(null);

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
  // Each showing of an asset is a visit, and its body is asked of the server
  // afresh: a body is rendered with the asset's state at that moment (the
  // star, the resume point), so one kept from an earlier visit would open on
  // what the reader has since changed. `visit` numbers them, and an answer
  // is shown only for the visit it was asked for.
  const [visit, setVisit] = useState(0);
  const [held, setHeld] = useState<{ visit: number; answer: Answer } | null>(() =>
    initial === null ? null : { visit: 0, answer: initial },
  );
  const { mounted, leaving } = usePresence(openId !== null, DIALOG_CLOSE_MS);
  // Read by the dialog's cleanup, which runs after the render that unmounts it.
  const shownIdRef = useRef(shownId);
  useEffect(() => {
    shownIdRef.current = shownId;
  }, [shownId]);

  const show = useCallback((id: string | null) => {
    setOpenId(id);
    if (id === null) return;
    setShownId(id);
    setVisit((n) => n + 1);
  }, []);

  // The body for this visit. An answer that lands after the reader moved on
  // belongs to a visit no longer current and is dropped.
  const asked = useRef(-1);
  useEffect(() => {
    if (openId === null || held?.visit === visit || asked.current === visit) return;
    asked.current = visit;
    const id = openId;
    const mine = visit;
    previewAsset(id)
      .then((answer): Answer => answer)
      .catch((): Answer => ({ state: "failed", id }))
      .then((answer) => {
        // A transition, and the body in its own Suspense boundary below: the
        // answer's client components load their code on first use, and an
        // urgent update that suspended would fall back to the nearest
        // boundary above, the page's loading frame, blanking the Library
        // under the panel and scrolling it to the top.
        startTransition(() =>
          setHeld((previous) => (mine < (previous?.visit ?? -1) ? previous : { visit: mine, answer })),
        );
      });
  }, [openId, visit, held]);

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

  // The Library's paged list leaves its loader here (`LibraryMoreContext`).
  const moreRows = useRef<MoreRows | null>(null);

  const step = useCallback(
    async (by: -1 | 1) => {
      const list = listRef.current;
      if (list === null || openId === null) return;
      const drawnIds = () => {
        const ids: string[] = [];
        for (const a of list.querySelectorAll("a[href]")) {
          const id = assetIdOfHref(a.getAttribute("href"));
          if (id !== null && !ids.includes(id)) ids.push(id);
        }
        return ids;
      };
      let next = neighbour(drawnIds(), openId, by);
      // Past the last row drawn: the next page, then the first row on it (L9).
      if (next === null && by === 1 && moreRows.current !== null && (await moreRows.current())) {
        next = neighbour(drawnIds(), openId, by);
      }
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
    // A row's menu and the dialogs it opens are drawn inside the row: their
    // links ("Open", "Open in course") do what they say, not open the panel.
    const control = target?.closest(ROW_CONTROLS);
    const inControl =
      target?.closest(OWN_SURFACES) != null || (control != null && control !== anchor && anchor.contains(control));
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

  // The row to give focus back to: the one that opened the panel, or after
  // an arrow the one now shown. `Dialog` focuses it as it unmounts.
  const returnTo = useCallback(
    () =>
      opener.current?.isConnected
        ? opener.current
        : shownIdRef.current === null
          ? null
          : rowLink(shownIdRef.current),
    [rowLink],
  );

  // On the way out, the page goes back to where it was when the panel
  // opened; after an arrow moved the panel, to wherever shows the row now
  // shown. `Dialog` holds the page still while it is open (`lockScroll`).
  useEffect(() => {
    if (!mounted) return;
    return () => {
      if (scrollAt.current !== null) window.scrollTo({ top: scrollAt.current, behavior: "instant" });
      else returnTo()?.scrollIntoView({ block: "nearest" });
      opener.current = null;
      scrollAt.current = null;
    };
  }, [mounted, returnTo]);

  // A fresh asset starts at the top of the panel.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [shownId]);

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
    void step(by);
  }

  // While the panel fades out, the visit's answer stays; a new visit shows
  // the skeleton until its own arrives.
  const answer = held !== null && held.visit === visit && held.answer.id === shownId ? held.answer : undefined;
  const header = answer?.state === "ok" ? answer.header : null;

  return (
    <>
      {/* `contents`: the wrapper only listens; the list lays out as before. */}
      <div ref={listRef} className="contents" onClickCapture={onListClick}>
        <LibraryMoreContext value={moreRows}>{children}</LibraryMoreContext>
      </div>

      {mounted && shownId !== null && (
        <Dialog
          label={header?.title ?? "Preview"}
          onClose={close}
          closing={leaving}
          size="preview"
          lockScroll
          opener={returnTo}
        >
          <div className="flex min-h-0 flex-1 flex-col" aria-busy={answer === undefined} onKeyDown={onPanelKeyDown}>
            <PreviewerHeader header={header} loading={answer === undefined} id={shownId} onClose={close} />
            <div
              ref={bodyRef}
              tabIndex={-1}
              // Focus lands here on open, so the keys scroll the asset.
              data-autofocus
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-10 outline-none md:px-12"
            >
              <div className={cx("mx-auto w-full", header?.wide ? "max-w-[1000px]" : "max-w-[712px]")}>
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
                        // Another visit to the same asset asks again.
                        retry={() => setVisit((n) => n + 1)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** The first paint of the body, before the server's answer: grey where the words will be. */
function BodySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex gap-2.5">
        <span className={cx(SKELETON, "h-8 w-28 rounded-full")} />
        <span className={cx(SKELETON, "h-8 w-24 rounded-full")} />
      </div>
      <span className={cx(SKELETON, "h-7 w-2/3")} />
      <span className={cx(SKELETON, "h-3.5 w-full")} />
      <span className={cx(SKELETON, "h-3.5 w-11/12")} />
      <span className={cx(SKELETON, "h-3.5 w-4/5")} />
      <span className={cx(SKELETON, "mt-2 h-48 w-full")} />
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
