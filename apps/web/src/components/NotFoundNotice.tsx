import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextLink";

/**
 * What a missing page says, wherever it is drawn: the root `not-found.tsx`
 * on its own ground, and `(app)/not-found.tsx` inside the shell. One notice,
 * so the two cannot drift apart.
 */
export function NotFoundNotice() {
  return (
    <Notice
      level={1}
      title="Page not found"
      actions={
        <TextLink href="/home" size="md">
          Back to Home
        </TextLink>
      }
    >
      Nothing lives at this address. The link may be mistyped, or what it pointed at has moved or gone.
    </Notice>
  );
}
