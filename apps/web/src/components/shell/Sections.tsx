"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import type { HistorySearch } from "@/components/studio/history-search";
import { cx, FIELD_TEXT } from "@/components/ui/classes";
import { isImeKey } from "@/components/ui/composer-keys";
import { Collapse } from "@/components/ui/Collapse";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { usePresence } from "@/components/ui/use-presence";
import { isCurrentRow } from "@/lib/nav";
import type { RecentChange } from "@/lib/recent-client";
import {
  mergeStreams,
  named,
  recentGroups,
  splitPinned,
  type PinnedRow,
  type RecentItem,
  type RecentKind,
  type SidebarCourse,
} from "@/lib/recent-core";
import { draftRows } from "@/lib/studio-draft-list";
import { conversationHref } from "@/lib/studio-view";

import { SearchResults } from "./ChatSearch";
import { FADE, FADE_IN } from "./motion";
import { rowClick } from "./row-click";
import { RECENT_GLYPHS, ROW, rowFill } from "./rows";
import { useShell } from "./shell-context";
import { useConversations } from "./use-conversations";
import { useRecent } from "./use-recent";

/**
 * The sidebar under the destinations, in sections (L7 of
 * docs/proposals/library-by-type-and-day.md, after Manus's sidebar): Courses,
 * the courses the owner has opened, each a folder that unfolds to its
 * modules; Pinned, shown once something is pinned; and Recent, what the owner
 * was last in, newest first under day headings, fifty at a time.
 *
 * Recent is two reads merged. The catalog's (`useRecent`, through
 * `/api/learner/recent`) brings module visits, half-watched videos, concepts
 * answered on and tutor sessions; with a studio, its conversations come from
 * the runner (`useConversations`), which names a conversation from its first
 * message before it has a title. `mergeStreams` holds back what a list that
 * has more could still outrank, so Show older is never wrong about order.
 * Without a studio the catalog's read is the whole list.
 *
 * Each section label is 13px grey and sticks to the top of the sidebar's
 * scroller while its section scrolls under it. A row's more button appears on
 * hover or focus (always, on a screen with no hover), and its menu has Pin,
 * Rename for a conversation and Open in course for a module. There is no
 * Archive: the studio keeps no archive, and its Start over closes a
 * conversation for good, which a sidebar menu should not do in one press.
 *
 * On the folded rail the labels fade, the courses fold shut, and every row is
 * its glyph alone, named for a screen reader and by its tooltip.
 */
