/**
 * How the sidebar's labels, wordmark, conversations and account name come
 * and go as it widens and narrows: out quickly, so nothing is clipped
 * mid-word as it narrows, and in a beat after the width starts, so they
 * appear into room that is already there. Off under reduced motion.
 *
 * `LABEL_FADE` is the transition and `LABEL_SHOWN` the visible half of the
 * toggle (the hidden half is `opacity-0`). Not a mount animation: that is
 * the studio's `FADE_IN` and `PAGE_ENTER`, which these names no longer
 * share, so an import from the wrong module cannot compile.
 */
export const LABEL_FADE = "transition-opacity duration-150 ease-out motion-reduce:transition-none";
export const LABEL_SHOWN = "opacity-100 delay-100 motion-reduce:delay-0";
