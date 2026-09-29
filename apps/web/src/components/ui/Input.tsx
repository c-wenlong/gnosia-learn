import type { InputHTMLAttributes, Ref } from "react";

import { inputClasses } from "./classes";

/**
 * Kit `Input`: 44px, 2px border, radius 8 (`pill` for a rounded one, `sm` for
 * 36px). Focus turns the border accent; `aria-invalid` turns it the danger
 * colour, so a field a check refused is marked where the person is looking.
 */
export function Input({
  pill = false,
  size = "md",
  className,
  ref,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size"> & {
  pill?: boolean;
  size?: "md" | "sm";
  className?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  return <input ref={ref} className={inputClasses({ pill, size, className })} {...rest} />;
}
