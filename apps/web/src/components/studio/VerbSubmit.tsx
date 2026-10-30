"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";

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
 *
 * The hold is shared by every button of one verb (`verb`), not kept by the
 * form that was pressed: the More menu unmounts its forms when it closes, and
 * the freshness pill and Export SVG are two forms for one action, so a hold
 * kept by one form let the other, or the menu reopened, press again (the
 * Greptile review of #595). It ends when the action's redirect lands (the
 * address changes), and after `HOLD_MS` whatever happens, so an action that
 * threw cannot leave a verb held for good.
 */

/** Longer than the runner's 200 s verb deadline. */
const HOLD_MS = 210_000;

const held = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function hold(verb: string): void {
  held.set(verb, Date.now());
  changed();
}

function release(verb?: string): void {
  if (verb === undefined ? held.size === 0 : !held.has(verb)) return;
  if (verb === undefined) held.clear();
  else held.delete(verb);
  changed();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isHeld(verb: string): boolean {
  const since = held.get(verb);
  return since !== undefined && Date.now() - since < HOLD_MS;
}

export function VerbSubmit({
  verb,
  children,
  pending,
  variant = "secondary",
  className,
  title,
  row = false,
}: {
  /** Which action this is a button of, shared by every button that runs it: "export", "commit". */
  verb: string;
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
  // Read for its version, so every button of a verb redraws when it is held or freed.
  useSyncExternalStore(subscribe, () => version, () => 0);
  const ours = useRef(false);
  useEffect(() => {
    if (status.pending) {
      ours.current = true;
      hold(verb);
    } else if (ours.current) {
      ours.current = false;
      release(verb);
    }
  }, [status.pending, verb]);
  // The redirect that ends an action changes the address; a form that was
  // unmounted mid-action (the closed menu) never sees its own end.
  const query = useSearchParams()?.toString() ?? "";
  const seen = useRef(query);
  useEffect(() => {
    if (seen.current === query) return;
    seen.current = query;
    release();
  }, [query]);
  useEffect(() => {
    if (!isHeld(verb) || status.pending) return;
    const timer = setTimeout(() => release(verb), HOLD_MS);
    return () => clearTimeout(timer);
  });

  const busy = status.pending || isHeld(verb);
  if (row) {
    return (
      <button type="submit" disabled={busy} aria-busy={busy || undefined} className={menuRowClasses()}>
        {busy ? pending : children}
      </button>
    );
  }
  return (
    <Button type="submit" variant={variant} size="xs" disabled={busy} aria-busy={busy || undefined} className={className} title={title}>
      {busy ? pending : children}
    </Button>
  );
}
