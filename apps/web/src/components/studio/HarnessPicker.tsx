"use client";

import { useId, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LABEL } from "@/components/ui/classes";
import { Dialog, DIALOG_CLOSE_MS } from "@/components/ui/Dialog";
import { FilterMenu } from "@/components/ui/FilterMenu";
import type { FilterOption } from "@/components/ui/filter-menu";
import { Glyph } from "@/components/ui/Glyph";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { usePresence } from "@/components/ui/use-presence";

/**
 * Which harness a conversation runs on, picked at the left of its pane's
 * header, the way Manus's top bar picks a model (`docs/STUDIO-CHAT-FIRST.md`).
 * The model the harness runs is still the picker's under the composer (D90);
 * this one is the agent itself.
 *
 * Placeholder for now: the pick is kept in the pane's state and goes nowhere,
 * since only the Claude harness is wired to the runner. Codex stands in the
 * list, and BYOK ("bring your own key") opens the configuration dialog an
 * open harness will take once one is chosen — the dialog is drawn and wired
 * to the pick, but its Connect is the placeholder too.
 */
const HARNESSES: readonly FilterOption[] = [
  { value: "claude", label: "Claude", detail: "Anthropic's agent harness. The default." },
  { value: "codex", label: "Codex", detail: "OpenAI's agent harness." },
  { value: "byok", label: "BYOK", detail: "Bring your own model API key to power the agent." },
];

/** The providers a BYOK key can name, until the BYOK harness names its own. */
const PROVIDERS: readonly FilterOption[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "openrouter", label: "OpenRouter" },
];

export function HarnessPicker() {
  const [harness, setHarness] = useState("claude");
  const [byokOpen, setByokOpen] = useState(false);
  const byok = usePresence(byokOpen, DIALOG_CLOSE_MS);

  const pick = (next: string) => {
    // The BYOK row opens its configuration rather than picking itself: it
    // becomes the harness once the dialog's Connect stands.
    if (next === "byok") {
      setByokOpen(true);
      return;
    }
    setHarness(next);
  };

  return (
    <>
      <FilterMenu label="Harness" bare options={HARNESSES} value={harness} onChange={pick} />
      {byok.mounted && (
        <ByokDialog
          closing={byok.leaving}
          onClose={() => setByokOpen(false)}
          onConnect={() => {
            setHarness("byok");
            setByokOpen(false);
          }}
        />
      )}
    </>
  );
}

/**
 * The BYOK configuration dialog, Manus's "Manus Flex" popup: the harness's
 * mark, its name with a Beta badge, a line on what a third-party model costs
 * in guarantees, a Provider menu, the key with a Show toggle, and Cancel and
 * Connect as a pair of equal buttons at the foot.
 *
 * Close comes last in the document, so `showModal()` puts the opening focus
 * on Provider, the first field; the row's absolute corner place is unchanged.
 */
function ByokDialog({ closing, onClose, onConnect }: { closing: boolean; onClose: () => void; onConnect: () => void }) {
  const id = useId();
  const titleId = `${id}-title`;
  const providerId = `${id}-provider`;
  const keyId = `${id}-key`;
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);

  return (
    <Dialog labelledBy={titleId} onClose={onClose} closing={closing} size="compact" className="md:w-[480px]">
      <div className="relative flex flex-col gap-5 p-6 md:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-border bg-surface2 text-text2">
            <Glyph name="link" size={26} />
          </span>
          <h2 id={titleId} className="flex items-center gap-2 text-[18px] leading-6 font-semibold">
            BYOK
            <Badge tone="accent">Beta</Badge>
          </h2>
          <p className="max-w-[42ch] text-[13px] leading-5 text-text2">
            Run the agent with your own API key and models. Third-party model performance may vary and is not
            guaranteed.
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
          <label htmlFor={keyId} className={LABEL}>
            API key
          </label>
          <div className="relative">
            <Input
              id={keyId}
              type={show ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Enter your API key"
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

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={provider === "" || apiKey.trim() === ""} onClick={onConnect}>
            Connect
          </Button>
        </div>

        <IconButton label="Close" size="md" tone="muted" inset className="absolute top-3 right-3" onClick={onClose}>
          <Glyph name="close" size={16} />
        </IconButton>
      </div>
    </Dialog>
  );
}
