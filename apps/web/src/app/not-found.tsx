import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-[var(--muted-strong)]">
        That course or module does not exist in the shortlist.
      </p>
      <Link
        href="/today"
        className="inline-block text-[var(--accent-strong)] hover:underline"
      >
        Back to Today
      </Link>
    </div>
  );
}
