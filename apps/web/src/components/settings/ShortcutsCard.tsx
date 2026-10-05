"use client";

import { ShortcutList, useIsMac } from "@/components/shell/ShortcutList";
import { useShell } from "@/components/shell/shell-context";
import { Card } from "@/components/ui/Card";
import { NOTE } from "@/components/ui/classes";
import { shortcutsFor } from "@/lib/shortcuts";

/**
 * Settings' Shortcuts card, on the General tab, after Manus's Settings,
 * Shortcuts pane: the shortcuts table (`SHORTCUTS` in `lib/shortcuts.ts`)
 * with its keycaps, the same list the "?" sheet shows. Read only: Manus lets
 * a key be rebound, and nobody here has asked for that.
 *
 * `macGuess` is the server's reading of the request's user agent, so the
 * first paint draws ⌘ or Ctrl as the browser will.
 */
export function ShortcutsCard({ macGuess }: { macGuess: boolean }) {
  const mac = useIsMac(macGuess);
  const studio = useShell()?.studio ?? false;
  return (
    <Card title="Shortcuts">
      <p className={NOTE}>Press ? anywhere outside a field to see these over the page.</p>
      <ShortcutList shortcuts={shortcutsFor(studio)} mac={mac} />
    </Card>
  );
}
