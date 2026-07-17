import { getTag } from "@/data/tags";
import type { TagId } from "@/lib/types";

export function TagChip({
  id,
  size = "md",
}: {
  id: TagId;
  size?: "sm" | "md";
}) {
  const tag = getTag(id);
  const label = tag?.label ?? id;
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--chip-bg)] font-medium text-[var(--muted-strong)] ${pad}`}
      title={tag?.description}
    >
      {label}
    </span>
  );
}
