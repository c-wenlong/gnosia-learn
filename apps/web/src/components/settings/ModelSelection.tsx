"use client";

import { PREFERENCE_KEYS } from "@gnosia/schema/shared";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ByokConfig } from "@/components/studio/ByokConfig";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Combobox } from "@/components/ui/Combobox";
import { FormRow } from "@/components/ui/FormRow";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { Select } from "@/components/ui/Select";
import { statusProps } from "@/components/ui/save-status";
import type { ChainEntry } from "@/lib/agent/providers";
import { TUTOR_STYLES, type TutorStyle } from "@/lib/preferences";
import type { ProvidersView } from "@/lib/providers/view";
import { sendJson } from "@/lib/send-json";

import { usePreference } from "./SettingsForm";

/**
 * The Model selection card: what the saved providers run. The tutor's side
 * is a style select and one provider-and-model pick — the model the tutor
 * calls, chosen off the provider's own `/models` list or typed, saved as the
 * whole chain it replaces. The Studio chats side is `ByokConfig` trimmed to
 * selection (`manageKeys` off): a connected provider's pick and its
 * Lite/Default/Max models, its key coming from the Providers card above.
 * It is drawn only with `studio` (the server's `studioEnabled()`): without
 * the studio, its runner's `/studio/api/settings/byok` answers 404 and the
 * picker would say Loading for good.
 */

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

interface Reply {
  ok?: boolean;
  error?: string;
  chain?: ChainEntry[];
  models?: { id: string; free?: boolean }[];
  message?: string;
  served?: string;
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

export function ModelSelection({
  view,
  chain,
  tutorStyle,
  savedForTutor,
  studio,
}: {
  view: ProvidersView;
  /** The tutor's chain as the server read it; the first entry is the pick the tutor uses. */
  chain: ChainEntry[];
  tutorStyle: TutorStyle;
  /** BYOK preset names with a key saved on the Providers card — listed so they connect with that key, no re-typing (D95). */
  savedForTutor: string[];
  /** `studioEnabled()` on the server: whether to draw the Studio chats side at all. */
  studio: boolean;
}) {
  const style = usePreference<TutorStyle>(PREFERENCE_KEYS.tutorStyle, tutorStyle);
  return (
    <Card title="Model selection">
      <p className="text-[14px] text-text2">
        {studio ? "The model the tutor calls and the provider Studio chats run on." : "The model the tutor calls."} Keys
        live on the Providers card above.
      </p>
      <div className="flex flex-col gap-3">
        <p className="text-[14px] font-medium text-text">Tutor</p>
        <FormRow
          layout="inline"
          label="Tutor style"
          hint="Used by the concept tutor and the questions in a session, from the next message."
          status={statusProps(style.status)}
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              label="Tutor style"
              describedBy={describedBy}
              options={TUTOR_STYLES.map((t) => ({ value: t.id, label: t.label }))}
              value={style.value}
              onChange={(v) => style.save(v as TutorStyle)}
            />
          )}
        </FormRow>
        <TutorPick view={view} chain={chain} />
      </div>
      {studio && (
        <div className="flex flex-col gap-3 border-t-2 border-border pt-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-[14px] font-medium text-text">Studio chats</p>
            <p className="text-[12px] text-text2">
              The provider chats run on, and the Lite, Default and Max models the picker offers. Connecting a provider
              uses the key saved above, no re-typing.
            </p>
          </div>
          <ByokConfig manageKeys={false} savedForTutor={savedForTutor} />
        </div>
      )}
    </Card>
  );
}