export function Sections({ rail, onPick, search }: { rail: boolean; onPick: () => void; search: HistorySearch }) {
  const shell = useShell();
  const studio = shell?.studio ?? false;
  const chats = shell?.chats ?? null;
  const pathname = usePathname();
  const recent = useRecent(studio);
  const conversations = useConversations(studio, chats);
  const model = recent.model;
  const names = model?.names ?? {};
  const path = chats?.path ?? "/studio";
  const active = chats?.active ?? null;
  const pending = chats?.pending ?? null;

  // The runner's conversations as Recent's rows, named as the owner named them.
  const fromRunner =
    conversations.list === null
      ? null
      : named(
          draftRows(conversations.list.drafts, conversations.titles).map(
            (row): RecentItem => ({
              key: `draft:${row.draftId}`,
              kind: "draft",
              title: row.heading,
              detail: row.state,
              href: `/studio?draft=${encodeURIComponent(row.draftId)}`,
              at: row.updated,
              draftId: row.draftId,
              quoted: row.quoted,
              briefed: row.briefed,
            }),
          ),
          names,
        );
  const streams = [
    ...(model === null ? [] : [{ items: model.items, more: model.more }]),
    ...(fromRunner === null || conversations.list === null ? [] : [{ items: fromRunner, more: conversations.list.more }]),
  ];
  const merged = mergeStreams(streams);
  const { pinned, recent: rows } = splitPinned(merged.items, model?.pinned ?? []);
  const unlisted = studio && (pending !== null || (active !== null && !merged.items.some((item) => item.draftId === active)));
  const loaded = model !== null || fromRunner !== null;

  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  async function showOlder() {
    if (loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    const [server, runner] = await Promise.all([
      model?.more === true ? recent.showOlder() : Promise.resolve(true),
      conversations.list?.more === true ? conversations.showOlder() : Promise.resolve(true),
    ]);
    setLoadingOlder(false);
    if (!server || !runner) setOlderError("Older rows could not be read. Try again in a moment.");
  }

  const current = (item: { key: string; href: string; kind: RecentKind }) => {
    if (item.kind === "draft") return active !== null && item.key === `draft:${active}`;
    return isCurrentRow(item.href, pathname, item.kind === "module");
  };
  const linkFor = (item: { key: string; href: string; kind: RecentKind }) =>
    item.kind === "draft" ? conversationHref(path, item.key.slice("draft:".length)) : item.href;

  const row = (item: RecentItem | PinnedRow, isPinned: boolean) => (
    <RecentRow
      key={item.key}
      item={item}
      href={linkFor(item)}
      current={current(item)}
      rail={rail}
      pinned={isPinned}
      quoted={"quoted" in item && item.quoted === true}
      briefed={"briefed" in item && item.briefed === true}
      courseHref={item.kind === "module" ? courseOf(item.key) : null}
      onClick={item.kind === "draft" ? rowClick(chats?.navigate ?? null, linkFor(item), onPick) : onPick}
      onChange={recent.change}
    />
  );

  const courses = model?.courses ?? [];

  return (
    <div className="mt-3 flex flex-col">
      {/* `min-w-0`: a grid item is as wide as its longest title otherwise, and a row would run past the gutter. */}
      {/* Shown once Recent has answered, empty or not, so its add button
          to /courses is there for someone who has opened no course yet. */}
      <Collapse open={model?.reachable === true} className="min-w-0">
        <CoursesSection courses={courses} rail={rail} pathname={pathname} onPick={onPick} />
      </Collapse>

      <Collapse open={pinned.length > 0} className="min-w-0">
        <section aria-labelledby="sidebar-pinned" className="pb-2">
          <SectionLabel id="sidebar-pinned" rail={rail}>
            Pinned
          </SectionLabel>
          <ul className="flex flex-col gap-px">{pinned.map((p) => <li key={p.key}>{row(p, true)}</li>)}</ul>
        </section>
      </Collapse>

      <section aria-labelledby="sidebar-recent" className="pb-2">
        <SectionLabel id="sidebar-recent" rail={rail}>
          Recent
        </SectionLabel>
        {search.words !== "" ? (
          <div inert={rail}>
            <SearchResults
              search={search}
              studio={studio}
              names={names}
              renamed={(fromRunner ?? []).filter((item) => names[item.key] !== undefined)}
              path={path}
              active={active}
              navigate={chats?.navigate ?? null}
              onPick={onPick}
            />
          </div>
        ) : (
          // The list fades back in as the search is cleared.
          <div className="flex animate-fade-in flex-col motion-reduce:animate-none">
            {unlisted && (
              <ul className="mb-1 flex flex-col">
                <li>
                  <span aria-current="page" className={cx(ROW, rowFill(true))}>
                    <Glyph name="compose" size={18} className="text-text2" />
                    <span className={cx("min-w-0 flex-1 truncate", FADE, rail ? "opacity-0" : FADE_IN)}>{pending ?? "New conversation"}</span>
                  </span>
                </li>
              </ul>
            )}
            {recentGroups(rows, new Date()).map((group) => (
              <section key={group.label} aria-label={group.label} className="mb-1">
                <h3 className={cx("px-2 pb-1 pt-2 text-[12px] leading-4 text-text3", FADE, rail ? "opacity-0" : FADE_IN)}>{group.label}</h3>
                <ul className="flex flex-col gap-px">{group.rows.map((item) => <li key={item.key}>{row(item, false)}</li>)}</ul>
              </section>
            ))}
            {/* Whenever there is more, even with every row on screen pinned. */}
            {merged.more && (
              <div inert={rail} className={cx("px-0.5 pt-1", FADE, rail ? "opacity-0" : FADE_IN)}>
                <button
                  type="button"
                  onClick={() => void showOlder()}
                  disabled={loadingOlder}
                  className="rounded-lg px-1.5 py-1 text-[13px] font-medium text-accent-text underline-offset-4 hover:underline disabled:cursor-progress disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {loadingOlder ? "Reading older rows…" : "Show older"}
                </button>
                {olderError !== null && (
                  <p role="alert" className="px-1.5 text-[12px] text-danger">
                    {olderError}
                  </p>
                )}
              </div>
            )}
            {loaded && rows.length === 0 && !unlisted && !merged.more && (
              <p className={cx("px-2 pt-1 text-[13px] leading-5 text-text3", FADE, rail ? "opacity-0" : FADE_IN)}>
                {model?.reachable === false && fromRunner === null
                  ? "Recent could not be read."
                  : "Modules, videos, conversations and concepts you open show here."}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** A module row's course page, from its key (`module:<course>/<module>`), so a pinned copy has it too. */
function courseOf(key: string): string | null {
  const course = key.slice("module:".length).split("/")[0];
  return course === "" ? null : `/courses/${encodeURIComponent(course)}`;
}

/**
 * A section's label: 13px grey, sticky at the top of the scroller while its
 * section is in view (Manus's `nav-section-header`), on the sidebar's own
 * fill so rows scroll under it. An action, when there is one, sits at its
 * right and shows on hover or focus.
 */
function SectionLabel({ id, rail, action, children }: { id: string; rail: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="group/label sticky top-0 z-10 flex h-[var(--shell-row,36px)] items-center justify-between bg-surface ps-2">
      <h2 id={id} className={cx("text-[13px] font-medium text-text3", FADE, rail ? "opacity-0" : FADE_IN)}>
        {children}
      </h2>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Courses                                                                    */
/* -------------------------------------------------------------------------- */

function CoursesSection({
  courses,
  rail,
  pathname,
  onPick,
}: {
  courses: readonly SidebarCourse[];
  rail: boolean;
  pathname: string | null;
  onPick: () => void;
}) {
  // A course is open while the owner has it open, and the course of the page
  // on screen opens by itself, so the current module is in view.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const here = courses.find((c) => isCurrentRow(c.href, pathname, true))?.slug ?? null;
  const [seen, setSeen] = useState<string | null>(null);
  if (here !== seen) {
    setSeen(here);
    if (here !== null && !open.has(here)) setOpen(new Set([...open, here]));
  }
  const toggle = (slug: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <section aria-labelledby="sidebar-courses" className="pb-2">
      <SectionLabel
        id="sidebar-courses"
        rail={rail}
        action={
          <Link
            href="/courses"
            onClick={onPick}
            inert={rail}
            aria-label="Browse courses"
            title="Browse courses"
            className={cx(
              "inline-flex size-7 items-center justify-center rounded-md text-text3 transition-[opacity,background-color,color] duration-150 hover:bg-surface2/60 hover:text-text motion-reduce:transition-none",
              "focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
              rail ? "opacity-0" : "opacity-0 group-hover/label:opacity-100 [@media(hover:none)]:opacity-100",
            )}
          >
            <Glyph name="add" size={16} />
          </Link>
        }
      >
        Courses
      </SectionLabel>
      {courses.length === 0 && (
        <p className={cx("px-2 pb-1 text-[13px] leading-5 text-text3", FADE, rail ? "opacity-0" : FADE_IN)}>Courses you open show here.</p>
      )}
      <ul className="flex flex-col gap-px">
        {courses.map((course) => {
          const unfolded = open.has(course.slug) && !rail;
          const id = `sidebar-course-${course.slug}`;
          const name = `${course.code} ${course.title}`;
          return (
            <li key={course.slug}>
              <button
                type="button"
                aria-expanded={unfolded}
                aria-controls={id}
                aria-label={rail ? name : undefined}
                title={rail ? name : undefined}
                onClick={() => toggle(course.slug)}
                className={cx(ROW, "group/course text-left", rowFill(false))}
              >
                {/* The folder gives way to a chevron on hover or focus, as
                    Manus's project row does; both stay mounted and cross-fade. */}
                <span className="relative size-[18px] shrink-0 text-text2">
                  <Glyph
                    name="folder"
                    size={18}
                    className={cx(
                      "absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none",
                      !rail && "group-hover/course:opacity-0 group-focus-visible/course:opacity-0",
                    )}
                  />
                  <Glyph
                    name="chevron"
                    size={18}
                    className={cx(
                      "absolute inset-0 opacity-0 transition-[opacity,rotate] duration-200 ease-soft motion-reduce:transition-none",
                      !rail && "group-hover/course:opacity-100 group-focus-visible/course:opacity-100",
                      unfolded && "rotate-90",
                    )}
                  />
                </span>
                <span className={cx("min-w-0 flex-1 truncate", FADE, rail ? "opacity-0" : FADE_IN)}>
                  <span className="text-text2">{course.code}</span> {course.title}
                </span>
              </button>
              <Collapse open={unfolded} id={id} className="min-w-0">
                <ul className="flex flex-col gap-px pb-1">
                  {course.modules.map((m) => {
                    const on = isCurrentRow(m.href, pathname, true);
                    return (
                      <li key={m.slug}>
                        <Link
                          href={m.href}
                          onClick={onPick}
                          aria-current={on ? "page" : undefined}
                          className={cx(ROW, "ps-9 text-[13px]", on ? "bg-surface2 font-medium text-text" : "text-text2 hover:bg-surface2/60 hover:text-text")}
                        >
                          <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-text3">{m.order}</span>
                          <span className="min-w-0 flex-1 truncate">{m.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Collapse>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* A row and its menu                                                         */
/* -------------------------------------------------------------------------- */

function RecentRow({
  item,
  href,
  current,
  rail,
  pinned,
  quoted,
  briefed,
  courseHref,
  onClick,
  onChange,
}: {
  item: { key: string; kind: RecentKind; title: string; href: string };
  href: string;
  current: boolean;
  rail: boolean;
  pinned: boolean;
  quoted: boolean;
  briefed: boolean;
  courseHref: string | null;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onChange: (change: RecentChange) => Promise<boolean>;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const kind = RECENT_GLYPHS[item.kind];

  if (renaming) {
    return (
      <RenameField
        title={item.title}
        onDone={(name) => {
          setRenaming(false);
          requestAnimationFrame(() => more.current?.focus());
          if (name !== null && name !== item.title) void onChange({ action: "rename", key: item.key, name });
        }}
      />
    );
  }

  return (
    <div className="group/row relative">
      <Link
        href={href}
        scroll={item.kind === "draft" ? false : undefined}
        onClick={onClick}
        aria-current={current ? "page" : undefined}
        aria-label={rail ? `${kind.word}: ${item.title}` : undefined}
        title={item.title}
        // The title has the row's width until the more button shows, then makes room for it.
        className={cx(
          ROW,
          rowFill(current),
          menu ? "pe-9" : "group-focus-within/row:pe-9 group-hover/row:pe-9 [@media(hover:none)]:pe-9",
        )}
      >
        <Glyph name={kind.glyph} size={18} className="text-text2" />
        <span className={cx("min-w-0 flex-1 truncate", quoted && !current && "text-text2", FADE, rail ? "opacity-0" : FADE_IN)}>
          <span className="sr-only">{kind.word}: </span>
          {item.title}
        </span>
        {briefed && <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full bg-accent", FADE, rail ? "opacity-0" : FADE_IN)} />}
      </Link>
      <div inert={rail} className="absolute inset-y-0 right-1 flex items-center">
        <button
          ref={more}
          type="button"
          aria-label={`More for ${item.title}`}
          aria-expanded={menu}
          aria-haspopup="true"
          onClick={() => setMenu((v) => !v)}
          className={cx(
            "inline-flex size-7 items-center justify-center rounded-md text-text2 transition-[opacity,background-color] duration-150 hover:bg-surface2 hover:text-text motion-reduce:transition-none",
            "focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
            rail ? "opacity-0" : menu ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <svg aria-hidden viewBox="0 0 20 20" className="size-[18px]" fill="currentColor">
            <circle cx="5" cy="10" r="1.4" />
            <circle cx="10" cy="10" r="1.4" />
            <circle cx="15" cy="10" r="1.4" />
          </svg>
        </button>
        <RowMenu
          open={menu && !rail}
          anchor={more}
          onClose={(refocus) => {
            setMenu(false);
            if (refocus) more.current?.focus();
          }}
        >
          {(close) => (
            <>
              <MenuItem
                glyph="pin"
                onSelect={() => {
                  close(true);
                  void onChange(
                    pinned
                      ? { action: "unpin", key: item.key }
                      : { action: "pin", row: { key: item.key, kind: item.kind, title: item.title, href: item.href } },
                  );
                }}
              >
                {pinned ? "Unpin" : "Pin"}
              </MenuItem>
              {item.kind === "draft" && (
                <MenuItem
                  glyph="rename"
                  onSelect={() => {
                    close(false);
                    setRenaming(true);
                  }}
                >
                  Rename
                </MenuItem>
              )}
              {courseHref !== null && (
                <MenuItem glyph="open" href={courseHref} onSelect={() => close(false)}>
                  Open in course
                </MenuItem>
              )}
            </>
          )}
        </RowMenu>
      </div>
    </div>
  );
}

/**
 * A row's menu: a small card under its more button, or over it when the
 * sidebar has no room below. Kept for one beat after it closes so it can fade
 * (`usePresence`). A disclosure of a few buttons, as the account menu is: it
 * closes on Escape (focus back on the more button), on a press outside, and
 * on choosing an item, and focus moves to its first item as it opens.
 */
function RowMenu({
  open,
  anchor,
  onClose,
  children,
}: {
  open: boolean;
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: (refocus: boolean) => void;
  children: (close: (refocus: boolean) => void) => ReactNode;
}) {
  const { mounted, leaving } = usePresence(open, 120);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const [up, setUp] = useState(false);
  // The latest close, for listeners that stay put while the menu is open.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    // Over the button when the scroller has no room for the card below it.
    const scroller = anchor.current?.closest<HTMLElement>("[data-sidebar-scroll]");
    const button = anchor.current?.getBoundingClientRect();
    const bounds = scroller?.getBoundingClientRect();
    const height = box.current?.offsetHeight ?? 120;
     
    if (button !== undefined && bounds !== undefined) setUp(button.bottom + height + 8 > bounds.bottom && button.top - height - 8 > bounds.top);
    box.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) close.current(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The menu's Escape, not the drawer's.
      event.stopPropagation();
      close.current(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, anchor]);

  if (!mounted) return null;
  return (
    <div
      ref={box}
      id={id}
      inert={leaving}
      className={cx(
        "absolute right-0 z-20 w-48 rounded-xl border border-border bg-surface p-1 shadow-lg",
        up ? "bottom-full mb-1 origin-bottom-right" : "top-full mt-1 origin-top-right",
        leaving ? "pointer-events-none animate-pop-out" : "animate-pop-in",
        "motion-reduce:animate-none",
      )}
    >
      <ul className="flex flex-col">{children(onClose)}</ul>
    </div>
  );
}

function MenuItem({ glyph, href, onSelect, children }: { glyph: GlyphName; href?: string; onSelect: () => void; children: ReactNode }) {
  const itemClass = cx(
    "flex h-[var(--shell-row,36px)] w-full items-center gap-2.5 rounded-lg px-2 text-left text-[14px] text-text transition-colors duration-100 hover:bg-surface2 motion-reduce:transition-none",
    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
  );
  return (
    <li>
      {href === undefined ? (
        <button type="button" onClick={onSelect} className={itemClass}>
          <Glyph name={glyph} size={16} className="text-text2" />
          {children}
        </button>
      ) : (
        <Link href={href} onClick={onSelect} className={itemClass}>
          <Glyph name={glyph} size={16} className="text-text2" />
          {children}
        </Link>
      )}
    </li>
  );
}

/** Rename in place: Enter keeps the name, Escape keeps the old one, and leaving the field keeps what was typed. */
function RenameField({ title, onDone }: { title: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(title);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name === null ? null : name.trim() === "" ? null : name);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isImeKey(event.nativeEvent)) {
      event.preventDefault();
      finish(value);
    } else if (event.key === "Escape") {
      // The field's Escape, not the drawer's.
      event.stopPropagation();
      finish(null);
    }
  };
  return (
    <div className={cx(ROW, "animate-fade-in bg-surface2 motion-reduce:animate-none")}>
      <Glyph name="compose" size={18} className="text-text2" />
      <input
        // A rename is asked for, so the field takes the focus it was asked for.
        autoFocus
        value={value}
        maxLength={200}
        aria-label="Name this conversation"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => finish(value)}
        className={cx("h-full min-w-0 flex-1 bg-transparent text-text outline-none", FIELD_TEXT.px14)}
      />
    </div>
  );
}
