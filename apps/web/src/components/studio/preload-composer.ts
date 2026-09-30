/**
 * Start loading the composer's chunk now, ahead of the panel that shows it.
 * Extend is pressed or hovered a moment before its panel mounts, and the panel
 * wants the field ready to type in; `dynamic` fetches the same module, so this
 * only starts the fetch earlier. A failure is the fallback's to handle when
 * the panel asks again.
 * Its own module, so a page that only needs to start the fetch (the grid's
 * Extend links) does not import the composer's stand-in and frame with it.
 */
export function preloadMentionComposer(): void {
  void import("@/components/ui/MentionComposer").catch(() => {});
}
