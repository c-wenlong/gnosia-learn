/**
 * Where the focus was when something took it (a drawer, a dialog), so it can
 * go back there when that closes.
 *
 * `restore` focuses the element again only while it is still on screen:
 * still in the document and laid out (an element in a folded rail, under a
 * closed menu or on a page navigated away has no boxes), since focus on
 * something unseen leaves a keyboard user nowhere. Otherwise it focuses what
 * `fallback` returns, if anything. The body, which has the focus when nothing
 * does, is not remembered. Either way the page does not scroll to it.
 */
export interface RememberedFocus {
  /** The element that had the focus, or null when nothing did. */
  readonly element: HTMLElement | null;
  restore(fallback?: () => HTMLElement | null): void;
}

export function rememberFocus(): RememberedFocus {
  const active = document.activeElement;
  const element = active instanceof HTMLElement && active !== document.body ? active : null;
  return {
    element,
    restore(fallback) {
      const back = element !== null && onScreen(element) ? element : (fallback?.() ?? null);
      back?.focus({ preventScroll: true });
    },
  };
}

/** In the document and laid out: what a person could see and press. */
export function onScreen(element: Element): boolean {
  return element.isConnected && element.getClientRects().length > 0;
}
