"use client";

import type { Module } from "@/lib/types";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { moduleProgress } from "@/lib/progress";
import { useLearner } from "@/lib/learner-context";

export function ModuleProgressHeader({ module }: { module: Module }) {
  const { state } = useLearner();
  const progress = moduleProgress(module, state.completed);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-2 text-sm font-medium text-[var(--muted-strong)]">
        Module progress
      </p>
      <ProgressBar progress={progress} />
    </section>
  );
}
