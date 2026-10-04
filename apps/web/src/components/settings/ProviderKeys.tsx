"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Collapse } from "@/components/ui/Collapse";
import { FormRow } from "@/components/ui/FormRow";
import { Input } from "@/components/ui/Input";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { usePresence } from "@/components/ui/use-presence";
import { cx } from "@/components/ui/classes";
import type { ProviderKeyView } from "@/lib/provider-keys/settings";
import { sendJson } from "@/lib/send-json";

/**
 * A row, with the model its Test sends and whether the tutor uses this key
 * at all (`keyTestModel`, docs/TUTOR-MODELS.md T9).
 */
export type ProviderKeyRow = ProviderKeyView & { test: { model: string; modelFrom: "chain" | "default"; used: boolean } };

/**
 * The Provider keys card (docs/BYOK.md): the owner's own model provider keys,
 * one row per provider.
 *
 * Write-only. A key is typed into a password field, sent once to
 * `POST /api/learner/provider-key`, and dropped from this component's state
 * whatever the answer; nothing on this page can show it again. What a row
 * knows is what the server handed it: the last four characters, the day it
 * was saved, whether it still decrypts, and whether the server has a key of
 * its own for the provider.
 *
 * A row's buttons, its key form and its remove confirm take turns in one
 * place, each in a `Collapse`, so one folds away as the next unfolds rather
 * than swapping in a frame. Focus follows: into the field or onto the
 * confirm's Cancel when one opens, and back to the button that opened it
 * when it closes, since that button was inside the fold that shut.
 */

type Status =
  | { kind: "idle" }
  | { kind: "busy"; what: string }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

interface Reply {
  ok?: boolean;
  error?: string;
  message?: string;
  model?: string;
  source?: string;
  status?: number | null;
  tested?: string;
}

export function ProviderKeys({ rows, reachable }: { rows: ProviderKeyRow[]; reachable: boolean }) {
  return (
    <Card title="Provider keys">
      <p className="text-[14px] text-text2">
        Your own API keys for the tutor&apos;s model providers. A saved key is used instead of the server&apos;s for its
        provider, stored encrypted, and never shown again once saved: only the last four characters are.
      </p>
      {!reachable && (
        <p role="status" className="rounded-lg border-2 border-warn bg-warn-tint px-3.5 py-2.5 text-[14px] text-text">
          Your saved keys could not be read: the database is unreachable. The server&apos;s keys still work.
        </p>
      )}
      <ul className="flex flex-col divide-y-2 divide-border">
        {rows.map((row) => (
          <ProviderRow key={row.id} row={row} disabled={!reachable} />
        ))}
      </ul>
    </Card>
  );
}

