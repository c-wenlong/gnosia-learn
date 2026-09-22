# Current app: baseline inventory

A survey of `apps/web/` as it stands today, for planning a redesign against.
Sourced from [AGENTS.md](../../../AGENTS.md), [ARCHITECTURE.md](../../../ARCHITECTURE.md),
[services/catalog/SCHEMA.md](../../../services/catalog/SCHEMA.md),
[learn/README.md](../../../learn/README.md), [content/README.md](../../../content/README.md)
and a direct read of every route, component and lib file named below.

## Pages

| Route | What it shows | Layout | Server/client | Weak or missing, for a learner |
| --- | --- | --- | --- | --- |
| `/` ([page.tsx](../../../apps/web/src/app/page.tsx)) | Course shortlist grouped under theme tags (`TagChip`), one `CourseCard` per course with its own progress bar. Reads `content/courses/` and `content/tags.yaml` via `@/data/courses` and `@/data/content`. | `AppShell` (measure `max-w-3xl`) | Server | No personalised "what to do next"; nothing here surfaces due reviews, the frontier, or recent activity. Tags are static labels, not a filter into the course list. |
| `/learn` ([learn/page.tsx](../../../apps/web/src/app/learn/page.tsx)) | Stat cards (concepts, mastered, learning, untouched, due now), the frontier list, a full `ConceptGraph` SVG, then every concept grouped by domain folder with p(L)%, mastery label, requires/assumes, observations, due date, leech flag, and links back to the course topic it supports. | `AppShell`, wide only for the graph section | Server, dynamic (reads the DB every request) | "Due now" is a bare count with no list to act on and no review session on the web (`/review` is CLI-only). No link from a concept row to its own note or to the videos/diagrams about it, even though `asset_concept` exists. No search or filter over 32+ concepts. No history of *why* a concept sits where it does (the event trajectory is invisible here). |
| `/library` ([library/page.tsx](../../../apps/web/src/app/library/page.tsx)) | Every catalog asset (video, note, session, diagram, link, plus companion kinds) as cards/rows, filtered by `?kind=` and `?topic=` query params; says how many of 206 rows are hidden as companions. | `AppShell`, `data-layout="wide"` | Server, dynamic | No text search, only topic/kind facets. No sort (newest, most-referenced). No way to see an asset's relationship to course progress or to the concept it explains. No "what's new since last visit". |
| `/library/[id]` ([library/[id]/page.tsx](../../../apps/web/src/app/library/[id]/page.tsx)) | One asset rendered as its real shape: video with chapters/transcript, diagram SVG, rendered note prose, session log, or a bare link. Shows derivations (source/companion files) and other assets under the same topic. | `AppShell`, wide | Server, dynamic | No link from the asset to the concept(s) it is about (`asset_concept` is in the schema, never queried here). No way to mark "I watched/read this" or tie it into progress. No learner annotation on an asset. |
| `/courses/[slug]` ([courses/[slug]/page.tsx](../../../apps/web/src/app/courses/[slug]/page.tsx)) | Course header, tags, inferred-syllabus banner, course-wide progress bar, one row per module with its own progress, a reset button, the capstone blurb, related courses by shared tag. | `AppShell` | Server, static params + dynamic progress | No link out to the library assets or knowledge-base concepts that belong to this course. Progress is a percentage with no sense of pace, time spent, or what's left today. |
| `/courses/[slug]/[module]` ([courses/[slug]/[module]/page.tsx](../../../apps/web/src/app/courses/[slug]/[module]/page.tsx)) | Module progress header, a `TopicChecklist` (tick, per-topic note, "Launch Agent", recap card) per topic with subtopics, curated + learner-added resource links, prev/next nav. | `AppShell` | Server, static params | The module never queries the catalog: even when a video or diagram exists for this exact topic (`asset_topic`/`curriculum_item_topic`), nothing here shows it: the learner has to already know to go dig in `/library`. No inline concept-mastery signal for a topic that has one. |
| `/courses/[slug]/[module]/session` ([.../session/page.tsx](../../../apps/web/src/app/courses/[slug]/[module]/session/page.tsx)) | A one-topic Socratic chat (`AgentSession`) against three free LLM providers in a fixed fallback order, plus a recap editor. | `AppShell` | Server shell + client chat | This chat never touches the `learn` pipeline's BKT/event log: a correct or wrong answer here does not move the p(L) shown on `/learn`. Two "mastery" systems exist (recap text vs. BKT probability) and the UI never reconciles them. No transcript is kept once the tab closes, beyond whatever recap gets saved. |
| `/studio` ([studio/page.tsx](../../../apps/web/src/app/studio/page.tsx)) | A corpus browser for `learn/assets/` diagrams: filters, a brief form to commission a new drawing, a job panel and comparison view. 404s unless `STUDIO_ENABLED`. | `AppShell`, `data-layout="full"` | Server, force-dynamic | Not learner-facing at all: a content-author tool. Disconnected from `/library`'s asset view of the same diagrams. |
| `/studio/d/[name]` ([studio/d/[name]/page.tsx](../../../apps/web/src/app/studio/d/[name]/page.tsx)) | A live tldraw canvas for one document, mirrored in an iframe, with the same brief/job panel. | `AppShell`, full | Server, force-dynamic | Same as `/studio`: author tool, not a learner surface. |
| 404 ([not-found.tsx](../../../apps/web/src/app/not-found.tsx)) | Generic not-found page. | `AppShell` | Server | n/a |

