"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AVATARS, avatarLabel, DISPLAY_NAME_MAX, PREFERENCE_KEYS, type AvatarId } from "@gnosia/schema/shared";

import { ThemeSwitch } from "@/components/ThemeSwitch";
import { PixelAvatar } from "@/components/avatar/PixelAvatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmFold } from "@/components/ui/ConfirmFold";
import { FormRow, type FormRowField } from "@/components/ui/FormRow";
import { Input } from "@/components/ui/Input";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { Select } from "@/components/ui/Select";
import { buttonClasses, cx, inputClasses } from "@/components/ui/classes";
import { isImeKey } from "@/components/ui/composer-keys";
import { statusProps, useSaveStatus, type SaveStatus } from "@/components/ui/save-status";
import { useLearner } from "@/lib/learner-context";
import { applyMotionToDocument, readMotionCookie, writeMotionCookie } from "@/lib/motion";
import { sendJson } from "@/lib/send-json";
import { MOTION_MODES, type MotionMode } from "@/lib/preferences";
import type { SettingsSnapshot } from "@/lib/settings";

/**
 * The Settings page's cards, one export per tab (`SettingsTabs`): the hi-fi
 * 12's cards (less the Habit card, which went with the streak and the daily
 * target: H1 of docs/proposals/home-page.md), regrouped so each tab is short.
 * Each select saves on change through `POST /api/learner/preference` and says
 * what happened beside it. The theme is `ThemeSwitch`, which goes through the
 * provider's `setThemeMode` and so also writes the cookie the layout reads.
 * Motion is applied the same way, at once and before the save lands: the
 * `gnosia-motion` cookie and `data-motion` on <html> (`@/lib/motion`).
 */

async function savePreference(key: string, value: unknown): Promise<string | null> {
  const reply = await sendJson<{ ok?: boolean; error?: string }>("POST", "/api/learner/preference", { key, value });
  if (reply === null) return "Not saved: the server did not answer.";
  if (reply.ok && reply.data.ok !== false) return null;
  return reply.data.error ?? `Not saved (HTTP ${reply.status}).`;
}

/**
 * One select's value, its save, and what to say about it.
 *
 * Saves to one key run one after another: two quick changes are two requests,
 * and if they ran side by side the first could land last and leave the row
 * on the older choice while the select shows the newer one. Only the newest
 * save reports (`useSaveStatus`). A failed save leaves the new choice on
 * screen, with the error beside it, rather than putting the old one back.
 */
export function usePreference<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const { status, track } = useSaveStatus();
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const save = (next: T) => {
    setValue(next);
    const run = chain.current.then(() => savePreference(key, next));
    chain.current = run;
    track(run);
  };
  return { value, status, save };
}

/** The General tab: how the app looks and moves. */
export function GeneralSettings({ settings }: { settings: SettingsSnapshot }) {
  const motion = usePreference<MotionMode>(PREFERENCE_KEYS.reducedMotion, settings.motion);

  // The stored row wins, as the layout's `MotionSeed` has it. The layout
  // stays mounted across client navigations and its seed does not run
  // again, so this page brings the cookie in line with the row it read
  // fresh: a refused save, or a change made in another browser.
  const storedMotion = settings.reachable ? settings.motion : null;
  useEffect(() => {
    if (storedMotion === null || readMotionCookie() === storedMotion) return;
    writeMotionCookie(storedMotion);
    applyMotionToDocument(storedMotion);
  }, [storedMotion]);
  return (
    <Card title="Appearance">
      <Field label="Theme" note="Classic is the original palette and Gnosia the brand's; each has a light and a dark. System follows your device.">
        {({ id, labelId }) => <ThemeSwitch id={id} labelledBy={labelId} />}
      </Field>
      <Field
        label="Motion"
        note="Always reduce motion stops the app's animations in this browser, whatever your device says. Respect system follows your device's setting."
        status={motion.status}
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            label="Motion"
            describedBy={describedBy}
            options={MOTION_MODES.map((m) => ({ value: m.id, label: m.label }))}
            value={motion.value}
            onChange={(v) => {
              const mode = v as MotionMode;
              // At once, and whether or not the save lands, as the theme
              // does: the cookie is what the next page's first paint reads.
              applyMotionToDocument(mode);
              writeMotionCookie(mode);
              motion.save(mode);
            }}
          />
        )}
      </Field>
    </Card>
  );
}

/** The Profile tab: who the app says you are, and the sprite beside it. */
export function ProfileSettings() {
  return (
    <>
      <Card>
        <NameField />
      </Card>
      <Card title="Avatar">
        <AvatarPicker />
      </Card>
    </>
  );
}

/**
 * The twelve sprites as one radio group (`AVATARS`), saved the moment one is
 * chosen, through the provider, so the sidebar changes with it. Native
 * radios under the tiles give the arrow keys, the tab stop and the screen
 * reader's "3 of 12" for free; the tile is the radio's label.
 *
 * With the database unreachable the state holds no sprite, and the group
 * says so rather than showing a choice it cannot save.
 */