function ProviderRow({ row, disabled }: { row: ProviderKeyRow; disabled: boolean }) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "busy";
  // The key form is in the page only while it is open, and for its fold's
  // 300ms on the way out: a password field kept in the page all along is one
  // a browser may autofill with the sign-in password nobody meant for it.
  const form = usePresence(editing, 300);

  const testButton = useRef<HTMLButtonElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const keyField = useRef<HTMLInputElement>(null);
  const removeConfirm = useRef<HTMLButtonElement>(null);
  const cancelRemove = useRef<HTMLButtonElement>(null);
  // The control to focus once the change it follows has rendered (a fold
  // that was inert takes no focus before then): a ref, so setting it renders
  // nothing by itself.
  // The ref itself, not its element: the key field is not mounted yet when
  // the button that opens its form is pressed.
  const focusNext = useRef<{ current: HTMLElement | null } | null>(null);
  useEffect(() => {
    if (focusNext.current === null || busy) return;
    focusNext.current.current?.focus();
    focusNext.current = null;
  }, [editing, confirmingRemove, busy]);
  const after = (target: { current: HTMLElement | null }) => {
    focusNext.current = target;
  };

  const saved = row.saved;
  const unreadable = saved !== null && !saved.readable;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const key = draft;
    // Out of state before the request goes, so the key is held nowhere but
    // the one request carrying it.
    setDraft("");
    setStatus({ kind: "busy", what: "Saving…" });
    const reply = await sendJson<Reply>("POST", "/api/learner/provider-key", { provider: row.id, key });
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
      // Save was disabled while the request was out; back to the field.
      after(keyField);
      return setStatus({
        kind: "error",
        message: reply === null ? "Not saved: the server did not answer." : (reply.data.error ?? `Not saved (HTTP ${reply.status}).`),
      });
    }
    after(editButton);
    setEditing(false);
    setStatus({ kind: "done", message: "Saved. Test it to check the provider accepts it." });
    router.refresh();
  };

  const remove = async () => {
    setStatus({ kind: "busy", what: "Removing…" });
    const reply = await sendJson<Reply>("DELETE", "/api/learner/provider-key", { provider: row.id });
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
      after(removeConfirm);
      return setStatus({
        kind: "error",
        message: reply === null ? "Not removed: the server did not answer." : (reply.data.error ?? `Not removed (HTTP ${reply.status}).`),
      });
    }
    // Remove goes with the key; the button that adds one is where focus lands.
    after(editButton);
    setConfirmingRemove(false);
    setStatus({ kind: "done", message: "Removed." });
    router.refresh();
  };

  const test = async () => {
    // Disabled while the request is out, so focus would drop; it comes back.
    after(testButton);
    setStatus({ kind: "busy", what: "Testing…" });
    const reply = await sendJson<Reply>("POST", "/api/learner/provider-key/test", { provider: row.id });
    if (reply === null) return setStatus({ kind: "error", message: "Not tested: the server did not answer." });
    const whose = reply.data.source === "server" ? "The server's key" : "Your key";
    const tested = reply.data.tested ? ` Tested with ${reply.data.tested}.` : "";
    if (reply.status === 200 && reply.data.ok === true) {
      const answered = reply.data.model && reply.data.model !== reply.data.tested ? `, answered by ${reply.data.model}` : "";
      return setStatus({ kind: "done", message: `${whose} works${answered}.${tested}` });
    }
    if (reply.status === 200) {
      // No status is no answer at all (a timeout, a refused connection), not a refusal.
      const outcome = typeof reply.data.status === "number" ? `was refused (HTTP ${reply.data.status})` : "could not be tested";
      const reason = (reply.data.message ?? "no reason given").replace(/\.$/, "");
      return setStatus({ kind: "error", message: `${whose} ${outcome}: ${reason}.${tested}` });
    }
    setStatus({ kind: "error", message: reply.data.error ?? `Not tested (HTTP ${reply.status}).` });
  };

  const state = saved === null
    ? row.server
      ? "Using the server's key."
      : "No key. The tutor skips this provider."
    : unreadable
      ? "Your saved key can no longer be read, most likely because the server's secret changed. Re-enter this key."
      : `Your key, ending ${saved.last4}. Saved ${saved.savedOn}.`;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-2 last:pb-0" aria-labelledby={`${id}-name`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
        <div className="flex min-w-0 flex-col gap-0.5 md:w-[320px] md:shrink-0">
          <p id={`${id}-name`} className="text-[14px] font-medium text-text">
            {row.label}
          </p>
          <p className="text-[12px] break-all text-text2">{row.test.model}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={cx("text-[14px]", unreadable ? "text-danger" : "text-text")}>{state}</p>
          {row.inUse !== null && !row.test.used && (
            <p className="mt-2.5 text-[12px] text-text2">
              Your models don&apos;t include {row.label}, so the tutor isn&apos;t using this key. Test sends the built-in
              default, {row.test.model}.
            </p>
          )}
          <Collapse open={!editing && !confirmingRemove} className="pt-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              {row.inUse !== null && (
                <Button
                  ref={testButton}
                  variant="secondary"
                  size="sm"
                  disabled={busy || (disabled && row.inUse === "saved")}
                  onClick={() => void test()}
                >
                  Test
                </Button>
              )}
              <Button
                ref={editButton}
                variant="secondary"
                size="sm"
                disabled={busy || disabled}
                onClick={() => {
                  after(keyField);
                  setEditing(true);
                  setStatus({ kind: "idle" });
                }}
              >
                {saved === null ? "Add your key" : unreadable ? "Re-enter" : "Replace"}
              </Button>
              {saved !== null && (
                <Button
                  ref={removeButton}
                  variant="secondary"
                  size="sm"
                  disabled={busy || disabled}
                  onClick={() => {
                    after(cancelRemove);
                    setConfirmingRemove(true);
                    setStatus({ kind: "idle" });
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </Collapse>
          <Collapse open={editing} className="pt-2.5">
            {form.mounted && (
              <form onSubmit={(e) => void save(e)} className="flex flex-col gap-2.5" aria-label={`${row.label} key`}>
                <FormRow
                  id={`${id}-key`}
                  label="API key"
                  hint={`Paste the key from your ${row.label} account. It is sent once and cannot be shown again.`}
                >
                  {({ id: field, describedBy }) => (
                    <Input
                      ref={keyField}
                      id={field}
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
                  <Button type="submit" size="sm" disabled={busy || draft.trim() === ""}>
                    Save key
                  </Button>
                  {/* Not while a save is in flight: the request has left, so
                      closing the editor would say "cancelled" about a key that
                      is about to be stored. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setDraft("");
                      after(editButton);
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </Collapse>
          <Collapse open={confirmingRemove} className="pt-2.5">
            <div role="group" aria-label={`Confirm removing the ${row.label} key`} className="flex flex-col gap-3 rounded-2xl border-2 border-warn bg-warn-tint p-4">
              <p className="text-[14px] text-text">
                Remove your {row.label} key?{" "}
                {row.server ? "The tutor goes back to the server's key." : "The tutor stops using this provider."}
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Button ref={removeConfirm} variant="warn" size="sm" disabled={busy} onClick={() => void remove()}>
                  Remove key
                </Button>
                <Button
                  ref={cancelRemove}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    after(removeButton);
                    setConfirmingRemove(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Collapse>
          <LiveStatus
            text={status.kind === "busy" ? status.what : status.kind === "idle" ? null : status.message}
            tone={status.kind === "done" ? "ok" : status.kind === "error" ? "danger" : "muted"}
            className="pt-2.5"
          />
        </div>
      </div>
    </li>
  );
}
