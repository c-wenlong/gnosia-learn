"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";

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
 *
 * **Motion** (docs/design/IMPLEMENTATION.md, "Motion"). A side panel folds by
 * animating the grid's columns (200ms, `ease-soft`), so the tutor widens as
 * the panel narrows. Both the panel and its rail stay mounted: the panel keeps
 * its open width inside a column that clips it, so its text slides away
 * whole instead of re-wrapping at every frame, and fades out, then turns
 * `invisible` and `inert`; the rail fades in over it. The control pressed
 * hands the focus to the one that undoes it. On a phone a tab that comes into
 * view fades in (`@starting-style`); the one leaving goes at once, since two
 * stacked panels for a moment would jolt the page.
 */

type PanelKey = "note" | "tutor" | "studio";

const TABS: { key: PanelKey; label: string }[] = [
  { key: "note", label: "Note & sources" },
  { key: "tutor", label: "Tutor" },
  { key: "studio", label: "Studio" },
];

const WIDE = "(min-width: 900px)";

function subscribeWide(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the panels sit side by side (900px up). False on the server and the first client render. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => typeof window.matchMedia === "function" && window.matchMedia(WIDE).matches,
    () => false,
  );
}

function CollapseButton({
  label,
  onClick,
  buttonRef,
}: {
  label: string;
  onClick: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="hidden rounded-sm text-[12px] text-text3 underline-offset-4 transition-colors duration-100 hover:text-text2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none min-[900px]:inline"
      aria-label={`Collapse ${label}`}
    >
      Collapse
    </button>
  );
}

/**
 * A collapsed side panel: a 48px rail whose whole height expands it again.
 * Always mounted, over the panel's column; it fades in once the panel folds.
 */
