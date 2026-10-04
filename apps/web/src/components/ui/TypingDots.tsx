/**
 * Kit `TypingDots`: three small dots pulsing in turn, the "still writing"
 * mark beside a line such as "Thinking" or "Checking the brief". Each dot
 * starts 180ms after the one before, so the pulse runs along the row.
 *
 * Decoration only (`aria-hidden`): the words beside it carry the meaning, in
 * a `role="status"` line of the caller's. Under reduced motion the dots stay
 * still, shown but not pulsing, so the line still reads as in progress.
 */
export function TypingDots() {
  return (
    <span aria-hidden className="inline-flex gap-1">
      {[0, 1, 2].map((at) => (
        <span
          key={at}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-text3 motion-reduce:animate-none"
          style={{ animationDelay: `${at * 180}ms` }}
        />
      ))}
    </span>
  );
}
