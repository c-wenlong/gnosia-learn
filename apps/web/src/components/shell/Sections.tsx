"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import type { HistorySearch } from "@/components/studio/history-search";
import { TextLink } from "@/components/ui/TextLink";
import { cx, FIELD_TEXT, STATUS_TEXT } from "@/components/ui/classes";
import { isImeKey } from "@/components/ui/composer-keys";
import { Collapse } from "@/components/ui/Collapse";
import { Glyph } from "@/components/ui/Glyph";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { isCurrentRow } from "@/lib/nav";
import type { RecentChange } from "@/lib/recent-client";
import {
  cleanTitle,
  mergeStreams,
  recentGroups,
  splitPinned,
  type PinnedRow,
  type RecentItem,
  type RecentKind,
  type SidebarCourse,
} from "@/lib/recent-core";
import { announceDraftChange, draftRows } from "@/lib/studio-draft-list";
import { renameDraft } from "@/lib/studio-drafts";
import { conversationHref } from "@/lib/studio-view";

import { SearchResults } from "./ChatSearch";
import { FADE, FADE_IN } from "./motion";
import { rowClick } from "./row-click";
import { RECENT_GLYPHS, ROW, ROW_TWO_LINE, rowFill } from "./rows";
import { useShell } from "./shell-context";
import { useConversations } from "./use-conversations";
import { useRecent } from "./use-recent";

