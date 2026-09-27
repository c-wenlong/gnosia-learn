"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";
import { PREFERENCE_KEYS } from "@self-learn/schema/shared";

import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { buttonClasses, cx, inputClasses } from "@/components/ui/classes";
import type { DailyTarget } from "@/lib/habit-core";
import { useLearner } from "@/lib/learner-context";
import {
  leewayChoices,
  MOTION_MODES,
  targetChoices,
  targetKey,
  TUTOR_STYLES,
  type MotionMode,
  type TutorStyle,
} from "@/lib/preferences";
import type { SettingsSnapshot } from "@/lib/settings";

/**
 * The Settings page's three cards (hi-fi 12). Each select saves on change
 * through `POST /api/learner/preference` and says what happened beside it.
 *
 * Saving the target or the leeway calls `router.refresh()`: the top bar's
 * pills are computed by the root layout, which Next keeps mounted, so without
 * it the pill would still show the old target. The theme is `ThemeSwitch`,
 * which goes through the provider's `setThemeMode` and so also writes the
 * cookie the layout reads.
 */

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

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
 * (and the refreshed top bar) on the older choice while the select shows the
 * newer one. Only the newest save reports, so an earlier one finishing late
 * cannot print "Saved" over a later one still in flight.
 */
function usePreference<T>(key: string, initial: T, afterSave?: () => void) {
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
        afterSave?.();
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
  topicIds,
}: {
  settings: SettingsSnapshot;
  /** The providers with a key on this server, in the order they are tried. */
  providers: { id: string; label: string }[];
  /** Every curriculum item id, for Reset progress. */
  topicIds: string[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const target = usePreference<DailyTarget>(PREFERENCE_KEYS.dailyTarget, settings.target, refresh);
  const leeway = usePreference<number>(PREFERENCE_KEYS.dailyLeeway, settings.leeway, refresh);
  const tutor = usePreference<TutorStyle>(PREFERENCE_KEYS.tutorStyle, settings.tutorStyle);
  const motion = usePreference<MotionMode>(PREFERENCE_KEYS.reducedMotion, settings.motion);

  const choices = targetChoices(target.value);
  const bkt = settings.bkt;

  return (
    <>
      <Card title="Habit">
        <Field label="Daily target" note="You set it. The app never raises it." status={target.status}>
          {(id) => (
            <Select
              id={id}
              value={targetKey(target.value)}
              onChange={(key) => {
                const choice = choices.find((c) => c.value === key);
                if (choice !== undefined) target.save(choice.target);
              }}
            >
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Streak leeway" status={leeway.status}>
          {(id) => (
            <Select id={id} value={String(leeway.value)} onChange={(v) => leeway.save(Number(v))}>
              {leewayChoices().map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reminders" note="Not built yet, so nothing is stored or sent.">
          {(id) => (
            <Select id={id} value="off" disabled describedBy={`${id}-note`} onChange={() => undefined}>
              <option value="off">Off</option>
            </Select>
          )}
        </Field>
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
        <Field label="Motion" note="Saved, not applied yet: only your system's reduced-motion setting is honoured today." status={motion.status}>
          {(id) => (
            <Select id={id} value={motion.value} onChange={(v) => motion.save(v as MotionMode)}>
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
        <Field label="Model providers" note="Tried in this order. Set by the API keys on the server.">
          {(id) => (
            <ReadOnly id={id} title={providers.map((p) => p.label).join(" → ")}>
              {providers.length === 0 ? "None configured on this server" : providers.map((p) => p.id).join(" → ")}
            </ReadOnly>
          )}
        </Field>
        <DataActions topicIds={topicIds} />
      </Card>
    </>
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
      <p aria-live="polite" className="min-w-0 text-[12px] md:flex-1">
        {status?.kind === "saving" && <span className="text-text3">Saving…</span>}
        {status?.kind === "saved" && <span className="text-ok-text">Saved</span>}
        {status?.kind === "error" && <span className="text-danger">{status.message}</span>}
      </p>
    </div>
  );
}

/** Kit `Input` holding a native select, with a chevron in place of the platform arrow. */
function Select({
  id,
  value,
  onChange,
  disabled,
  describedBy,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The id of the text that says why it is disabled. */
  describedBy?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy}
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
 */
function DataActions({ topicIds }: { topicIds: string[] }) {
  const { resetCourse } = useLearner();
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const reset = async () => {
    setStatus({ kind: "saving" });
    const stored = await resetCourse(topicIds);
    if (stored) {
      setConfirming(false);
      setStatus({ kind: "saved" });
    } else {
      setStatus({ kind: "error", message: "Not reset: the write was not stored." });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <a href="/api/learner/export" className={buttonClasses({ variant: "secondary" })}>
          Export learner data
        </a>
        <Button
          variant="secondary"
          aria-expanded={confirming}
          onClick={() => {
            setConfirming((v) => !v);
            setStatus({ kind: "idle" });
          }}
        >
          Reset progress
        </Button>
      </div>
      {confirming && (
        <div role="group" aria-label="Confirm reset" className="flex flex-col gap-3 rounded-2xl border-2 border-warn bg-warn-tint p-4">
          <p className="text-[14px] text-text">
            Clear the ticks and notes on every course? Mastery, review cards and saved recaps are kept. This cannot be
            undone.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="warn" size="sm" disabled={status.kind === "saving"} onClick={() => void reset()}>
              Reset every course
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <p aria-live="polite" className={cx("text-[12px]", status.kind === "idle" && "sr-only")}>
        {status.kind === "saving" && <span className="text-text3">Resetting…</span>}
        {status.kind === "saved" && <span className="text-ok-text">Progress reset. Ticks and notes are cleared.</span>}
        {status.kind === "error" && <span className="text-danger">{status.message}</span>}
      </p>
    </div>
  );
}
