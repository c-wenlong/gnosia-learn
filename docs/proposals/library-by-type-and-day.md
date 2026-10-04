# Proposal: the Library by type and day, and the sidebar in sections

Status: proposed, 2026-10-04, for the owner to decide. Decisions L1 to L8
are defaults chosen from the Manus reference
([docs/design/reference/manus](../design/reference/manus/README.md)); each
names what it changes and what it leaves. Phase 1 (L1, L2, L3, L8) is
built: the type tabs, the day groups, the source line from `assetParents`
(`services/catalog/src/state/asset-parents.ts`, one statement per page) and
the three `--shell-row` tokens. Days and times are counted in the zone Home
uses (`appTimeZone()`), not UTC. Phases 2 to 4 are not built.

## The problem

The app makes files the way an agent product does: a tutor session writes a
note and a log, the studio draws a diagram or renders a video with its
transcript, chapters, captions and poster, a course brings readings and links.
They land in one Library ([/library](../../apps/web/src/app/(app)/library/page.tsx))
as a grid sorted newest first, with the type, course and topic behind three
dropdown menus and no date on a card. Measured on the owner's checkout on
2026-10-04:

| What the Library does today | Where | What it costs |
| --- | --- | --- |
| Ten asset kinds (video, transcript, chapters, captions, diagram source, diagram, note, session log, link, poster), five of them companions hidden from All | [content.ts:41](../../packages/schema/src/content.ts), [library.ts:62](../../apps/web/src/lib/library.ts) | A reader cannot see the shape of the collection without opening the Type menu, where the counts live |
| Sorted by `created_at`, newest first, or by title; never grouped | [library.ts:491](../../apps/web/src/lib/library.ts) | Yesterday's five diagrams and last month's course readings sit in one undifferentiated run |
| The date is shown only in list view, only at the right, only above the `sm` breakpoint | [AssetRow.tsx:85](../../apps/web/src/components/library/AssetRow.tsx) | "When did I make this" has no answer on the default grid |
| Type, Course and Topic are dropdowns in a toolbar | [page.tsx:201](../../apps/web/src/app/(app)/library/page.tsx) | Switching from videos to diagrams is two clicks and a menu read |
| Every item opens `/library/[id]`, a full page | [library/[id]/page.tsx](../../apps/web/src/app/(app)/library/[id]/page.tsx) | Skimming ten notes is ten round trips |
| The sidebar is four unlabelled destinations, then a "Chats" list of studio drafts in day buckets | [AppSidebar.tsx:270](../../apps/web/src/components/shell/AppSidebar.tsx), [ChatHistory.tsx:168](../../apps/web/src/components/shell/ChatHistory.tsx) | Tutor sessions, modules and videos the owner was in (which Home already lists) are not reachable from the sidebar; a chat row has no glyph, no menu, no pin |

Manus has the same inventory problem, a hundred files of eight kinds per
account, and answers it with one Library page: a strip of type tabs, then
groups by the day each file was made, each row naming the task it came from,
with a grid view, a view option to group by task instead, a menu per row and a
full-screen previewer. Its sidebar is one column in sections: destinations,
then projects, then recent tasks with a glyph each, folding to a rail. That
is the shape proposed here. The references for every number are in
[components.md](../design/reference/manus/components.md) and
[raw/pages.md](../design/reference/manus/raw/pages.md).

## Decisions

