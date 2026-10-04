import type { TagMeta } from "@/lib/types";

/**
 * Takes the theme rather than its id: the tag list is read from
 * `content/tags.yaml` on the server, and this chip renders inside `CourseCard`,
 * which is a client component. A server page resolves the metadata with
 * `tagsFor(await getTags(), ids)` from `@/data/content` and passes it down.
 */
export function TagChip({
  tag,
  size = "md",
}: {
  tag: TagMeta;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--chip-bg)] font-medium text-[var(--muted-strong)] ${pad}`}
      title={tag.description || undefined}
    >
      {tag.label}
    </span>
  );
}
