"use client";

import { PROVIDER_KEY_LIMITS } from "@gnosia/schema/shared";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Collapse } from "@/components/ui/Collapse";
import { ConfirmFold } from "@/components/ui/ConfirmFold";
import { FormRow } from "@/components/ui/FormRow";
import { Glyph } from "@/components/ui/Glyph";
import { Input } from "@/components/ui/Input";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { TextLink } from "@/components/ui/TextLink";
import { cx } from "@/components/ui/classes";
import { Dialog, DIALOG_CLOSE_MS } from "@/components/ui/Dialog";
import { DialogHeader } from "@/components/ui/DialogHeader";
import { usePresence } from "@/components/ui/use-presence";
import type { ChainEntry } from "@/lib/agent/providers";
import type { ProviderRowView, ProvidersView } from "@/lib/providers/view";
import { sendJson } from "@/lib/send-json";
import { BYOK_SETTINGS_CHANGED } from "@/lib/studio-drafts";

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

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

interface Reply {
  ok?: boolean;
  error?: string;
  /** The mirrored `byok.json` write's answer on preset providers: false when the runner did not take it (D95). */
  byok?: boolean;
  chain?: ChainEntry[];
  models?: { id: string; free?: boolean }[];
  message?: string;
  served?: string;
  model?: string;
  source?: string;
  status?: number | null;
  tested?: string;
}

const tone = (s: Status) => (s.kind === "done" ? "ok" : s.kind === "error" ? "danger" : "muted");
const textOf = (s: Status) => (s.kind === "idle" ? null : s.text);
const failure = (what: string, reply: { status: number; data: Reply } | null) =>
  reply === null ? `Not ${what}: the server did not answer.` : (reply.data.error ?? `Not ${what} (HTTP ${reply.status}).`);

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

/**
 * Add custom provider's dialog: a name, a base URL and a key for any
 * OpenAI-compatible endpoint (T14), which `/api/learner/custom-provider`
 * stores whole or not at all.
 */