**9 pages** (excluding the 404) inventoried.

## Shared shell

[apps/web/src/app/layout.tsx](../../../apps/web/src/app/layout.tsx) is the root
server component. It reads the theme cookie and the learner snapshot in
parallel, resolves which theme wins (cookie beats the stored preference,
since the cookie may reflect a choice made while the DB was down), projects
`content/courses/` into `CourseNavEntry[]` for the sidebar, and wraps
everything in `LearnerProvider` then `AppShell`. It is the one place allowed
to read both `content/` and the database, which is why nav and the header
progress bar are handed down as resolved props rather than fetched by client
components.

[AppShell.tsx](../../../apps/web/src/components/AppShell.tsx) renders the
persistent chrome: a collapsible `Sidebar`, a sticky header with a mobile nav
toggle, a compact whole-shortlist `ProgressBar`, a `ThemeToggle`, and a
`StoreBanner` that surfaces two failure states in plain words: "the database
could not be reached" (read) and "the last change did not save" (write). It
also owns the `wide`/`full` layout escape hatches other
pages opt into via `data-layout`.

[Sidebar.tsx](../../../apps/web/src/components/Sidebar.tsx) lists: All
courses, Knowledge base (`/learn`), Library, Studio (only when the server
says `STUDIO_ENABLED`), then every course with its modules expanded when the
learner is on that course, each carrying a live tick count.

Components in [apps/web/src/components/](../../../apps/web/src/components/):

