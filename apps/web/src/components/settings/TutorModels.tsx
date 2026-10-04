"use client";

import { providerLabel, TUTOR_MODEL_LIMITS, type ProviderId } from "@self-learn/schema/shared";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Collapse } from "@/components/ui/Collapse";
import { Input } from "@/components/ui/Input";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { cx, inputClasses, LABEL } from "@/components/ui/classes";
import type { TutorModelsView } from "@/lib/tutor-models/settings";

/**
 * The Models card (docs/TUTOR-MODELS.md): the owner's model chain, the
 * provider and model pairs the tutor tries top to bottom, with Add, Test,
 * Move up, Move down and Remove. Every control is a button or a form field,
 * so the whole card works by keyboard; after a move or a remove, focus goes
 * back to the entry it acted on (or the one that took its place).
 *
 * The card is handed provider names, model ids and where each provider's key
 * comes from, never a key. A model list is fetched on the server
 * (`/api/learner/tutor-model/models`) when the Add form opens. The last Test
 * result per entry lives in this component's state only.
 *
 * Nothing swaps in a frame: an entry that arrives (added, or moved, which
 * re-inserts its row) fades in; Add a model and its form fold into each
 * other (`Collapse`); the status line glides (`LiveStatus`).
 */

type Entry = TutorModelsView["chain"][number];

interface Reply {
  ok?: boolean;
  error?: string;
  code?: string;
  chain?: Entry[];
  models?: { id: string; free?: boolean }[];
  message?: string;
  served?: string;
  source?: string;
  status?: number | null;
}

async function send(method: "POST" | "DELETE" | "PATCH", path: string, body: unknown): Promise<{ status: number; data: Reply } | null> {
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

const keyOf = (e: Entry) => `${e.provider}/${e.model}`;

type Notice = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };
type ListState =
  | { state: "loading" }
  | { state: "ready"; models: { id: string; free?: boolean }[] }
  | { state: "error"; message: string };

