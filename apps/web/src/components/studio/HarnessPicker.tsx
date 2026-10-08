"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cx, FOCUS, LABEL } from "@/components/ui/classes";
import { Dialog, DIALOG_CLOSE_MS } from "@/components/ui/Dialog";
import { DialogHeader } from "@/components/ui/DialogHeader";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Select } from "@/components/ui/Select";
import { usePresence } from "@/components/ui/use-presence";
import { getByokSettings, saveByokSettings } from "@/lib/studio-drafts";
import { rememberHarness, storedHarness, subscribeHarness, type HarnessValue } from "@/lib/studio-harness";

/**
 * Which harness a conversation's turns run on, picked at the left of its
 * pane's header, the way Manus's top bar picks a model
 * (`docs/STUDIO-CHAT-FIRST.md`). The model the harness runs is still the
 * picker under the composer (D90); this one is the agent itself.
 *
 * Two modes, since the picker outlives any one conversation:
 *
 * - Uncontrolled (`PanelHost`'s placeholder panes): the pick is remembered
 *   for the next `POST /api/drafts`, which is how a conversation is started
 *   on BYOK before its pane exists.
 * - Controlled (`DraftPanel`, the draft's own `harness` as `value` and
 *   `onPick` writing `PUT .../harness`): a pick shows at once and stands if
 *   the runner takes it, which it does only while no turn has run.
 *
 * BYOK is Qwen Code (`qwen`) on the key the dialog's Connect stores
 * (`PUT /api/settings/byok`); Codex is a placeholder the runner refuses until
 * it is wired.
 *
 * A `Menu` rather than the `FilterMenu` the model picker is: its rows are
 * `menuitemradio`, so the BYOK row can reopen the dialog while it is the
 * chosen harness, where a listbox only reports a changed value.
 */
interface Harness {
  value: HarnessValue;
  label: string;
  detail: string;
}

const HARNESSES: readonly Harness[] = [
  { value: "claude", label: "Claude", detail: "Anthropic's agent harness. The default." },
  { value: "codex", label: "Codex", detail: "OpenAI's agent harness, on your codex login." },
  { value: "byok", label: "BYOK", detail: "Your own provider key, run through Qwen Code." },
];

/** The providers `byok.json` can name (`BYOK_PROVIDERS` in the runner), each with a model hint for its field. */
const PROVIDERS = [
  { value: "openai", label: "OpenAI", modelHint: "e.g. gpt-5.4" },
  { value: "anthropic", label: "Anthropic", modelHint: "e.g. claude-sonnet-4-5" },
  { value: "google", label: "Google", modelHint: "e.g. gemini-3-pro" },
  { value: "openrouter", label: "OpenRouter", modelHint: "e.g. anthropic/claude-sonnet-4.5" },
];

/**
 * The remembered pick as React state: `subscribeHarness` notifies on every
 * write here and on another tab's `storage` event, so every mounted picker
 * and `createDraft` read the same value.
 */
export function useStoredHarness(): HarnessValue {
  return useSyncExternalStore(subscribeHarness, storedHarness, () => "claude");
}

/**
 * The harness picker. Controlled when `value` is a draft's own `harness` —
 * `onPick` then writes it through the record and the record decides what
 * shows. Uncontrolled (no `value`) holds the remembered pick for the next
 * conversation itself, and still reports each pick to `onPick`, for a parent
 * that only needs to know.
 */
export function HarnessPicker({ value, onPick }: { value?: string | null; onPick?: (harness: HarnessValue) => void }) {
  const [byokOpen, setByokOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const byok = usePresence(byokOpen, DIALOG_CLOSE_MS);
  // Controlled when a conversation hands its pick in; the remembered one else.
  const controlled = value !== undefined && value !== null;
  // The remembered pick, "claude" on the server and the stored value once
  // hydrated. `rememberHarness` notifies the store, so this re-renders.
  const stored = useStoredHarness();
  const harness = (controlled ? (value ?? "claude") : stored) as HarnessValue;
  const name = HARNESSES.find((option) => option.value === harness)?.label ?? harness;
  // The dialog's `opener`: the BYOK row opens it through `afterClose`, which
  // skips putting focus back on the menu, and the row it was on is gone by
  // then. The trigger is the control that outlives both, so it is the one
  // close gives focus to.
  const wrap = useRef<HTMLSpanElement | null>(null);

  // A controlled pick is the draft's own; keep the remembered default in step
  // with what an open conversation actually runs on.
  useEffect(() => {
    if (controlled && (value === "claude" || value === "byok")) rememberHarness(value);
  }, [controlled, value]);

  function pick(next: HarnessValue) {
    // A controlled pick is the draft's own: the record decides, and the
    // effect above remembers it once it stands — a refused pick ("codex" not
    // wired, a spoken conversation locked) must not become the default new
    // conversations start on. Uncontrolled, the pick is remembered at once;
    // the store's notification is what re-renders this trigger.
    if (!controlled) rememberHarness(next);
    onPick?.(next);
  }

  return (
    <>
      <span ref={wrap} className="contents">
        <Menu
          label={`Harness: ${name}`}
          menuLabel="Harness"
          align="start"
          minWidth={320}
          onOpenChange={setMenuOpen}
          trigger={
            <>
              <span className="min-w-0 truncate">{name}</span>
              <Glyph
                name="chevron"
                className={cx(
                  "size-3.5 text-text3 transition-[rotate] duration-150 ease-soft motion-reduce:transition-none",
                  menuOpen && "rotate-180",
                )}
              />
            </>
          }
          // Bare text, not a chip: the way Manus's top bar wears the same
          // picker — the name itself is the affordance, and a border around it
          // read as a filter chip, not a title.
          triggerClassName={cx(
            "inline-flex max-w-full shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5",
            "font-sans text-[13px] font-medium text-text not-disabled:hover:bg-surface2",
            FOCUS,
          )}
        >
          {HARNESSES.map((option) => (
            <MenuItem
              key={option.value}
              checked={harness === option.value}
              // BYOK opens its configuration rather than picking: `afterClose`
              // hands it the focus once the menu has shut, and it can open it
              // again while it is already the harness, since a menu row's press
              // fires every time.
              onSelect={option.value === "byok" ? undefined : () => pick(option.value)}
              afterClose={option.value === "byok" ? () => setByokOpen(true) : undefined}
            >
              <HarnessRow option={option} />
            </MenuItem>
          ))}
        </Menu>
      </span>
      {byok.mounted && (
        <ByokDialog
          closing={byok.leaving}
          opener={() => wrap.current?.querySelector("button") ?? null}
          onClose={() => setByokOpen(false)}
          onConnect={() => {
            // A key just stored is meant to be used: remembered at once, so
            // the next conversation runs on it even when this one is already
            // locked to the harness it started on.
            rememberHarness("byok");
            pick("byok");
            setByokOpen(false);
          }}
        />
      )}
    </>
  );
}

/** A harness's row: its name with what it is on a muted line under it. */
function HarnessRow({ option }: { option: Harness }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{option.label}</span>{" "}
      <span className="truncate text-[12px] font-normal text-text2">{option.detail}</span>
    </span>
  );
}

