"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ASSET_NAME_MAX, cleanAssetName } from "@self-learn/schema/shared";

import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import { Glyph } from "@/components/ui/Glyph";
import { LiveStatus, type StatusTone } from "@/components/ui/LiveStatus";
import { cx, inputClasses } from "@/components/ui/classes";

type Status = { text: string | null; tone: StatusTone };

const QUIET: Status = { text: null, tone: "muted" };

/**
 * The asset page's heading, with a way to rename the asset for this learner
 * (`asset_name`, through `POST /api/learner/asset-name`).
 *
 * The heading stays where it is; the field opens under it, so the page does
 * not jump between two layouts. Enter saves, Escape puts the field away. A
 * renamed asset says what its source called it and offers that name back,
 * which clears the learner's own. A save refreshes the page, so the tab title
 * and the player's label follow; the heading changes at once.
 *
 * `naming` is null when the name could not be read: the heading then shows
 * without the control, since a field that cannot say what it is changing is
 * worse than none.
 */
export function AssetTitle({
  assetId,
  text,
  headingClassName,
  naming,
}: {
  assetId: string;
  /** What the page calls the asset now (`assetDisplayTitle`). */
  text: string;
  headingClassName: string;
  naming: { name: string | null; original: string | null } | null;
}) {
  const router = useRouter();
  const fieldId = useId();
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(text);
  const [named, setNamed] = useState(naming?.name ?? null);
  const [draft, setDraft] = useState(text);
  const [status, setStatus] = useState<Status>(QUIET);
  const [saving, setSaving] = useState(false);

  // A refresh after a save hands down the server's answer: take it, unless a
  // field is open with something typed in it.
  const [base, setBase] = useState({ text, name: naming?.name ?? null });
  if (text !== base.text || (naming?.name ?? null) !== base.name) {
    setBase({ text, name: naming?.name ?? null });
    setShown(text);
    setNamed(naming?.name ?? null);
    if (!editing) setDraft(text);
  }

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  if (naming === null) return <h1 className={headingClassName}>{shown}</h1>;
  const original = naming.original;

  function close() {
    setEditing(false);
    setDraft(shown);
    toggle.current?.focus();
  }

  async function save(name: string | null) {
    const cleaned = cleanAssetName(name);
    if (cleaned !== null && cleaned.length > ASSET_NAME_MAX) {
      setStatus({ text: `At most ${ASSET_NAME_MAX} characters.`, tone: "danger" });
      return;
    }
    if (cleaned === (named ?? original)) {
      close();
      return;
    }
    setSaving(true);
    setStatus({ text: "Saving…", tone: "muted" });
    try {
      const response = await fetch("/api/learner/asset-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, name: cleaned }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: { title: string | null; name: string | null };
      };
      if (!response.ok || payload.ok === false || payload.result === undefined) {
        setStatus({ text: payload.error ?? `Not saved (HTTP ${response.status}).`, tone: "danger" });
        return;
      }
      const next = payload.result.title ?? text;
      setShown(next);
      setNamed(payload.result.name);
      setDraft(next);
      setEditing(false);
      setStatus({ text: payload.result.name === null ? "Back to the original name." : "Renamed.", tone: "ok" });
      toggle.current?.focus();
      router.refresh();
    } catch {
      setStatus({ text: "Not saved: the server could not be reached.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 basis-72 flex-col">
      <div className="flex min-w-0 items-start gap-1.5">
        <h1 className={cx("min-w-0", headingClassName)}>{shown}</h1>
        <button
          ref={toggle}
          type="button"
          aria-expanded={editing}
          aria-controls={fieldId}
          title="Rename"
          onClick={() => (editing ? close() : (setStatus(QUIET), setEditing(true)))}
          className="mt-0.5 shrink-0 rounded-md p-1.5 text-text3 transition-colors duration-150 hover:bg-surface2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <Glyph name="practice" size={18} />
          <span className="sr-only">Rename</span>
        </button>
      </div>
      <Collapse open={editing} id={fieldId}>
        <form
          className="flex flex-col gap-2 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save(draft);
          }}
        >
          <label htmlFor={`${fieldId}-input`} className="sr-only">
            Name
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              id={`${fieldId}-input`}
              type="text"
              value={draft}
              maxLength={ASSET_NAME_MAX + 20}
              placeholder={original ?? "A name for this"}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                }
              }}
              className={cx(inputClasses(), "min-w-0 flex-1 basis-64")}
            />
            <Button type="submit" size="sm" disabled={saving}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={close} disabled={saving}>
              Cancel
            </Button>
          </div>
          {named !== null && original !== null && (
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-text3">
              <span className="min-w-0 break-words">Original name: {original}</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(null)}
                className="rounded-sm font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Use it
              </button>
            </p>
          )}
        </form>
      </Collapse>
      <LiveStatus text={status.text} tone={status.tone} className="pt-1 text-[13px]" />
    </div>
  );
}
