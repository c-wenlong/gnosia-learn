"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ASSET_NAME_MAX, cleanAssetName } from "@gnosia/schema/shared";

import { AskPanel } from "@/components/library/AskPanel";
import { Button } from "@/components/ui/Button";
import { Dialog, DIALOG_CLOSE_MS, type DialogSize } from "@/components/ui/Dialog";
import { DialogHeader } from "@/components/ui/DialogHeader";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { LiveStatus, type StatusTone } from "@/components/ui/LiveStatus";
import { Menu, MenuDivider, MenuItem } from "@/components/ui/Menu";
import { cx, iconButtonClasses, inputClasses } from "@/components/ui/classes";
import { usePresence } from "@/components/ui/use-presence";
import type { AskSubject, RowMenuItem, RowMenuSections } from "@/lib/row-menu";
import { sendJson } from "@/lib/send-json";

/** How long a confirmation ("Copied") stays beside the button. */
const NOTICE_MS = 1800;

const ICONS: Record<RowMenuItem["action"], GlyphName> = {
  open: "next",
  concept: "concepts",
  course: "open",
  conversation: "compose",
  rename: "rename",
  favorite: "star",
  ask: "sparkle",
  mark: "done",
  copy: "link",
  download: "download",
};

/**
 * The more button on a Library row and card, and the menu it opens (L5 of
 * docs/proposals/library-by-type-and-day.md, Manus's `file-row-menu` and
 * `row-menu`). The page decides the items per asset (`rowMenuItems` in
 * `@/lib/row-menu`); this draws them and does what they say.
 *
 * - **Open, Open the concept, Open in course, Locate in conversation** are links.
 * - **Rename** opens a small dialog with the name in a field, saved through
 *   #370's `POST /api/learner/asset-name`, the asset page's own rename; an
 *   empty field gives the asset back the name it came with.
 * - **Favorite** and **Unfavorite** write #372's star through
 *   `/api/learner/favorite`, and the page refreshes, so a Favorites only view
 *   drops a row the moment it is unstarred.
 * - **Ask** opens #374's unsaved chat (`AskPanel`) in a dialog over the list.
 * - **Mark watched** and **Mark read** append `MarkWatched`'s event.
 * - **Copy link** writes the asset page's absolute URL to the clipboard.
 * - **Download** is the file route's `?download=1`, saved under the title.
 *
 * What an action did is said beside the button for a moment ("Copied",
 * "Marked read", "Not saved"), in a status line a screen reader hears, since
 * the menu has closed by then and focus is back on the button.
 *
 * The button shows on the row's hover and while anything in the row has
 * focus, so a keyboard user reaches it, and always on a screen with no
 * hover. Its clicks and keys stay inside it (`Menu`), so a row that opens on
 * a press is not pressed too.
 */