| Component | One line |
| --- | --- |
| `AgentSession.tsx` | The chat UI and turn loop for a topic's tutoring session |
| `AssetCard.tsx` | One catalog asset as a grid card, with a thumbnail and kind chip |
| `ConceptGraph.tsx` | Plain-SVG longest-path layering of the concept DAG, server-safe |
| `CourseCard.tsx` | One course on the homepage, with its progress bar |
| `CourseProgressHeader.tsx` | The progress bar block at the top of a course page |
| `DiagramView.tsx` | An `<img>` wrapper for one exported teaching diagram |
| `InferredBanner.tsx` | The "syllabus is inferred, not official" warning banner |
| `ModuleProgressHeader.tsx` | The progress bar block at the top of a module page |
| `ModuleProgressRow.tsx` | One module row inside a course's module list |
| `NoteProse.tsx` | Renders a concept note or session log as styled prose, not raw markdown |
| `ProgressBar.tsx` | The shared completed/total percentage bar |
| `ResetCourseButton.tsx` | Confirm-then-clear button for a course's ticks and notes |
| `ResourceList.tsx` | Curated + learner-added resource links for a module |
| `TagChip.tsx` | One theme-tag pill |
| `TopicChecklist.tsx` | Per-topic tick, note editor, subtopics, launch-agent link, recap |
| `TopicRecap.tsx` | The saved "what I learnt" card and its editor |
| `TranscriptPanel.tsx` | Scrolling, clickable transcript beside a playing video |
| `VideoPlayer.tsx` | Native `<video>` with chapters and transcript wired to it |
| `VisitTracker.tsx` | Records "last visited" for the preference row |
| `studio/*` (11 files) | The `/studio` and `/studio/d/[name]` chrome: brief form, job panel/strip, diagram tile/inspector, shot comparison view, controls |

## APIs

| Route | Method | Request | Response | Called from | Touches |
| --- | --- | --- | --- | --- | --- |
| [api/agent/chat](../../../apps/web/src/app/api/agent/chat/route.ts) | POST | `{courseSlug, moduleSlug, topicId, messages, learnerNote?, priorKnowledge?}` | `{message, model, provider, providerLabel, fallbackAttempts}` or `503`/`502` with `code` | `AgentSession.tsx` | Course/module/topic lookup in `content/` (no DB); calls NVIDIA NIM → Gemini → OpenRouter in order |
| [api/agent/summarize](../../../apps/web/src/app/api/agent/summarize/route.ts) | POST | `{courseSlug, moduleSlug, topicId, messages}` | `{knowledge, model, provider, providerLabel}` or error | `AgentSession.tsx` (recap generation) | Same provider cascade; no DB write itself, the learner still has to save the result |
| [api/assets/[id]/file](../../../apps/web/src/app/api/assets/[id]/file/route.ts) | GET (HEAD via Next) | none (range header) | Byte stream of the file, 200/206/416 | `VideoPlayer`, `DiagramView`, "Raw file" links, note embeds | `asset` row lookup + filesystem under `learn/assets/` or manimkc's data root; gated by `ASSET_FILES_ENABLED` |
| [api/assets/[id]/poster](../../../apps/web/src/app/api/assets/[id]/poster/route.ts) | GET | none | JPEG still frame, 200/304 | `AssetCard` thumbnails for videos | `asset` row + ffmpeg frame extraction, cached under the system temp root |
| [api/learner/progress](../../../apps/web/src/app/api/learner/progress/route.ts) | POST | `{curriculumItemId, completed}` | `{curriculumItemId, completed}` | `TopicChecklist` tick | `progress` table |
| [api/learner/note](../../../apps/web/src/app/api/learner/note/route.ts) | POST | `{curriculumItemId, note}` | `{curriculumItemId, cleared}` | `TopicChecklist` note editor | `progress.note` |
| [api/learner/preference](../../../apps/web/src/app/api/learner/preference/route.ts) | POST | `{key, value}`, key ∈ `theme`/`lastVisited`/`userResources` | `{key}` | `ThemeToggle`, `VisitTracker`, `ResourceList` | `preference` table (allow-listed keys only) |
| [api/learner/recap](../../../apps/web/src/app/api/learner/recap/route.ts) | POST | `{curriculumItemId, summary, keyPoints, misconceptions, openQuestions, source, countSession?}` | `{curriculumItemId, cleared, recap}` | `TopicRecap` save, post-chat summarize flow | `recap` table, clamped by `KNOWLEDGE_LIMITS` |
| [api/learner/reset](../../../apps/web/src/app/api/learner/reset/route.ts) | POST | `{curriculumItemIds}` | result of `resetCourse` | `ResetCourseButton` | Deletes `progress` rows for those ids, bumps the preference epoch; `recap` untouched |
| [api/learner/import](../../../apps/web/src/app/api/learner/import/route.ts) | POST | Legacy `{completed, notes, knowledge, userResources}` | Merge result | `LearnerProvider` on first mount, once | `progress`/`recap`/`preference` via `importLegacyState`, database wins on conflict |
| [studio/api/[...segments]](../../../apps/web/src/app/studio/api/[...segments]/route.ts) | GET/POST/DELETE | Proxied, `application/json` only, same-origin only | Proxied from the runner | Every `studio/*` component | Forwards to `127.0.0.1:7250/api/*`; the runner touches `session`/`job`/`asset_job` and `learn/assets/.candidates/` |

