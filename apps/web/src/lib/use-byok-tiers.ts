"use client";

import { useEffect, useState } from "react";

import { BYOK_SETTINGS_CHANGED, getByokSettings, type ByokProviderStatus } from "@/lib/studio-byok";

/** The active BYOK provider's Default model and its tier models (D94). */
export interface ByokTiers {
  model: string | null;
  tiers: ByokProviderStatus["models"];
}

/**
 * The BYOK tiers the active provider configured (D94), read fresh from
 * `GET /api/settings/byok` rather than taken from health, whose copy can be
 * older than a Connect that just wrote them. Read when `enabled` turns on and
 * again whenever a BYOK write lands (`BYOK_SETTINGS_CHANGED`), so tiers set in
 * the dialog or Settings can be picked at once. A change of `readKey` reads
 * again too, for a caller whose own reads can carry an older copy. A caller
 * that already re-reads on a BYOK write (by changing `readKey`) passes
 * `listen: false`, so a save is read once.
 *
 * The answer: `undefined` until a read has answered (a failed read changes
 * nothing), `null` when nothing is configured, else the active provider's
 * model and tiers. A read that says nothing is configured clears what an
 * earlier one found, so a removed provider's tiers go with it. An answer
 * that lands after the hook stopped listening, or after a newer read
 * started, is dropped.
 */
export function useByokTiers(
  enabled: boolean,
  readKey: unknown = null,
  { listen = true }: { listen?: boolean } = {},
): ByokTiers | null | undefined {
  const [read, setRead] = useState<ByokTiers | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // Only the newest read may answer: a write during the first read starts a
    // second, and the first answering last would put back what the write changed.
    let latest = 0;
    const run = async () => {
      const mine = ++latest;
      const result = await getByokSettings();
      if (!alive || mine !== latest || !result.ok) return;
      const entry = result.data.configured ? result.data.providers.find((provider) => provider.provider === result.data.active) : undefined;
      setRead(entry === undefined ? null : { model: result.data.model, tiers: entry.models });
    };
    const onWrite = () => void run();
    void run();
    if (listen) window.addEventListener(BYOK_SETTINGS_CHANGED, onWrite);
    return () => {
      alive = false;
      window.removeEventListener(BYOK_SETTINGS_CHANGED, onWrite);
    };
  }, [enabled, readKey, listen]);
  return read;
}
