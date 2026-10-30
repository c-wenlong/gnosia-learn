"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Glyph } from "@/components/ui/Glyph";
import { LiveStatus } from "@/components/ui/LiveStatus";
import type { ProvidersView } from "@/lib/providers/view";
import { BYOK_SETTINGS_CHANGED } from "@/lib/studio-byok";

import { AddProvider } from "./AddProvider";
import { ProviderRow } from "./ProviderRow";
import { tone, textOf, type Status } from "./status";

/**
 * The Providers card: every model provider in one list — each built-in,
 * keyed or not, then the custom ones — each row holding its key's state
 * with Edit (replace the key), Delete (the key and the provider's models,
 * after a confirm) and Test the key. An unkeyed built-in stays listed: its
 * row is where the key goes, so a provider is never hidden behind the add
 * dialog. Add custom provider takes a name, a base URL and a key for any
 * OpenAI-compatible endpoint (T14).
 *
 * Which model a provider serves is picked under Model selection below
 * (`ModelSelection.tsx`); this card answers whose key the call spends.
 *
 * Keys are write-only, as on the old card (docs/BYOK.md): typed into a
 * password field, sent once, dropped from state whatever the answer. The
 * card is handed last four characters and dates, never a key.
 *
 * Nothing swaps in a frame: every form and confirm glides open and shut
 * (`Collapse`), and the status lines glide (`LiveStatus`).
 */

export function Providers({
  view,
  studio,
}: {
  view: ProvidersView;
  /** `studioEnabled()` on the server: whether the keys reach Studio chats too. */
  studio: boolean;
}) {
  const router = useRouter();
  const base = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [adding, setAdding] = useState(false);
  // While a new key is on its way the form must stay open: the toggle would
  // shut it under a save that is still going to land.
  const [addSaving, setAddSaving] = useState(false);
  // A deleted provider's row leaves with the refresh, and the focus it held
  // with it: Add provider, which offers that provider again, takes it once
  // the new rows have arrived (unless the person has put it somewhere).
  const focusAdd = useRef(false);
  useEffect(() => {
    if (!focusAdd.current) return;
    focusAdd.current = false;
    const at = document.activeElement;
    if (at === null || at === document.body) document.getElementById(`${base}-add`)?.focus();
  }, [view, base]);
  const addButton = (
    <Button
      id={`${base}-add`}
      variant="secondary"
      size="sm"
      aria-haspopup="dialog"
      disabled={!view.keysReachable || addSaving}
      onClick={() => setAdding(true)}
    >
      <Glyph name="add" size={16} />
      Add custom provider
    </Button>
  );

  return (
    <Card title="Providers" action={addButton}>
      <p className="text-[14px] text-text2">
        Your model providers and the keys they run on, {studio ? "shared by the tutor and Studio chats" : "used by the tutor"}.
        A row without a key calls nothing until you add one.
      </p>
      {!view.keysReachable && (
        <Callout role="status" bordered>
          Your saved keys could not be read: the database is unreachable. The server&apos;s keys still work.
        </Callout>
      )}
      {!view.chainReachable && (
        <Callout role="status" bordered>
          Your models could not be read: the database is unreachable. The tutor cannot call anything until they are back.
        </Callout>
      )}
      {/* The form is a dialog rather than an inline panel — a provider is a
          credentials ask, and it deserves the same surface the picker's BYOK
          connect gets. */}
      <AddProvider
        open={adding}
        onSaving={setAddSaving}
        onClose={() => setAdding(false)}
        opener={() => document.getElementById(`${base}-add`)}
        onAdded={(label, note) => {
          setAdding(false);
          setStatus({ kind: "done", text: note ?? `Added ${label}. Pick a model for it below.` });
          // The key mirrored into `byok.json` — the Studio block reads it.
          window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
          router.refresh();
        }}
      />
      {view.rows.length === 0 ? (
        <p className="text-[14px] text-text">No provider yet. Add one to give the tutor a model to call.</p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-border">
          {view.rows.map((row) => (
            <ProviderRow
              key={row.id}
              row={row}
              disabled={!view.keysReachable}
              // A deleted row leaves with the refresh, its status line with
              // it: the card says what happened, and Add provider takes focus.
              onGone={(text) => {
                focusAdd.current = true;
                setStatus({ kind: "done", text });
              }}
            />
          ))}
        </ul>
      )}
      <div className="-mt-3">
        <LiveStatus text={textOf(status)} tone={tone(status)} className="pt-3" />
      </div>
    </Card>
  );
}