function Rail({
  label,
  open,
  onExpand,
  buttonRef,
}: {
  label: string;
  /** Whether the panel is open, and so the rail is away. */
  open: boolean;
  onExpand: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${label}`}
      inert={open}
      data-rail={open ? "away" : "shown"}
      className={cx(
        "absolute inset-y-0 left-0 z-10 hidden w-12 flex-col items-center gap-3 rounded-2xl bg-surface py-4 text-[13px] font-semibold text-text2 min-[900px]:flex",
        "duration-200 ease-soft hover:text-text motion-reduce:transition-none",
        // Inset, so the column that clips the panel does not clip the ring.
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        // Visibility waits for the fade out, but not in: an element still hidden
        // at the start of its fade could not take the focus handed to it.
        open ? "invisible opacity-0 transition-[opacity,visibility,color]" : "opacity-100 transition-[opacity,color]",
      )}
    >
      <span aria-hidden className="text-[16px] leading-none">+</span>
      <span className="[writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}

/**
 * A side panel's place in the grid from 900px up: its column clips the panel,
 * which keeps its open width (`openWidth`), so folding slides it out whole.
 * `edge` is the side it leaves by. Below 900px it is an ordinary block.
 */
function SidePanel({
  label,
  open,
  wide,
  edge,
  openWidth,
  onCollapse,
  onExpand,
  railRef,
  collapseRef,
  bodyClassName,
  children,
}: {
  label: string;
  open: boolean;
  wide: boolean;
  edge: "left" | "right";
  openWidth: string;
  onCollapse: () => void;
  onExpand: () => void;
  railRef: RefObject<HTMLButtonElement | null>;
  collapseRef: RefObject<HTMLButtonElement | null>;
  bodyClassName: string;
  children: ReactNode;
}) {
  // Folded is a desktop state: below 900px there is no rail, so the panel shows as a tab whatever it was.
  const folded = wide && !open;
  return (
    <div className={cx("h-full min-[900px]:relative min-[900px]:overflow-hidden", edge === "left" && "min-[900px]:flex min-[900px]:justify-end")}>
      <Rail label={label} open={open} onExpand={onExpand} buttonRef={railRef} />
      <div
        inert={folded}
        data-folded={folded ? "true" : "false"}
        className={cx(
          "h-full min-[900px]:shrink-0 min-[900px]:duration-200 min-[900px]:ease-soft min-[900px]:motion-reduce:transition-none",
          openWidth,
          // As the rail: visibility waits for the fade out, and not in, so Collapse can take the focus at once.
          open ? "min-[900px]:transition-opacity" : "min-[900px]:invisible min-[900px]:opacity-0 min-[900px]:transition-[opacity,visibility]",
        )}
      >
        <Panel
          title={label}
          aria-label={label}
          headerClassName="max-[899px]:hidden"
          actions={<CollapseButton label={label} onClick={onCollapse} buttonRef={collapseRef} />}
          className="h-full"
          bodyClassName={bodyClassName}
        >
          {children}
        </Panel>
      </div>
    </div>
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
  const wide = useWide();
  const noteRail = useRef<HTMLButtonElement>(null);
  const noteCollapse = useRef<HTMLButtonElement>(null);
  const studioRail = useRef<HTMLButtonElement>(null);
  const studioCollapse = useRef<HTMLButtonElement>(null);

  /** Fold or open a side panel, and hand the focus to the control that undoes it. */
  const toggle = (set: (open: boolean) => void, open: boolean, next: RefObject<HTMLButtonElement | null>) => {
    set(open);
    // After the render that lifts `inert` from it.
    requestAnimationFrame(() => next.current?.focus({ preventScroll: true }));
  };

  // `hidden` below 900px unless this is the active tab. A wrapper carries it,
  // since a primitive's own `display` would win over a class passed to it. A
  // tab coming into view fades in from its starting style.
  const shown = (key: PanelKey) =>
    cx(
      "min-h-0 min-w-0",
      "max-[899px]:transition-opacity max-[899px]:duration-150 max-[899px]:ease-out max-[899px]:starting:opacity-0 max-[899px]:motion-reduce:transition-none",
      active !== key && "max-[899px]:hidden",
    );
  // Below 900px the tab row names the one panel on show, so its title would
  // repeat the tab just pressed. The note and studio headers hold nothing else
  // there (Collapse is desktop-only) and go; the tutor's keeps its style line
  // and Settings link, with only the title hidden. The section keeps its name
  // for a screen reader either way.
  const phoneTitle = "max-[899px]:sr-only";

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
          // The open widths, once: the columns and the panels inside them both read them.
          "min-[900px]:[--note-open:250px] min-[900px]:[--studio-open:270px] xl:[--note-open:290px] xl:[--studio-open:310px]",
          noteOpen ? "min-[900px]:[--note-w:var(--note-open)]" : "min-[900px]:[--note-w:48px]",
          studioOpen ? "min-[900px]:[--studio-w:var(--studio-open)]" : "min-[900px]:[--studio-w:48px]",
          "min-[900px]:grid-cols-[var(--note-w)_minmax(0,1fr)_var(--studio-w)]",
          "min-[900px]:transition-[grid-template-columns] min-[900px]:duration-200 min-[900px]:ease-soft min-[900px]:motion-reduce:transition-none",
        )}
      >
        <div className={shown("note")} data-panel="note" data-active={active === "note"}>
          <SidePanel
            label="Note & sources"
            open={noteOpen}
            wide={wide}
            edge="left"
            openWidth="min-[900px]:w-[var(--note-open)]"
            onCollapse={() => toggle(setNoteOpen, false, noteRail)}
            onExpand={() => toggle(setNoteOpen, true, noteCollapse)}
            railRef={noteRail}
            collapseRef={noteCollapse}
            bodyClassName="gap-4 min-[900px]:overflow-y-auto"
          >
            {note}
          </SidePanel>
        </div>

        <div className={shown("tutor")} data-panel="tutor" data-active={active === "tutor"}>
          <Panel
            title="Tutor"
            aria-label="Tutor"
            titleClassName={phoneTitle}
            actions={tutorAside}
            className="h-full max-[899px]:min-h-[70dvh]"
            // A last resort for a window too short for even the shrunk thread,
            // the chips and the composer: the body scrolls rather than clips.
            bodyClassName="gap-3.5 min-[900px]:overflow-y-auto"
          >
            {tutor}
          </Panel>
        </div>

        <div className={shown("studio")} data-panel="studio" data-active={active === "studio"}>
          <SidePanel
            label="Studio"
            open={studioOpen}
            wide={wide}
            edge="right"
            openWidth="min-[900px]:w-[var(--studio-open)]"
            onCollapse={() => toggle(setStudioOpen, false, studioRail)}
            onExpand={() => toggle(setStudioOpen, true, studioCollapse)}
            railRef={studioRail}
            collapseRef={studioCollapse}
            bodyClassName="gap-2.5 min-[900px]:overflow-y-auto"
          >
            {studio}
          </SidePanel>
        </div>
      </div>
    </div>
  );
}
