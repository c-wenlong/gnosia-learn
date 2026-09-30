"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cx } from "@/components/ui/classes";
import type { ProviderKeyView } from "@/lib/provider-keys/settings";

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
}

async function send(method: "POST" | "DELETE", path: string, body: unknown): Promise<{ status: number; data: Reply } | null> {
  try {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return { status: response.status, data: (await response.json().catch(() => ({}))) as Reply };
  } catch {
    return null;
  }
}

export function ProviderKeys({ rows, reachable }: { rows: ProviderKeyView[]; reachable: boolean }) {
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

function ProviderRow({ row, disabled }: { row: ProviderKeyView; disabled: boolean }) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "busy";

  const saved = row.saved;
  const unreadable = saved !== null && !saved.readable;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const key = draft;
    // Out of state before the request goes, so the key is held nowhere but
    // the one request carrying it.
    setDraft("");
    setStatus({ kind: "busy", what: "Saving…" });
    const reply = await send("POST", "/api/learner/provider-key", { provider: row.id, key });
    if (reply === null) return setStatus({ kind: "error", message: "Not saved: the server did not answer." });
    if (reply.status !== 200 || reply.data.ok !== true) {
      return setStatus({ kind: "error", message: reply.data.error ?? `Not saved (HTTP ${reply.status}).` });
    }
    setEditing(false);
    setStatus({ kind: "done", message: "Saved. Test it to check the provider accepts it." });
    router.refresh();
  };

  const remove = async () => {
    setStatus({ kind: "busy", what: "Removing…" });
    const reply = await send("DELETE", "/api/learner/provider-key", { provider: row.id });
    if (reply === null) return setStatus({ kind: "error", message: "Not removed: the server did not answer." });
    if (reply.status !== 200 || reply.data.ok !== true) {
      return setStatus({ kind: "error", message: reply.data.error ?? `Not removed (HTTP ${reply.status}).` });
    }
    setConfirmingRemove(false);
    setStatus({ kind: "done", message: "Removed." });
    router.refresh();
  };

  const test = async () => {
    setStatus({ kind: "busy", what: "Testing…" });
    const reply = await send("POST", "/api/learner/provider-key/test", { provider: row.id });
    if (reply === null) return setStatus({ kind: "error", message: "Not tested: the server did not answer." });
    const whose = reply.data.source === "server" ? "The server's key" : "Your key";
    if (reply.status === 200 && reply.data.ok === true) {
      return setStatus({ kind: "done", message: `${whose} works${reply.data.model ? ` (${reply.data.model})` : ""}.` });
    }
    if (reply.status === 200) {
      const code = typeof reply.data.status === "number" ? ` (HTTP ${reply.data.status})` : "";
      return setStatus({ kind: "error", message: `${whose} was refused${code}: ${reply.data.message ?? "no reason given."}` });
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
          <p className="text-[12px] text-text2">{row.model}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <p className={cx("text-[14px]", unreadable ? "text-danger" : "text-text")}>{state}</p>
          {!editing && !confirmingRemove && (
            <div className="flex flex-wrap items-center gap-2.5">
              {row.inUse !== null && (
                <Button variant="secondary" size="sm" disabled={busy || (disabled && row.inUse === "saved")} onClick={() => void test()}>
                  Test
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={busy || disabled}
                onClick={() => {
                  setEditing(true);
                  setStatus({ kind: "idle" });
                }}
              >
                {saved === null ? "Add your key" : unreadable ? "Re-enter" : "Replace"}
              </Button>
              {saved !== null && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || disabled}
                  onClick={() => {
                    setConfirmingRemove(true);
                    setStatus({ kind: "idle" });
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          )}
          {editing && (
            <form onSubmit={(e) => void save(e)} className="flex flex-col gap-2.5" aria-label={`${row.label} key`}>
              <label htmlFor={`${id}-key`} className="text-[12px] text-text2">
                Paste the key from your {row.label} account. It is sent once and cannot be shown again.
              </label>
              <Input
                id={`${id}-key`}
                type="password"
                name={`${row.id}-api-key`}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="API key"
              />
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
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {confirmingRemove && (
            <div role="group" aria-label={`Confirm removing the ${row.label} key`} className="flex flex-col gap-3 rounded-2xl border-2 border-warn bg-warn-tint p-4">
              <p className="text-[14px] text-text">
                Remove your {row.label} key?{" "}
                {row.server ? "The tutor goes back to the server's key." : "The tutor stops using this provider."}
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Button variant="warn" size="sm" disabled={busy} onClick={() => void remove()}>
                  Remove key
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmingRemove(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <p aria-live="polite" className={cx("text-[12px]", status.kind === "idle" && "sr-only")}>
            {status.kind === "busy" && <span className="text-text3">{status.what}</span>}
            {status.kind === "done" && <span className="text-ok-text">{status.message}</span>}
            {status.kind === "error" && <span className="text-danger">{status.message}</span>}
          </p>
        </div>
      </div>
    </li>
  );
}
