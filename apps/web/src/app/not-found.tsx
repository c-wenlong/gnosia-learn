import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextLink";

/**
 * What any `notFound()` and any unknown address show: a course, a concept or
 * an asset that does not exist. The root boundary, so it is drawn inside the
 * root layout only, with no shell around it; it centres itself on the page's
 * ground rather than sitting in the corner.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-16">
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
    </main>
  );
}