/**
 * The BYOK configuration dialog, Manus's "Manus Flex" popup: the name with a
 * Beta badge in the kit header (its Close, as `DialogHeader.test.ts` asks of
 * every kit `Dialog`), the harness's mark, a line on what a third-party model
 * costs in guarantees, Provider and Model fields, the key with a Show toggle,
 * and Cancel and Connect as a pair of equal buttons at the foot.
 *
 * Connect is real: `PUT /api/settings/byok` writes the key to the runner's
 * `byok.json` (it never comes back — the dialog shows the stored `last4`),
 * and the picker's pick becomes `byok`. A save that fails is said in place
 * and keeps the dialog open.
 */
function ByokDialog({
  closing,
  opener,
  onClose,
  onConnect,
}: {
  closing: boolean;
  /** The picker's trigger, which closing hands focus back to. */
  opener: () => HTMLElement | null;
  onClose: () => void;
  onConnect: () => void;
}) {
  const id = useId();
  const providerId = `${id}-provider`;
  const modelId = `${id}-model`;
  const keyId = `${id}-key`;
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  /** The stored key's tail and which provider it belongs to, never the key. */
  const [held, setHeld] = useState<{ provider: string; last4: string } | null>(null);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the runner already holds, so a reopen shows the configured provider
  // and model. The key itself never comes back; Connect on the same provider
  // with the field left blank keeps the stored one.
  useEffect(() => {
    void getByokSettings().then((result) => {
      if (!result.ok || !result.data.configured) return;
      setProvider(result.data.provider ?? "");
      setModel(result.data.model ?? "");
      if (result.data.provider !== null && result.data.last4 !== null) {
        setHeld({ provider: result.data.provider, last4: result.data.last4 });
      }
    });
  }, []);

  const modelHint = PROVIDERS.find((entry) => entry.value === provider)?.modelHint ?? "e.g. a model name";
  // The stored key only stands in for its own provider; another provider's
  // key is a different secret the dialog has to be given.
  const keyHeld = held !== null && held.provider === provider;

  async function connect() {
    setSaving(true);
    setError(null);
    const result = await saveByokSettings({ provider, apiKey: apiKey.trim(), model: model.trim() });
    setSaving(false);
    if (!result.ok) {
      setError(result.refusal.error);
      return;
    }
    onConnect();
  }

  return (
    <Dialog label="BYOK" onClose={onClose} closing={closing} size="compact" className="md:w-[480px]" opener={opener}>
      <DialogHeader
        title={
          <span className="flex items-center gap-2">
            BYOK
            <Badge tone="accent">Beta</Badge>
          </span>
        }
        onClose={onClose}
      />
      <div className="relative flex flex-col gap-5 p-6 md:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-border bg-surface2 text-text2">
            <Glyph name="link" size={26} />
          </span>
          <p className="max-w-[42ch] text-[13px] leading-5 text-text2">
            Run the agent with your own API key and models through Qwen Code. Third-party model performance may vary and
            is not guaranteed.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={providerId} className={LABEL}>
            Provider
          </label>
          <Select
            id={providerId}
            label="Provider"
            options={PROVIDERS}
            value={provider}
            onChange={setProvider}
            placeholder="Select a provider"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={modelId} className={LABEL}>
            Model
          </label>
          <Input
            id={modelId}
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={modelHint}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

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
              placeholder={
                held === null || !keyHeld
                  ? "Enter your API key"
                  : `A key ending ${held.last4} is stored; leave blank to keep it`
              }
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

        {error !== null && (
          <p role="alert" className="text-[13px] leading-5 text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={saving || provider === "" || model.trim() === "" || (apiKey.trim() === "" && !keyHeld)}
            onClick={() => void connect()}
          >
            {saving ? "Connecting…" : "Connect"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
