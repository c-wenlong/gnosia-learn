"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { probeAssetProblem, type AssetProblemCode } from "@/lib/asset-problems";

/**
 * A media element's failure, and the reason for it, once asked for.
 *
 * `null` while nothing has failed. `{ code: null }` from the moment the
 * element fires `onError` until the status route answers, so the panel can go
 * up at once and fill in its reason a beat later rather than leaving a broken
 * box on screen while the question is in flight.
 */
export type AssetFailure = { code: AssetProblemCode | null } | null;

/**
 * The one piece of client state every asset surface shares.
 *
 * **Asks only after a failure.** Nothing here runs on a successful load, so a
 * page of thirty cards whose posters all arrive costs no extra request at all.
 * The server component has already decided everything it could before render;
 * this covers what nobody could know until the browser tried.
 *
 * **Tied to one `src`.** A soft navigation between two assets reuses the
 * mounted component, and a failure belongs to the file that failed, so a new
 * `src` clears it during render (the same reset `DiagramView` and
 * `VideoPlayer` already make for their own state) and aborts a probe still in
 * flight for the old one. A late answer for a file nobody is looking at any
 * more is dropped rather than painted onto the next one.
 *
 * **Asks once.** A `<video>` can fire `error` more than once for one failure;
 * the first starts the probe and the rest are ignored until Try again.
 *
 * `attempt` is for the element's `key`: Try again clears the failure and
 * remounts the element, which is a fresh request by the browser's own rules,
 * with no cache-busting query string to invent.
 */
export function useAssetFailure(src: string | null | undefined, statusHref: string | undefined) {
  const [failure, setFailure] = useState<AssetFailure>(null);
  const [attempt, setAttempt] = useState(0);
  const probe = useRef<AbortController | null>(null);

  const [seen, setSeen] = useState(src);
  if (seen !== src) {
    setSeen(src);
    setFailure(null);
  }

  // Aborts the previous file's probe when `src` moves on, and on unmount.
  useEffect(
    () => () => {
      probe.current?.abort();
      probe.current = null;
    },
    [src],
  );

  // Read through a ref so `fail` and `observe` keep one identity across
  // renders: `observe` is a ref callback, and a new one each render would be
  // detached and re-attached every time.
  const statusRef = useRef(statusHref);
  useEffect(() => {
    statusRef.current = statusHref;
  }, [statusHref]);

  const fail = useCallback(() => {
    if (probe.current !== null) return;
    const controller = new AbortController();
    probe.current = controller;
    setFailure({ code: null });
    probeAssetProblem(statusRef.current, fetch, controller.signal).then(
      (code) => {
        if (!controller.signal.aborted) setFailure({ code });
      },
      () => {
        // Aborted: the file changed or the component went away.
      },
    );
  }, []);

  function retry() {
    probe.current?.abort();
    probe.current = null;
    setFailure(null);
    setAttempt((n) => n + 1);
  }

  // Measured, not assumed: on a server-rendered page the browser starts
  // fetching an `<img>` from the HTML, before React has hydrated and attached
  // `onError`. A small file that is refused fails in that window, the event
  // has already fired, and the reader is left with the browser's broken-image
  // box, which is exactly what this hook exists to replace. So the element is
  // checked once when it is attached. A `<video>` that already failed carries
  // its `error`; an `<img>` that finished with no width may be broken or may be
  // a lazy one not fetched yet, and `decode()` tells the two apart by
  // rejecting only for the broken one (it waits for the lazy one to load).
  const observed = useRef<Element | null>(null);
  const observe = useCallback((element: HTMLImageElement | HTMLVideoElement | null) => {
    if (element === null || element === observed.current) return;
    observed.current = element;
    if (element instanceof HTMLVideoElement) {
      // Truthy rather than `!== null`: an environment without media support
      // leaves it undefined, and that is not a failure.
      if (element.error) fail();
      return;
    }
    if (
      element.complete &&
      element.naturalWidth === 0 &&
      element.getAttribute("src") &&
      typeof element.decode === "function"
    ) {
      element.decode().catch(() => {
        // Only if it is still the element on screen: a new `src` or a retry
        // has replaced it, and its failure is no longer anyone's.
        if (observed.current === element) fail();
      });
    }
  }, [fail]);

  return { failure, fail, retry, attempt, observe };
}
