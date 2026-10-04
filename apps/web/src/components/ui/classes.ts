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

/**
 * The kit's focus ring: a 2px accent outline 2px out, shown to a keyboard
 * only. Every control takes it from here rather than writing its own copy, so
 * a change to the ring is one edit.
 */
export const FOCUS =
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
  "transition-[translate,box-shadow,background-color,opacity] duration-100 motion-reduce:transition-none",
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

/**
 * A chip's colours. `accent`, the default, fills a selected chip with the
 * accent. `tint` is quieter, for a toggle that sits among other controls (the
 * studio home's Diagram and Video in the composer's row): a selected one is
 * the accent tint with accent text, an idle one secondary text. `overlay` is
 * a chip laid over a picture (a course cover, a diagram), a translucent face
 * that blurs what is under it so the label stays legible on any image.
 */
export type ChipTone = "accent" | "tint" | "overlay";

/** Each tone's selected look, and its idle face and ink apart, so `dashed` can swap the ink alone. */
const CHIP_TONE: Record<ChipTone, { active: string; face: string; ink: string }> = {
  accent: { active: "border-accent bg-accent text-white", face: "border-border bg-surface", ink: "text-text" },
  tint: { active: "border-accent bg-tint text-accent-text", face: "border-border bg-surface", ink: "text-text2" },
  overlay: {
    active: "border-accent bg-accent text-white",
    face: "border-border bg-surface/90 backdrop-blur-sm",
    ink: "text-text",
  },
};

/**
 * Kit `Chip`: 34px (28 small) pill, 1px border, accent fill when selected.
 * `dashed` is the "add one" chip at the end of a list (the confirm card's Add
 * and Add an arrow): a dashed border and secondary text until it is pressed.
 * A disabled chip dims like a disabled button, and its hover is scoped to an
 * enabled one so it does not react.
 */
export function chipClasses({
  active = false,
  size = "md",
  interactive = true,
  dashed = false,
  tone = "accent",
  className,
}: {
  active?: boolean;
  size?: ChipSize;
  interactive?: boolean;
  dashed?: boolean;
  tone?: ChipTone;
  className?: string;
} = {}): string {
  const colours = CHIP_TONE[tone];
  const ink = dashed ? "text-text2" : colours.ink;
  return cx(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-[color,background-color,border-color,opacity] duration-100 motion-reduce:transition-none",
    size === "md" ? "h-[34px] px-3.5 text-[13px]" : "h-7 px-2.5 text-[12px]",
    active ? colours.active : cx(colours.face, ink, dashed && "border-dashed"),
    // Secondary ink darkens under the pointer with the face.
    interactive && !active && cx("not-disabled:hover:bg-surface2", ink === "text-text2" && "not-disabled:hover:text-text"),
    interactive && FOCUS,
    interactive && DISABLED,
    className,
  );
}

export type IconButtonSize = "xs" | "sm" | "md" | "lg" | "xl";
export type IconButtonShape = "round" | "square";
export type IconButtonTone = "neutral" | "muted" | "solid" | "onDark";

/** Sides 24, 28, 32, 36 and 40, and how far a 44px touch target reaches past each. */
const ICON_SIZE: Record<IconButtonSize, { box: string; touch: string }> = {
  xs: { box: "size-6", touch: "pointer-coarse:after:-inset-2.5" },
  sm: { box: "size-7", touch: "pointer-coarse:after:-inset-2" },
  md: { box: "size-8", touch: "pointer-coarse:after:-inset-1.5" },
  lg: { box: "size-9", touch: "pointer-coarse:after:-inset-1" },
  xl: { box: "size-10", touch: "pointer-coarse:after:-inset-0.5" },
};

const ICON_TONE: Record<IconButtonTone, string> = {
  // A toolbar's or a header's icon: secondary ink, the surface's hover face.
  neutral: cx(
    "text-text2 not-disabled:hover:bg-surface2 not-disabled:hover:text-text",
    "aria-pressed:bg-surface2 aria-pressed:text-text",
    DISABLED,
    "focus-visible:outline-accent",
  ),
  // A quieter one beside something else's content: a chip's remove.
  muted: cx(
    "text-text3 not-disabled:hover:bg-surface2 not-disabled:hover:text-text",
    "aria-pressed:bg-surface2 aria-pressed:text-text",
    DISABLED,
    "focus-visible:outline-accent",
  ),
  // The primary button's face: the box composer's Send. Disabled, it turns to
  // the surface's grey rather than dimming, as Atlas's empty-box disc does.
  solid: cx(
    "bg-btn-face text-btn-text not-disabled:hover:opacity-90",
    "disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-text3",
    "focus-visible:outline-accent",
  ),
  // Over a picture that is dark whatever the theme (the video player's
  // controls on their black scrim), so white, and a white ring.
  onDark: cx(
    "text-white/90 not-disabled:hover:bg-white/15 not-disabled:hover:text-white",
    DISABLED,
    "focus-visible:outline-white",
  ),
};

