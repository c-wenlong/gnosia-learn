import { cx } from "@/components/ui/classes";

/** The repository, for "See the source" and the footer. */
export const GITHUB_URL = "https://github.com/c-wenlong/self-learn";

/**
 * A link on the public pages: a focus ring in the brand teal. Pass the
 * rounding with the rest (`rounded-md` for text, `rounded-full` for a pill),
 * so the ring follows the link's own shape.
 */
export function siteLink(className?: string): string {
  return cx(
    "transition-colors duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-teal",
    className,
  );
}
