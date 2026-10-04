import { TextLink } from "@/components/ui/TextLink";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-[var(--muted-strong)]">
        That course or module does not exist in the shortlist.
      </p>
      <TextLink href="/home" className="inline-block">
        Back to Home
      </TextLink>
    </div>
  );
}
