import type { Ref, TextareaHTMLAttributes } from "react";

import { textareaClasses } from "./classes";

/**
 * Kit `Textarea`: the `Input` face for words that take more than a line (a
 * note, what a video should change). Three lines tall at least, growing only
 * when dragged, and only downwards. `aria-invalid` turns the border the danger
 * colour, as on `Input`.
 *
 * Not the chat input: that is `Composer`, which grows as it is typed into and
 * sends on Enter.
 */
export function Textarea({
  className,
  ref,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  return <textarea ref={ref} className={textareaClasses({ className })} {...rest} />;
}
