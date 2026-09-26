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

export type ButtonVariant = "primary" | "secondary" | "ghost" | "ok" | "warn" | "accent";
export type ButtonSize = "md" | "sm";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const BUTTON_BASE = cx(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold select-none",
  "transition-[translate,box-shadow,background-color,opacity] duration-100",
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
  FOCUS,
);

/**
 * The 3D pill (Brilliant button3d, Duolingo's lesson buttons): a face over a
 * 4px lip of a darker shade. The lip is a hard box-shadow, not a second
 * element, and `mb-1` reserves its space so a row does not overlap it.
 * Pressing moves the face down onto the lip and drops the lip, so the button
 * reads as pushed in.
 */
const LIP = "mb-1 hover:opacity-90 active:translate-y-1 active:shadow-none";

const VARIANT: Record<ButtonVariant, string> = {
  primary: cx("bg-btn-face text-btn-text shadow-[0_4px_0_var(--btn-lip)]", LIP),
  ok: cx("bg-ok text-[var(--ok-on)] shadow-[0_4px_0_var(--ok-lip)]", LIP),
  warn: cx("bg-warn text-[var(--warn-on)] shadow-[0_4px_0_var(--warn-lip)]", LIP),
  accent: cx("bg-accent text-white shadow-[0_4px_0_var(--accent-lip)]", LIP),
  secondary: "border-2 border-border bg-surface text-text hover:bg-surface2 active:bg-surface2",
  ghost: "text-accent-text underline-offset-4 hover:underline",
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

/** Kit `Input`: 44px, 2px border, radius 8, or a pill for search. */
export function inputClasses({ pill = false, className }: { pill?: boolean; className?: string } = {}): string {
  return cx(
    "h-11 w-full min-w-0 border-2 border-border bg-surface px-3.5 text-[14px] text-text",
    "placeholder:text-text3 outline-none transition-colors duration-100 focus:border-accent",
    "disabled:opacity-50",
    pill ? "rounded-full" : "rounded-lg",
    className,
  );
}

/** Kit `Card`: 2px border, radius 20, padding 20 (14 when `tight`). */
export function cardClasses({ tight = false, className }: { tight?: boolean; className?: string } = {}): string {
  return cx(
    "flex min-w-0 flex-col gap-3 rounded-[20px] border-2 border-border bg-surface",
    tight ? "p-3.5" : "p-5",
    className,
  );
}
