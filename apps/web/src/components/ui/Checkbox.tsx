import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { cx, FOCUS } from "./classes";
import { Glyph } from "./Glyph";

/**
 * Kit `Checkbox`: a 20px box in the field's face (2px `--border`, radius 6)
 * that fills with the accent and shows a white tick when checked, beside its
 * label. The whole label is the target, at least 44px tall, so a thumb does
 * not have to find a 20px square.
 *
 * The box is the real `<input type="checkbox">` with its platform drawing
 * turned off (`appearance: none`), not a picture over a hidden one: Space
 * toggles it, a screen reader hears a checkbox, and the focus ring is drawn
 * on the box itself, only for the keyboard. The tick scales in and the fill
 * fades, and neither moves under reduced motion.
 */
export function Checkbox({
  children,
  className,
  ref,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type" | "children"> & {
  /** The label, beside the box. */
  children: ReactNode;
  /** Classes for the label, e.g. its text colour. */
  className?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <label
      className={cx(
        "inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-text select-none",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        className,
      )}
    >
      <span className="relative inline-flex size-5 shrink-0">
        <input
          ref={ref}
          type="checkbox"
          className={cx(
            "peer m-0 size-5 cursor-pointer appearance-none rounded-md border-2 border-border bg-surface",
            "transition-colors duration-100 motion-reduce:transition-none",
            "not-disabled:hover:border-text3 checked:border-accent checked:bg-accent not-disabled:checked:hover:border-accent",
            FOCUS,
            "disabled:cursor-not-allowed",
          )}
          {...rest}
        />
        {/* The tick at the weight of the box's 2px border, not Glyph's hairline. */}
        <Glyph
          name="tick"
          size={14}
          stroke={2.75}
          className={cx(
            "pointer-events-none absolute inset-0 m-auto size-3.5 text-white",
            "scale-50 opacity-0 transition-[opacity,scale] duration-150 ease-soft motion-reduce:transition-none",
            "peer-checked:scale-100 peer-checked:opacity-100",
          )}
        />
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}
