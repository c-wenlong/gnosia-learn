"use client";

import { useEffect } from "react";

/**
 * Tell the runner somebody is still looking at this canvas.
 *
 * The one thing on the studio's side of the screen that the server cannot work
 * out for itself. Editing happens entirely between the browser and the `serve`
 * port — a different origin and a different process (D13) — so a person drawing
 * for twenty minutes is, from the runner's point of view, indistinguishable
 * from a tab nobody has looked at since lunch. Without this, the idle sweep
 * closes the canvas under them and costs them whatever was unsaved.
 *
 * A `GET /api/mirrors?file=…` touches that mirror's timer and returns its
 * health, and nothing else. It is deliberately not a `POST`: this says "still
 * here", it starts nothing, and a failed one is not worth reporting — the next
 * one is a third of the idle window away, and if the runner has really gone the
 * page says so through the server-rendered state on the next navigation.
 *
 * The interval comes from the runner's own `idleMs` rather than a number here,
 * so moving `STUDIO_MIRROR_IDLE_MS` moves both ends at once.
 */
/** What to beat at when the runner did not say. Matches its own default. */
const FALLBACK_IDLE_MS = 15 * 60_000;

export function MirrorKeepAlive({ file, idleMs }: { file: string; idleMs?: number }) {
  useEffect(() => {
    // A third of the window, floored at thirty seconds: two heartbeats can be
    // missed — a sleeping laptop, a throttled background tab — before anything
    // is closed.
    //
    // The guard on `idleMs` is not defensive decoration. `setInterval` coerces
    // its delay, and `NaN` becomes zero rather than an error, so a runner one
    // version behind — which is exactly what an older process answering a
    // freshly built page is — sent no `idleMs`, and this fired roughly 250
    // requests a second at the proxy. Measured, in the browser, on the review
    // pass that added this component.
    const window = Number.isFinite(idleMs) && (idleMs ?? 0) > 0 ? (idleMs as number) : FALLBACK_IDLE_MS;
    const every = Math.max(30_000, Math.floor(window / 3));
    const touch = (): void => {
      void fetch(`/studio/api/mirrors?file=${encodeURIComponent(file)}`, {
        cache: "no-store",
      }).catch(() => undefined);
    };
    touch();
    const timer = setInterval(touch, every);
    return () => clearInterval(timer);
  }, [file, idleMs]);

  return null;
}