/**
 * Kit icon button: a square or round box holding one glyph, named by its
 * `aria-label` (`IconButton` sets it and the `title` from one `label`).
 * `inset` draws the focus ring on the edge rather than 2px out, for a button
 * against the edge of its container; `touch` reaches a 44px target under a
 * finger while the face keeps its size.
 */
export function iconButtonClasses({
  size = "lg",
  shape = "round",
  tone = "neutral",
  inset = false,
  touch = false,
  className,
}: {
  size?: IconButtonSize;
  shape?: IconButtonShape;
  tone?: IconButtonTone;
  inset?: boolean;
  touch?: boolean;
  className?: string;
} = {}): string {
  const s = ICON_SIZE[size];
  return cx(
    "inline-flex shrink-0 items-center justify-center select-none",
    "transition-[color,background-color,opacity] duration-100 motion-reduce:transition-none",
    s.box,
    shape === "round" ? "rounded-full" : "rounded-lg",
    ICON_TONE[tone],
    "focus-visible:outline-2",
    inset ? "focus-visible:outline-offset-0" : "focus-visible:outline-offset-2",
    touch && cx("relative pointer-coarse:after:absolute pointer-coarse:after:content-['']", s.touch),
    className,
  );
}

export type LinkTone = "accent" | "muted" | "danger" | "inherit";
export type LinkSize = "inherit" | "xs" | "sm" | "md";
export type LinkWeight = "normal" | "medium" | "semibold";

const LINK_TONE: Record<LinkTone, string> = {
  accent: "text-accent-text not-disabled:hover:underline",
  // Secondary ink that darkens under the pointer: "Keep it", "Exit".
  muted: "text-text2 not-disabled:hover:text-text not-disabled:hover:underline",
  danger: "text-danger not-disabled:hover:underline",
  // The surrounding text's colour, so only the underline marks it as a link
  // (the store banner's Dismiss): it is always drawn.
  inherit: "underline",
};

const LINK_SIZE: Record<LinkSize, string | undefined> = {
  inherit: undefined,
  xs: "text-[12px]",
  sm: "text-[13px]",
  md: "text-[14px]",
};

const LINK_WEIGHT: Record<LinkWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
};

/**
 * Kit text link: words that go somewhere or do something, inside a line or
 * beside a heading ("See all", "Back to the module", "Show older
 * conversations"). Underlined under the pointer, always the kit's focus ring.
 * The same classes serve a `next/link`, an `<a>` and a `<button>`, so a
 * button that reads as a link looks like one. A disabled one dims; one that
 * is `pending` (disabled while what it started runs) dims less and shows the
 * progress cursor rather than the not-allowed one.
 */
