import type { InputHTMLAttributes, Ref } from "react";

import { inputClasses, type InputSize } from "./classes";

/**
 * Kit `Input`: 44px, 2px border, radius 8 (`pill` for a rounded one). `size`
 * is any of `inputClasses`' sizes (`sm` 36px, `lg` 48px, `chip` 34px,
 * `compact` 32px, `inline` a 28px pill as wide as its words), so `htmlSize`
 * carries the `size` attribute: the width in characters an `inline` field
 * falls back to where `field-sizing` is not supported. Focus turns the border
 * accent; `aria-invalid` turns it the danger colour, so a field a check
 * refused is marked where the person is looking.
 */
export function Input({
  pill = false,
  size = "md",
  htmlSize,
  className,
  ref,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size"> & {
  pill?: boolean;
  size?: InputSize;
  /** The `size` attribute (a width in characters). */
  htmlSize?: number;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  return <input ref={ref} size={htmlSize} className={inputClasses({ pill, size, className })} {...rest} />;
}
