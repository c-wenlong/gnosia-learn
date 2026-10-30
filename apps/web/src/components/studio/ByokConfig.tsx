"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { cx, LABEL } from "@/components/ui/classes";
import { Combobox } from "@/components/ui/Combobox";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { BYOK_PROVIDERS, byokToTutor } from "@/lib/byok-providers";
import { sendJson } from "@/lib/send-json";
import { BYOK_SETTINGS_CHANGED, getByokSettings, listByokModels, removeByokProvider, saveByokModels, setByokActive, type ByokProviderStatus } from "@/lib/studio-drafts";

type Tier = "default" | "lite" | "max";

const ADD_PROVIDER = "__add__";

/** A provider's three tier fields as the form holds them: its saved models, blank where none (or no provider). */
function tiersOf(entry: ByokProviderStatus | null | undefined): Record<Tier, string> {
  return { default: entry?.models.default ?? "", lite: entry?.models.lite ?? "", max: entry?.models.max ?? "" };
}

/**
 * BYOK provider configuration (D94), shared by the picker's dialog and the
 * Models settings card: a provider dropdown listing only the connected
 * providers plus "+ Add provider" (which opens the provider select and the
 * key field for one not connected yet), then a Lite / Default / Max tab set
 * holding a combobox each — the provider's own `/models`, fetched on the key
 * the field holds or the stored one. Provider picks switch what `byok` turns
 * run on; "Save models" writes the three tiers.
 *
 * `manageKeys` false trims it to selection alone (the settings card, where
 * keys live on Providers above): no "+ Add provider", no key field, no
 * Connect and no Remove — the dropdown lists connected providers and the
 * tutor-saved ones that connect with their saved key.
 */
