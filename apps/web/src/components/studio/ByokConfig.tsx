"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { cx, LABEL } from "@/components/ui/classes";
import { Combobox } from "@/components/ui/Combobox";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { getByokSettings, listByokModels, saveByokModels, saveByokSettings, setByokActive, type ByokProviderStatus } from "@/lib/studio-drafts";

/** The providers `byok.json` can name (`BYOK_PROVIDERS` in the runner), each with a model hint for its fields. */
export const BYOK_PROVIDERS = [
  { value: "openai", label: "OpenAI", modelHint: "e.g. gpt-5.4" },
  { value: "anthropic", label: "Anthropic", modelHint: "e.g. claude-sonnet-4-5" },
  { value: "google", label: "Google", modelHint: "e.g. gemini-3-pro" },
  { value: "openrouter", label: "OpenRouter", modelHint: "e.g. anthropic/claude-sonnet-4.5" },
] as const;

type Tier = "default" | "lite" | "max";

const ADD_PROVIDER = "__add__";

/**
 * BYOK provider configuration (D94), shared by the picker's dialog and the
 * Models settings card: a provider dropdown listing only the connected
 * providers plus "+ Add provider" (which opens the provider select and the
 * key field for one not connected yet), then a Lite / Default / Max tab set
 * holding a combobox each — the provider's own `/models`, fetched on the key
 * the field holds or the stored one. Provider picks switch what `byok` turns
 * run on; "Save models" writes the three tiers.
 */
export function ByokConfig({ onConnected }: { onConnected?: () => void }) {
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
  useEffect(() => {
    void getByokSettings().then((result) => {
      if (!result.ok) return;
      setConnected(result.data.providers);
      const active = result.data.active ?? result.data.providers[0]?.provider ?? null;
      if (active !== null) {
        setProvider(active);
        const entry = result.data.providers.find((entry) => entry.provider === active);
        if (entry !== undefined) {
          setTiers({ default: entry.models.default ?? "", lite: entry.models.lite ?? "", max: entry.models.max ?? "" });
        }
      } else {
        setProvider(ADD_PROVIDER);
        setAdding(true);
      }
    });
  }, []);

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
  const modelSig = `${listProvider}:${apiKey.trim() === "" ? "stored" : apiKey.trim().slice(-8)}`;
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

  async function chooseProvider(next: string) {
    setError(null);
    setNote(null);
    if (next === ADD_PROVIDER) {
      setAdding(true);
      setNewProvider("");
      return;
    }
    setAdding(false);
    setProvider(next);
    const entry = connected?.find((held) => held.provider === next);
    setTiers({ default: entry?.models.default ?? "", lite: entry?.models.lite ?? "", max: entry?.models.max ?? "" });
    const result = await setByokActive(next);
    if (!result.ok) {
      setError(result.refusal.error);
      return;
    }
    // Picking a connected provider is picking the harness it runs on.
    onConnected?.();
  }

  async function connect() {
    setSaving(true);
    setError(null);
    const result = await saveByokSettings({ provider: newProvider, apiKey: apiKey.trim() });
    setSaving(false);
    if (!result.ok) {
      setError(result.refusal.error);
      return;
    }
    setConnected(result.data.providers);
    setProvider(newProvider);
    setAdding(false);
    setApiKey("");
    setTiers({ default: "", lite: "", max: "" });
    // The provider is connected and active — the picker's pick becomes
    // `byok`, but the dialog stays open for the tier models: a provider
    // with no Default model still cannot run.
    onConnected?.();
  }

  async function saveTiers() {
    if (selected === null) return;
    setSaving(true);
    setError(null);
    // A typed key on a connected provider replaces the stored one first, so
    // a rotated key and new tier picks land together.
    if (apiKey.trim() !== "") {
      const keyResult = await saveByokSettings({ provider, apiKey: apiKey.trim() });
      if (!keyResult.ok) {
        setSaving(false);
        setError(keyResult.refusal.error);
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
            { value: ADD_PROVIDER, label: "+ Add provider" },
          ]}
          value={adding ? ADD_PROVIDER : provider}
          onChange={(next) => void chooseProvider(next)}
          placeholder={connected === null ? "Loading…" : "Select a provider"}
        />
      </div>

      {adding && (
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
          key). Its tail names what is stored, never the key itself. */}
      {(adding || selected !== null) && (
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

      {adding && (
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
