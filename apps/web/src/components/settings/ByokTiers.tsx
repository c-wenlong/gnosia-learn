"use client";

import type { ProviderName } from "@self-learn/schema/shared";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { FormRow } from "@/components/ui/FormRow";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { sendJson } from "@/lib/send-json";
import { BYOK_SETTINGS_CHANGED, listByokModels, saveByokModels, setByokActive, type ByokProviderStatus } from "@/lib/studio-drafts";

type Tier = "default" | "lite" | "max";

/**
 * A provider row's Studio BYOK section (D95 of docs/STUDIO-CHAT-FIRST.md):
 * the Lite / Default / Max models `qwen` spawns on for it, and whether the
 * provider is the one Studio chats run on. The key is the row's own — one
 * provider, one key, in both stores — so a provider the tutor knows but the
 * runner does not gets a "Connect" that pushes the saved key over
 * (`/api/learner/provider-key/sync`), no re-typing.
 */
export function ByokTiers({
  provider,
  tutorId,
  entry,
  active,
  keyed,
  visible,
}: {
  /** The BYOK preset name (`openrouter`, `google`, …). */
  provider: string;
  /** The tutor's id for the same provider (`openrouter`, `gemini`, …), for the sync route. */
  tutorId: ProviderName;
  /** The provider's byok.json entry, or null when the runner does not have it. */
  entry: ByokProviderStatus | null;
  /** Studio chats run on this provider now. */
  active: boolean;
  /** The row has a key the sync can push (saved or server's). */
  keyed: boolean;
  /** The row is open: the model list is fetched the first time it is. */
  visible: boolean;
}) {
  const modelId = `${useId()}-model`;
  const [tier, setTier] = useState<Tier>("default");
  const [tiers, setTiers] = useState<Record<Tier, string>>({ default: entry?.models.default ?? "", lite: entry?.models.lite ?? "", max: entry?.models.max ?? "" });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A fresh entry's tiers refill the fields — the adjust-during-render
  // pattern, since a fetch landing mid-edit must not clobber the typing.
  const [seen, setSeen] = useState<ByokProviderStatus | null>(entry);
  if (seen !== entry) {
    setSeen(entry);
    setTiers({ default: entry?.models.default ?? "", lite: entry?.models.lite ?? "", max: entry?.models.max ?? "" });
  }

  // The provider's model list, asked once per key (a replaced key is another
  // account) and again on Try again after a refusal.
  const [listed, setListed] = useState<{ models: { value: string; label: string | null }[] } | { error: string } | null>(null);
  const asked = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);
  const keyStamp = entry?.last4 ?? "";
  useEffect(() => {
    if (!visible || entry === null || asked.current === keyStamp) return;
    asked.current = keyStamp;
    setListed(null);
    void listByokModels(provider).then((result) => {
      if (result.ok) {
        setListed({ models: result.data.models });
      } else {
        asked.current = null;
        setListed({ error: result.refusal.error });
      }
    });
  }, [visible, entry, provider, keyStamp, retry]);

  if (entry === null) {
    return (
      <div className="flex flex-wrap items-center gap-3 pt-3">
        <p className="text-[12px] leading-4 text-text2">
          Studio chats cannot use this provider yet —{" "}
          {keyed ? "connect it and the same key works for both." : "add its key above first."}
        </p>
        {keyed && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setNote(null);
                const reply = await sendJson<{ ok?: boolean; synced?: boolean }>("POST", "/api/learner/provider-key/sync", { provider: tutorId });
                setBusy(false);
                if (reply === null || reply.data.synced !== true) {
                  setNote("Not connected — the runner is not answering.");
                  return;
                }
                window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
                setNote("Connected for Studio chats.");
              })();
            }}
          >
            {busy ? "Connecting…" : "Connect for Studio chats"}
          </Button>
        )}
        {note !== null && <p className="text-[12px] leading-4 text-text3">{note}</p>}
      </div>
    );
  }

  const options = listed !== null && "models" in listed ? listed.models.map((m) => (m.label === null || m.label === m.value ? { value: m.value, label: m.value } : { value: m.value, label: m.label, detail: m.value })) : [];

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium text-text2">
          Studio chats{active ? " run on this provider" : ""}
        </p>
        {!active && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                const result = await setByokActive(provider);
                setBusy(false);
                if (!result.ok) setNote(result.refusal.error);
              })();
            }}
          >
            Use for Studio
          </Button>
        )}
      </div>
      <SegmentedControl
        label="Studio model tier"
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
      <FormRow id={modelId} label={tier === "default" ? "Default model" : tier === "lite" ? "Lite model" : "Max model"}>
        {({ id }) => (
          <Combobox
            id={id}
            label="Model"
            value={tiers[tier]}
            onChange={(next) => setTiers((held) => ({ ...held, [tier]: next }))}
            options={options}
            placeholder="e.g. a model name"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </FormRow>
      {listed !== null && "error" in listed && (
        <p className="text-[12px] leading-4 text-text3">
          {listed.error}{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setNote(null);
              const result = await saveByokModels(provider, { default: tiers.default.trim(), lite: tiers.lite.trim(), max: tiers.max.trim() });
              setBusy(false);
              setNote(result.ok ? "Saved." : result.refusal.error);
            })();
          }}
        >
          {busy ? "Saving…" : "Save tiers"}
        </Button>
        {note !== null && <p className="text-[12px] leading-4 text-text3">{note}</p>}
      </div>
    </div>
  );
}
