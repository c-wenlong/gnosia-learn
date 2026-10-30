"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import { ConfirmFold } from "@/components/ui/ConfirmFold";
import { FormRow } from "@/components/ui/FormRow";
import { Input } from "@/components/ui/Input";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { TextLink } from "@/components/ui/TextLink";
import { cx } from "@/components/ui/classes";
import { usePresence } from "@/components/ui/use-presence";
import type { ProviderRowView } from "@/lib/providers/view";
import { sendJson } from "@/lib/send-json";
import { BYOK_SETTINGS_CHANGED } from "@/lib/studio-byok";

import { tone, textOf, failure, type Status, type Reply } from "./status";

type Mode = "idle" | "edit" | "delete";

export function ProviderRow({
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
