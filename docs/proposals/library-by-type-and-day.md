# Proposal: the Library by type and day, and the sidebar in sections

Status: proposed, 2026-10-04, for the owner to decide. Decisions L1 to L8
are defaults chosen from the Manus reference
([docs/design/reference/manus](../design/reference/manus/README.md)); each
names what it changes and what it leaves. Nothing here is built.

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
written should say so.

**L3. A row names where it came from.** Second line, in grey: the course and
module for a reading, the concept for a note or diagram, the conversation for
a studio output, the session for a log. Manus's row carries only the task
name; ours has two possible parents (a course and a concept), so the line is
"CS3230 · Week 3 · Master theorem" when both exist and one of them otherwise.
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
Mark watched or Mark read. These exist as actions on the asset page already
([library/[id]/page.tsx](../../apps/web/src/app/(app)/library/[id]/page.tsx));
the menu brings them to the list. Nothing destructive: a Library asset is
deleted by the import that stops seeing it, not by hand.

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
modules; then a Recent section, which is the list Home's "Pick up where you
left off" already computes ([home-core.ts:41](../../apps/web/src/lib/home-core.ts)),
extended from five rows to the day buckets the Chats list uses, and no
longer limited to studio drafts: a row is a tutor session, a studio
conversation, a module or a video, each with its kind glyph at 18 px as
Home draws them. Section labels are 13 px grey, sticky while their section
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
| 1 | L1, L2, L3, L8: the tab strip, the day groups, the source line, the density tokens | `apps/web/src/app/(app)/library/`, `apps/web/src/lib/library.ts`, a shared `dayGroups` helper, the shell's tokens | The Library at `?kind=` shows the tab strip and day groups in both views; the counts are in the header; `npm test` passes with a golden of the grouping |
| 2 | L4, L5: view options, the row and card menu | the same, plus a `RowMenu` in `apps/web/src/components/library/` | `?group=course` and `?group=concept` render; every menu action reaches the handler the asset page already has |
| 3 | L6: the previewer | `apps/web/src/components/library/Previewer.tsx`, the asset page's body factored out of `library/[id]/page.tsx` | A row opens the panel, Escape restores the scroll position, deep links still open the page |
| 4 | L7: the sidebar sections, the Recent list and its menu | `apps/web/src/components/shell/`, `apps/web/src/lib/home-core.ts` | The sidebar shows Courses, Pinned and Recent with glyphs; the phone drawer is the same column; `AppSidebar.test.ts` covers the sections |

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
