"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/Button";
import { menuRowClasses, type ButtonVariant } from "@/components/ui/classes";

/**
 * The submit button of a diagram verb's form (Export SVG, Verify, Inspect,
 * Commit, the freshness pill), disabled and saying what it is doing while the
 * action runs.
 *
 * Each verb waits up to 200 seconds for `canvas`, and Next runs a page's
 * server actions one at a time, so a button that never disabled let a second
 * press queue a second export, and every other action on the page (Commit,
 * the settings panel's save, Restart canvas) waited behind both (R2-1-04).
 * A leaf, so the inspector and the canvas page around it stay server
 * components.
 */
export function VerbSubmit({
  children,
  pending,
  variant = "secondary",
  className,
  title,
  row = false,
}: {
  children: ReactNode;
  /** What it says while the action runs: "Exporting", "Committing". */
  pending: string;
  variant?: ButtonVariant;
  className?: string;
  title?: string;
  /** A row of a menu rather than a strip button. */
  row?: boolean;
}) {
  const status = useFormStatus();
  if (row) {
    return (
      <button type="submit" disabled={status.pending} aria-busy={status.pending || undefined} className={menuRowClasses()}>
        {status.pending ? pending : children}
      </button>
    );
  }
  return (
    <Button
      type="submit"
      variant={variant}
      size="xs"
      disabled={status.pending}
      aria-busy={status.pending || undefined}
      className={className}
      title={title}
    >
      {status.pending ? pending : children}
    </Button>
  );
}