export function RowMenu({
  assetId,
  title,
  sections,
  className,
}: {
  assetId: string;
  /** What the row calls the asset: the button's name and the rename field's start. */
  title: string;
  sections: RowMenuSections;
  className?: string;
}) {
  const router = useRouter();
  const root = useRef<HTMLSpanElement>(null);
  const [notice, setNotice] = useState<{ text: string; tone: StatusTone; at: number } | null>(null);
  const [dialog, setDialog] = useState<"rename" | "ask" | null>(null);
  // What Ask is about, once it has been opened: its dialog then stays in the
  // page, closed, so the thread is still there when it is opened again.
  const [asked, setAsked] = useState<AskSubject | null>(null);
  const [starred, setStarred] = useState<boolean | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // `at` counts the notices, so the same words twice still restart the timer.
  const say = (text: string, tone: StatusTone = "ok") => setNotice((held) => ({ text, tone, at: (held?.at ?? 0) + 1 }));
  const moreButton = useCallback(() => root.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]") ?? null, []);

  const favorite = async (on: boolean) => {
    setStarred(on);
    try {
      const response = await fetch("/api/learner/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, favorite: on }),
      });
      if (!response.ok) throw new Error(String(response.status));
      say(on ? "Starred" : "Unstarred");
      router.refresh();
    } catch {
      setStarred(!on);
      say("Not saved. Try again.", "danger");
    }
  };

  const mark = async (verb: "watched" | "read") => {
    const reply = await sendJson<{ ok?: boolean; error?: string }>("POST", "/api/learner/watched", { assetId });
    if (reply === null) say("Not saved: the server could not be reached.", "danger");
    else if (!reply.ok || reply.data.ok === false) say(reply.data.error ?? `Not saved (HTTP ${reply.status}).`, "danger");
    else say(`Marked ${verb}`);
  };

  const copy = async (href: string) => {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      say("Copied");
    } catch {
      say("Could not copy the link", "danger");
    }
  };

  const item = (entry: RowMenuItem) => {
    const icon = ICONS[entry.action];
    switch (entry.action) {
      case "open":
      case "concept":
      case "course":
      case "conversation":
        return (
          <MenuItem key={entry.action} icon={icon} href={entry.href}>
            {entry.label}
          </MenuItem>
        );
      case "download":
        return (
          <MenuItem key={entry.action} icon={icon} href={entry.href} download>
            {entry.label}
          </MenuItem>
        );
      case "copy":
        return (
          <MenuItem key={entry.action} icon={icon} onSelect={() => void copy(entry.href)}>
            {entry.label}
          </MenuItem>
        );
      case "favorite": {
        const on = starred ?? entry.on;
        return (
          <MenuItem key={entry.action} icon={icon} onSelect={() => void favorite(!on)}>
            {on ? "Unfavorite" : "Favorite"}
          </MenuItem>
        );
      }
      case "mark":
        return (
          <MenuItem key={entry.action} icon={icon} onSelect={() => void mark(entry.verb)}>
            {entry.label}
          </MenuItem>
        );
      case "rename":
        return (
          <MenuItem key={entry.action} icon={icon} onSelect={() => setDialog("rename")}>
            {entry.label}
          </MenuItem>
        );
      case "ask":
        return (
          <MenuItem key={entry.action} icon={icon} onSelect={() => {
              setAsked(entry.subject);
              setDialog("ask");
            }}
          >
            {entry.label}
          </MenuItem>
        );
    }
  };

  // Focus goes back to the button once the dialog has left the top layer
  // (`RowDialog`): while it fades it is still modal, and would keep it.
  const closeDialog = () => setDialog(null);

  return (
    <span
      ref={root}
      className={cx("relative inline-flex shrink-0 items-center", className)}
      // The dialog is inside the row too: a press in it is not the row's.
      onClick={(event) => event.stopPropagation()}
      // Only the keys the menu acts on, though (`rowMenuOwnsKey`): React's
      // stop is the native event's too, and the shell's shortcuts and the
      // phone drawer's Escape listen on the window.
      onKeyDown={(event) => {
        const inList = event.target instanceof Element && event.target.closest('[role="menu"]') !== null;
        if (rowMenuOwnsKey(event, inList)) event.stopPropagation();
      }}
    >
      <span
        role="status"
        className={cx(
          "pointer-events-none absolute top-1/2 right-full mr-1 -translate-y-1/2 rounded-md bg-surface px-2 py-0.5 text-[12px] whitespace-nowrap shadow-sm",
          "transition-opacity duration-150 motion-reduce:transition-none",
          notice === null ? "opacity-0" : "opacity-100",
          notice?.tone === "danger" ? "text-danger" : "text-text2",
        )}
      >
        {notice?.text}
      </span>
      <Menu
        label={`More actions for ${title}`}
        menuLabel={title}
        minWidth={240}
        trigger={<Glyph name="more" size={16} />}
        triggerClassName={iconButtonClasses({
          size: "md",
          shape: "square",
          inset: true,
          className: cx(
            // Shown on the row's hover and focus, open, or always without hover.
            "[@media(hover:hover)]:opacity-0 group-hover/asset:opacity-100 group-focus-within/asset:opacity-100 aria-expanded:opacity-100",
            "transition-[opacity,background-color,color] not-disabled:hover:bg-border/70 aria-expanded:bg-border/70 aria-expanded:text-text",
          ),
        })}
      >
        {sections
          .filter((section) => section.length > 0)
          .map((section, index) => (
            <MenuSection key={section[0]?.action ?? index} divider={index > 0}>
              {section.map(item)}
            </MenuSection>
          ))}
      </Menu>
      <RowDialog open={dialog === "rename"} label={`Rename ${title}`} size="compact" button={moreButton} onClose={closeDialog}>
        {dialog === "rename" && (
          <RenameForm
            assetId={assetId}
            title={title}
            onDone={(text) => {
              closeDialog();
              say(text);
              router.refresh();
            }}
            onCancel={closeDialog}
          />
        )}
      </RowDialog>
      {asked !== null && (
        <RowDialog open={dialog === "ask"} label={`Ask about ${title}`} size="default" keep button={moreButton} onClose={closeDialog}>
          <AskPanel assetId={assetId} subject={asked} open={dialog === "ask"} />
        </RowDialog>
      )}
    </span>
  );
}

/**
 * Whether a key press in the row's menu (its button, its list or a dialog it
 * opened) is the menu's own, kept from the row and the card around it, which
 * open their asset: Enter and Space press the button, an item or a dialog's
 * control, the arrows, Home and End move, and, inside the open list, a letter
 * finds an item. Any other key, or one held with Ctrl, Cmd or Alt, goes on
 * to the window, where the shell's shortcuts listen (a field in a dialog is
 * typing, which they leave alone). The kit `Menu`'s rule, for the row.
 */
