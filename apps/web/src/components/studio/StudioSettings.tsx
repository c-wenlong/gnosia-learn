"use client";

import { useRef, useState, useTransition } from "react";

import type { StudioAgentPreference } from "@self-learn/schema/shared";

import { saveStudioAgent } from "@/app/(app)/studio/actions";
import { PanelLink } from "@/components/studio/PanelLink";
import { usePanelHost } from "@/components/studio/panel-host";
import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import type { FilterOption } from "@/components/ui/filter-menu";
import { FormRow } from "@/components/ui/FormRow";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import type { AgentKind } from "@/lib/studio-agent-settings";

/**
 * One row as the page builds it on the server: its stored value, the value
 * it has when nothing is stored, and its two menus. Built there so this
 * client module imports no runtime from `@self-learn/schema/shared`, whose
 * exports, once used on the client, ship with every route that loads it.
 */
export interface AgentRow {
  kind: AgentKind;
  name: string;
  value: StudioAgentPreference;
  fallback: StudioAgentPreference;
  models: FilterOption<string>[];
  efforts: FilterOption<string>[];
  /** The runner's warning for this row (an unpriced model), shown quietly under it. */
  warning?: string | null;
}

/**
 * The studio's settings panel (D53 of docs/STUDIO-VIDEOS.md): the model and
 * effort the video agent and the diagram agent run with.
 *
 * Two rows, Videos and Diagrams, each two menus. "Claude Code default" says
 * what it resolves to now, read from the runner's health, since the runner
 * passes the owner's own setting rather than no flag. No heading beyond the
 * row names and no helper text that repeats a menu (DESIGN.md, "Sentence
 * case"). A pick saves at once through the `saveStudioAgent` server action;
 * the row says "Saved", or why not, beside its menus.
 */
export function StudioSettings({
  rows,
  reachable,
  onSaved,
}: {
  rows: AgentRow[];
  /** Whether the catalog answered the read: with it down, a save cannot land either. */
  reachable: boolean;
  /** Told of each row that saved, so the panel opened again starts from it rather than from the first read. */
  onSaved?: (kind: AgentKind, value: StudioAgentPreference) => void;
}) {
  const [values, setValues] = useState<Record<AgentKind, StudioAgentPreference>>(
    () => Object.fromEntries(rows.map((row) => [row.kind, row.value])) as Record<AgentKind, StudioAgentPreference>,
  );
  const [notes, setNotes] = useState<Partial<Record<AgentKind, { ok: boolean; text: string }>>>({});
  const [saving, startSaving] = useTransition();

  /**
   * Saves run one after another per row, each carrying the whole row, so
   * the last pick is the last write. Only the newest save's answer is shown:
   * an older one finishing late, or failing, says nothing over it. A save
   * that throws (the network, a restart, the session gone) is a refused save
   * here, never an exception that takes the studio page down.
   */
  const saved = useRef<Record<AgentKind, StudioAgentPreference>>(
    Object.fromEntries(rows.map((row) => [row.kind, row.value])) as Record<AgentKind, StudioAgentPreference>,
  );
  const sequence = useRef<Record<string, number>>({});
  const chain = useRef<Record<string, Promise<unknown>>>({});

  function change(kind: AgentKind, patch: Partial<StudioAgentPreference>) {
    const next = { ...values[kind], ...patch };
    const ticket = (sequence.current[kind] ?? 0) + 1;
    sequence.current[kind] = ticket;
    setValues((held) => ({ ...held, [kind]: next }));
    setNotes((held) => ({ ...held, [kind]: undefined }));
    const run = (chain.current[kind] ?? Promise.resolve()).then(async () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("model", next.model);
      form.set("effort", next.effort);
      let result: { ok: boolean; error: string | null };
      try {
        result = await saveStudioAgent(form);
      } catch {
        result = { ok: false, error: "Not saved: the studio did not answer." };
      }
      if (result.ok) {
        saved.current[kind] = next;
        onSaved?.(kind, next);
      }
      if (sequence.current[kind] !== ticket) return;
      if (result.ok) {
        setNotes((held) => ({ ...held, [kind]: { ok: true, text: "Saved" } }));
        return;
      }
      // A refused save puts the menus back to what is stored.
      setValues((held) => ({ ...held, [kind]: saved.current[kind] }));
      setNotes((held) => ({ ...held, [kind]: { ok: false, text: result.error ?? "Not saved." } }));
    });
    chain.current[kind] = run;
    startSaving(() => run);
  }

  return (
    <Panel as="div" aria-label="Agents" className="rounded-none" bodyClassName="gap-5 p-5">
      {!reachable && (
        <p role="status" className="rounded-lg bg-warn-tint px-3 py-2 text-[13px] leading-5 text-text">
          The catalog is not answering, so these show the defaults and a change cannot be saved yet.
        </p>
      )}
      {rows.map((row) => {
        const value = values[row.kind];
        const note = notes[row.kind];
        return (
          <fieldset key={row.kind} className="flex min-w-0 flex-col gap-2.5">
            <legend className="mb-2.5 text-[14px] font-semibold text-text">{row.name}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Menu
                label="Model"
                options={row.models}
                value={value.model}
                busy={saving}
                onChange={(model) => change(row.kind, { model })}
              />
              <Menu
                label="Effort"
                options={row.efforts}
                value={value.effort}
                busy={saving}
                onChange={(effort) => change(row.kind, { effort: effort as StudioAgentPreference["effort"] })}
              />
            </div>
            {row.warning && <p className="text-[12px] leading-4 text-text2">{row.warning}</p>}
            {note !== undefined && (
              <p role={note.ok ? "status" : "alert"} className={cx("text-[12px] leading-4", note.ok ? "text-text3" : "text-danger")}>
                {note.text}
              </p>
            )}
          </fieldset>
        );
      })}
    </Panel>
  );
}

/** One menu: the kit `Select` under its label, its list in the top layer so the dialog cannot clip it. */
function Menu({
  label,
  options,
  value,
  busy,
  onChange,
}: {
  label: string;
  options: FilterOption<string>[];
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormRow label={label}>
      {({ id }) => <Select id={id} label={label} options={options} value={value} busy={busy} onChange={onChange} />}
    </FormRow>
  );
}

/**
 * The strip's way in: a quiet icon button beside Display and Sort. A panel
 * link, so the dialog opens in the browser (`PanelHost`), and a hover or a
 * focus starts reading its rows, which are then there by the press.
 */
export function SettingsLink({ href }: { href: string }) {
  const host = usePanelHost();
  return (
    <PanelLink
      href={href}
      onPointerEnter={() => host?.warmSettings()}
      onFocus={() => host?.warmSettings()}
      aria-label="Settings"
      title="Settings"
      className={cx(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text2 transition-colors",
        "hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      {/* The kit's sliders, the mark Settings' General tab carries too. */}
      <Glyph name="sliders" size={18} />
    </PanelLink>
  );
}
