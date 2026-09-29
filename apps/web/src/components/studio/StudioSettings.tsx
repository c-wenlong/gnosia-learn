"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { StudioAgentPreference } from "@self-learn/schema/shared";

import { saveStudioAgent } from "@/app/(app)/studio/actions";
import { cx } from "@/components/ui/classes";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { Glyph } from "@/components/ui/Glyph";
import { Panel } from "@/components/ui/Panel";
import {
  AGENT_ROWS,
  effortOptions,
  modelOptions,
  storedAgent,
  type AgentDefaults,
  type AgentKind,
} from "@/lib/studio-agent-settings";

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
  initial,
  defaults,
  reachable,
}: {
  initial: Record<AgentKind, StudioAgentPreference>;
  defaults: AgentDefaults | null;
  /** Whether the catalog answered the read: with it down, a save cannot land either. */
  reachable: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [notes, setNotes] = useState<Partial<Record<AgentKind, { ok: boolean; text: string }>>>({});
  const [saving, startSaving] = useTransition();

  function change(kind: AgentKind, patch: Partial<StudioAgentPreference>) {
    const previous = values[kind];
    const next = { ...previous, ...patch };
    setValues((held) => ({ ...held, [kind]: next }));
    setNotes((held) => ({ ...held, [kind]: undefined }));
    startSaving(async () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("model", next.model);
      form.set("effort", next.effort);
      const result = await saveStudioAgent(form);
      if (result.ok) {
        setNotes((held) => ({ ...held, [kind]: { ok: true, text: "Saved" } }));
        return;
      }
      // A refused save puts the menu back: what is shown is what is stored.
      setValues((held) => ({ ...held, [kind]: previous }));
      setNotes((held) => ({ ...held, [kind]: { ok: false, text: result.error ?? "Not saved." } }));
    });
  }

  return (
    <Panel as="div" aria-label="Agents" className="rounded-none" bodyClassName="gap-5 p-5">
      {!reachable && (
        <p role="status" className="rounded-lg bg-warn-tint px-3 py-2 text-[13px] leading-5 text-text">
          The catalog is not answering, so these show the defaults and a change cannot be saved yet.
        </p>
      )}
      {AGENT_ROWS.map((row) => {
        const value = values[row.kind];
        const note = notes[row.kind];
        const fallback = storedAgent(row.kind, null);
        return (
          <div key={row.kind} className="flex flex-col gap-2">
            <h3 className="text-[14px] font-semibold text-text">{row.name}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <FilterMenu
                label="Model"
                options={modelOptions(value.model, defaults)}
                value={value.model}
                defaultValue={fallback.model}
                onChange={(model) => change(row.kind, { model })}
                busy={saving}
              />
              <FilterMenu
                label="Effort"
                options={effortOptions(defaults)}
                value={value.effort}
                defaultValue={fallback.effort}
                onChange={(effort) => change(row.kind, { effort: effort as StudioAgentPreference["effort"] })}
                busy={saving}
              />
              {note !== undefined && (
                <span role={note.ok ? "status" : "alert"} className={cx("text-[12px]", note.ok ? "text-text3" : "text-danger")}>
                  {note.text}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

/** The strip's way in: a quiet icon button beside Display and Sort. */
export function SettingsLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label="Settings"
      title="Settings"
      className={cx(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text2 transition-colors",
        "hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      <Glyph name="settings" size={18} />
    </Link>
  );
}
