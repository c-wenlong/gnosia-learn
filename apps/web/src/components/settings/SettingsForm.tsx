"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DISPLAY_NAME_MAX, PREFERENCE_KEYS } from "@self-learn/schema/shared";

import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Collapse } from "@/components/ui/Collapse";
import { LiveStatus, type StatusTone } from "@/components/ui/LiveStatus";
import { buttonClasses, inputClasses } from "@/components/ui/classes";
import { useLearner } from "@/lib/learner-context";
import { applyMotionToDocument, readMotionCookie, writeMotionCookie } from "@/lib/motion";
import {
  MOTION_MODES,
  TUTOR_STYLES,
  type MotionMode,
  type TutorStyle,
} from "@/lib/preferences";
import type { SettingsSnapshot } from "@/lib/settings";

/**
 * The Settings page's cards: the name the sidebar shows, then the hi-fi 12's
 * two (hi-fi 12, less the Habit card, which went
 * with the streak and the daily target: H1 of docs/proposals/home-page.md).
 * Each select saves on change through `POST /api/learner/preference` and says
 * what happened beside it. The theme is `ThemeSwitch`, which goes through the
 * provider's `setThemeMode` and so also writes the cookie the layout reads.
 * Motion is applied the same way, at once and before the save lands: the
 * `self-learn-motion` cookie and `data-motion` on <html> (`@/lib/motion`).
 */

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/** What a status says, for `LiveStatus`: nothing while idle. */
function statusLine(status: Status | undefined, words: { saving: string; saved: string }): { text: string | null; tone: StatusTone } {
  switch (status?.kind) {
    case "saving":
      return { text: words.saving, tone: "muted" };
    case "saved":
      return { text: words.saved, tone: "ok" };
    case "error":
      return { text: status.message, tone: "danger" };
    default:
      return { text: null, tone: "muted" };
  }
}

async function savePreference(key: string, value: unknown): Promise<string | null> {
  try {
    const response = await fetch("/api/learner/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (response.ok && payload.ok !== false) return null;
    return payload.error ?? `Not saved (HTTP ${response.status}).`;
  } catch {
    return "Not saved: the server did not answer.";
  }
}

/**
 * One select's value, its save, and what to say about it.
 *
 * Saves to one key run one after another: two quick changes are two requests,
 * and if they ran side by side the first could land last and leave the row
 * on the older choice while the select shows the newer one. Only the newest save reports, so an earlier one finishing late
 * cannot print "Saved" over a later one still in flight.
 */
function usePreference<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(0);
  const save = (next: T) => {
    setValue(next);
    setStatus({ kind: "saving" });
    const mine = ++latest.current;
    const run = chain.current.then(() => savePreference(key, next));
    chain.current = run;
    void run.then((error) => {
      if (mine !== latest.current) return;
      if (error === null) {
        setStatus({ kind: "saved" });
      } else {
        setStatus({ kind: "error", message: error });
      }
    });
  };
  return { value, status, save };
}

