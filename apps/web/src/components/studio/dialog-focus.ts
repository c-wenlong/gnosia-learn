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