/** The tutor's one pick: a provider with a key, then one of its models — saved as the whole chain. */
function TutorPick({ view, chain }: { view: ProvidersView; chain: ChainEntry[] }) {
  const router = useRouter();
  const base = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const busy = status.kind === "busy";
  const disabled = !view.chainReachable;
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (focusNext.current === null || busy) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  }, [busy, chain]);

  const keyed = view.rows.filter((row) => row.inUse !== null);
  const current = chain[0];
  const [provider, setProvider] = useState<ChainEntry["provider"] | "">(current?.provider ?? "");
  const [model, setModel] = useState(current?.model ?? "");
  // The fields follow the saved pick until the person changes them: a row
  // deleted above refreshes the chain without its entry, and a field still
  // showing that pick moves on with it rather than keeping a deleted model.
  const savedPick = useRef(chain[0]);
  useEffect(() => {
    const first = chain[0];
    const was = savedPick.current;
    savedPick.current = first;
    if (provider === (was?.provider ?? "") && model === (was?.model ?? "")) {
      setProvider(first?.provider ?? "");
      setModel(first?.model ?? "");
    }
  }, [chain, provider, model]);

  // The provider's model list, asked once per provider and again when its
  // key changes: a replaced key is another account, and the server's cache
  // is keyed by the key. Only the newest ask's answer is shown.
  const row = keyed.find((r) => r.id === provider);
  const keyStamp = `${provider}:${row?.inUse ?? ""}:${row?.saved?.last4 ?? ""}:${row?.saved?.savedOn ?? ""}`;
  const asked = useRef<string | null>(null);
  const latest = useRef(0);
  const [list, setList] = useState<ListState | null>(null);
  const load = async () => {
    const ask = ++latest.current;
    setList({ state: "loading" });
    const reply = await sendJson<Reply>("POST", "/api/learner/tutor-model/models", { provider });
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
    if (provider === "" || row === undefined) return;
    if (asked.current === keyStamp) return;
    asked.current = keyStamp;
    void load();
    // `load` reads only the provider pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, row, keyStamp]);

  const suggestions = useMemo(
    () =>
      list?.state === "ready"
        ? list.models.map((m) => ({ value: m.id, label: m.id, detail: m.free ? "free" : undefined }))
        : [],
    [list],
  );

  const picked = { provider, model: model.trim() };
  const already = chain.some((e) => e.provider === picked.provider && e.model === picked.model);
  const unchanged = chain.length === 1 && already;

  const save = async () => {
    setStatus({ kind: "busy", text: "Saving…" });
    setError(null);
    // One write for the whole chain (`PUT`): a refused save keeps the chain
    // it would have replaced.
    const reply = await sendJson<Reply>("PUT", "/api/learner/tutor-model", picked);
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
      focusNext.current = `${base}-model`;
      setStatus({ kind: "idle" });
      return setError(failure("saved", reply));
    }
    setStatus({ kind: "done", text: `Saved. The tutor calls ${picked.model}.` });
    router.refresh();
  };

  const test = async () => {
    setStatus({ kind: "busy", text: `Testing ${picked.model}…` });
    const reply = await sendJson<Reply>("POST", "/api/learner/tutor-model/test", picked);
    if (reply === null) setStatus({ kind: "error", text: "Not tested: the server did not answer." });
    else if (reply.status === 200 && reply.data.ok === true) {
      setStatus({ kind: "done", text: `Works${reply.data.served && reply.data.served !== picked.model ? `, answered by ${reply.data.served}` : ""}.` });
    } else if (reply.status === 200) {
      const outcome = typeof reply.data.status === "number" ? `Refused (HTTP ${reply.data.status})` : "No answer";
      setStatus({ kind: "error", text: `${outcome}: ${reply.data.message ?? "no reason given."}` });
    } else setStatus({ kind: "error", text: reply.data.error ?? `Not tested (HTTP ${reply.status}).` });
  };

  const remove = async () => {
    setStatus({ kind: "busy", text: "Removing…" });
    for (const entry of chain) {
      const reply = await sendJson<Reply>("DELETE", "/api/learner/tutor-model", { provider: entry.provider, model: entry.model });
      if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
        setStatus({ kind: "error", text: failure("removed", reply) });
        router.refresh();
        return;
      }
    }
    setProvider("");
    setModel("");
    setStatus({ kind: "done", text: "Removed. The tutor has nothing to call until you save a model." });
    router.refresh();
  };

  if (keyed.length === 0) {
    return <p className="text-[13px] text-text2">No provider has a key yet — add one under Providers above, then pick its model here.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <FormRow label="Provider">
          {({ id }) => (
            <Select
              id={id}
              label="Tutor provider"
              options={keyed.map((r) => ({ value: r.id, label: r.label, detail: r.inUse === "server" ? "server key" : undefined }))}
              value={provider}
              onChange={(next) => {
                setProvider(next);
                setModel("");
                setError(null);
              }}
              placeholder="Select a provider"
              busy={busy}
            />
          )}
        </FormRow>
        <FormRow id={`${base}-model`} label="Model" error={error}>
          {({ id, describedBy, invalid }) => (
            <Combobox
              id={id}
              label="Tutor model"
              value={model}
              onChange={(v) => {
                setModel(v);
                setError(null);
              }}
              options={suggestions}
              placeholder={provider === "" ? "Pick a provider first" : "Search models or type an id"}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              describedBy={describedBy}
              invalid={invalid}
              disabled={disabled || provider === ""}
            />
          )}
        </FormRow>
      </div>
      {provider !== "" && row !== undefined && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p aria-live="polite" className="text-[12px] text-text2">
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
      {chain.length > 1 && <p className="text-[12px] text-text2">The tutor tries {chain.length} models today — saving keeps only this one.</p>}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="sm" disabled={disabled || busy || provider === "" || picked.model === "" || unchanged} onClick={() => void save()}>
          Use this model
        </Button>
        {already && (
          <Button variant="secondary" size="sm" disabled={disabled || busy} onClick={() => void test()}>
            Test
          </Button>
        )}
        {chain.length > 0 && (
          <button
            type="button"
            className="ml-auto text-[12px] leading-4 text-text3 underline-offset-2 hover:underline"
            disabled={disabled || busy}
            onClick={() => void remove()}
          >
            Remove model
          </button>
        )}
      </div>
      <LiveStatus text={textOf(status)} tone={tone(status)} className="pt-0.5" />
    </div>
  );
}