export function TutorModels({ view }: { view: TutorModelsView }) {
  const router = useRouter();
  const base = useId();
  const [chain, setChain] = useState<Entry[]>(view.chain);
  const [seen, setSeen] = useState(view.chain);
  if (seen !== view.chain) {
    // A refresh from the server is the truth; take it.
    setSeen(view.chain);
    setChain(view.chain);
  }
  const [tests, setTests] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>({ kind: "idle" });
  // The control to focus once the change it follows has rendered: a ref, not
  // state, since setting it must not render anything by itself.
  const focusNext = useRef<string | null>(null);

  const keyed = new Map(view.providers.map((p) => [p.id, p]));
  const usable = view.providers.filter((p) => p.key !== null);
  const full = chain.length >= TUTOR_MODEL_LIMITS.maxEntries;
  const idFor = (e: Entry, action: string) => `${base}-${keyOf(e)}-${action}`;

  useEffect(() => {
    if (focusNext.current === null || busy !== null) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  }, [chain, busy]);

  /**
   * Send one change and take the chain it answers with. `pressed` is the
   * button that sent it, disabled while the request is out, so focus goes
   * back to it on a failure; `landed` says what to announce and focus once
   * the new chain renders. Both are set before the state that renders them.
   */
  const change = async (
    method: "DELETE" | "PATCH",
    entry: Entry,
    extra: Record<string, unknown>,
    busyText: string,
    pressed: string,
    landed: (next: Entry[]) => { text: string; focus: string },
  ) => {
    setBusy(keyOf(entry));
    setNotice({ kind: "busy", text: busyText });
    const reply = await send(method, "/api/learner/tutor-model", { provider: entry.provider, model: entry.model, ...extra });
    if (reply === null || reply.status !== 200 || reply.data.ok !== true || reply.data.chain === undefined) {
      focusNext.current = pressed;
      setNotice({
        kind: "error",
        text: reply === null ? "Not changed: the server did not answer." : (reply.data.error ?? `Not changed (HTTP ${reply.status}).`),
      });
      setBusy(null);
      return;
    }
    const next = reply.data.chain;
    const { text, focus } = landed(next);
    focusNext.current = focus;
    setNotice({ kind: "done", text });
    setChain(next);
    setBusy(null);
    router.refresh();
  };

  const move = (entry: Entry, direction: "up" | "down") =>
    change("PATCH", entry, { direction }, "Moving…", idFor(entry, direction), (next) => {
      const at = next.findIndex((e) => keyOf(e) === keyOf(entry));
      // Keep focus on the button pressed, unless the entry reached that end and it is now disabled.
      const atEnd = direction === "up" ? at === 0 : at === next.length - 1;
      return {
        text: `${entry.model} is now number ${at + 1} of ${next.length}.`,
        focus: idFor(entry, atEnd ? (direction === "up" ? "down" : "up") : direction),
      };
    });

  const remove = (entry: Entry) => {
    const at = chain.findIndex((e) => keyOf(e) === keyOf(entry));
    return change("DELETE", entry, {}, "Removing…", idFor(entry, "remove"), (next) => {
      setTests((t) => {
        const rest = { ...t };
        delete rest[keyOf(entry)];
        return rest;
      });
      const neighbour = next[Math.min(at, next.length - 1)];
      return {
        text: next.length === 0 ? `Removed ${entry.model}. The tutor is back on the built-in defaults.` : `Removed ${entry.model}.`,
        focus: neighbour === undefined ? `${base}-open` : idFor(neighbour, "remove"),
      };
    });
  };

  const test = async (entry: Entry) => {
    const key = keyOf(entry);
    setBusy(key);
    setNotice({ kind: "busy", text: `Testing ${entry.model}…` });
    const reply = await send("POST", "/api/learner/tutor-model/test", { provider: entry.provider, model: entry.model });
    let result: { ok: boolean; text: string };
    if (reply === null) result = { ok: false, text: "Not tested: the server did not answer." };
    else if (reply.status === 200 && reply.data.ok === true) {
      result = { ok: true, text: `Works${reply.data.served && reply.data.served !== entry.model ? `, answered by ${reply.data.served}` : ""}.` };
    } else if (reply.status === 200) {
      // No status is no answer at all (a timeout, a refused connection), not a refusal.
      const outcome = typeof reply.data.status === "number" ? `Refused (HTTP ${reply.data.status})` : "No answer";
      result = { ok: false, text: `${outcome}: ${reply.data.message ?? "no reason given."}` };
    } else result = { ok: false, text: reply.data.error ?? `Not tested (HTTP ${reply.status}).` };
    focusNext.current = idFor(entry, "test");
    setTests((t) => ({ ...t, [key]: result }));
    setNotice({ kind: result.ok ? "done" : "error", text: `${entry.model}: ${result.text}` });
    setBusy(null);
  };

  return (
    <Card title="Models">
      {chain.length === 0 ? (
        <div className="flex flex-col gap-2 text-[14px] text-text2">
          <p>
            The tutor is using the built-in defaults until you add a model.{" "}
            {view.defaults.length > 0 ? "It tries them in this order:" : "No provider has a key yet, so it cannot answer: add one under Provider keys."}
          </p>
          {view.defaults.length > 0 && (
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-text">
              {view.defaults.map((d) => (
                <li key={d.id} className="break-all">
                  {d.label}, {d.model}{" "}
                  <span className="text-text2">({d.key === "saved" ? "your key" : "server key"})</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <p className="text-[14px] text-text2">
          The tutor tries these top to bottom and stops at the first that answers. The built-in defaults are not used
          while this list has a model.
        </p>
      )}
      {!view.reachable && (
        <p role="status" className="rounded-lg border-2 border-warn bg-warn-tint px-3.5 py-2.5 text-[14px] text-text">
          Your models could not be read: the database is unreachable. The tutor is using the built-in defaults.
        </p>
      )}
      {chain.length > 0 && (
        <ol className="flex flex-col divide-y-2 divide-border">
          {chain.map((entry, index) => {
            const key = keyOf(entry);
            const provider = keyed.get(entry.provider);
            const last = tests[key];
            const rowBusy = busy !== null;
            return (
              <li
                key={key}
                className="flex animate-fade-in flex-col gap-2.5 py-3.5 first:pt-1 last:pb-0 motion-reduce:animate-none md:flex-row md:items-start md:gap-4"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <span aria-hidden className="w-5 shrink-0 pt-px text-[14px] font-semibold text-text2 tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p id={`${base}-${key}-name`} className="text-[14px] font-medium break-all text-text">
                      {entry.model}
                    </p>
                    <p className={cx("text-[12px]", provider?.key ? "text-text2" : "text-danger")}>
                      {provider?.label ?? providerLabel(entry.provider)}
                      {", "}
                      {provider?.key === "saved"
                        ? "your key"
                        : provider?.key === "server"
                          ? "server key"
                          : `no key for ${provider?.label ?? providerLabel(entry.provider)}, so the tutor skips it`}
                    </p>
                    {last !== undefined && (
                      <p
                        key={last.text}
                        className={cx("animate-fade-in text-[12px] motion-reduce:animate-none", last.ok ? "text-ok-text" : "text-danger")}
                      >
                        Last test: {last.text}
                      </p>
                    )}
                  </div>
                </div>
                <div role="group" aria-labelledby={`${base}-${key}-name`} className="flex flex-wrap gap-2 pl-8 md:pl-0">
                  <Button id={idFor(entry, "test")} variant="secondary" size="sm" disabled={rowBusy || !provider?.key} onClick={() => void test(entry)}>
                    Test
                  </Button>
                  <Button
                    id={idFor(entry, "up")}
                    variant="secondary"
                    size="sm"
                    aria-label={`Move ${entry.model} up`}
                    disabled={rowBusy || index === 0}
                    onClick={() => void move(entry, "up")}
                  >
                    Move up
                  </Button>
                  <Button
                    id={idFor(entry, "down")}
                    variant="secondary"
                    size="sm"
                    aria-label={`Move ${entry.model} down`}
                    disabled={rowBusy || index === chain.length - 1}
                    onClick={() => void move(entry, "down")}
                  >
                    Move down
                  </Button>
                  <Button
                    id={idFor(entry, "remove")}
                    variant="secondary"
                    size="sm"
                    aria-label={`Remove ${entry.model}`}
                    disabled={rowBusy}
                    onClick={() => void remove(entry)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <AddModel
        base={base}
        usable={usable}
        full={full}
        disabled={!view.reachable || busy !== null}
        onAdded={(next, model) => {
          setChain(next);
          setNotice({ kind: "done", text: `Added ${model}. Test it to check the provider answers.` });
          router.refresh();
        }}
      />
      {/* The card's gap would stay behind a shut status, so the space above it folds with it. */}
      <div className="-mt-3">
        <LiveStatus
          text={notice.kind === "idle" ? null : notice.text}
          tone={notice.kind === "done" ? "ok" : notice.kind === "error" ? "danger" : "muted"}
          className="pt-3"
        />
      </div>
    </Card>
  );
}

function AddModel({
  base,
  usable,
  full,
  disabled,
  onAdded,
}: {
  base: string;
  usable: TutorModelsView["providers"];
  full: boolean;
  disabled: boolean;
  onAdded: (chain: Entry[], model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId | "">(usable[0]?.id ?? "");
  const [model, setModel] = useState("");
  const [lists, setLists] = useState<Partial<Record<ProviderId, ListState>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Opening the form focuses the model field, and so does a failed add;
  // closing it focuses the button that opens it again. Focused once the change has rendered, not before: a focus
  // call on an element React has not committed yet goes nowhere.
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    if (focusAfter.current === null) return;
    document.getElementById(focusAfter.current)?.focus();
    focusAfter.current = null;
  }, [open, saving]);

  const chosen = usable.find((p) => p.id === provider) ?? usable[0];
  const list = chosen === undefined ? undefined : lists[chosen.id];

  /**
   * Ask the server for a provider's list, at most once per provider each
   * time the form opens. Asking again on the next open, not once per page:
   * a key replaced in Settings since the last ask is a different account,
   * and the server's cache misses under a new key while answering from
   * memory otherwise. Switching provider back and forth inside one open
   * reuses what was asked, so it cannot spend the route's rate limit; a list
   * that failed is asked again. A reply from an earlier open is dropped.
   */
  const opened = useRef(0);
  const asked = useRef<Partial<Record<ProviderId, number>>>({});
  const load = async (id: ProviderId) => {
    const token = opened.current;
    if (asked.current[id] === token) return;
    asked.current[id] = token;
    setLists((l) => ({ ...l, [id]: { state: "loading" } }));
    const reply = await send("POST", "/api/learner/tutor-model/models", { provider: id });
    if (asked.current[id] !== token) return;
    const next: ListState =
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
            };
    // A failed ask does not count as asked: switching back, or Try again,
    // asks once more.
    if (next.state === "error") delete asked.current[id];
    setLists((l) => ({ ...l, [id]: next }));
  };

  const openForm = () => {
    opened.current += 1;
    focusAfter.current = `${base}-model`;
    setOpen(true);
    setError(null);
    if (chosen !== undefined) {
      setProvider(chosen.id);
      void load(chosen.id);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (chosen === undefined) return;
    setSaving(true);
    setError(null);
    const reply = await send("POST", "/api/learner/tutor-model", { provider: chosen.id, model });
    if (reply === null || reply.status !== 200 || reply.data.ok !== true || reply.data.chain === undefined) {
      // The Add button was disabled while the request was out, so focus went
      // nowhere; put it back in the field the person has to correct.
      focusAfter.current = `${base}-model`;
      setError(reply === null ? "Not added: the server did not answer." : (reply.data.error ?? `Not added (HTTP ${reply.status}).`));
      setSaving(false);
      return;
    }
    const added = model.trim();
    setModel("");
    focusAfter.current = `${base}-open`;
    setOpen(false);
    setSaving(false);
    onAdded(reply.data.chain, added);
  };

  const reason = usable.length === 0 ? "Add a provider key first." : full ? `The chain holds at most ${TUTOR_MODEL_LIMITS.maxEntries} models.` : undefined;
  const listId = `${base}-models`;
  // The button and the form take turns in one place, each in a fold, so one
  // closes as the other opens; both stay mounted, the shut one inert.
  return (
    <div>
      <Collapse open={!open}>
        <Button id={`${base}-open`} variant="secondary" size="sm" disabled={disabled || reason !== undefined} disabledReason={reason} onClick={openForm}>
          Add a model
        </Button>
      </Collapse>
      <Collapse open={open}>
        <form onSubmit={(e) => void submit(e)} aria-label="Add a model" className="flex flex-col gap-3 rounded-2xl border-2 border-border p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${base}-provider`} className={LABEL}>
              Provider
            </label>
            <select
              id={`${base}-provider`}
              value={chosen?.id ?? ""}
              onChange={(e) => {
                const id = e.target.value as ProviderId;
                setProvider(id);
                void load(id);
              }}
              className={inputClasses({ className: "cursor-pointer" })}
            >
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.key === "saved" ? "your key" : "server key"})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${base}-model`} className={LABEL}>
              Model
            </label>
            <Input
              id={`${base}-model`}
              name="model"
              list={list?.state === "ready" ? listId : undefined}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model id"
              aria-describedby={`${base}-list-state`}
              aria-invalid={error !== null}
            />
            {list?.state === "ready" && (
              <datalist id={listId}>
                {list.models.map((m) => (
                  <option key={m.id} value={m.id} label={m.free ? "free" : undefined} />
                ))}
              </datalist>
            )}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <p id={`${base}-list-state`} aria-live="polite" className="text-[12px] text-text2">
                {list === undefined || list.state === "loading"
                  ? `Loading ${chosen?.label ?? "the provider"}'s models…`
                  : list.state === "ready"
                    ? list.models.length > 0
                      ? `${list.models.length} ${list.models.length === 1 ? "model" : "models"} from ${chosen?.label}. Start typing to pick one, or type any model id.`
                      : `${chosen?.label} listed no models. Type a model id.`
                    : `The list could not be loaded (${list.message}). Type a model id.`}
              </p>
              {list?.state === "error" && chosen !== undefined && (
                <Button variant="ghost" size="sm" onClick={() => void load(chosen.id)}>
                  Try again
                </Button>
              )}
            </div>
          </div>
          {error !== null && (
            <p role="alert" className="animate-fade-in text-[12px] text-danger motion-reduce:animate-none">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" size="sm" disabled={saving || disabled || model.trim() === ""}>
              Add model
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => {
                focusAfter.current = `${base}-open`;
                setOpen(false);
                setModel("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Collapse>
    </div>
  );
}