export function AvatarPicker() {
  const { state, setAvatar } = useLearner();
  const { status, track } = useSaveStatus();
  const name = useId();
  const current = state.avatar;

  // Chosen on `click`, which a radio fires on a press or an arrow key even
  // when it is already checked, so the sprite a failed save left showing can
  // be chosen again to retry; `change` would not fire for it.
  const choose = (avatar: AvatarId) => {
    if (avatar === current && status.kind !== "error") return;
    track(setAvatar(avatar).then((ok) => (ok ? null : "Not saved: the database did not answer. Choose it again to retry.")));
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="sr-only">Avatar</legend>
      <div>
        <p id={`${name}-note`} className="text-[12px] text-text2">
          {current === undefined
            ? "Not read: the database is unreachable."
            : "Drawn at random when your account was made. Shown at the foot of the sidebar."}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {AVATARS.map((avatar) => {
          const on = avatar === current;
          return (
            <label
              key={avatar}
              className={cx(
                "group flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-2.5",
                "transition-colors duration-150 motion-reduce:transition-none",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                on ? "border-accent bg-surface2" : "border-transparent hover:bg-surface2",
                current === undefined && "pointer-events-none opacity-50",
              )}
            >
              <input
                type="radio"
                name={name}
                value={avatar}
                checked={on}
                disabled={current === undefined}
                aria-describedby={`${name}-note`}
                onClick={() => choose(avatar)}
                // Saving is on `click` (see `choose`); this only keeps the
                // controlled radio from being read-only to React.
                onChange={() => {}}
                className="sr-only"
              />
              <PixelAvatar
                avatar={avatar}
                className={cx(
                  "size-12 transition-transform duration-150 motion-reduce:transition-none",
                  on ? "scale-105" : "group-hover:scale-105",
                )}
              />
              <span className={cx("text-[12px]", on ? "font-semibold text-text" : "text-text2")}>{avatarLabel(avatar)}</span>
            </label>
          );
        })}
      </div>
      <LiveStatus {...statusProps(status)} />
    </fieldset>
  );
}

/** The Data tab: the mastery model's priors, read-only, then export and reset. */
export function DataSettings({
  settings,
  topicIds,
}: {
  settings: SettingsSnapshot;
  /** Every curriculum item id, for Reset progress. */
  topicIds: string[];
}) {
  const bkt = settings.bkt;
  return (
    <>
      <Card title="Mastery model">
        <Field label="BKT priors" note="Advanced. Read-only here: the learn CLI owns them, and they change future observations only.">
          {(field) => (
            <ReadOnly field={field}>
              {bkt === null
                ? "Not read: the database is unreachable"
                : `pL0 ${short(bkt.pL0)} · pT ${short(bkt.pT)} · pG ${short(bkt.pG)} · pS ${short(bkt.pS)}`}
            </ReadOnly>
          )}
        </Field>
      </Card>
      <Card title="Export and reset">
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
  const { status, setStatus, track } = useSaveStatus();
  // A newer name from the server (a refresh, another tab's save) replaces an
  // untouched field, so a focus and blur cannot save the old one over it. A
  // field being edited keeps what is typed, and so does one whose save is
  // still in flight: a refresh then can still carry the name before it.
  const [base, setBase] = useState(saved);
  if (saved !== base) {
    setBase(saved);
    if (draft === base && status.kind !== "saving") setDraft(saved);
  }
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
    track(setDisplayName(next).then((ok) => (ok ? null : "Not saved: the database did not answer.")));
  };
  return (
    <Field label="Name" note="Shown at the foot of the sidebar. Leave it empty to show Account." status={status}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          type="text"
          value={draft}
          autoComplete="name"
          placeholder="Your name"
          aria-describedby={describedBy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            // The Enter that confirms an input method's word is not a save.
            if (event.key === "Enter" && !isImeKey(event.nativeEvent)) {
              event.preventDefault();
              save();
            }
          }}
        />
      )}
    </Field>
  );
}

/** Three significant decimals at most, trailing zeros dropped: 0.25, 0.1. */
function short(n: number): string {
  return String(Number(n.toFixed(3)));
}

/** A Settings row: `FormRow`'s inline layout, its status read from a save's `SaveStatus`. */
function Field({
  label,
  note,
  status,
  children,
}: {
  label: string;
  note?: string;
  status?: SaveStatus;
  children: (field: FormRowField) => ReactNode;
}) {
  return (
    <FormRow
      layout="inline"
      label={label}
      hint={note}
      status={status === undefined ? undefined : statusProps(status)}
    >
      {children}
    </FormRow>
  );
}

/** The input box, holding text that cannot be changed here. */
function ReadOnly({ field, title, children }: { field: FormRowField; title?: string; children: ReactNode }) {
  return (
    <output
      id={field.id}
      aria-describedby={field.describedBy}
      title={title || undefined}
      className={inputClasses({ className: "flex items-center truncate" })}
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
 * The confirm and the status line glide open and shut (`ConfirmFold`,
 * `LiveStatus`). Closing the confirm, by Cancel, Escape or a reset that
 * landed, puts focus back on Reset progress when it was inside the fold that
 * just closed; a reset that failed gives it back to the press it disabled.
 */
function DataActions({ topicIds }: { topicIds: string[] }) {
  const { resetCourse } = useLearner();
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const confirmId = useId();
  const toggle = useRef<HTMLButtonElement>(null);

  const reset = async () => {
    setStatus({ kind: "saving" });
    const stored = await resetCourse(topicIds);
    if (stored) {
      setConfirming(false);
      setStatus({ kind: "saved" });
    } else {
      // A long catalog resets in batches, and the ones before a refused batch
      // stay cleared, so this does not promise nothing changed.
      setStatus({ kind: "error", message: "Not reset: the write was not stored, so some ticks and notes may remain. Try again." });
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
      <ConfirmFold
        open={confirming}
        id={confirmId}
        className="pt-3"
        label="Confirm reset"
        message="Clear the ticks and notes on every course? Mastery, review cards and saved recaps are kept. This cannot be undone."
        confirmLabel="Reset every course"
        onConfirm={() => void reset()}
        onCancel={() => setConfirming(false)}
        busy={status.kind === "saving"}
        returnFocusTo={toggle}
      />
      <LiveStatus
        {...statusProps(status, { saving: "Resetting…", saved: "Progress reset. Ticks and notes are cleared." })}
        className="pt-3"
      />
    </div>
  );
}