**11 API routes** inventoried (6 files under `api/learner/`, one each for
chat, summarize, asset file, asset poster, and the studio proxy).

## Data the UI can show today

The catalog and the `learn` pipeline hold considerably more than the pages
above surface.

**Shown somewhere:** concept id/title/summary/requires/assumes, p(L) and its
mastery label, observations/correct counts, due date, leech flag, the
concept's domain folder, links from a concept to the course topics it
supports; the full asset table by kind/topic with derivation links; course →
module → topic → subtopic structure; per-topic progress ticks, notes and
recaps; theme and last-visited preferences; the learner's own resource
links; (studio only, dev) job state, briefs, comparisons.

**Available in the catalog or the `learn` CLI's `--json` shapes but never
surfaced in the learner-facing UI:**

- The full SM-2 review state per concept: `ease`, `repetitions`,
  `interval_days`, `lastSeen`. Only the bare `due` date reaches `/learn`,
  and there is no due-reviews list or review session on the web at all
  (`review due`/`review grade` are CLI/`/review`-skill only).
- The event log itself: every observation's `pLBefore`/`pLAfter`, source
  (probe vs. teach), and session id: the "trajectory is the source of
  truth" from [learn/README.md](../../../learn/README.md) is invisible on
  any page. There is no history/timeline view of what was asked and how it
  went.
- `asset_concept` links: which specific video, diagram or note explains a
  given concept. The UI resolves `asset_topic` (coarser) but never this.
- Session logs as structured data. They render as raw prose on
  `/library/[id]`, but nothing distinguishes a `tutor` session from a
  `studio` session or links a session to the events it produced.
- `index_run` freshness (when each source was last indexed) and `mirror`
  status (whether a video is backed up off-repo): `catalog status`-only.
- Tunable BKT parameters (`pL0`, `pT`, `pG`, `pS`) stored per-learner in
  `preference.bktParams`. No UI reads or writes them.
- Checks (`check` blocks) stored inside a concept note, used by `review
  due` for CLI quizzing, never rendered on `/learn` or `/library`.

## Content model

Ten courses, one YAML file each under
[content/courses/](../../../content/courses/README.md): a course has
modules, a module has topics, a topic has subtopics and the module carries
curated resources. `content/topics.yaml` is a separate, permanent shared
vocabulary slug (the required join every asset, concept and course module
goes through), not to be confused with a course's own `topics:` (curriculum
items like `cs2111-m1-t1`). A concept note under `learn/concepts/` may
optionally enrich a `topic` slug and separately links back to one or more
curriculum items via its frontmatter `topics:`. Learner state (`progress`,
`recap`) hangs off the curriculum-item id, which is permanent and never
renumbered; mastery and review hang off the concept slug instead, so a
course topic and a knowledge-base concept can each carry the learner's
history independently even though the same subject may appear in both.

## Screenshots

Not captured. `python3 -c "import playwright"` fails with
`ModuleNotFoundError: No module named 'playwright'` and `pip3 show
playwright` confirms it is not installed in the global Python environment
this harness uses. Per the task's own fallback instruction, the build/serve
step was skipped rather than spending time on a screenshot pipeline that
cannot run. No `npm run build` or `next start` was attempted, since neither
mattered without a way to capture the result.
