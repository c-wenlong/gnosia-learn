/**
 * The class merger behind `cx`: tailwind-merge, told this app's theme.
 *
 * React-free, like `classes.ts`, whose `cx` is the one caller.
 *
 * Tailwind v4 orders the utilities of one property by value in the
 * stylesheet, not by where they sit in a class string, so of `rounded-xl` and
 * a caller's `rounded-none` on one element, whichever the stylesheet happens
 * to put last wins. Merging drops the earlier of two classes that set the
 * same thing under the same variants, so the one written last is the only one
 * left and wins by being alone.
 *
 * The rule the configuration keeps is that a class is dropped only when a
 * later one really sets the same property. Out of the box tailwind-merge reads
 * any word after `text-`, `bg-` or `border-` as a colour, so an unknown class
 * would be treated as a colour and could be dropped; here a colour is one of
 * the tokens `globals.css` declares or one of Tailwind's own, and anything
 * else is left alone. Getting a colour wrong that way costs a merge (the two
 * classes stay, as they did before), never a class.
 */
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Every `--color-*` in `globals.css`'s `@theme inline` block, the utilities'
 * names (`bg-surface2`, `text-accent-text`, `border-hair`).
 * `class-merge.test.ts` fails when the two lists differ, so a new token is
 * added here when it is added there.
 */
export const THEME_COLOURS = [
  "page",
  "surface",
  "surface2",
  "surface-raised",
  "tint",
  "border",
  "hair",
  "track",
  "text",
  "text2",
  "text3",
  "accent",
  "accent-text",
  "ok",
  "ok-lip",
  "ok-text",
  "ok-tint",
  "warn",
  "warn-lip",
  "warn-text",
  "warn-tint",
  "danger",
  "streak",
  "streak-text",
  "btn-face",
  "btn-lip",
  "btn-text",
  "m-hi",
  "m-mid",
  "m-lo",
  "lip-shade",
  "violet",
  "on-tone",
  "diagram-matte",
  "brand-teal",
  "brand-navy",
  "brand-cream",
  "brand-gold",
  "brand-gold-soft",
  "brand-ink",
  "brand-mist",
] as const;

/** The `--font-*` families in `globals.css`, and Tailwind's own three. */
export const THEME_FONTS = ["sans", "serif", "mono", "display", "book"] as const;

/** The `--animate-*` and `--ease-*` names `globals.css` adds to Tailwind's. */
const THEME_ANIMATIONS = ["spin", "ping", "pulse", "bounce", "enter", "pop-in", "fade-in", "pop-out", "fade-in-late"];
const THEME_EASES = ["in", "out", "in-out", "soft"];

const KEYWORD_COLOURS = new Set(["inherit", "current", "transparent", "black", "white"]);
const PALETTE =
  /^(slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)$/;
const APP_COLOURS = new Set<string>(THEME_COLOURS);

/** A colour name after `bg-`, `text-`, `border-` and the rest, its `/90` opacity already cut off. */
export function isThemeColour(value: string): boolean {
  return APP_COLOURS.has(value) || KEYWORD_COLOURS.has(value) || PALETTE.test(value);
}

export const mergeClasses = extendTailwindMerge({
  // The kit and its call sites make a few hundred distinct class lists; a
  // cache that holds them all means a render past the first only looks up.
  cacheSize: 2000,
  override: {
    theme: {
      color: [isThemeColour],
      font: [...THEME_FONTS],
      animate: THEME_ANIMATIONS,
      ease: THEME_EASES,
    },
    conflictingClassGroups: {
      // tailwind-merge drops a `leading-*` before a later text size, as in
      // Tailwind v3, where `text-sm` set its own line height. In v4 a size's
      // line height is `var(--tw-leading, …)`, which a `leading-*` on the same
      // element sets, so the leading wins whatever the order (FIELD_TEXT after
      // a textarea's `leading-5`, `text-[13px]` after a role's `leading-4`).
      // A size with its own leading (`text-sm/6`) still replaces one, through
      // `conflictingClassGroupModifiers`.
      "font-size": [],
    },
  },
});
