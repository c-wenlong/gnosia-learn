"use client";

import { PROVIDER_KEY_LIMITS, type ProviderName } from "@self-learn/schema/shared";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Collapse } from "@/components/ui/Collapse";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmFold } from "@/components/ui/ConfirmFold";
import { FormRow } from "@/components/ui/FormRow";
import { Glyph } from "@/components/ui/Glyph";
import { Input } from "@/components/ui/Input";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { Select } from "@/components/ui/Select";
import { TextLink } from "@/components/ui/TextLink";
import { cx } from "@/components/ui/classes";
import { Dialog, DIALOG_CLOSE_MS } from "@/components/ui/Dialog";
import { DialogHeader } from "@/components/ui/DialogHeader";
import { usePresence } from "@/components/ui/use-presence";
import { ByokTiers } from "@/components/settings/ByokTiers";
import type { ChainEntry } from "@/lib/agent/providers";
import { byokToTutor, TUTOR_TO_BYOK } from "@/lib/byok-providers";
import type { ProviderRowView, ProvidersView } from "@/lib/providers/view";
import { sendJson } from "@/lib/send-json";
import { BYOK_SETTINGS_CHANGED, getByokSettings, removeByokProvider, type ByokProviderStatus } from "@/lib/studio-drafts";

/**
 * The Providers card (docs/TUTOR-MODELS.md, T12): the tutor's model
 * providers, each with its key and its models, in the order the tutor tries
 * them. It replaces the Provider keys and Models cards, which kept the key
 * and the models of one provider on two cards.
 *
 * Add provider takes a provider not listed yet and its key. A row shows the
 * key's state with Edit (replace the key), Delete (the key and the
 * provider's models, after a confirm), Move up and Move down (the provider's
 * models together, `PATCH /api/learner/tutor-model/provider`), and an arrow
 * at the far right that opens the row onto its models. Rows start closed.
 * Inside, each model has Test, Move up, Move down and Remove, and Add model
 * is the kit's `Combobox` over the provider's live model list
 * (`/api/learner/tutor-model/models`), fetched when the row first opens, so
 * picking from the list and typing an id are the same field.
 *
 * Keys are write-only, as on the old card (docs/BYOK.md): typed into a
 * password field, sent once, dropped from state whatever the answer. The
 * card is handed last four characters and dates, never a key.
 *
 * Nothing swaps in a frame: every form, confirm and model list glides open
 * and shut (`Collapse`), the arrow turns, a model that arrives fades in, and
 * the status lines glide (`LiveStatus`).
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

type ListState =
  | { state: "loading" }
  | { state: "ready"; models: { id: string; free?: boolean }[] }
  | { state: "error"; message: string };

const tone = (s: Status) => (s.kind === "done" ? "ok" : s.kind === "error" ? "danger" : "muted");
const textOf = (s: Status) => (s.kind === "idle" ? null : s.text);
const failure = (what: string, reply: { status: number; data: Reply } | null) =>
  reply === null ? `Not ${what}: the server did not answer.` : (reply.data.error ?? `Not ${what} (HTTP ${reply.status}).`);

export function Providers({ view }: { view: ProvidersView }) {
  const router = useRouter();
  const base = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [adding, setAdding] = useState(false);
  // The studio BYOK side of the same keys (D95): the connected providers,
  // the one chats run on, and each one's tier picks, re-read whenever a
  // BYOK write lands (the picker dialog or a sync button).
  const [byok, setByok] = useState<{ active: string | null; providers: ByokProviderStatus[] } | null>(null);
  useEffect(() => {
    const read = async () => {
      const result = await getByokSettings();
      if (result.ok && Array.isArray(result.data.providers)) setByok({ active: result.data.active, providers: result.data.providers });
    };
    void read();
    window.addEventListener(BYOK_SETTINGS_CHANGED, read);
    return () => window.removeEventListener(BYOK_SETTINGS_CHANGED, read);
  }, []);
  /** The BYOK preset a row answers to and its entry, or undefined when the provider is no preset. */
  const byokFor = (id: ProviderName) => {
    const preset = TUTOR_TO_BYOK[id];
    return preset === undefined ? undefined : { preset, entry: byok?.providers.find((p) => p.provider === preset) ?? null };
  };
  // A provider connected for Studio but not for the tutor still gets a row —
  // its key is real, so its tiers stay editable.
  const byokOnly = (byok?.providers ?? []).filter((p) => !view.rows.some((row) => TUTOR_TO_BYOK[row.id] === p.provider));
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
      Add provider
    </Button>
  );

  return (
    <Card title="Providers" action={addButton}>
      <p className="text-[14px] text-text2">
        {view.usingDefaults
          ? "Your model providers and their keys. Until you add a model, the tutor tries each provider's built-in default, in this order."
          : "Your model providers, their keys and their models. The tutor tries each provider's models top to bottom, then the next provider's, and skips a provider with no models."}
      </p>
      {!view.keysReachable && (
        <Callout role="status" bordered>
          Your saved keys could not be read: the database is unreachable. The server&apos;s keys still work.
        </Callout>
      )}
      {!view.chainReachable && (
        <Callout role="status" bordered>
          Your models could not be read: the database is unreachable. The tutor is using the built-in defaults.
        </Callout>
      )}
      {/* The form is a dialog rather than an inline panel — a provider is a
          credentials ask, and it deserves the same surface the picker's BYOK
          connect gets. */}
      <AddProvider
        open={adding}
        addable={view.addable}
        onSaving={setAddSaving}
        onClose={() => setAdding(false)}
        opener={() => document.getElementById(`${base}-add`)}
        onAdded={(label) => {
          setAdding(false);
          setStatus({ kind: "done", text: `Added ${label}. Open it to add a model.` });
          // The key mirrored into `byok.json` — the Studio block reads it.
          window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
          router.refresh();
        }}
      />
      {view.rows.length === 0 && byokOnly.length === 0 ? (
        <p className="text-[14px] text-text">No provider yet. Add one to give the tutor a model to call.</p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-border">
          {/* A provider Studio's BYOK has but the tutor does not (connected
              before the stores merged) gets a slim row of its own, so its
              tiers stay editable and its key is not invisible. */}
          {byokOnly.map((entry) => (
            <ByokOnlyRow key={`byok-${entry.provider}`} entry={entry} active={byok?.active === entry.provider} />
          ))}
          {view.rows.map((row, index) => (
            <ProviderRow
              key={row.id}
              row={row}
              first={index === 0 || view.rows[index - 1]?.models.length === 0}
              last={index === view.rows.length - 1 || view.rows[index + 1]?.models.length === 0}
              usingDefaults={view.usingDefaults}
              full={view.full}
              byok={byokFor(row.id)}
              byokActive={byok?.active}
              disabled={!view.keysReachable || !view.chainReachable}
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

/** The Add provider menu's last choice: any OpenAI-compatible endpoint (T14). */
const CUSTOM = "custom";

/**
 * Add provider's dialog: a provider not listed yet and its key, or a custom
 * provider (a name, a base URL and a key), which `/api/learner/custom-provider`
 * stores whole or not at all.
 */
function AddProvider({
  open,
  addable,
  onSaving,
  onClose,
  onAdded,
  opener,
}: {
  open: boolean;
  addable: ProvidersView["addable"];
  onSaving: (saving: boolean) => void;
  onClose: () => void;
  onAdded: (label: string) => void;
  /** The Add provider button, which the dialog returns focus to. */
  opener: () => HTMLElement | null;
}) {
  const [provider, setProvider] = useState<ProviderName | typeof CUSTOM>(addable[0]?.id ?? CUSTOM);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // In the page only while open, as the old key form: a password field kept
  // in the page is one a browser may fill with the sign-in password.
  const form = usePresence(open, DIALOG_CLOSE_MS);
  const custom = provider === CUSTOM || addable.length === 0;
  const chosen = custom ? undefined : (addable.find((a) => a.id === provider) ?? addable[0]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const key = draft;
    setDraft("");
    setSaving(true);
    onSaving(true);
    setError(null);
    const reply = custom
      ? await sendJson<Reply>("POST", "/api/learner/custom-provider", { label: name, baseUrl: url, key })
      : await sendJson<Reply>("POST", "/api/learner/provider-key", { provider: chosen?.id, key });
    setSaving(false);
    onSaving(false);
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) return setError(failure("added", reply));
    const label = custom ? name.trim() : (chosen?.label ?? "the provider");
    setName("");
    setUrl("");
    onAdded(label);
  };

  if (!form.mounted) return null;
  const ready = draft.trim() !== "" && (!custom || (name.trim() !== "" && url.trim() !== ""));
  // A save in flight is not dismissed: Escape, the backdrop and Close all
  // ask the same way, and the ask waits — a hid error is a silent failure.
  const askClose = () => {
    if (!saving) onClose();
  };
  return (
    <Dialog label="Add a provider" onClose={askClose} closing={form.leaving} size="compact" className="md:w-[520px]" opener={opener}>
      <DialogHeader title="Add a provider" onClose={askClose} />
      <form onSubmit={(e) => void save(e)} aria-label="Add a provider" className="flex min-h-0 flex-col gap-3 overflow-y-auto p-6 pt-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <FormRow label="Provider">
          {({ id }) => (
            <Select
              id={id}
              label="Provider"
              options={[
                ...addable.map((a) => ({ value: a.id as string, label: a.label })),
                { value: CUSTOM, label: "Custom provider", detail: "Any OpenAI-compatible API", section: "Your own" },
              ]}
              value={custom ? CUSTOM : (chosen?.id ?? CUSTOM)}
              onChange={(v) => {
                setProvider(v as ProviderName | typeof CUSTOM);
                setError(null);
              }}
            />
          )}
        </FormRow>
        {custom && (
          <FormRow label="Name" hint="How it is listed here and named in the tutor's messages.">
            {({ id, describedBy }) => (
              <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="My gateway" aria-describedby={describedBy} />
            )}
          </FormRow>
        )}
      </div>
      {custom && (
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
      )}
      <FormRow
        label="API key"
        hint={
          <>
            Sent once and stored encrypted. Only its last four characters are shown again.
            {custom && " For a local server that needs no key, type any 16 characters."}
            {chosen?.keyUrl !== undefined && (
              <>
                {" "}
                <TextLink href={chosen.keyUrl} external size="xs">
                  Get a {chosen.label} key<span aria-hidden> ↗</span>
                </TextLink>
              </>
            )}
          </>
        }
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            name={`${custom ? "custom" : (chosen?.id ?? "provider")}-api-key`}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={draft}
            minLength={PROVIDER_KEY_LIMITS.minChars}
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
  first,
  last,
  usingDefaults,
  full,
  byok,
  byokActive,
  disabled,
  onGone,
}: {
  row: ProviderRowView;
  /** No provider with models above it: Move up does nothing. */
  first: boolean;
  /** No provider with models below it: Move down does nothing. */
  last: boolean;
  usingDefaults: boolean;
  full: boolean;
  /** The BYOK preset this provider answers to and its `byok.json` entry (null = not connected there), or undefined for a non-preset provider. */
  byok: { preset: string; entry: ByokProviderStatus | null } | undefined;
  /** The provider Studio chats run on, for the "Use for Studio" switch. */
  byokActive: string | null | undefined;
  disabled: boolean;
  /** This row was deleted and leaves with the refresh (no server key keeps it listed), with what to say. */
  onGone: (text: string) => void;
}) {
  const router = useRouter();
  const base = useId();
  const [expanded, setExpanded] = useState(false);
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
        : "No key, so the tutor skips this provider."
      : unreadable
        ? "Your saved key can no longer be read, most likely because the server's secret changed. Edit to re-enter it."
        : `Your key, ending ${saved.last4}. Saved ${saved.savedOn}.`;
  const modelLine = hasModels
    ? `${row.models.length} ${row.models.length === 1 ? "model" : "models"}`
    : usingDefaults && row.inUse !== null && row.custom === undefined
      ? `Built-in default: ${row.model}`
      : "No models";

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
    // Delete when the delete failed, to the row's Delete once it closes, and
    // to Add provider when the row itself goes (`onGone`).
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
      return setStatus({ kind: "error", text: failure("deleted", reply) });
    }
    setMode("idle");
    const kept = reply.data.byok === false ? " The studio runner did not answer, so it still has the key — its row below has a Remove." : "";
    const text = row.server ? `Deleted ${row.label}. The server's key still applies.${kept}` : `Deleted ${row.label}.${kept}`;
    setStatus({ kind: "done", text });
    window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
    if (!row.server) onGone(text);
    router.refresh();
  };

  const moveProvider = async (direction: "up" | "down") => {
    setStatus({ kind: "busy", text: "Moving…" });
    const reply = await sendJson<Reply>("PATCH", "/api/learner/tutor-model/provider", { provider: row.id, direction });
    focusNext.current = `${base}-${direction}`;
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) return setStatus({ kind: "error", text: failure("moved", reply) });
    setStatus({ kind: "done", text: `${row.label} moved ${direction}.` });
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
          <p className="text-[12px] break-all text-text2">{modelLine}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {hasModels && (
            <>
              <Button
                id={`${base}-up`}
                variant="secondary"
                size="sm"
                className="w-9 px-0"
                aria-label={`Move ${row.label} up`}
                title="Move up"
                disabled={disabled || busy || first}
                onClick={() => void moveProvider("up")}
              >
                <Glyph name="up" size={16} />
              </Button>
              <Button
                id={`${base}-down`}
                variant="secondary"
                size="sm"
                className="w-9 px-0"
                aria-label={`Move ${row.label} down`}
                title="Move down"
                disabled={disabled || busy || last}
                onClick={() => void moveProvider("down")}
              >
                <Glyph name="down" size={16} />
              </Button>
            </>
          )}
          <Button
            id={`${base}-edit`}
            variant="secondary"
            size="sm"
            aria-expanded={mode === "edit"}
            disabled={disabled || busy}
            onClick={() => open(mode === "edit" ? "idle" : "edit")}
          >
            Edit
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
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${base}-models`}
            aria-label={`${expanded ? "Hide" : "Show"} ${row.label} models`}
            title={expanded ? "Hide models" : "Show models"}
            onClick={() => setExpanded((was) => !was)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text2 transition-colors duration-100 hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Glyph
              name="expand"
              size={18}
              className={cx("transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")}
            />
          </button>
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
                  row.custom !== undefined
                    ? "Leave it empty to keep the key saved now. A new one is sent once and stored encrypted."
                    : "Sent once and stored encrypted. It replaces the key saved now."
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
            {row.server ? " The server's key stays, so it is still listed." : ""}
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => void remove()}
        onCancel={() => open("idle")}
        busy={busy}
        returnFocusTo={deleteButton}
      />

      <LiveStatus text={textOf(status)} tone={tone(status)} className="pt-2.5" />

      <Collapse open={expanded} id={`${base}-models`}>
        <Models row={row} usingDefaults={usingDefaults} full={full} disabled={disabled} visible={expanded} onTestKey={() => void testKey()} testKeyId={`${base}-test-key`} />
        {byok !== undefined && (
          <ByokTiers
            provider={byok.preset}
            tutorId={row.id}
            entry={byok.entry}
            active={byokActive === byok.preset}
            keyed={row.saved?.readable === true}
            visible={expanded}
          />
        )}
      </Collapse>
    </li>
  );
}

/**
 * A provider `byok.json` holds that the tutor's list does not (connected
 * before the stores merged, D95): a slim row — the name, the key's tail,
 * and the Studio tiers under the same arrow. Saving the key above through
 * Add provider turns it into a full row, since the one key is shared.
 */
function ByokOnlyRow({ entry, active }: { entry: ByokProviderStatus; active: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const tutor = byokToTutor(entry.provider);
  const base = useId();
  return (
    <li className="flex flex-col py-4" aria-label={`${entry.provider} (Studio only)`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
          <p id={`${base}-name`} className="text-[14px] font-medium text-text">
            {entry.provider}
          </p>
          <p className="text-[12px] text-text2">Studio BYOK key ending {entry.last4} — not saved for the tutor.</p>
          <p className="text-[12px] break-all text-text2">Studio chats{active ? " run on this provider" : ""}</p>
          {note !== null && <p className="text-[12px] leading-4 text-danger">{note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* The runner-side remove, also the retry when a mirrored delete could not reach it. */}
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setNote(null);
                const result = await removeByokProvider(entry.provider);
                setBusy(false);
                // A gone entry leaves with the BYOK_SETTINGS_CHANGED refetch.
                if (!result.ok) setNote(result.refusal.error);
              })();
            }}
          >
            Remove
          </Button>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${base}-tiers`}
            aria-label={`${expanded ? "Hide" : "Show"} ${entry.provider} Studio tiers`}
            title={expanded ? "Hide tiers" : "Show tiers"}
            onClick={() => setExpanded((was) => !was)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text2 transition-colors duration-100 hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Glyph name="expand" size={18} className={cx("transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")} />
          </button>
        </div>
      </div>
      <Collapse open={expanded} id={`${base}-tiers`}>
        {tutor !== undefined ? (
          <ByokTiers provider={entry.provider} tutorId={tutor} entry={entry} active={active} keyed={false} visible={expanded} />
        ) : (
          <p className="pt-3 text-[12px] leading-4 text-text2">A provider the preset table dropped — remove it under Add provider on the runner.</p>
        )}
      </Collapse>
    </li>
  );
}

/** A row's models, opened under it: each with Test, Move up, Move down and Remove, then Add model. */
function Models({
  row,
  usingDefaults,
  full,
  disabled,
  visible,
  onTestKey,
  testKeyId,
}: {
  row: ProviderRowView;
  usingDefaults: boolean;
  full: boolean;
  disabled: boolean;
  /** The row is open: the model list is fetched the first time it is. */
  visible: boolean;
  onTestKey: () => void;
  testKeyId: string;
}) {
  const router = useRouter();
  const base = useId();
  const [tests, setTests] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<ListState | null>(null);
  const busy = status.kind === "busy";
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (focusNext.current === null || busy) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  }, [busy, row.models]);
  const idFor = (m: string, action: string) => `${base}-${m}-${action}`;
  const keyed = row.inUse !== null;

  /**
   * The provider's model list, asked once each time the row opens, and again
   * when its key changes while it is open: a replaced key is another
   * account, and the server's cache is keyed by the key. A list that failed
   * is asked again on Try again. Only the newest ask's answer is shown, so a
   * slow earlier one cannot put an old list or an old error back.
   */
  const asked = useRef<string | null>(null);
  const latest = useRef(0);
  const keyStamp = `${row.inUse ?? "none"}:${row.saved?.last4 ?? ""}:${row.saved?.savedOn ?? ""}`;
  const load = async () => {
    const ask = ++latest.current;
    setList({ state: "loading" });
    const reply = await sendJson<Reply>("POST", "/api/learner/tutor-model/models", { provider: row.id });
    if (ask !== latest.current) return;
    setList(
      reply === null
        ? { state: "error", message: "the server did not answer" }
        : reply.status === 200 && reply.data.ok === true && Array.isArray(reply.data.models)
          ? { state: "ready", models: reply.data.models }
          : {
              state: "error",
              message:
                reply.status === 200
                  ? `${typeof reply.data.status === "number" ? `HTTP ${reply.data.status}: ` : ""}${reply.data.message ?? "no reason given"}`
                  : (reply.data.error ?? `HTTP ${reply.status}`),
            },
    );
  };
  useEffect(() => {
    if (!visible) {
      asked.current = null;
      return;
    }
    if (asked.current === keyStamp || !keyed) return;
    asked.current = keyStamp;
    void load();
    // `load` reads only the row's id, which a row never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, keyed, keyStamp]);

  const change = async (method: "DELETE" | "PATCH", m: string, extra: Record<string, unknown>, busyText: string, pressed: string, done: (next: ChainEntry[]) => { text: string; focus: string }) => {
    setStatus({ kind: "busy", text: busyText });
    const reply = await sendJson<Reply>(method, "/api/learner/tutor-model", { provider: row.id, model: m, ...extra });
    if (reply === null || reply.status !== 200 || reply.data.ok !== true || reply.data.chain === undefined) {
      focusNext.current = pressed;
      return setStatus({ kind: "error", text: failure("changed", reply) });
    }
    const { text, focus } = done(reply.data.chain);
    focusNext.current = focus;
    setStatus({ kind: "done", text });
    router.refresh();
  };

  const move = (m: string, direction: "up" | "down") =>
    change("PATCH", m, { direction }, "Moving…", idFor(m, direction), (next) => {
      const mine = next.filter((e) => e.provider === row.id).map((e) => e.model);
      const at = mine.indexOf(m);
      const atEnd = direction === "up" ? at === 0 : at === mine.length - 1;
      return { text: `${m} is now number ${at + 1} of ${mine.length}.`, focus: idFor(m, atEnd ? (direction === "up" ? "down" : "up") : direction) };
    });

  const remove = (m: string) => {
    const at = row.models.indexOf(m);
    return change("DELETE", m, {}, "Removing…", idFor(m, "remove"), (next) => {
      const mine = next.filter((e) => e.provider === row.id).map((e) => e.model);
      const neighbour = mine[Math.min(at, mine.length - 1)];
      return {
        text: next.length === 0 ? `Removed ${m}. The tutor is back on the built-in defaults.` : `Removed ${m}.`,
        focus: neighbour === undefined ? `${base}-model` : idFor(neighbour, "remove"),
      };
    });
  };

  const test = async (m: string) => {
    setStatus({ kind: "busy", text: `Testing ${m}…` });
    const reply = await sendJson<Reply>("POST", "/api/learner/tutor-model/test", { provider: row.id, model: m });
    let result: { ok: boolean; text: string };
    if (reply === null) result = { ok: false, text: "Not tested: the server did not answer." };
    else if (reply.status === 200 && reply.data.ok === true) {
      result = { ok: true, text: `Works${reply.data.served && reply.data.served !== m ? `, answered by ${reply.data.served}` : ""}.` };
    } else if (reply.status === 200) {
      const outcome = typeof reply.data.status === "number" ? `Refused (HTTP ${reply.data.status})` : "No answer";
      result = { ok: false, text: `${outcome}: ${reply.data.message ?? "no reason given."}` };
    } else result = { ok: false, text: reply.data.error ?? `Not tested (HTTP ${reply.status}).` };
    focusNext.current = idFor(m, "test");
    setTests((t) => ({ ...t, [m]: result }));
    setStatus({ kind: result.ok ? "done" : "error", text: `${m}: ${result.text}` });
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setStatus({ kind: "busy", text: "Adding…" });
    setError(null);
    const reply = await sendJson<Reply>("POST", "/api/learner/tutor-model", { provider: row.id, model });
    if (reply === null || reply.status !== 200 || reply.data.ok !== true || reply.data.chain === undefined) {
      focusNext.current = `${base}-model`;
      setStatus({ kind: "idle" });
      return setError(failure("added", reply));
    }
    const added = model.trim();
    setModel("");
    focusNext.current = `${base}-model`;
    setStatus({ kind: "done", text: `Added ${added}. Test it to check ${row.label} answers.` });
    router.refresh();
  };

  const suggestions = useMemo(
    () =>
      list?.state === "ready"
        ? list.models.filter((m) => !row.models.includes(m.id)).map((m) => ({ value: m.id, label: m.id, detail: m.free ? "free" : undefined }))
        : NO_MODELS,
    [list, row.models],
  );
  const reason = !keyed ? `Add a ${row.label} key first: Edit above.` : full ? "The tutor keeps at most 10 models. Remove one first." : undefined;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-surface2 p-4">
      {row.models.length === 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-text2">
          <p>
            {usingDefaults && keyed && row.custom === undefined
              ? `No models yet. Until you add one to any provider, the tutor calls ${row.label}'s built-in default, ${row.model}.`
              : `No models yet, so the tutor skips ${row.label}.`}
          </p>
          {keyed && row.custom === undefined && (
            <Button id={testKeyId} variant="ghost" size="sm" disabled={disabled} onClick={onTestKey}>
              Test the key
            </Button>
          )}
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {row.models.map((m, index) => {
            const last = tests[m];
            return (
              <li key={m} className="flex animate-fade-in flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-border bg-surface px-3 py-2.5 motion-reduce:animate-none">
                <span aria-hidden className="w-4 shrink-0 text-[13px] font-semibold text-text2 tabular-nums">
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-0.5">
                  <p id={`${base}-${m}-name`} className="font-mono text-[13px] break-all text-text">
                    {m}
                  </p>
                  {last !== undefined && (
                    <p key={last.text} className={cx("animate-fade-in text-[12px] motion-reduce:animate-none", last.ok ? "text-ok-text" : "text-danger")}>
                      Last test: {last.text}
                    </p>
                  )}
                </div>
                <div role="group" aria-labelledby={`${base}-${m}-name`} className="flex shrink-0 flex-wrap gap-1.5">
                  <Button id={idFor(m, "test")} variant="secondary" size="sm" disabled={disabled || busy || !keyed} onClick={() => void test(m)}>
                    Test
                  </Button>
                  <Button
                    id={idFor(m, "up")}
                    variant="secondary"
                    size="sm"
                    className="w-9 px-0"
                    aria-label={`Move ${m} up`}
                    title="Move up"
                    disabled={disabled || busy || index === 0}
                    onClick={() => void move(m, "up")}
                  >
                    <Glyph name="up" size={16} />
                  </Button>
                  <Button
                    id={idFor(m, "down")}
                    variant="secondary"
                    size="sm"
                    className="w-9 px-0"
                    aria-label={`Move ${m} down`}
                    title="Move down"
                    disabled={disabled || busy || index === row.models.length - 1}
                    onClick={() => void move(m, "down")}
                  >
                    <Glyph name="down" size={16} />
                  </Button>
                  <Button id={idFor(m, "remove")} variant="secondary" size="sm" aria-label={`Remove ${m}`} disabled={disabled || busy} onClick={() => void remove(m)}>
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <form onSubmit={(e) => void add(e)} aria-label={`Add a ${row.label} model`} className="flex flex-col gap-1.5">
        <FormRow id={`${base}-model`} label="Add a model" error={error}>
          {({ id, invalid }) => (
            <div className="flex flex-wrap items-start gap-2.5">
              <Combobox
                id={id}
                name="model"
                label={`${row.label} model`}
                options={suggestions}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={model}
                onChange={(v) => {
                  setModel(v);
                  setError(null);
                }}
                placeholder={keyed ? "Search models or type an id" : "Add a key first"}
                describedBy={`${base}-list`}
                invalid={invalid}
                disabled={disabled || reason !== undefined}
                className="min-w-0 flex-1 basis-[240px]"
              />
              <Button type="submit" size="sm" className="mt-[3px]" disabled={disabled || busy || reason !== undefined || model.trim() === ""} disabledReason={reason}>
                Add model
              </Button>
            </div>
          )}
        </FormRow>
        {keyed && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p id={`${base}-list`} aria-live="polite" className="text-[12px] text-text2">
              {list === null || list.state === "loading"
                ? `Loading ${row.label}'s models…`
                : list.state === "ready"
                  ? list.models.length > 0
                    ? `${list.models.length} ${list.models.length === 1 ? "model" : "models"} from ${row.label}. Type to search, or type any model id.`
                    : `${row.label} listed no models. Type a model id.`
                  : `The list could not be loaded (${list.message}). Type a model id.`}
            </p>
            {list?.state === "error" && (
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            )}
          </div>
        )}
      </form>
      <div className="-mt-3">
        <LiveStatus text={textOf(status)} tone={tone(status)} className="pt-3" />
      </div>
    </div>
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

/** The model box's suggestions while the list is not in: none, the same array each time. */
const NO_MODELS: { value: string; label: string; detail?: string }[] = [];