export function rowMenuOwnsKey(
  event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  inList: boolean,
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (ROW_MENU_KEYS.has(event.key)) return true;
  return inList && event.key.length === 1;
}

const ROW_MENU_KEYS = new Set(["Enter", " ", "ArrowUp", "ArrowDown", "Home", "End"]);

function MenuSection({ divider, children }: { divider: boolean; children: ReactNode }) {
  return (
    <>
      {divider && <MenuDivider />}
      {children}
    </>
  );
}

/**
 * Rename's and Ask's dialog over the Library: the kit `Dialog` (modal, Escape
 * and a press on the backdrop close it, focus kept inside and handed back to
 * the more button), under the kit `DialogHeader`: its name and Close. It fades out
 * for `DIALOG_CLOSE_MS` before it goes, at once under reduced motion.
 *
 * `keep` is Ask's: once opened it stays in the page, closed by hand rather
 * than unmounted (the kit `Dialog` opens on mount and closes on unmount), so
 * the thread `AskPanel` holds in its state, and a reply still on its way, are
 * there when it is opened again, as the asset page's `Collapse` keeps them.
 * Its `closing` follows `open` rather than `usePresence`'s `leaving`, so its
 * fade ends at nothing and stays there until it has shut.
 */
function RowDialog({
  open,
  label,
  size,
  keep = false,
  button,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  size: DialogSize;
  keep?: boolean;
  /** The more button, which takes focus back when it closes. */
  button: () => HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const { mounted, leaving } = usePresence(open, DIALOG_CLOSE_MS);
  const ref = useRef<HTMLDialogElement | null>(null);
  const [kept, setKept] = useState(false);
  if (keep && open && !kept) setKept(true);

  // A kept dialog is shown and hidden here; the first showing is the kit's.
  useEffect(() => {
    const dialog = ref.current;
    if (!keep || dialog === null) return;
    if (mounted) {
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus], textarea")?.focus();
    } else if (dialog.open) {
      dialog.close();
      button()?.focus({ preventScroll: true });
    }
  }, [keep, mounted, button]);

  if (!(keep ? kept : mounted)) return null;
  return (
    <Dialog
      ref={ref}
      label={label}
      size={size}
      // A kept dialog is shut by the effect above, which runs after the
      // commit that ends `leaving` and can come a frame after its paint. Off
      // `leaving`, that frame shows it still open in its open style, a step
      // back from the end of its fade; off `open`, it keeps its closed style
      // until it has shut, and drops it only to open again.
      closing={keep ? !open : leaving}
      opener={button}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <DialogHeader title={label} onClose={() => open && onClose()} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-5">{children}</div>
    </Dialog>
  );
}

/**
 * The rename field: the name the Library shows, selected, Enter or Save to
 * keep it, empty for the asset's own name back. The same route and the same
 * rules as the asset page's (`AssetTitle`): at most `ASSET_NAME_MAX`
 * characters, cleaned by `cleanAssetName`.
 */
function RenameForm({
  assetId,
  title,
  onDone,
  onCancel,
}: {
  assetId: string;
  title: string;
  onDone: (said: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string | null; tone: StatusTone }>({ text: null, tone: "muted" });

  const save = async () => {
    const cleaned = cleanAssetName(draft);
    if (cleaned !== null && cleaned.length > ASSET_NAME_MAX) {
      setStatus({ text: `At most ${ASSET_NAME_MAX} characters.`, tone: "danger" });
      return;
    }
    if (cleaned === title) {
      onCancel();
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
        result?: { name: string | null };
      };
      if (!response.ok || payload.ok === false || payload.result === undefined) {
        setStatus({ text: payload.error ?? `Not saved (HTTP ${response.status}).`, tone: "danger" });
        return;
      }
      onDone(payload.result.name === null ? "Back to the original name" : "Renamed");
    } catch {
      setStatus({ text: "Not saved: the server could not be reached.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label htmlFor={id} className="text-[13px] text-text2">
        Name
      </label>
      <input
        id={id}
        type="text"
        // The dialog's first focus, with the name selected to type over.
        data-autofocus
        onFocus={(event) => event.currentTarget.select()}
        value={draft}
        maxLength={ASSET_NAME_MAX + 20}
        onChange={(event) => setDraft(event.target.value)}
        className={inputClasses()}
      />
      <p className="text-[12px] text-text3">Leave it empty to go back to the name it came with.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
      <LiveStatus text={status.text} tone={status.tone} className="text-[13px]" />
    </form>
  );
}