**L1. Type tabs replace the Type menu.** A strip under the title: All,
Videos, Diagrams, Notes, Sessions, Links. Each is a kind (or the video
family, which folds the companions under their video). Companion files stay
out of All as today ([library.ts:62](../../apps/web/src/lib/library.ts)); the
"Companion files" entries move to the Others tab Manus also has, shown only
when there are any. The URL stays `?kind=`, so every existing link works.
Counts leave the menu and go into the header line beside the title ("42
files"), not onto the tabs, which Manus keeps as plain words
([type-tab](../design/reference/manus/components.md#type-tab)).

**L2. Rows and cards are grouped by the day they were made, newest first.**
A heading per day ("4 Oct" with the count in grey, "(5)"), the rows under it,
40 px between groups. The same `historyGroups` logic the chat history already
has ([studio-draft-list.ts:280](../../apps/web/src/lib/studio-draft-list.ts))
moves to a shared helper, but with calendar days rather than the Today,
Yesterday, Previous 7 days buckets, because a library is browsed back months
and a bucket called Older is useless there. The day is `created_at`, which
every asset carries ([content.ts:442](../../packages/schema/src/content.ts)).
`updated_at` is shown in the row's time column when it differs from
`created_at`, as "edited 2 Oct", since a note revised a month after it was
written should say so. The row type carries neither today
(`AssetCardRef` in [asset-meta.ts:25](../../apps/web/src/components/asset-meta.ts)
is id, kind, path, url, bytes and title, and the list adds `createdAt` to
it), so phase 1 adds `createdAt` and `updatedAt` to the row type and to the
list query.

**L3. A row names where it came from.** Second line, in grey: the course and
module for a reading, the concept for a note or diagram, the conversation for
a studio output, the session for a log. Each parent is a join the catalog
already has, none of which the list reads today (it carries topic slugs and
resolves topic and concept labels only): the course and module through
`collection_item.asset_id` ([content.ts:575](../../packages/schema/src/content.ts)),
the item's module collection and that collection's course, falling back to
the asset's topic and the module whose topics include it, which is how
`?course=` already finds an asset ([library.ts:352](../../apps/web/src/lib/library.ts));
the concept through `asset_concept` ([content.ts:501](../../packages/schema/src/content.ts));
the studio conversation through `asset_job` ([studio.ts:391](../../packages/schema/src/studio.ts))
to the job and its draft; the tutor session through `session.log_asset_id`
([studio.ts:93](../../packages/schema/src/studio.ts)). Phase 1 adds one
query that returns these four for a page of rows. Manus's row carries only
the task name; ours can have several parents, so the order is fixed: the
course and module first, then the concept, "CS3230 · Week 3 · Master theorem"
when both exist and one of them otherwise; a studio output with neither shows
its conversation's title, a log its session's. An asset under two concepts
shows the first in the graph's order with "+1", as the card does today
([AssetCard.tsx:100](../../apps/web/src/components/AssetCard.tsx)); an asset
listed in two courses shows the one the open filter names, else the first by
code.
The concept chip with its mastery dot, which the card shows today
([AssetCard.tsx:100](../../apps/web/src/components/AssetCard.tsx)), stays on
the card and becomes the mastery dot before the concept in the row.

**L4. View options: group by course or by concept instead of by day.** A
button beside the grid/list switch opens a small menu with Group by: Day
(default), Course, Concept; and Show: All, Not watched or read. Grouping by
course gives a heading per course with its module order inside; by concept,
a heading per concept in the order of the prerequisite graph. The choice is
`?group=`, not a stored preference, so a link carries it. Favourites, which
Manus has here, are not added: there is no favourite on an asset and no
other surface would read one yet.

**L5. A menu per row and per card.** The more button at the right of a row,
and in a card's title row, opens: Open, Open the concept (when it has one),
Open in course (when it has one), Copy link, Download (for a stored file),
Mark watched or Mark read. Two of these exist on the asset page
([library/[id]/page.tsx](../../apps/web/src/app/(app)/library/[id]/page.tsx)):
Mark watched and Mark read are `MarkWatched`, and Open the concept is its
concept link. The other three are new and phase 2 builds them: Copy link
writes `/library/<id>` to the clipboard from a client component; Download
is the file route with `?download=1`, which answers with
`Content-Disposition: attachment` where today it serves the file inline;
Open in course is the L3 parent's module page. Nothing destructive: a
Library asset is deleted by the import that stops seeing it, not by hand.

**L6. A previewer over the Library.** Pressing a row or a card opens the
asset in a panel over the page (Manus's 1200 by 820 at 1440, a 48 px header
with the title, the date and four tools, the body in the serif for a note),
with Escape and the close button returning to the same scroll position. The
panel is the asset page's body without its shell: `LibraryVideo` for a
video, `DiagramView` for a diagram, the rendered note for a note, the log
for a session. "Open page" in the header goes to `/library/[id]`, which
stays as it is for the Explains, Related, Files and Details tabs and for
deep links. On a phone the previewer is the full screen.

**L7. The sidebar is one column in sections.** From the top: New chat and
the four destinations as today, with no label; then a Courses section, one
row per course the owner has opened, each a folder that unfolds to its
modules; then a Recent section: a row is a tutor session, a studio conversation, a
module or a video, each with its kind glyph at 18 px as Home's "Pick up where
you left off" draws them ([home-core.ts:41](../../apps/web/src/lib/home-core.ts)).
Home's list is not the source, since it returns five rows, reads module
visits from a preference that keeps five ([home.ts:226](../../apps/web/src/lib/home.ts))
and has no tutor sessions. Recent is a query of its own, with five sources,
and it must keep everything Home's list shows today or Home cannot move to
it: `draft` by `updated_at` for conversations; `session` by `updated_at` for
tutor sessions (its `title`, `kind` and `log_asset_id` are there,
[studio.ts:76](../../packages/schema/src/studio.ts)); videos from the saved
playback positions (the `playback:<asset id>` preferences Home already reads,
[home.ts:64](../../apps/web/src/lib/home.ts)), a row being a video with a
position and no `watchedAt` that passes Home's `resumeAt` check (not within
five seconds of the start or ten of the end), since a finished or barely
started video is for the Library, not for picking up, and the `watched` events are not used because they fire only
at Mark watched or 90% played; concepts from the `observation` events, as
Home's `conceptTouches` builds them ([home.ts:110](../../apps/web/src/lib/home.ts)),
so a concept studied yesterday stays a row and "Next from here" keeps its
input; and module visits. Visits move from the preference into a `visit`
event on the append-only `event` table (course and module slugs, one row per
visit) so a visit older than five survives. That is a new event type, which
is a migration and not only an edit to `EVENT_TYPES`
([shared.ts:108](../../packages/schema/src/shared.ts)): the table's
`event_type_check` constraint is rewritten the way `0008_watched_event.sql`
did for `watched`, generated with `npm run generate -w @self-learn/catalog`,
and `visit` is not a study event. Until the first visit event exists, the
query also reads the `recentModules` preference and merges the two by course
and module, newest first, so the five modules Home shows today do not vanish
on the day of the change; the preference keeps being written for one release
and is then left unread, as H1 left the streak's. The rows merge newest first
into the day buckets the Chats list uses, 50 a page with Show older, and
Home's threads read the same query from then on. Section labels are 13 px grey, sticky while their section
scrolls, as Manus's are ([nav-section-header](../design/reference/manus/components.md#nav-section-header)).
Hovering a row shows a more button; its menu has Pin, Rename (for a
conversation), Open in course (for a module), Archive (for a conversation).
Pinned rows sit under the Courses section in a Pinned section. The Chats
list and its search stay, with the search now over everything in Recent. On
a phone the same column is the drawer, as today.

**L8. Density tokens for the shell.** Manus's sidebar rows are 36 px with a
10 px radius and an 8 px start padding; ours are 40 px with an 8 px radius
and 11 px ([AppSidebar.tsx:335](../../apps/web/src/components/shell/AppSidebar.tsx)).
The proposal adopts three variables, `--shell-row` (36 px), `--shell-row-radius`
(10 px) and `--shell-row-pad` (8 px), read by the sidebar rows, the section
labels, the menu items and the Library rows, so the lists share one rhythm
and a Compact setting later is one override. The folded rail stays 60 px
with its peek; Manus's 52 px rail has no peek and is not better.

## The Library

```
Library                                   [ search ]  [ view ⌄ ]  [ ▦ | ☰ ]
All   Videos   Diagrams   Notes   Sessions   Links   Others

4 Oct  (3)
  ▣  Master theorem, cases 1 to 3                 CS3230 · Week 3 · Master theorem    18:12  ⋯
  ◫  Recurrence tree for T(n) = 2T(n/2) + n       ● Recurrences                       17:40  ⋯
  ▤  Teach session: divide and conquer            ● Divide and conquer                17:05  ⋯

2 Oct  (1)
  ▣  Dynamic programming, the four steps          CS3230 · Week 5 · DP                 21:30  ⋯

28 Sep  (5)
  ...
```

The grid view keeps the groups and shows the thumbnail cards under each
heading, three to a row at 1440 as Manus does (cards of 323 px with 16 px
gaps inside a 1000 px column), two at 1024, one on a phone. The type strip
becomes a single dropdown chip at 390, as Manus's does, and the time column
is dropped there.

## Phases

| Phase | What | Where | Done when |
| --- | --- | --- | --- |
| 1 | L1, L2, L3, L8: the tab strip, the day groups, `createdAt` and `updatedAt` on the row, the parent query behind the source line, the density tokens | `apps/web/src/app/(app)/library/`, `apps/web/src/lib/library.ts`, `apps/web/src/components/asset-meta.ts`, a shared `dayGroups` helper, the shell's tokens | The Library at `?kind=` shows the tab strip and day groups in both views; every row has its time and, where it differs, its edited date; the source line resolves for an asset with a course item, a concept, a studio job and a session; the counts are in the header; `npm test` passes with a golden of the grouping and of the parent precedence |
| 2 | L4, L5: view options, the row and card menu, with Copy link, the `?download=1` file response and Open in course built | the same, plus a `RowMenu` in `apps/web/src/components/library/` and `apps/web/src/app/api/assets/[id]/file/` | `?group=course` and `?group=concept` render; each of the six menu actions works on a row and a card, the three new ones with tests |
| 3 | L6: the previewer | `apps/web/src/components/library/Previewer.tsx`, the asset page's body factored out of `library/[id]/page.tsx` | A row opens the panel, Escape restores the scroll position, deep links still open the page |
| 4 | L7: the sidebar sections, the Recent query over drafts, sessions, playback positions, observation events and visits, the `visit` event with its migration and the preference fallback, the row menu | `apps/web/src/components/shell/`, `apps/web/src/lib/home.ts` and `home-core.ts`, a `recent.ts` beside them, `packages/schema/src/shared.ts` for `EVENT_TYPES` and a new `services/catalog/drizzle/00NN_visit_event.sql` | The sidebar shows Courses, Pinned and Recent with glyphs; a tutor session, a half-watched video, a concept observed yesterday and a module visited six modules ago all appear, and a finished video does not; the five modules in the preference still show after the migration; Home's threads come from the same query and its golden test is unchanged; the phone drawer is the same column; `AppSidebar.test.ts` covers the sections |

Phases 1 and 4 are independent; 2 and 3 build on 1.

## What stays

- `/library/[id]` and its four tabs; the previewer is a shortcut to its body, not a replacement.
- The Course and Topic filters, as menus beside the view options, since a tab strip of courses would not fit.
- Search as a server-side form over titles and text.
- Settings as a page with tabs. Manus's settings dialog is not adopted; a page is easier to link to and already holds the tutor's models and keys.
- The folded rail at 60 px with its hover peek.
- Companion kinds hidden from All.

## Out of scope

- Favourites on assets (L4 says why).
- Deleting or renaming an asset from the Library; the import owns asset rows.
- A bottom tab bar on the phone. The drawer stays.
- Manus's model picker, plan chip and credits in the top bar; the app has no top bar and the tutor's model chain is in Settings.
- Group by task for the studio's own outputs beyond what L4's group by concept gives; a studio conversation is reachable from the row's source line.
