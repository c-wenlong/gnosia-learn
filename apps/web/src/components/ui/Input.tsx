import type { InputHTMLAttributes } from "react";

import { inputClasses } from "./classes";

/** Kit `Input`: 44px, 2px border, radius 8 (`pill` for a rounded one). Focus turns the border accent. */
export function Input({
  pill = false,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { pill?: boolean; className?: string }) {
  return <input className={inputClasses({ pill, className })} {...rest} />;
}
