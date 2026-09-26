"use client";

import Link from "next/link";
import type { Module } from "@/lib/types";
import { moduleProgress } from "@/lib/progress";
import { useLearner } from "@/lib/learner-context";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function ModuleProgressRow({
  courseSlug,
  module,
}: {
  courseSlug: string;
  module: Module;
}) {
  const { state } = useLearner();
  const progress = moduleProgress(module, state.completed);

  return (
    <li>
      <Link
        href={`/courses/${courseSlug}/${module.slug}`}
        className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium text-[var(--foreground)]">
            <span className="mr-2 font-mono text-xs text-[var(--muted)]">
              M{module.order}
            </span>
            {module.title}
          </h3>
          <span className="text-xs tabular-nums text-[var(--muted)]">
            {progress.completed}/{progress.total} topics
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar progress={progress} showLabel={false} size="sm" />
        </div>
      </Link>
    </li>
  );
}
