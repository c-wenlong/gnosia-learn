/**
 * How the sidebar's labels, wordmark, conversations and account name come
 * and go as it widens and narrows: out quickly, so nothing is clipped
 * mid-word as it narrows, and in a beat after the width starts, so they
 * appear into room that is already there. Off under reduced motion.
 */
export const FADE = "transition-opacity duration-150 ease-out motion-reduce:transition-none";
export const FADE_IN = "opacity-100 delay-100 motion-reduce:delay-0";