export function linkClasses({
  tone = "accent",
  size = "inherit",
  weight = "medium",
  pending = false,
  className,
}: {
  tone?: LinkTone;
  size?: LinkSize;
  weight?: LinkWeight;
  pending?: boolean;
  className?: string;
} = {}): string {
  return cx(
    "rounded-sm underline-offset-4 transition-colors duration-100 motion-reduce:transition-none",
    LINK_TONE[tone],
    LINK_SIZE[size],
    LINK_WEIGHT[weight],
    pending ? "disabled:cursor-progress disabled:opacity-70" : DISABLED,
    FOCUS,
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

export type InputSize = "md" | "sm" | "lg" | "chip" | "compact" | "inline";

/** Each size's height, inset, border and text; the face around them is shared. */
const INPUT_SIZE: Record<InputSize, string> = {
  md: cx("h-11 px-3.5 border-2", FIELD_TEXT.px14),
  sm: cx("h-9 px-3 border-2", FIELD_TEXT.px14),
  lg: cx("h-12 px-4 border-2", FIELD_TEXT.px15),
  chip: cx("h-[34px] px-3.5 border", FIELD_TEXT.px13),
  compact: cx("h-8 px-2.5 border", FIELD_TEXT.xs),
  inline: cx("h-7 px-2.5 border", FIELD_TEXT.px13),
};

/**
 * What every field shares whatever its size: the surface, the border going
 * accent on focus and the danger colour once a check refused it, the muted
 * placeholder, the disabled dimming.
 */
const FIELD_FACE = cx(
  "border-border bg-surface text-text",
  "placeholder:text-text3 outline-none transition-colors duration-100 focus:border-accent",
  "aria-invalid:border-danger",
  DISABLED,
);

/**
 * Kit `Input`: 44px, 2px border, radius 8, or a pill for search. The other
 * sizes are for a field that sits somewhere a 44px one would not:
 *
 * - `sm`, 36px with a 12px inset: in a row of text rather than a form (the
 *   confirm card's title), where a 44px field would push every row apart the
 *   moment editing starts.
 * - `lg`, 48px at 15px: the one field a page is about (Home's Ask box).
 * - `chip`, a `Chip`'s face (34px, 1px border, 13px): in a row of filter
 *   menus, the Library's search beside its Type, Course and sort menus.
 * - `compact`, 32px with a 1px border at 12px: the studio's strips, whose
 *   segments and buttons are 32px and 12px.
 * - `inline`, a small `Chip`'s 28px pill: a value inside a line of words (the
 *   confirm card's element labels and arrow ends). It is as wide as what it
 *   holds (`field-sizing: content`, with the `size` attribute as the fallback
 *   for a browser without it), never the full width, and always a pill.
 */
export function inputClasses({
  pill = false,
  size = "md",
  className,
}: { pill?: boolean; size?: InputSize; className?: string } = {}): string {
  return cx(
    INPUT_SIZE[size],
    size === "inline"
      ? "min-w-[5ch] max-w-full rounded-full [field-sizing:content]"
      : cx("w-full min-w-0", pill ? "rounded-full" : "rounded-lg"),
    FIELD_FACE,
    className,
  );
}

/**
 * Kit `Textarea`: the `Input` face (2px border, radius 8, 14px) with room for
 * three lines at least, padded as a box rather than centred on one line, and
 * resizable only in height so a long note cannot push the page sideways.
 */
export function textareaClasses({ className }: { className?: string } = {}): string {
  return cx("block min-h-20 w-full min-w-0 resize-y rounded-lg border-2 px-3.5 py-2.5 leading-5", FIELD_TEXT.px14, FIELD_FACE, className);
}

/** Kit `Card`: 2px border, radius 20, padding 20 (14 when `tight`). */
export function cardClasses({ tight = false, className }: { tight?: boolean; className?: string } = {}): string {
  return cx(
    "flex min-w-0 flex-col gap-3 rounded-[20px] border-2 border-border bg-surface",
    tight ? "p-3.5" : "p-5",
    className,
  );
}

export type CalloutTone = "warn" | "neutral" | "danger";

/**
 * Kit `Callout`: an inline tinted box in the flow of a page or a thread, one
 * shape for every tone: radius 12, padding 12 by 16, 13px words. `warn` is the
 * `--warn-tint` box (a failure with what to do, a caveat, a confirm), `neutral`
 * the `--surface2` one (a status that is not a problem), `danger` a red tint
 * for something lost. `bordered` adds a 2px ring in the tone, for a box that
 * sits on a card of the same pale ground (a confirm, a settings card's status).
 *
 * The words stay `--text` on every tint, never the tone's own text colour: the
 * amber on its tint clears 4.5:1 but is the lightest text on the page, fine for
 * a verdict and harder going for a sentence (the store banner's reasoning).
 */
export function calloutClasses({
  tone = "warn",
  bordered = false,
  className,
}: { tone?: CalloutTone; bordered?: boolean; className?: string } = {}): string {
  return cx(
    "flex min-w-0 flex-col gap-2 rounded-xl px-4 py-3 text-[13px] leading-5 text-text",
    CALLOUT_TONE[tone],
    bordered && cx("border-2", CALLOUT_BORDER[tone]),
    className,
  );
}

const CALLOUT_TONE: Record<CalloutTone, string> = {
  warn: "bg-warn-tint",
  neutral: "bg-surface2",
  danger: "bg-danger/8",
};

const CALLOUT_BORDER: Record<CalloutTone, string> = {
  warn: "border-warn",
  neutral: "border-border",
  danger: "border-danger/45",
};

export type BannerTone = "warn" | "danger" | "ok";

/**
 * Kit `Banner`: a full-width strip across the top of a region, under a 2px
 * rule in its tone, with a dot in the tone before the words. `--text` words
 * for the same reason as the callout's.
 */
export function bannerClasses({ tone = "warn", className }: { tone?: BannerTone; className?: string } = {}): string {
  return cx("flex items-start gap-3 border-b-2 px-4 py-2 text-[13px] leading-5 text-text", BANNER_TONE[tone], className);
}

const BANNER_TONE: Record<BannerTone, string> = {
  warn: "border-warn bg-warn-tint",
  danger: "border-danger/45 bg-danger/8",
  ok: "border-ok bg-ok-tint",
};

/** The banner's dot: the tone's strongest colour, which the tint cannot drown. */
export const BANNER_MARK: Record<BannerTone, string> = {
  warn: "bg-warn-lip",
  danger: "bg-danger",
  ok: "bg-ok-lip",
};