export function ByokConfig({
  onConnected,
  savedForTutor = [],
  manageKeys = true,
}: {
  onConnected?: () => void;
  /** BYOK preset names with a key saved on the Providers card — listed so they connect with that key, no re-typing (D95). */
  savedForTutor?: string[];
  /** False hides every key control: the surface picks and models only. */
  manageKeys?: boolean;
}) {
  const id = useId();
  const providerId = `${id}-provider`;
  const newProviderId = `${id}-new-provider`;
  const keyId = `${id}-key`;
  const modelId = `${id}-model`;

  const [connected, setConnected] = useState<ByokProviderStatus[] | null>(null);
  const [provider, setProvider] = useState("");
  const [adding, setAdding] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [tier, setTier] = useState<Tier>("default");
  const [tiers, setTiers] = useState<Record<Tier, string>>({ default: "", lite: "", max: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // What the runner already holds: the dropdown lists only connected
  // providers (+ Add provider), and the selected one's tiers fill the fields.
  // A key write on the Providers card mirrors into `byok.json` too, so the
  // list re-reads whenever that lands.
  const loaded = useRef(false);
  useEffect(() => {
    const load = () =>
      void getByokSettings().then((result) => {
        if (!result.ok) return;
        setConnected(result.data.providers);
        // Only the first read lands a pick: a later one (a key write
        // announced from the Providers card) refreshes the list without
        // moving the provider or retyping over edited tiers — unless the
        // pick itself was deleted, which falls back to the active one.
        const active = result.data.active ?? result.data.providers[0]?.provider ?? null;
        if (!loaded.current) {
          loaded.current = true;
          const entry = result.data.providers.find((entry) => entry.provider === active);
          setTiers(tiersOf(entry));
          if (active !== null) {
            setProvider(active);
          } else if (manageKeys) {
            setProvider(ADD_PROVIDER);
            setAdding(true);
          }
          return;
        }
        setProvider((was) => {
          if (was === "" || was === ADD_PROVIDER) return was;
          if (result.data.providers.some((entry) => entry.provider === was)) return was;
          // The pick itself was deleted: the fallback provider is a
          // different account, so its tiers load and any typed key drops.
          const entry = result.data.providers.find((entry) => entry.provider === active);
          setTiers(tiersOf(entry));
          setApiKey("");
          return active ?? (manageKeys ? ADD_PROVIDER : "");
        });
        if (result.data.providers.length === 0 && manageKeys) setAdding(true);
      });
    load();
    window.addEventListener(BYOK_SETTINGS_CHANGED, load);
    return () => window.removeEventListener(BYOK_SETTINGS_CHANGED, load);
  }, [manageKeys]);

  const selected = connected?.find((entry) => entry.provider === provider) ?? null;
  // The provider the model list and Save are about: the connected pick, or
  // the one being added.
  const listProvider = adding ? newProvider : provider;
  const modelHint = BYOK_PROVIDERS.find((entry) => entry.value === listProvider)?.modelHint ?? "e.g. a model name";
  // The stored key stands in for its own provider; another's is a different
  // secret the dialog has to be given.
  const keyHeld = selected !== null;

  const [listed, setListed] = useState<{ sig: string; models: { value: string; label: string | null }[] } | null>(null);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const modelSig = `${listProvider}:${apiKey.trim() === "" ? `stored:${selected?.last4 ?? ""}` : apiKey.trim().slice(-8)}`;
  const models = listed !== null && listed.sig === modelSig ? listed.models : [];
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const usable = listProvider !== "" && (apiKey.trim() !== "" || keyHeld);
      if (!usable) {
        if (!cancelled) {
          setListed(null);
          setModelsNote(null);
        }
        return;
      }
      setModelsNote("Loading models…");
      const result = await listByokModels(listProvider, apiKey.trim() === "" ? undefined : apiKey.trim());
      if (cancelled) return;
      if (result.ok) {
        setListed({ sig: modelSig, models: result.data.models });
        setModelsNote(null);
      } else {
        setListed(null);
        setModelsNote(result.refusal.error);
      }
    }, apiKey.trim() === "" ? 0 : 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listProvider, apiKey, keyHeld, modelSig]);

  const unconnected = useMemo(
    () => BYOK_PROVIDERS.filter((entry) => !connected?.some((held) => held.provider === entry.value)),
    [connected],
  );
  // A tutor-keyed provider that is not connected gets a dropdown entry of
  // its own: picking it pushes the saved key over instead of asking for one.
  const tutorSaved = useMemo(
    () => savedForTutor.filter((p) => connected !== null && !connected.some((entry) => entry.provider === p)),
    [savedForTutor, connected],
  );

  async function chooseProvider(next: string) {
    setError(null);
    setNote(null);
    if (next === ADD_PROVIDER) {
      setAdding(true);
      setNewProvider("");
      return;
    }
    if (next.startsWith("saved:")) {
      await connectSaved(next.slice("saved:".length));
      return;
    }
    setAdding(false);
    setProvider(next);
    // A key typed for one provider is never another's: clear it on every
    // switch, or a replacement meant for A would write over B's saved key.
    setApiKey("");
    setShow(false);
    const entry = connected?.find((held) => held.provider === next);
    setTiers(tiersOf(entry));
    const result = await setByokActive(next);
    if (!result.ok) {
      setError(result.refusal.error);
      return;
    }
    // Picking a connected provider is picking the harness it runs on.
    onConnected?.();
  }

  /**
   * A provider whose key the tutor already has, connected by pushing that
   * key to the runner (`/api/learner/provider-key/sync`) — the same key,
   * never re-typed.
   */
  async function connectSaved(byokName: string) {
    const tutor = byokToTutor(byokName);
    if (tutor === undefined) return;
    setSaving(true);
    setError(null);
    const reply = await sendJson<{ ok?: boolean; synced?: boolean }>("POST", "/api/learner/provider-key/sync", { provider: tutor });
    if (reply === null || reply.status !== 200 || reply.data.synced !== true) {
      setSaving(false);
      setError("Not connected — the runner is not answering.");
      return;
    }
    const switched = await setByokActive(byokName);
    const fresh = await getByokSettings();
    setSaving(false);
    if (!fresh.ok || !fresh.data.providers.some((entry) => entry.provider === byokName)) {
      setError("Connected, but the studio runner did not answer — try again.");
      return;
    }
    if (!switched.ok || fresh.data.active !== byokName) {
      setError("Connected, but Studio chats still run on the previous provider — pick it again from the dropdown to switch.");
      setConnected(fresh.data.providers);
      return;
    }
    setConnected(fresh.data.providers);
    setAdding(false);
    setProvider(byokName);
    setApiKey("");
    const entry = fresh.data.providers.find((held) => held.provider === byokName);
    setTiers(tiersOf(entry));
    onConnected?.();
  }

  async function connect() {
    setSaving(true);
    setError(null);
    // One key, both stores (D95): the tutor's `/api/learner/provider-key`
    // seals it, and the route itself mirrors it into the runner's
    // `byok.json`. The tutor write is the canonical one — a refusal there
    // means nothing is connected anywhere.
    const tutor = byokToTutor(newProvider);
    const reply = await sendJson<{ ok?: boolean; error?: string; byok?: boolean }>("POST", "/api/learner/provider-key", {
      provider: tutor,
      key: apiKey.trim(),
    });
    if (reply === null || reply.status !== 200 || reply.data.ok !== true) {
      setSaving(false);
      setError(reply?.data.error ?? (reply === null ? "the server did not answer" : `not connected (HTTP ${reply.status})`));
      return;
    }
    // The tutor route mirrors the key without moving Studio's pick; a
    // provider just connected here is meant to run, so make it active now —
    // and a switch that failed is said rather than silently kept on the old
    // provider.
    const switched = await setByokActive(newProvider);
    const fresh = await getByokSettings();
    setSaving(false);
    if (!fresh.ok || !fresh.data.providers.some((entry) => entry.provider === newProvider)) {
      setError("Saved, but the studio runner did not take it — the tutor can use the key; Studio will when the runner is reachable.");
      return;
    }
    if (!switched.ok || fresh.data.active !== newProvider) {
      setError("Connected, but Studio chats still run on the previous provider — pick it again from the dropdown to switch.");
      setConnected(fresh.data.providers);
      return;
    }
    setConnected(fresh.data.providers);
    setProvider(newProvider);
    setAdding(false);
    setApiKey("");
    setTiers(tiersOf(null));
    // The provider is connected and active — the picker's pick becomes
    // `byok`, but the dialog stays open for the tier models: a provider
    // with no Default model still cannot run.
    onConnected?.();
  }

  /** The selected provider leaves `byok.json` whole — key, tiers and the pick. */
  async function remove() {
    if (selected === null) return;
    setSaving(true);
    setError(null);
    const result = await removeByokProvider(provider);
    setSaving(false);
    if (!result.ok) {
      setError(result.refusal.error);
      return;
    }
    setNote(null);
    window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
  }

  async function saveTiers() {
    if (selected === null) return;
    setSaving(true);
    setError(null);
    // A typed key on a connected provider replaces the stored one first, so
    // a rotated key and new tier picks land together — through the tutor's
    // route, which mirrors it into `byok.json`, keeping both stores on one key.
    if (apiKey.trim() !== "") {
      const keyResult = await sendJson<{ ok?: boolean; error?: string; byok?: boolean }>("POST", "/api/learner/provider-key", {
        provider: byokToTutor(provider),
        key: apiKey.trim(),
      });
      if (keyResult === null || keyResult.status !== 200 || keyResult.data.ok !== true) {
        setSaving(false);
        setError(keyResult?.data.error ?? (keyResult === null ? "the server did not answer" : `key not saved (HTTP ${keyResult.status})`));
        return;
      }
      // The tutor write succeeded but the runner did not take its mirror:
      // say the key Studio still uses is the old one, and do not save tiers
      // against a provider whose key just did not land.
      if (keyResult.data.byok === false) {
        setSaving(false);
        setError("The key saved for the tutor, but the studio runner did not take it — Studio keeps the old key until the runner answers.");
        return;
      }
      setApiKey("");
    }
    const result = await saveByokModels(provider, {
      default: tiers.default.trim(),
      lite: tiers.lite.trim(),
      max: tiers.max.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.refusal.error);
      return;
    }
    setConnected(result.data.providers);
    setNote("Saved");
  }

  const modelOptions = models.map((entry) =>
    entry.label === null || entry.label === entry.value ? { value: entry.value, label: entry.value } : { value: entry.value, label: entry.label, detail: entry.value },
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={providerId} className={LABEL}>
          Provider
        </label>
        <Select
          id={providerId}
          label="Provider"
          options={[
            ...(connected ?? []).map((entry) => ({
              value: entry.provider,
              label: `${BYOK_PROVIDERS.find((known) => known.value === entry.provider)?.label ?? entry.provider} ··${entry.last4}`,
            })),
            ...tutorSaved.map((p) => ({
              value: `saved:${p}`,
              label: `${BYOK_PROVIDERS.find((known) => known.value === p)?.label ?? p} · use saved key`,
            })),
            ...(manageKeys ? [{ value: ADD_PROVIDER, label: "+ Add provider" }] : []),
          ]}
          value={adding ? ADD_PROVIDER : provider}
          onChange={(next) => void chooseProvider(next)}
          placeholder={connected === null ? "Loading…" : "Select a provider"}
        />
        {!manageKeys && connected !== null && connected.length === 0 && tutorSaved.length === 0 && (
          <p className="text-[12px] leading-4 text-text3">No provider has a key yet — add one under Providers above.</p>
        )}
      </div>

      {manageKeys && adding && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={newProviderId} className={LABEL}>
              New provider
            </label>
            <Select
              id={newProviderId}
              label="New provider"
              options={unconnected.map((entry) => ({ value: entry.value, label: entry.label }))}
              value={newProvider}
              onChange={setNewProvider}
              placeholder="Select a provider"
            />
          </div>
        </>
      )}

      {/* The key field sits under the provider for both flows: required when
          adding, a replacement for a connected one (blank keeps the stored
          key). Its tail names what is stored, never the key itself. Keys are
          managed on the Providers card where `manageKeys` is off. */}
      {manageKeys && (adding || selected !== null) && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={keyId} className={LABEL}>
            API key
          </label>
          <div className="relative">
            <Input
              id={keyId}
              type={show ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={selected !== null ? `Leave blank to keep ··${selected.last4}` : "Enter your API key"}
              autoComplete="off"
              spellCheck={false}
              className="pr-11"
            />
            <IconButton
              label="Show the API key"
              pressed={show}
              size="sm"
              tone="muted"
              inset
              className="absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => setShow((was) => !was)}
            >
              <Glyph name={show ? "eye" : "eyeOff"} size={17} />
            </IconButton>
          </div>
        </div>
      )}

      {manageKeys && adding && (
        <Button className="self-start" disabled={saving || newProvider === "" || apiKey.trim() === ""} onClick={() => void connect()}>
          {saving ? "Connecting…" : "Connect"}
        </Button>
      )}

      {!adding && provider !== "" && (
        <>
          <SegmentedControl
            label="Model tier"
            size="sm"
            block
            value={tier}
            onChange={setTier}
            items={[
              { id: "default", label: "Default" },
              { id: "lite", label: "Lite" },
              { id: "max", label: "Max" },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={modelId} className={LABEL}>
              {tier === "default" ? "Default model" : tier === "lite" ? "Lite model" : "Max model"}
            </label>
            <Combobox
              id={modelId}
              label="Model"
              value={tiers[tier]}
              onChange={(next) => setTiers((held) => ({ ...held, [tier]: next }))}
              options={modelOptions}
              placeholder={modelHint}
              autoComplete="off"
              spellCheck={false}
            />
            {modelsNote !== null && <p className="text-[12px] leading-4 text-text3">{modelsNote}</p>}
            <p className={cx("text-[12px] leading-4 text-text3", tier !== "default" && "")}>
              {tier === "default"
                ? "A BYOK turn's model when the conversation picks Default — required to run."
                : `Runs when the conversation picks ${tier === "lite" ? "Lite" : "Max"}; blank means the Default model.`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button className="self-start" disabled={saving || selected === null} onClick={() => void saveTiers()}>
              {saving ? "Saving…" : "Save models"}
            </Button>
            {note !== null && <p className="text-[12px] leading-4 text-text3">{note}</p>}
            {/* Asks first, as every other press that cannot be undone here
                does: the key, the tiers and the pick all leave at once. */}
            {manageKeys && selected !== null && (
              // Keyed by provider: a question opened for one key is put
              // away when the pick moves, so it never removes another.
              // `busy`, not only `disabled`: an open question waits out a
              // save, which could otherwise add the key back after Remove.
              <InlineConfirm
                key={provider}
                size="text"
                label="Remove"
                question={`Remove ${BYOK_PROVIDERS.find((known) => known.value === provider)?.label ?? provider}'s key from Studio?`}
                confirmLabel="Remove it"
                onConfirm={() => void remove()}
                busy={saving}
                disabled={saving}
                className="ml-auto text-[12px] leading-4"
              />
            )}
          </div>
        </>
      )}

      {error !== null && (
        <p role="alert" className="text-[13px] leading-5 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
