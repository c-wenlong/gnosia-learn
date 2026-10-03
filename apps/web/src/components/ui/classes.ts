/**
 * The class strings behind the UI primitives, kept apart from the components.
 *
 * React-free on purpose (AGENTS.md: a `"use client"` module's exports are
 * client references, functions included). A server component, a client
 * component and a test can all import these; a page that needs a link styled
 * as a button without the `Button` component can call `buttonClasses` itself.
 *
 * Every value comes from the hi-fi kit (`docs/design/kit/hifi.py`): heights,
 * paddings, radii and the 4px lip. Colours are the token utilities declared in
 * `globals.css`, never literals.
 */

/** Join the truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * The empty part of a bar or meter: the `--track` fill inside a 1px inset
 * ring of `--border`. In the dark palettes the track is black, so every fill
 * clears 3:1 on it, and black is barely apart from the dark card and page
 * (1.26:1 and 1.14:1); the ring is what shows an empty bar's extent there
 * (1.94:1 and 2.15:1 in `.dark`). The fill is drawn over the ring, so it
 * never touches the fill's contrast. In the light palettes the ring is the
 * track's own colour and cannot be seen.
 */
export const TRACK = "bg-track inset-ring inset-ring-border";

/**
 * A small label over a group, a list or a value: 12/600 in `--text2`,
 * sentence case, no letter-spacing. The owner retired the kit's 11/700
 * uppercase tracked eyebrow on 2026-09-29 (AGENTS.md, "Sentence case, and no
 * label that repeats the page"). The capitals were what made the old label
 * read as a label, so without them it takes `--text2`, which clears 4.5:1
 * where `--text3` is a hint colour. `Eyebrow` renders it; a `<label>`, `<dt>`
 * or `<th>` that cannot be an `Eyebrow` takes the class itself.
 */
export const LABEL = "text-[12px] font-semibold leading-4 text-text2";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "ok" | "warn" | "accent" | "brand";
export type ButtonSize = "md" | "sm";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * A disabled button is dimmed and shows the not-allowed cursor, and it still
 * takes pointer events: `pointer-events-none` would hide its `title` and any
 * hover at all, which is how a disabled button's reason went unseen. A
 * `<button disabled>` ignores clicks on its own; the hover and press styles
 * below are scoped to `not-disabled:` so a disabled button does not react.
 * There is no `aria-disabled` styling on purpose: an anchor marked that way
 * still navigates, so the kit never renders one (`Button` with `href` has no
 * disabled state).
 */
const DISABLED = "disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_BASE = cx(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold select-none",
  "transition-[translate,box-shadow,background-color,opacity] duration-100",
  DISABLED,
  FOCUS,
);

/**
 * The 3D pill (Brilliant button3d, Duolingo's lesson buttons): a face over a
 * 4px lip of a darker shade. The lip is a hard box-shadow, not a second
 * element, and `mb-1` reserves its space so a row does not overlap it.
 * Pressing moves the face down onto the lip and drops the lip, so the button
 * reads as pushed in.
 */
const LIP = "mb-1 not-disabled:hover:opacity-90 not-disabled:active:translate-y-1 not-disabled:active:shadow-none";

const VARIANT: Record<ButtonVariant, string> = {
  primary: cx("bg-btn-face text-btn-text shadow-[0_4px_0_var(--btn-lip)]", LIP),
  ok: cx("bg-ok text-[var(--ok-on)] shadow-[0_4px_0_var(--ok-lip)]", LIP),
  warn: cx("bg-warn text-[var(--warn-on)] shadow-[0_4px_0_var(--warn-lip)]", LIP),
  accent: cx("bg-accent text-white shadow-[0_4px_0_var(--accent-lip)]", LIP),
  // The Gnosia pill for the public pages (docs/design/BRAND.md): a teal face
  // over a navy lip with cream text in light; in dark the teal lightens, so the
  // label turns navy and the lip is the teal sunk halfway into navy.
  brand: cx(
    "bg-brand-teal text-brand-cream shadow-[0_4px_0_var(--brand-navy)]",
    "dark:text-brand-navy dark:shadow-[0_4px_0_color-mix(in_srgb,var(--brand-teal)_50%,var(--brand-navy))]",
    LIP,
  ),
  secondary: "border-2 border-border bg-surface text-text not-disabled:hover:bg-surface2 not-disabled:active:bg-surface2",
  ghost: "text-accent-text underline-offset-4 not-disabled:hover:underline",
};

