"use client";

import { PROVIDER_KEY_LIMITS } from "@gnosia/schema/shared";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { FormRow } from "@/components/ui/FormRow";
import { Input } from "@/components/ui/Input";
import { Dialog, DIALOG_CLOSE_MS } from "@/components/ui/Dialog";
import { DialogHeader } from "@/components/ui/DialogHeader";
import { usePresence } from "@/components/ui/use-presence";
import { sendJson } from "@/lib/send-json";

import { failure, type Reply } from "./status";

/**
 * Add custom provider's dialog: a name, a base URL and a key for any
 * OpenAI-compatible endpoint (T14), which `/api/learner/custom-provider`
 * stores whole or not at all.
 */
export function AddProvider({
  open,
  onSaving,
  onClose,
  onAdded,
  opener,
}: {
  open: boolean;
  onSaving: (saving: boolean) => void;
  onClose: () => void;
  /** A provider went on the card. */
  onAdded: (label: string) => void;
  /** The Add custom provider button, which the dialog returns focus to. */
  opener: () => HTMLElement | null;
}) {
  // In the page only while open, as the old key form: a password field kept
  // in the page is one a browser may fill with the sign-in password. The
  // form's state lives in the child, so every way out (Escape, the backdrop,
  // Close, Cancel) drops what was typed with it, the key above all: kept in
  // state it would fill back in on reopen, where it could be sent to a
  // different base URL.
  const form = usePresence(open, DIALOG_CLOSE_MS);
  if (!form.mounted) return null;
  return <AddProviderForm leaving={form.leaving} onSaving={onSaving} onClose={onClose} onAdded={onAdded} opener={opener} />;
}

function AddProviderForm({
  leaving,
  onSaving,
  onClose,
  onAdded,
  opener,
}: {
  leaving: boolean;
  onSaving: (saving: boolean) => void;
  onClose: () => void;
  onAdded: (label: string) => void;
  opener: () => HTMLElement | null;
}) {
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keyId = useId();
  // The submit button is disabled while the request runs, which drops its
  // focus; a refusal puts it in the key field, emptied for the retype.
  const refocus = useRef(false);
  useEffect(() => {
    if (saving || !refocus.current) return;
    refocus.current = false;
    // Only focus that was dropped: a person editing the name or URL while the
    // request ran keeps where they are.
    const at = document.activeElement;
    if (at === null || at === document.body) document.getElementById(keyId)?.focus();
  }, [saving, keyId]);

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
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
      refocus.current = true;
      return setError(failure("added", reply));
    }
    const label = name.trim();
    setName("");
    setUrl("");
    onAdded(label);
  };

  const ready = draft.trim() !== "" && name.trim() !== "" && url.trim() !== "";
  // A save in flight is not dismissed: Escape, the backdrop and Close all
  // ask the same way, and the ask waits — a hid error is a silent failure.
  const askClose = () => {
    if (!saving) onClose();
  };
  return (
    <Dialog label="Add a custom provider" onClose={askClose} closing={leaving} size="compact" className="md:w-[520px]" opener={opener}>
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
          id={keyId}
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
            onClick={askClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
