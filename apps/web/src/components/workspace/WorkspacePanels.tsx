"use client";

import { useState, type ReactNode } from "react";

import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/classes";
import { Panel } from "@/components/ui/Panel";

/**
 * The workspace's three panels (hi-fi 04): Note & sources, Tutor, Studio.
 *
 * From 900px up they sit side by side at 290, the rest, and 310, each one the
 * height of the window so it scrolls on its own, and either side panel can
 * collapse to a 48px rail to give the tutor the room. Below 900px three
 * columns do not fit, so the panels become tabs and one shows at a time.
 *
 * The panels' contents are server-rendered and arrive as props; only the
 * layout state lives here.
 */

type PanelKey = "note" | "tutor" | "studio";

const TABS: { key: PanelKey; label: string }[] = [
  { key: "note", label: "Note & sources" },
  { key: "tutor", label: "Tutor" },
  { key: "studio", label: "Studio" },
];

function CollapseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden rounded-sm text-[12px] text-text3 underline-offset-4 hover:text-text2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent min-[900px]:inline"
      aria-label={`Collapse ${label}`}
    >
      collapse
    </button>
  );
}

/** A collapsed side panel: a 48px rail whose whole height expands it again. */
function Rail({ label, onExpand }: { label: string; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${label}`}
      className="hidden h-full w-12 flex-col items-center gap-3 rounded-2xl bg-surface py-4 text-[13px] font-semibold text-text2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent min-[900px]:flex"
    >
      <span aria-hidden className="text-[16px] leading-none">+</span>
      <span className="[writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}

export function WorkspacePanels({
  note,
  tutor,
  tutorAside,
  studio,
  initialPanel = "note",
}: {
  note: ReactNode;
  tutor: ReactNode;
  /** The quiet line at the right of the Tutor header. */
  tutorAside?: ReactNode;
  studio: ReactNode;
  /** The tab a phone opens on; the tutor when a session sent a question here. */
  initialPanel?: PanelKey;
}) {
  const [active, setActive] = useState<PanelKey>(initialPanel);
  const [noteOpen, setNoteOpen] = useState(true);
  const [studioOpen, setStudioOpen] = useState(true);

  // `hidden` below 900px unless this is the active tab. A wrapper carries it,
  // since a primitive's own `display` would win over a class passed to it.
  const shown = (key: PanelKey) => cx("min-h-0 min-w-0", active !== key && "max-[899px]:hidden");

  return (
    <div className="flex min-h-0 flex-col gap-4 min-[900px]:flex-1">
      <div role="group" aria-label="Workspace panels" className="flex gap-2 overflow-x-auto min-[900px]:hidden">
        {TABS.map((t) => (
          <Chip key={t.key} active={active === t.key} onClick={() => setActive(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      <div
        className={cx(
          "grid grid-cols-1 gap-4",
          // From 900px up the page is fixed to the viewport (`data-layout="workspace"`),
          // so the grid takes whatever height is left and the panels scroll inside.
          "min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:grid-rows-[minmax(0,1fr)]",
          noteOpen ? "min-[900px]:[--note-w:250px] xl:[--note-w:290px]" : "min-[900px]:[--note-w:48px]",
          studioOpen ? "min-[900px]:[--studio-w:270px] xl:[--studio-w:310px]" : "min-[900px]:[--studio-w:48px]",
          "min-[900px]:grid-cols-[var(--note-w)_minmax(0,1fr)_var(--studio-w)]",
        )}
      >
        <div className={shown("note")}>
          {!noteOpen && <Rail label="Note & sources" onExpand={() => setNoteOpen(true)} />}
          {/* Collapsing hides the panel from 900px up only: below that there is no rail, just tabs. */}
          <div className={cx("h-full", !noteOpen && "min-[900px]:hidden")}>
            <Panel
              title="Note & sources"
              actions={<CollapseButton label="Note & sources" onClick={() => setNoteOpen(false)} />}
              className="h-full"
              bodyClassName="gap-4 min-[900px]:overflow-y-auto"
            >
              {note}
            </Panel>
          </div>
        </div>

        <div className={shown("tutor")}>
          <Panel
            title="Tutor"
            actions={tutorAside}
            className="h-full max-[899px]:min-h-[70dvh]"
            // A last resort for a window too short for even the shrunk thread,
            // the chips and the composer: the body scrolls rather than clips.
            bodyClassName="gap-3.5 min-[900px]:overflow-y-auto"
          >
            {tutor}
          </Panel>
        </div>

        <div className={shown("studio")}>
          {!studioOpen && <Rail label="Studio" onExpand={() => setStudioOpen(true)} />}
          <div className={cx("h-full", !studioOpen && "min-[900px]:hidden")}>
            <Panel
              title="Studio"
              actions={<CollapseButton label="Studio" onClick={() => setStudioOpen(false)} />}
              className="h-full"
              bodyClassName="gap-2.5 min-[900px]:overflow-y-auto"
            >
              {studio}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