/** Heights 44 and 36, labels 15 and 13 (kit `Btn`). Ghost keeps the height and drops the padding. */
const SIZE: Record<ButtonSize, { box: string; pad: string; ghostPad: string }> = {
  md: { box: "h-11 text-[15px]", pad: "px-6", ghostPad: "px-2" },
  sm: { box: "h-9 text-[13px]", pad: "px-[18px]", ghostPad: "px-1.5" },
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  const s = SIZE[size];
  const pad = variant === "ghost" ? s.ghostPad : variant === "secondary" && size === "md" ? "px-[22px]" : s.pad;
  return cx(BUTTON_BASE, s.box, pad, VARIANT[variant], block && "w-full", className);
}

export type ChipSize = "md" | "sm";

/** Kit `Chip`: 34px (28 small) pill, 1px border, accent fill when selected. */
export function chipClasses({
  active = false,
  size = "md",
  interactive = true,
  className,
}: {
  active?: boolean;
  size?: ChipSize;
  interactive?: boolean;
  className?: string;
} = {}): string {
  return cx(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-colors duration-100",
    size === "md" ? "h-[34px] px-3.5 text-[13px]" : "h-7 px-2.5 text-[12px]",
    active ? "border-accent bg-accent text-white" : "border-border bg-surface text-text",
    interactive && !active && "hover:bg-surface2",
    interactive && FOCUS,
    className,
  );
}

/**
 * Kit `Input`: 44px, 2px border, radius 8, or a pill for search. `sm` is 36px
 * with a 12px inset, for a field that sits in a row of text rather than in a
 * form: the confirm card's inline edits, where a 44px field would push every
 * row apart the moment editing starts. `chip` is a `Chip`'s face (34px, 1px
 * border, 13px), for a field in a row of filter menus: the Library's search
 * beside its Type, Course and sort menus.
 */
export function inputClasses({
  pill = false,
  size = "md",
  className,
}: { pill?: boolean; size?: "md" | "sm" | "chip"; className?: string } = {}): string {
  return cx(
    size === "md" ? "h-11 px-3.5" : size === "sm" ? "h-9 px-3" : "h-[34px] px-3.5",
    "w-full min-w-0 border-border bg-surface text-text",
    size === "chip" ? "border" : "border-2",
    size === "chip" ? FIELD_TEXT.px13 : FIELD_TEXT.px14,
    "placeholder:text-text3 outline-none transition-colors duration-100 focus:border-accent",
    "aria-invalid:border-danger",
    DISABLED,
    pill ? "rounded-full" : "rounded-lg",
    className,
  );
}

/**
 * The text size of a form field: 16px on anything touched, and the desktop
 * size only where there is a fine pointer and at least 768px. iOS Safari zooms
 * the page when it focuses a field under 16px and leaves it zoomed, and a
 * phone held in landscape is wider than 768px, so the width alone cannot say
 * "phone": the pointer does. The pixel size goes in the name, written out so
 * Tailwind finds each class. Every field takes its size from here; a bare
 * `text-sm` on an `<input>` brings the zoom back (`composer-keys.test.ts`).
 */
export const FIELD_TEXT = {
  xs: "text-base md:pointer-fine:text-xs",
  sm: "text-base md:pointer-fine:text-sm",
  px13: "text-base md:pointer-fine:text-[13px]",
  px14: "text-base md:pointer-fine:text-[14px]",
  px15: "text-base md:pointer-fine:text-[15px]",
} as const;

/** Kit `Card`: 2px border, radius 20, padding 20 (14 when `tight`). */
export function cardClasses({ tight = false, className }: { tight?: boolean; className?: string } = {}): string {
  return cx(
    "flex min-w-0 flex-col gap-3 rounded-[20px] border-2 border-border bg-surface",
    tight ? "p-3.5" : "p-5",
    className,
  );
}