/**
 * The sidebar under the destinations, in sections (L7 of
 * docs/proposals/library-by-type-and-day.md, after Manus's sidebar): Courses,
 * the courses the owner has opened, each opening where they left off; Pinned, shown once something is pinned; and Recent, what the owner
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
 * Rename keeps the name on the conversation's draft, through the runner
 * (`renameDraft`), so the studio's own pages, Home and the runner's search
 * all call it by the same name (`conversationTitle`). The new name shows at
 * once and stays until the runner's list carries it, or is taken back when
 * the runner refuses it.
 *
 * A course is one row that opens the module visited last in it, named on a
 * second line. Its module list is the course page's own sidebar, so this one
 * does not repeat it, and a long course cannot push Recent off the screen.
 *
 * Each section label is 13px grey and sticks to the top of the sidebar's
 * scroller while its section scrolls under it. A row's more button appears on
 * hover or focus (always, on a screen with no hover), and its menu, the kit
 * `Menu` the Library's rows use, has Pin, Rename for a conversation and Open
 * in course for a module. Rename hands the focus to a field in the row once
 * the menu has gone (`afterClose`). There is no
 * Archive: the studio keeps no archive, and its Start over closes a
 * conversation for good, which a sidebar menu should not do in one press.
 *
 * On the folded rail the labels fade, and every row is
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
  const path = chats?.path ?? "/studio";
  const active = chats?.active ?? null;
  const pending = chats?.pending ?? null;

  // Names given here that the runner's list may not carry yet, by draft id;
  // null is a name taken off. Each goes once a list carries it, or at once
  // when the runner refused it.
  const [renames, setRenames] = useState<Readonly<Record<string, string | null>>>({});
  const drop = (draftId: string) => setRenames((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== draftId)));
  async function rename(draftId: string, typed: string | null) {
    // A field left blank takes the name off, and the planner's title shows again.
    const name = typed === null ? null : cleanTitle(typed);
    setRenames((current) => ({ ...current, [draftId]: name }));
    const saved = await renameDraft(draftId, name);
    // Read back either way: a refused rename puts the row back as the runner has it.
    const read = await conversations.refresh();
    // A saved name stays shown until a read carries it, so a read that failed
    // does not put the old name back over one the runner kept.
    if (!saved.ok || read) drop(draftId);
    // An open conversation hears it from its own stream; Home and the rest of the shell from this.
    if (saved.ok) announceDraftChange(draftId);
  }
  // Dropped while rendering, as `useConversations` adopts a page's list: the
  // render that sees the list carry a name is the one that lets it go.
  const listed = conversations.list;
  const carried = Object.entries(renames).filter(([id, name]) => listed?.drafts.some((d) => d.draftId === id && (d.name ?? null) === name) === true);
  if (carried.length > 0) {
    setRenames((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !carried.some(([gone]) => gone === id))));
  }

  // The runner's conversations as Recent's rows, called as `conversationTitle` calls them.
  const fromRunner =
    conversations.list === null
      ? null
      : draftRows(
          conversations.list.drafts.map((draft) => (draft.draftId in renames ? { ...draft, name: renames[draft.draftId] } : draft)),
          conversations.titles,
        ).map(
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
        );
  const streams = [
    ...(model === null ? [] : [{ items: model.items, more: model.more }]),
    ...(fromRunner === null || conversations.list === null ? [] : [{ items: fromRunner, more: conversations.list.more }]),
  ];
  const merged = mergeStreams(streams);
  // Titles for the pins from every row read, renames included, so a pinned
  // conversation the merge held back still shows its name now.
  const { pinned, recent: rows } = splitPinned(merged.items, model?.pinned ?? [], streams.flatMap((s) => s.items));
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
      onRename={item.kind === "draft" ? (name) => void rename(item.key.slice("draft:".length), name) : null}
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
                <TextLink onClick={() => void showOlder()} pending={loadingOlder} size="sm" className="px-1.5 py-1">
                  {loadingOlder ? "Reading older rows…" : "Show older"}
                </TextLink>
                {olderError !== null && (
                  <p role="alert" className={cx(STATUS_TEXT, "px-1.5 text-danger")}>
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
          // Any page of the course: the row is where the owner is.
          const here = isCurrentRow(course.href, pathname, true);
          const name = `${course.code} ${course.title}`;
          const resume = course.resume === null ? null : `${course.resume.order}. ${course.resume.title}`;
          return (
            <li key={course.slug}>
              <Link
                href={course.open}
                onClick={onPick}
                aria-current={here ? "page" : undefined}
                aria-label={rail ? name : undefined}
                title={resume === null ? name : `${name}, ${resume}`}
                // Two lines while the module visited last has a name under the
                // course, and one row's height on the rail, where only the glyph shows.
                className={cx(
                  resume === null ? ROW : ROW_TWO_LINE,
                  resume !== null && (rail ? "h-[var(--shell-row,36px)]" : "h-[calc(var(--shell-row,36px)+8px)]"),
                  rowFill(here),
                )}
              >
                <Glyph name="folder" size={18} className="text-text2" />
                <span className={cx("flex min-w-0 flex-1 flex-col", FADE, rail ? "opacity-0" : FADE_IN)}>
                  <span className="truncate">
                    <span className="text-text2">{course.code}</span> {course.title}
                  </span>
                  {resume !== null && <span className="truncate text-[12px] font-normal leading-4 text-text3">{resume}</span>}
                </span>
              </Link>
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
  onRename,
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
  /** A conversation's Rename: a name, or null to take the name off. Null for every other kind. */
  onRename: ((name: string | null) => void) | null;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const kind = RECENT_GLYPHS[item.kind];
  const open = menu && !rail;

  if (renaming) {
    return (
      <RenameField
        title={item.title}
        onDone={(name) => {
          setRenaming(false);
          // Back to the more button once the row is drawn again.
          requestAnimationFrame(() => box.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus());
          // Undefined is Escape. A blank field takes the name off; an unchanged one writes nothing.
          if (name === undefined || name === item.title) return;
          onRename?.(name);
        }}
      />
    );
  }

  return (
    <div ref={box} className="group/row relative">
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
          open ? "pe-9" : "group-focus-within/row:pe-9 group-hover/row:pe-9 [@media(hover:none)]:pe-9",
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
        {/* The kit menu button, as the Library's rows have: its clicks and keys
            stay inside it, so the row's link never hears them. */}
        <Menu
          label={`More for ${item.title}`}
          disabled={rail}
          onOpenChange={setMenu}
          trigger={
            <svg aria-hidden viewBox="0 0 20 20" className="size-[18px]" fill="currentColor">
              <circle cx="5" cy="10" r="1.4" />
              <circle cx="10" cy="10" r="1.4" />
              <circle cx="15" cy="10" r="1.4" />
            </svg>
          }
          triggerClassName={cx(
            "inline-flex size-7 items-center justify-center rounded-md text-text2 transition-[opacity,background-color] duration-150 hover:bg-surface2 hover:text-text motion-reduce:transition-none",
            "focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
            rail ? "opacity-0" : open ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <MenuItem
            icon="pin"
            onSelect={() => {
              void onChange(
                pinned
                  ? { action: "unpin", key: item.key }
                  : { action: "pin", row: { key: item.key, kind: item.kind, title: item.title, href: item.href } },
              );
            }}
          >
            {pinned ? "Unpin" : "Pin"}
          </MenuItem>
          {onRename !== null && (
            // The field takes the focus once the menu has gone.
            <MenuItem icon="rename" afterClose={() => setRenaming(true)}>
              Rename
            </MenuItem>
          )}
          {courseHref !== null && (
            <MenuItem icon="open" href={courseHref}>
              Open in course
            </MenuItem>
          )}
        </Menu>
      </div>
    </div>
  );
}

/**
 * Rename in place: Enter keeps the name, Escape keeps the old one, and leaving
 * the field keeps what was typed. A field emptied and kept takes the name off
 * (`null`), so the planner's title shows again; Escape is `undefined`.
 */
function RenameField({ title, onDone }: { title: string; onDone: (name: string | null | undefined) => void }) {
  const [value, setValue] = useState(title);
  const done = useRef(false);
  const finish = (name: string | undefined) => {
    if (done.current) return;
    done.current = true;
    onDone(name === undefined ? undefined : name.trim() === "" ? null : name);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isImeKey(event.nativeEvent)) {
      event.preventDefault();
      finish(value);
    } else if (event.key === "Escape") {
      // The field's Escape, not the drawer's.
      event.stopPropagation();
      finish(undefined);
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