export function SettingsForm({
  settings,
  providers,
  chain,
  topicIds,
}: {
  settings: SettingsSnapshot;
  /**
   * What the tutor tries, in order, and whose key each uses: the providers
   * with a key, or with a model chain the chain's entries with a key, by
   * model id (docs/TUTOR-MODELS.md).
   */
  providers: { id: string; label: string; source: "saved" | "server" }[];
  /** Whether `providers` is the owner's model chain rather than the built-in defaults. */
  chain: boolean;
  /** Every curriculum item id, for Reset progress. */
  topicIds: string[];
}) {
  const tutor = usePreference<TutorStyle>(PREFERENCE_KEYS.tutorStyle, settings.tutorStyle);
  const motion = usePreference<MotionMode>(PREFERENCE_KEYS.reducedMotion, settings.motion);

  // The stored row is the truth once it has been read: a browser whose
  // cookie disagrees (a save that failed, a change made in another browser)
  // is brought in line with what this page shows.
  const storedMotion = settings.reachable ? settings.motion : null;
  useEffect(() => {
    if (storedMotion === null || readMotionCookie() === storedMotion) return;
    writeMotionCookie(storedMotion);
    applyMotionToDocument(storedMotion);
  }, [storedMotion]);

  const bkt = settings.bkt;

  return (
    <>
      <Card title="Profile">
        <NameField />
      </Card>

      <Card title="Appearance and tutor">
        <Field label="Theme" note="Classic is the original palette and Gnosia the brand's; each has a light and a dark. System follows your device.">
          {(id) => <ThemeSwitch id={id} labelledBy={`${id}-label`} />}
        </Field>
        <Field label="Tutor style" note="Used by the concept tutor and the questions in a session, from the next message." status={tutor.status}>
          {(id) => (
            <Select id={id} value={tutor.value} onChange={(v) => tutor.save(v as TutorStyle)}>
              {TUTOR_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Motion"
          note="Always reduce motion stops the app's animations in this browser, whatever your device says. Respect system follows your device's setting."
          status={motion.status}
        >
          {(id) => (
            <Select
              id={id}
              value={motion.value}
              onChange={(v) => {
                const mode = v as MotionMode;
                // At once, and whether or not the save lands, as the theme
                // does: the cookie is what the next page's first paint reads.
                applyMotionToDocument(mode);
                writeMotionCookie(mode);
                motion.save(mode);
              }}
            >
              {MOTION_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Card>

      <Card title="Model">
        <Field label="BKT priors" note="Advanced. Read-only here: the learn CLI owns them, and they change future observations only.">
          {(id) => (
            <ReadOnly id={id}>
              {bkt === null
                ? "Not read: the database is unreachable"
                : `pL0 ${short(bkt.pL0)} · pT ${short(bkt.pT)} · pG ${short(bkt.pG)} · pS ${short(bkt.pS)}`}
            </ReadOnly>
          )}
        </Field>
        <Field
          label="Model providers"
          note={
            chain
              ? "Your models, tried in this order. Change them under Models."
              : "The built-in defaults, tried in this order: your own keys first, then the server's. Choose your own under Models."
          }
        >
          {(id) => (
            <ReadOnly id={id} title={providers.map((p) => `${p.label}, ${p.source === "saved" ? "your key" : "server key"}`).join(" → ")}>
              {providers.length === 0
                ? chain
                  ? "None: no model in your list has a key"
                  : "None yet: add a key under Provider keys"
                : providers.map((p) => `${p.id} (${p.source === "saved" ? "yours" : "server"})`).join(" → ")}
            </ReadOnly>
          )}
        </Field>
        <DataActions topicIds={topicIds} />
      </Card>
    </>
  );
}

/**
 * The name at the foot of the sidebar (`learner.display_name`). Saved on
 * Enter or when the field loses focus, through the provider, so the sidebar
 * changes the moment it is saved; empty clears it and the row says "Account".
 */
export function NameField() {
  const { state, setDisplayName } = useLearner();
  const saved = state.displayName ?? "";
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // A newer name from the server (a refresh, another tab's save) replaces an
  // untouched field, so a focus and blur cannot save the old one over it. A
  // field being edited keeps what is typed, and so does one whose save is
  // still in flight: a refresh then can still carry the name before it.
  const [base, setBase] = useState(saved);
  if (saved !== base) {
    setBase(saved);
    if (draft === base && status.kind !== "saving") setDraft(saved);
  }
  const latest = useRef(0);
  const save = () => {
    const next = draft.replace(/\s+/g, " ").trim();
    // After a failed save the provider still holds the name it tried, so the
    // same text is sent again rather than taken as already stored.
    if (next === saved && status.kind !== "error") return;
    if (next.length > DISPLAY_NAME_MAX) {
      setStatus({ kind: "error", message: `At most ${DISPLAY_NAME_MAX} characters.` });
      return;
    }
    setDraft(next);
    setStatus({ kind: "saving" });
    const mine = ++latest.current;
    void setDisplayName(next).then((ok) => {
      if (mine !== latest.current) return;
      setStatus(ok ? { kind: "saved" } : { kind: "error", message: "Not saved: the database did not answer." });
    });
  };
  return (
    <Field label="Name" note="Shown at the foot of the sidebar. Leave it empty to show Account." status={status}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={draft}
          autoComplete="name"
          placeholder="Your name"
          aria-describedby={`${id}-note`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          className={inputClasses()}
        />
      )}
    </Field>
  );
}

/** Three significant decimals at most, trailing zeros dropped: 0.25, 0.1. */
function short(n: number): string {
  return String(Number(n.toFixed(3)));
}

function Field({
  label,
  note,
  status,
  children,
}: {
  label: string;
  note?: string;
  status?: Status;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      <div className="flex flex-col gap-0.5 md:w-[320px] md:shrink-0">
        <label id={`${id}-label`} htmlFor={id} className="text-[14px] font-medium text-text">
          {label}
        </label>
        {note !== undefined && (
          <p id={`${id}-note`} className="text-[12px] text-text2">
            {note}
          </p>
        )}
      </div>
      <div className="w-full md:w-[300px] md:shrink-0">{children(id)}</div>
      <div className="min-w-0 md:flex-1">
        <LiveStatus {...statusLine(status, { saving: "Saving…", saved: "Saved" })} />
      </div>
    </div>
  );
}

/** Kit `Input` holding a native select, with a chevron in place of the platform arrow. */
function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses({ className: "cursor-pointer appearance-none pr-10" })}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-text2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </div>
  );
}

/** The input box, holding text that cannot be changed here. */
function ReadOnly({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  return (
    <output
      id={id}
      title={title || undefined}
      className="flex h-11 w-full min-w-0 items-center truncate rounded-lg border-2 border-border bg-surface px-3.5 text-[14px] text-text"
    >
      <span className="truncate">{children}</span>
    </output>
  );
}

/**
 * Export and Reset. Export is a plain link, not `next/link`: it answers with
 * a file, and a client-side navigation would try to render it as a page.
 *
 * Reset asks first, in place, and says what it keeps. It goes through the
 * provider's `resetCourse`, the same call a course page's reset makes, so it
 * waits behind any tick or note still being saved (a write landing after the
 * delete would recreate the row). It says "reset" only once the write has
 * been stored; a refusal is said here and in the shell's banner.
 *
 * The confirm and the status line glide open and shut (`Collapse`,
 * `LiveStatus`). Closing the confirm, by Cancel or by a reset that landed,
 * puts focus back on Reset progress, since the button pressed is inside the
 * fold that just closed.
 */
function DataActions({ topicIds }: { topicIds: string[] }) {
  const { resetCourse } = useLearner();
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const confirmId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  // Set before the state that closes the confirm, focused once it has rendered.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || confirming) return;
    refocus.current = false;
    toggle.current?.focus();
  }, [confirming]);

  const close = () => {
    // Only when focus was inside the fold (or was dropped by a button that
    // went disabled): never pull it back from somewhere the person moved it.
    const at = document.activeElement;
    if (confirming && (at === null || at === document.body || document.getElementById(confirmId)?.contains(at))) {
      refocus.current = true;
    }
    setConfirming(false);
  };

  const reset = async () => {
    setStatus({ kind: "saving" });
    const stored = await resetCourse(topicIds);
    if (stored) {
      close();
      setStatus({ kind: "saved" });
    } else {
      setStatus({ kind: "error", message: "Not reset: the write was not stored." });
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2.5">
        <a href="/api/learner/export" className={buttonClasses({ variant: "secondary" })}>
          Export learner data
        </a>
        <Button
          ref={toggle}
          variant="secondary"
          aria-expanded={confirming}
          aria-controls={confirmId}
          onClick={() => {
            setConfirming((v) => !v);
            setStatus({ kind: "idle" });
          }}
        >
          Reset progress
        </Button>
      </div>
      <Collapse open={confirming} id={confirmId} className="pt-3">
        <div role="group" aria-label="Confirm reset" className="flex flex-col gap-3 rounded-2xl border-2 border-warn bg-warn-tint p-4">
          <p className="text-[14px] text-text">
            Clear the ticks and notes on every course? Mastery, review cards and saved recaps are kept. This cannot be
            undone.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="warn" size="sm" disabled={status.kind === "saving"} onClick={() => void reset()}>
              Reset every course
            </Button>
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      </Collapse>
      <LiveStatus
        {...statusLine(status, { saving: "Resetting…", saved: "Progress reset. Ticks and notes are cleared." })}
        className="pt-3"
      />
    </div>
  );
}
