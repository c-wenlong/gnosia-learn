import { cx } from "./classes";

/** Kit `HR`: a 1px hairline in `--hair`. Vertical when placed in a flex row. */
export function Divider({ vertical = false, className }: { vertical?: boolean; className?: string }) {
  return vertical ? (
    <span aria-hidden className={cx("w-px self-stretch bg-hair", className)} />
  ) : (
    <hr className={cx("h-px w-full border-0 bg-hair", className)} />
  );
}
