/**
 * Whether focus is somewhere nobody chose: on the page body, on the dialog
 * itself, or on its Close button, where `showModal()` puts it
 * (`StudioDialog`). A panel whose composer arrives after a fetch takes focus
 * only from there, so a person who has clicked into something else, or tabbed
 * to another control, keeps it.
 */
export function focusIsUnclaimed(active: Element | null): boolean {
  if (active === null || active === document.body) return true;
  if (active instanceof HTMLDialogElement) return true;
  return active.hasAttribute("data-dialog-close");
}

/**
 * Whether a panel's composer, arriving late, may still take focus: focus is
 * unclaimed, or it has not moved from where it was when the panel opened (a
 * history row or New chat stays focused after the press that opened the
 * conversation). A person who has since clicked or tabbed somewhere else, such
 * as the sidebar's search, keeps it.
 */
export function focusIsStill(active: Element | null, openedWith: Element | null): boolean {
  return focusIsUnclaimed(active) || (openedWith !== null && active === openedWith);
}