function AddProvider({
  open,
  onSaving,
  onClose,
  onAdded,
  opener,
}: {
  open: boolean;
  onSaving: (saving: boolean) => void;
  onClose: () => void;
  /** A provider went on the card. `text` overrides the stock message when only part of the ask landed. */
  onAdded: (label: string, text?: string) => void;
  /** The Add custom provider button, which the dialog returns focus to. */
  opener: () => HTMLElement | null;
}) {
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // In the page only while open, as the old key form: a password field kept
  // in the page is one a browser may fill with the sign-in password.
  const form = usePresence(open, DIALOG_CLOSE_MS);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const key = draft;
    setDraft("");
    setSaving(true);
    onSaving(true);
    setError(null);
    const reply = await sendJson<Reply>("POST", "/api/learner/custom-provider", { label: name, baseUrl: url, key });
    setSaving(false);
    onSaving(false);
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) return setError(failure("added", reply));
    const label = name.trim();
    setName("");
    setUrl("");
    onAdded(label);
  };

  if (!form.mounted) return null;
  const ready = draft.trim() !== "" && name.trim() !== "" && url.trim() !== "";
  // A save in flight is not dismissed: Escape, the backdrop and Close all
  // ask the same way, and the ask waits — a hid error is a silent failure.
  const askClose = () => {
    if (!saving) onClose();
  };
  return (
    <Dialog label="Add a custom provider" onClose={askClose} closing={form.leaving} size="compact" className="md:w-[520px]" opener={opener}>
      <DialogHeader title="Add a custom provider" onClose={askClose} />
      <form onSubmit={(e) => void save(e)} aria-label="Add a custom provider" className="flex min-h-0 flex-col gap-3 overflow-y-auto p-6 pt-5">
        <FormRow label="Name" hint="How it is listed here and named in the tutor's messages.">
          {({ id, describedBy }) => (
            <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="My gateway" aria-describedby={describedBy} />
          )}
        </FormRow>
        <FormRow
          label="Base URL"
          hint="The part before /chat/completions, as the provider documents it. https:// only, or http:// for a model server on this machine."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              aria-describedby={describedBy}
            />
          )}
        </FormRow>
        <FormRow
          label="API key"
          hint="Sent once and stored encrypted. Only its last four characters are shown again. For a local server that needs no key, type any 16 characters."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              name="custom-api-key"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={draft}
              minLength={PROVIDER_KEY_LIMITS.minChars}
              required
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </FormRow>
        {/* The refusal can be about any field (the name, the URL, the key), so it sits above the buttons, not under one of them. */}
        {error !== null && (
          <p role="alert" className="animate-fade-in text-[12px] text-danger motion-reduce:animate-none">
            {error} {draft === "" && "Enter the key again: it is never kept after a send."}
          </p>
        )}
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" size="sm" disabled={saving || !ready}>
            Add provider
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => {
              setDraft("");
              onClose();
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type Mode = "idle" | "edit" | "delete";

function ProviderRow({
  row,
  disabled,
  onGone,
}: {
  row: ProviderRowView;
  disabled: boolean;
  /** This row was deleted and leaves with the refresh, with what to say. */
  onGone: (text: string) => void;
}) {
  const router = useRouter();
  const base = useId();
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState("");
  // A custom provider's Edit also takes its name and base URL (T14).
  const [name, setName] = useState(row.label);
  const [url, setUrl] = useState(row.custom?.baseUrl ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "busy";
  const keyForm = usePresence(mode === "edit", 300);
  const hasModels = row.models.length > 0;

  // The control to focus once the change it follows has rendered.
  const focusNext = useRef<string | null>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusNext.current === null || busy) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  }, [mode, busy, row.models]);

  const saved = row.saved;
  const unreadable = saved !== null && !saved.readable;
  const keyLine =
    saved === null
      ? row.server
        ? "Using the server's key."
        : "No key yet — nothing calls this provider."
      : unreadable
        ? "Your saved key can no longer be read, most likely because the server's secret changed. Edit to re-enter it."
        : `Your key, ending ${saved.last4}. Saved ${saved.savedOn}.`;

  const saveKey = async (event: FormEvent) => {
    event.preventDefault();
    const key = draft;
    setDraft("");
    setStatus({ kind: "busy", text: "Saving…" });
    // A custom provider's name, base URL and key go in one write, so a key
    // that is refused leaves the name and the URL as they were.
    const custom = row.custom;
    const moved = custom !== undefined && (name.trim() !== row.label || url.trim() !== custom.baseUrl);
    const typed = key.trim() !== "";
    if (moved || (custom !== undefined && typed)) {
      const body = { provider: row.id, label: name, baseUrl: url, ...(typed ? { key } : {}) };
      const changed = await sendJson<Reply>("PATCH", "/api/learner/custom-provider", body);
      if (changed === null || changed.status !== 200 || changed.data.ok !== true) {
        focusNext.current = `${base}-key`;
        return setStatus({ kind: "error", text: failure("saved", changed) });
      }
    } else if (typed) {
      const reply = await sendJson<Reply>("POST", "/api/learner/provider-key", { provider: row.id, key });
      if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
        focusNext.current = `${base}-key`;
        return setStatus({ kind: "error", text: failure("saved", reply) });
      }
    }
    focusNext.current = `${base}-edit`;
    setMode("idle");
    setStatus({ kind: "done", text: row.custom !== undefined ? "Saved." : "Key saved." });
    window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
    router.refresh();
  };

  const remove = async () => {
    setStatus({ kind: "busy", text: "Deleting…" });
    const reply = await sendJson<Reply>("DELETE", "/api/learner/tutor-model/provider", { provider: row.id });
    // Focus after either answer is the fold's (`ConfirmFold`): back to its
    // Delete when the delete failed, to the row's own Add key once the row
    // stays (a built-in is always listed), and to Add custom provider when a
    // custom row leaves with the refresh (`onGone`).
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
      return setStatus({ kind: "error", text: failure("deleted", reply) });
    }
    setMode("idle");
    const kept = reply.data.byok === false ? " The studio runner did not answer, so it may still hold the key — remove the provider in a chat's BYOK settings." : "";
    const text = `Deleted ${row.label}.${kept}`;
    setStatus({ kind: "done", text });
    window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
    if (row.custom === undefined) focusNext.current = `${base}-edit`;
    else onGone(text);
    router.refresh();
  };

  const testKey = async () => {
    focusNext.current = `${base}-test-key`;
    setStatus({ kind: "busy", text: "Testing…" });
    const reply = await sendJson<Reply>("POST", "/api/learner/provider-key/test", { provider: row.id });
    if (reply === null) return setStatus({ kind: "error", text: "Not tested: the server did not answer." });
    const tested = reply.data.tested ? ` Tested with ${reply.data.tested}.` : "";
    if (reply.status === 200 && reply.data.ok === true) return setStatus({ kind: "done", text: `The key works.${tested}` });
    if (reply.status === 200) {
      const outcome = typeof reply.data.status === "number" ? `was refused (HTTP ${reply.data.status})` : "could not be tested";
      return setStatus({ kind: "error", text: `The key ${outcome}: ${(reply.data.message ?? "no reason given").replace(/\.$/, "")}.${tested}` });
    }
    setStatus({ kind: "error", text: reply.data.error ?? `Not tested (HTTP ${reply.status}).` });
  };

  const open = (next: Mode) => {
    setStatus({ kind: "idle" });
    setDraft("");
    setName(row.label);
    setUrl(row.custom?.baseUrl ?? "");
    // The delete confirm moves focus itself (`ConfirmFold`), in and out.
    focusNext.current = next === "edit" ? `${base}-key` : next === "delete" || mode === "delete" ? null : `${base}-edit`;
    setMode(next);
  };

  return (
    <li className="flex flex-col py-4 first:pt-2 last:pb-0" aria-labelledby={`${base}-name`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
          <p id={`${base}-name`} className="text-[14px] font-medium text-text">
            {row.label}
          </p>
          {row.custom !== undefined && <p className="font-mono text-[12px] break-all text-text2">{row.custom.baseUrl}</p>}
          <p className={cx("text-[12px]", unreadable || (row.inUse === null && hasModels) ? "text-danger" : "text-text2")}>{keyLine}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.inUse !== null && row.custom === undefined && (
            <Button id={`${base}-test-key`} variant="secondary" size="sm" disabled={disabled || busy} onClick={() => void testKey()}>
              Test the key
            </Button>
          )}
          <Button
            id={`${base}-edit`}
            variant="secondary"
            size="sm"
            aria-expanded={mode === "edit"}
            disabled={disabled || busy}
            onClick={() => open(mode === "edit" ? "idle" : "edit")}
          >
            {saved === null && row.custom === undefined ? "Add key" : "Edit"}
          </Button>
          <Button
            ref={deleteButton}
            id={`${base}-delete`}
            variant="secondary"
            size="sm"
            aria-expanded={mode === "delete"}
            aria-controls={`${base}-delete-fold`}
            disabled={disabled || busy || (saved === null && !hasModels && row.custom === undefined)}
            onClick={() => open(mode === "delete" ? "idle" : "delete")}
          >
            Delete
          </Button>
        </div>
      </div>

      <Collapse open={mode === "edit"}>
        {/* The space above sits inside the fold, so a shut fold measures 0. */}
        {keyForm.mounted && (
          <div className="pt-3">
            <form onSubmit={(e) => void saveKey(e)} aria-label={`${row.label} key`} className="flex flex-col gap-3 rounded-2xl border-2 border-border p-4">
              {row.custom !== undefined && (
                <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                  <FormRow label="Name">
                    {({ id }) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
                  </FormRow>
                  <FormRow label="Base URL">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="url"
                        inputMode="url"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    )}
                  </FormRow>
                </div>
              )}
              <FormRow
                id={`${base}-key`}
                label={saved === null ? `Your ${row.label} key` : `A new ${row.label} key`}
                hint={
                  <>
                    {row.custom !== undefined
                      ? "Leave it empty to keep the key saved now. A new one is sent once and stored encrypted."
                      : saved === null
                        ? "Sent once and stored encrypted. Only its last four characters are shown again."
                        : "Sent once and stored encrypted. It replaces the key saved now."}
                    {row.keyUrl !== undefined && (
                      <>
                        {" "}
                        <TextLink href={row.keyUrl} external size="xs">
                          Get a {row.label} key<span aria-hidden> ↗</span>
                        </TextLink>
                      </>
                    )}
                  </>
                }
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="password"
                    name={`${row.id}-api-key`}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-describedby={describedBy}
                  />
                )}
              </FormRow>
              <div className="flex flex-wrap gap-2.5">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    busy ||
                    (row.custom === undefined
                      ? draft.trim() === ""
                      : draft.trim() === "" && name.trim() === row.label && url.trim() === row.custom.baseUrl)
                  }
                >
                  {row.custom !== undefined ? "Save" : "Save key"}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => open("idle")}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}
      </Collapse>

      <ConfirmFold
        open={mode === "delete"}
        id={`${base}-delete-fold`}
        className="pt-3"
        label={`Confirm deleting ${row.label}`}
        message={
          <>
            Delete {row.label}? {row.custom !== undefined ? "It is removed with your key and its models." : goes(saved !== null, row.models.length)}
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => void remove()}
        onCancel={() => open("idle")}
        busy={busy}
        returnFocusTo={deleteButton}
      />

      <LiveStatus text={textOf(status)} tone={tone(status)} className="pt-2.5" />
    </li>
  );
}

/** What a Delete takes, as a sentence: "Your key and its 2 models go with it." */
function goes(key: boolean, models: number): string {
  const parts = [key ? "your key" : null, models > 0 ? `its ${models} ${models === 1 ? "model" : "models"}` : null].filter(
    (part): part is string => part !== null,
  );
  const said = parts.join(" and ");
  return `${said.charAt(0).toUpperCase()}${said.slice(1)} ${parts.length > 1 ? "go" : "goes"} with it.`;
}

