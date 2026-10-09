"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Collapse } from "@/components/ui/Collapse";
import { Combobox } from "@/components/ui/Combobox";
import { FormRow } from "@/components/ui/FormRow";
import { Glyph } from "@/components/ui/Glyph";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { cx } from "@/components/ui/classes";
import type { ChainEntry } from "@/lib/agent/providers";
import type { ProviderRowView, ProvidersView } from "@/lib/providers/view";
import { sendJson } from "@/lib/send-json";

/**
 * The Models card (docs/TUTOR-MODELS.md, T15): the tutor's model chain,
 * grouped by provider, in the order the tutor tries it — each provider's
 * models top to bottom, then the next provider's. This is the whole call
 * set: nothing built-in, nothing implicit, a model is called only because
 * it sits here. Keys live on the Providers card above; this one only
 * answers which models each keyed provider serves.
 */

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

interface Reply {
  ok?: boolean;
  error?: string;
  chain?: ChainEntry[];
  models?: { id: string; free?: boolean }[];
  message?: string;
  served?: string;
  model?: string;
  source?: string;
  status?: number | null;
}

type ListState =
  | { state: "loading" }
  | { state: "ready"; models: { id: string; free?: boolean }[] }
  | { state: "error"; message: string };

const tone = (s: Status) => (s.kind === "done" ? "ok" : s.kind === "error" ? "danger" : "muted");
const textOf = (s: Status) => (s.kind === "idle" ? null : s.text);
const failure = (what: string, reply: { status: number; data: Reply } | null) =>
  reply === null ? `Not ${what}: the server did not answer.` : (reply.data.error ?? `Not ${what} (HTTP ${reply.status}).`);

const NO_MODELS: { value: string; label: string; detail?: string }[] = [];

export function TutorModels({ view }: { view: ProvidersView }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const disabled = !view.chainReachable;
  return (
    <Card title="Tutor models">
      <p className="text-[14px] text-text2">
        {"The models the tutor calls, in order: each provider's top to bottom, then the next provider's. Nothing is called that is not here."}
      </p>
      {!view.chainReachable && (
        <p className="text-[13px] text-danger">Your models could not be read: the database is unreachable. The tutor cannot call anything until they are back.</p>
      )}
      {view.rows.length === 0 ? (
        <p className="text-[14px] text-text">No connected providers. Connect one above to add models.</p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-border">
          {view.rows.map((row, index) => (
            <ModelRow
              key={row.id}
              row={row}
              first={index === 0 || view.rows[index - 1]?.models.length === 0}
              last={index === view.rows.length - 1 || view.rows[index + 1]?.models.length === 0}
              full={view.full}
              disabled={disabled}
              onNote={(kind, text) => setStatus({ kind, text })}
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

/** A provider's slice of the chain: its models in order, plus the provider's own place in that order. */
function ModelRow({
  row,
  first,
  last,
  full,
  disabled,
  onNote,
}: {
  row: ProviderRowView;
  first: boolean;
  last: boolean;
  full: boolean;
  disabled: boolean;
  onNote: (kind: Status["kind"], text: string) => void;
}) {
  const router = useRouter();
  const base = useId();
  const [expanded, setExpanded] = useState(row.models.length === 0);
  const [busy, setBusy] = useState(false);

  const moveProvider = async (direction: "up" | "down") => {
    setBusy(true);
    onNote("busy", "Moving…");
    const reply = await sendJson<Reply>("PATCH", "/api/learner/tutor-model/provider", { provider: row.id, direction });
    setBusy(false);
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) return onNote("error", failure("moved", reply));
    onNote("done", `${row.label} moved ${direction}.`);
    router.refresh();
  };

  const keyed = row.inUse !== null;
  return (
    <li className="flex flex-col py-4 first:pt-2 last:pb-0" aria-labelledby={`${base}-name`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
          <p id={`${base}-name`} className="text-[14px] font-medium text-text">
            {row.label}
          </p>
          <p className={cx("text-[12px]", !keyed && row.models.length > 0 ? "text-danger" : "text-text2")}>
            {row.models.length === 0 ? "No models" : `${row.models.length} ${row.models.length === 1 ? "model" : "models"}`}
            {!keyed ? " — no key, so the tutor skips them" : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.models.length > 0 && (
            <>
              <Button
            id={`${base}-up`}
            variant="secondary"
            size="sm"
            className="w-9 px-0"
            aria-label={`Move ${row.label} up`}
            title="Move up"
            disabled={disabled || busy || first || row.models.length === 0}
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
            disabled={disabled || busy || last || row.models.length === 0}
            onClick={() => void moveProvider("down")}
          >
            <Glyph name="down" size={16} />
          </Button>
            </>
          )}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${base}-models`}
            aria-label={`${expanded ? "Hide" : "Show"} ${row.label} models`}
            title={expanded ? "Hide models" : "Show models"}
            onClick={() => setExpanded((was) => !was)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text2 transition-colors duration-100 hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Glyph name="expand" size={18} className={cx("transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")} />
          </button>
        </div>
      </div>
      <Collapse open={expanded} id={`${base}-models`}>
        <Models row={row} keyed={keyed} full={full} disabled={disabled} visible={expanded} />
      </Collapse>
    </li>
  );
}

/** A provider's models, under its row: each with Test, Move up, Move down and Remove, then Add model. */
function Models({ row, keyed, full, disabled, visible }: { row: ProviderRowView; keyed: boolean; full: boolean; disabled: boolean; visible: boolean }) {
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
        text: next.length === 0 ? `Removed ${m}. The tutor has nothing to call until you add a model.` : `Removed ${m}.`,
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
  const reason = !keyed ? `Add a ${row.label} key in Providers above.` : full ? "The tutor keeps at most 10 models. Remove one first." : undefined;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-surface2 p-4">
      {row.models.length === 0 ? (
        <p className="text-[13px] text-text2">No models yet — add one below for the tutor to call {row.label}.</p>
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
