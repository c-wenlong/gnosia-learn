# Proposal: a module is a learning path

Status: built, 2026-10-04. All six phases are in; the Progress table at the end names each PR.

## The problem

The module page at `/courses/<slug>/<module>` sorts a week's material by what
format it is in. Under the header and the objectives sit three collapsible
sections, Topics, Resources and Assets
([ModuleMain.tsx](../../apps/web/src/components/course-home/ModuleMain.tsx)),
and the learner decides the order: which reading goes with which topic, when to
watch the video, and whether they are ready for the next week. Coursera's
module page, which the course home was built from (#194), does the opposite:
one list of videos, readings and practice in the order to take them, ending in
a graded check.

Each section reads a different key, which is why they cannot be interleaved
today:

| Section | Read by | Joined on |
| --- | --- | --- |
| Topics | `readCourses` ([courses.ts:145](../../services/catalog/src/content/readers/courses.ts)) | `curriculum_item.collection_id`, the module |
| Resources | the same reader ([courses.ts:164](../../services/catalog/src/content/readers/courses.ts)) | a `collection_item` asset row on the module |
| Assets | `assetsForTopic` ([assets.ts:102](../../services/catalog/src/state/assets.ts)) via [course-assets.ts](../../apps/web/src/lib/course-assets.ts) | `asset_topic`, the module's vocabulary topic, so two modules on one topic show the same assets |

Nothing links a reading or a video to the item or the concept it supports. A
reading's only links are its module (`collection_item`) and the module's topic
(`asset_topic`); the courses indexer writes it no `asset_concept` row
([courses.ts:274](../../services/catalog/src/index/courses.ts)). A video from
manimkc, remotionkc or revideokc gets exactly one `asset_topic` row
([video-tool.ts:410](../../services/catalog/src/index/video-tool.ts)): of the
62 videos in the catalog, none is linked to a concept. Only studio videos
(`catalog video put`) and diagrams carry concepts.

## What already exists

Most of what a path needs is already in the catalog. Measured on `self_learn`
on 2026-10-04:

- **The order.** Every one of the 248 live course items lists its concepts in
  teaching order (`concept_curriculum_item.position`, from
  [course-items-declare-concepts.md](course-items-declare-concepts.md)). An
  item averages 1.2 concepts; the most is 6.
- **The graph.** 332 `concept_prerequisite` edges, `requires` (hard) and
  `assumes` (soft), already on the knowledge base the web app reads
  ([knowledge-base.ts:41](../../services/catalog/src/state/knowledge-base.ts)).
- **The checks.** A note's ```` ```check ```` blocks: 490 of them across 167
  of the 306 notes. The concept session already turns them into multiple
  choice and records each answer through `POST /api/learner/observe`, and its
  Quiz me mode (`?mode=check`,
  [session-core.ts:216](../../apps/web/src/lib/session-core.ts)) asks up to
  five and nothing else. When a note has none, `/api/agent/session` has the
  tutor write one.
- **The done rule.** `topicDone`
  ([course-path.ts:146](../../apps/web/src/lib/course-path.ts)) marks an item
  done when all its concepts are mastered, and `pathStatus` soft-locks a
  module while the one before it has nothing done (`isLocked`, the same file).

So the page is the main thing missing. The other gaps are the reading and video
links, a check that spans a module, and a guard that keeps the course order
and the graph from contradicting each other.

### The order and the graph disagree in eleven places

Ordering each course's concepts by module, item and position, and checking
every edge whose two ends are both in the course:

| Edges where the prerequisite is | `requires` | `assumes` |
| --- | --- | --- |
| In the same module | 134 | 51 |
| In an earlier module of the course | 57 | 45 |
| Not in the course at all | 23 | 18 |
| **Taught after the concept that needs it** | **3** | **8** |

The three hard ones are `gaussian-splatting-optimization` before
`tile-based-gaussian-rasterization` (cp4282), `react-loop` before
`tool-calling` (cp4284), and `discount-usability-testing` before
`think-aloud-usability-testing` (cs3216). Either the course order or the edge
is wrong in each case, and today nothing reports it.

## The proposal

A module page shows one ordered path. Every step on it comes from data the
catalog already has, or from one of the three links this proposal adds.

For CS3230 week 1, as it would read:

| Step | What it shows | Comes from |
| --- | --- | --- |
| Before you start | `machine-model-and-input-size`, if not mastered | the `assumes` edge from `big-o-witness-definition` to a concept no CS3230 lesson teaches |
| Watch | CS3230 week 1: asymptotic analysis (narrated) | the video, linked to the module and to no single lesson |
| Read alongside | CLRS 4th ed, chapters 1 to 3 | a reading listing every lesson of the week |
| Lesson 1: Big-O and big-Omega | `big-o-witness-definition`, then `big-omega-witness-definition`: each the note, any diagram or video on that concept, then its checks | `cs3230-m1-t1`'s `concepts:` |
| Lesson 2: Theta, little-o and little-omega | the same, for its two concepts | `cs3230-m1-t2` |
| Lesson 3: Comparing growth rates | the same, then the readings listed on this lesson | `cs3230-m1-t3` |
| Practice | the two LeetCode problems | readings of type `practice` |
| Week check | mixed questions over all six concepts | the checks of every concept in the module |

### The path, step by step

1. **Before you start.** The `requires` and `assumes` edges from the module's
   concepts to concepts outside the module, deduplicated, `requires` first,
   leaving out any the learner has mastered. An empty list shows nothing. Each
   entry links to `/learn/<concept>` and does not lock anything, because the
   course's own lock already covers earlier modules and a prerequisite outside
   the course is advice, not a gate.
2. **Module material.** Readings and videos on the module and on no lesson
   come next, under "Watch" and "Read alongside". Readings of type `practice`
   are not module material; they have one place, step 4. Which videos count is
   under [Videos name their concepts](#videos-name-their-concepts).
3. **Lessons.** One per course item, in `position` order. Inside, one step per
   concept in its teaching order: the note (the concept page), the diagrams and
   videos whose `asset_concept` names that concept, then that concept's checks.
   The readings listed on the lesson close it. A lesson's done state is
   `topicDone`, unchanged.
4. **Practice.** A `practice` reading with `lessons:` closes the last lesson
   it lists, after that lesson's other readings. One with no `lessons:` sits
   here, after the last lesson and before the week check, and nowhere else.
5. **Week check.** A quiz over the checks of every concept in the module (see
   [The week check](#the-week-check)).

The by-format view stays where browsing by format belongs, in the library
(`/library`, filtered by topic). The module page links to it once, as the
Assets section's "All N in the library" link does today.

### Readings attach to lessons

A reading gains an optional `lessons:` list of item ids in its own module. A
reading with none is module material, unless it is `practice` (step 4 of the
path).

```yaml
modules:
  - id: cs3230-m1
    topics:
      - id: cs3230-m1-t1
        title: Big-O and big-Omega
        concepts: [big-o-witness-definition, big-omega-witness-definition]
    resources:
      - id: cs3230-m1-r1
        title: CLRS 4th ed, chapters 1 to 3
        url: https://...
        type: book                 # no lessons: the whole week
      - id: cs3230-m1-r4
        title: LeetCode fibonacci-number
        url: https://leetcode.com/problems/fibonacci-number/
        type: practice
        lessons: [cs3230-m1-t3]
```

Lesson, not concept, for four reasons:

1. **A reading belongs to its course; a concept does not.** Nine concepts are
   already taught by more than one course. A reading linked to a concept would
   follow it into every course that teaches it, so one course's textbook
   chapter would turn up in another course's path. A lesson belongs to exactly
   one course.
2. **A lesson is already almost one concept.** At 1.2 concepts per item, the
   finer link would rarely move a reading.
3. **Readings are wide.** 172 of the 209 are books, docs and papers. "CLRS
   chapters 1 to 3" spans all three lessons of week 1, so the link has to be a
   list either way, and a list of three lessons is easier to write correctly
   than a list of six concepts.
4. **One place to edit.** The link lives in the course file next to the lesson
   it names. The reader refuses an id that is not a live item of the same
   module, the way it refuses an unknown `topic:`.

A concept that wants its own reading has a place already: the note's body,
which travels with the concept to every course.

`practice` joins `paper`, `docs`, `video`, `book` and `other` in
`RESOURCE_TYPES` ([courses.ts:50](../../packages/content/src/courses.ts)). It
is how the path tells "read this" from "do this", which the LeetCode links in
CS3230 now file under `other`.

### Videos name their concepts

A video lands on a concept step only when it has an `asset_concept` row. The
video-tool indexers read a `concepts:` list from each `topic.yml`, check each
id the way the diagram indexer does
([diagrams.ts:335](../../services/catalog/src/index/diagrams.ts)), and write
`asset_concept` rows for the video and its sidecars. `TopicEntry` declared
the field and nothing read it until phase 5; `resolveConcepts` in
[video-tool.ts](../../services/catalog/src/index/video-tool.ts) reads it now.

A video reaches a path in one of three ways, and they scope differently:

| Link | Shows on | Shared across courses and modules |
| --- | --- | --- |
| `asset_concept` | that concept's step, in every lesson that teaches it | Yes, on purpose: a video that explains one concept is part of the concept, as its note is |
| The course file names it | the module, or the lesson that lists it | No: the course chose it |
| `asset_topic` only | the module, as module material | Only when two modules name the same `topic:` |

The middle row is the course-local route. A module, and a lesson, gain an
optional `videos:` list of catalog asset ids:

```yaml
  - id: cs3230-m1
    videos:
      - manimkc:out/algorithms/cs3230/week-01-asymptotic-analysis/week_01_asymptotic_analysis.mp4
    topics:
      - id: cs3230-m1-t3
        videos: [video:comparing-growth-rates-on-a-log-plot]   # a studio video, for illustration
```

A video listed here is a reference, not a resource: it has no id of its own,
because the asset id is already permanent and the course adds nothing to it
but a place. Readings keep `url:` and their resource ids, unchanged.

The list is stored as data on the row that owns it, the way `subtopics`
already is: a `videos` jsonb array on `curriculum_item`, and `videos` in the
module collection's `metadata`. It is deliberately not a foreign key to
`asset`. The courses source indexes before the video tools, and a checkout
without the tool submodules skips them altogether, so a course that names a
manimkc video would be refused on a fresh catalog or a clone with no tools if
the link had to resolve at import. Import checks the shape only: an id with an
asset prefix, and no video listed twice in one module. Export writes the
arrays back as they are, so a round trip keeps them.

The reference resolves when the page reads it. A listed id the owner can read
as a `video` is placed; any other id is left off the path and listed by
`catalog doctor` as dangling, naming the course, module and id. Nothing is
written from a dangling id, so this is not an indexer skipping a row (the
rule in [AGENTS.md](../../AGENTS.md#gotchas)); it is a reference waiting for
its source to be indexed.

**A video appears once on a module page.** The same video can be reached more
than one way: a studio video carries both concept and topic links, and the
course may also list it. The path places it at the first match of, in order:
the course's own list (the lesson, else the module), the step of the first
concept in the module that it names, then the topic-only fallback below.

The last row is the fallback, and it is what the Assets section does today.
A topic-only video shows as module material, except where it would be wrong:
eleven vocabulary topics are named by more than one module, so on those
modules a topic-only video may belong to the other one. A module on such a
shared topic shows topic-only videos only while none of the videos it lists
resolves (a listed id still waiting for its tool to be indexed does not
count, so the module is never left with no video at all); a module on a
topic it alone names always shows them, whatever it lists.
`catalog doctor` lists the modules on a shared topic that still list no
video.

The weekly CS3230, CS4223 and CS4225 videos cover a whole module, so they stay
module material, and that is correct. A video's chapters sidecar could later
split it into per-lesson segments; that is out of scope here.

### The week check

Renamed on screen to "Module check" on 2026-10-09, when the self-paced roadmap.sh courses arrived: they have no weeks. The code, routes and this document keep the old name (`weekCheck`, `week-check.ts`).

A new session mode, `?mode=module`, at `/courses/<slug>/<module>/check`,
reuses `SessionFocus` and its Quiz me flow. The plan takes the module's
concepts in path order and keeps asking about each one until it is mastered,
is answered wrong once, or has had three questions. Questions come from the
note's checks, the one asked least recently for this learner first (from the
observation events), and the tutor writes one when the note runs out, as Quiz
me does today. The whole check stops at 24 questions; a module with more
concepts than that fits starts from the weakest by mastery.

Three is the number that can finish a concept. With the default parameters
([bkt.mjs](../../scripts/learn/lib/bkt.mjs): prior 0.25, guess 0.2, slip 0.1,
mastered at 0.95), a correct probe takes a new concept from 0.25 to 0.60, then
0.87, then 0.97. One question per concept could never reach mastered from
nothing. Notes average about three checks (490 across 167), so the third
question is often the tutor's.

Each answer is an ordinary observation through `/api/learner/observe` with
`source: probe`, so it measures without counting as teaching
(`opportunity=false`), and its payload carries `module: <module id>`. That is
a field in the event's JSON, so no migration and no new event type, but it
needs two code changes: the route's `parseObserve` accepts an optional
`module` (an id the owner can read) and drops every key it does not name
([route.ts:72](../../apps/web/src/app/api/learner/observe/route.ts)), and
`recordObservation`
([observe.ts](../../services/catalog/src/state/observe.ts)) builds the payload
field by field, so it takes `module` and writes it. The check has no score of
its own and no pass mark: mastery moves per concept, and the module is done
when its lessons are, through `topicDone`. A learner who already knows the
week takes the check first, answers three in a row on each concept, and finds
the module done at the end.

Week 1 of CS3230 has no checks at all (its six notes have none), so on day one
this check would be all tutor-written questions. Writing checks is content
work, tracked by the coverage line below rather than by refusing anything.

### The order guard

`catalog doctor` reports every edge where a course teaches a concept before a
concept it `requires` or `assumes`, using each concept's first appearance in
the course. `requires` is an error and `assumes` a warning. Once the three
`requires` cases are fixed, the guard becomes a rule `course import` and the
concepts indexer enforce, so an edit to either side that breaks the order is
refused by name. `assumes` stays a warning: a soft prerequisite taught later is
sometimes how a course is meant to read.

`catalog status` gains two coverage lines per course: lessons whose readings
are placed (no unplaced reading in the module), and concepts with at least one
check.

## Schema

One migration.

- **`curriculum_item_asset`**: `(curriculum_item_id, asset_id, position)`,
  both foreign keys, unique on the pair, written only by the courses indexer
  and `course import`. A typed link table, following the rule in
  [SCHEMA.md](../../services/catalog/SCHEMA.md) that each link says what it
  joins; `collection_item` stays the module's own list, so a reading is still
  on its module whether or not it names lessons. Readings only: the
  readings are written by the same import, so the foreign key always
  resolves.
- **`curriculum_item.videos`**: jsonb, default `[]`, the lesson's `videos:`.
  The module's list goes in `collection.metadata`, which needs no column.
  Neither is a foreign key; see
  [Videos name their concepts](#videos-name-their-concepts).
- **`asset.resource_type`** accepts `practice`; `asset_resource_type_check`
  is replaced with the longer list.

No change to `event`, `session` or `mastery`.

## The changes

| Part | Where | What |
| --- | --- | --- |
| Parser | `packages/content/src/courses.ts`, `types.ts` | `lessons:` on a resource, refused when an id is not an item of the same module; `videos:` on a module and on a lesson; `practice` type |
| Import and export | `services/catalog/src/content/courses.ts`, `content/readers/courses.ts`, `content/export.ts` | write `curriculum_item_asset` and the two `videos` arrays, read them back into `lessons:` and `videos:`, so a round trip keeps them |
| Indexer | `services/catalog/src/index/courses.ts`, `index/video-tool.ts` | the link rows; `concepts:` from `topic.yml` |
| Doctor and status | `services/catalog/src/commands/doctor.ts`, `status` | the order guard, modules falling back to a shared topic's videos, dangling `videos:` ids, the two coverage lines |
| Path | a new `apps/web/src/lib/module-path.ts` | a pure function from the course, the knowledge base, the module's assets and the learner's mastery to the ordered steps above |
| Page | `ModuleMain.tsx` | renders the steps in place of Topics, Resources and Assets |
| Week check | `[module]/check/page.tsx`, `session-core.ts` | the `module` mode |
| Observation | `app/api/learner/observe/route.ts`, `services/catalog/src/state/observe.ts` | an optional `module` on the request, written into the event payload |

The parser currently ignores keys it does not know
([courses.ts:52](../../packages/content/src/courses.ts)), so a `lessons:` key
written before the parser change would be dropped without a word. The parser
change therefore lands first, in a phase of its own.

## Phases

Each is one PR.

1. **Order guard.** `catalog doctor` reports the eleven cases; fix the three
   `requires` ones in the course files or the notes; arm the rule.
2. **Readings on lessons.** The parser, the migration, import, export, the
   indexer and the coverage line. No page change.
3. **The path.** `module-path.ts` with its tests, and the page. Readings with
   no `lessons:` appear as module material, so the page works before any
   reading is placed.
4. **The week check.**
5. **Videos name concepts.** The indexer change here, then `concepts:` added
   to `topic.yml` in the tool repos where a video teaches one concept.
6. **Content.** Place the 209 readings (about two per module), and write checks
   for the 139 notes that have none, starting with the courses in progress.

## Tests

- `packages/content/test/courses.test.ts`: `lessons:` naming an item in
  another module, a duplicate, an archived item; `practice`.
- `services/catalog/test/courses-reader.test.ts` and the export round trip:
  `lessons:` and `videos:` survive export and import unchanged; a video listed
  twice in a module is refused; a course listing a manimkc video imports into
  a fresh catalog with no manimkc source.
- `services/catalog/test/catalog.test.ts`: the courses run prunes a link the
  file dropped; the video-tool run writes `asset_concept` from `concepts:` and
  refuses an unknown slug.
- A doctor test with a course that teaches a concept before its `requires`.
- `apps/web/src/lib/module-path.test.ts`: step order; before-you-start leaves
  out mastered and in-module prerequisites; a reading with no lessons is
  module material; a `practice` reading appears once, after the last lesson
  or on its lesson, never under "Read alongside"; a concept-linked video lands
  on its step; a module on a shared topic that lists a video that resolves
  shows no topic-only video, one whose listed videos are all dangling still
  does, and one on a topic it alone names still does; a video
  reached by a course listing, a concept link and a topic link appears once,
  where the course listed it; a listed id with no readable video is left off; a module whose topic is shared with another module still shows only
  its own lessons.
- `session-core.test.ts`: the module plan asks a concept again after a correct
  answer until it is mastered, stops on a wrong one, stops at three per
  concept and 24 in all, and falls back to the tutor when a note runs out.
- The observe route and `recordObservation`: `module` lands in the event
  payload, and an unknown or unreadable module id is refused.

## Out of scope

- Splitting a video into lesson segments by its chapters sidecar.
- A graded module score, a pass mark or a certificate.
- Per-course depth for a shared concept (an easier course teaching less of
  it), which needs the course to own its version of a lesson. This proposal
  keeps the concept shared and adds nothing that would block that later.
- Retiring `subtopics`, which stays as the reading list beside concepts
  (decision 1 of [course-items-declare-concepts.md](course-items-declare-concepts.md)).

## Decisions

1. **Readings attach to lessons, not concepts.** The reasons are under
   [Readings attach to lessons](#readings-attach-to-lessons).
2. **Before you start advises; it does not lock.** The module lock already
   covers the course's own order. A prerequisite outside the course is one the
   learner may know from elsewhere, and a probe on the concept page finds that
   out faster than a gate would.
3. **The week check writes probes, not a score.** A separate score would be a
   third record of what the learner knows, beside ticks and mastery, which
   [course-items-declare-concepts.md](course-items-declare-concepts.md) spent
   five PRs reducing to one.
4. **`assumes` order stays a warning.** Eight soft cases exist and some read as
   deliberate (a course that motivates with a later idea).

## Progress

| Step | Landed in |
| --- | --- |
| Proposal | #284 |
| Order guard: rule `course-order-respects-requires` (migration 0021), doctor warnings for `assumes`, the three `requires` cases reordered in the catalog, `catalog flip --rearm` to arm a rule on a type the database already owns | #302 |
| Readings on lessons: `lessons:` on a reading (`curriculum_item_asset`, migration 0022), `type: practice`, `videos:` on a module and a lesson kept as data (`collection.metadata.videos`, `curriculum_item.videos`), import, export and the reader carrying them, and a `catalog status` line of readings placed on a lesson per course | #309 |
| The path: `apps/web/src/lib/module-path.ts` and the module page drawn from it (before you start, Watch, Read alongside, a lesson per item with each concept's note row with Quiz me, then its diagrams and videos, practice), the owner-scoped `assetsForConcepts` and `conceptCheckCounts` reads, and `catalog doctor`'s listed videos that resolve to nothing and modules on a shared topic listing none | #317 |
| Videos name concepts: the manimkc, remotionkc and revideokc sources read each topic.yml's `concepts:` and write `asset_concept` for the video and each sidecar, refusing a slug the owner cannot read or a value that is not a list of slugs by folder and slug, and `--only concepts` now pulls the three tools in behind it. manimkc's topic.yml files already carry 30 lists (39 concepts); remotionkc's and revideokc's say `concepts: []` | #318 |
| The week check: `/courses/<slug>/<module>/check` (`SessionFocus` in its `module` mode, the plan in `apps/web/src/lib/week-check.ts`: each concept asked until mastered, wrong once or three times, at least once even when mastered, the note's checks least recently asked first then the tutor, 24 in all, weakest first past eight concepts), its row last on the module path ("6 concepts · up to 18 questions"), and `module` on `POST /api/learner/observe` and in the event payload, refused unless a live module the owner can read | #321 |
| Content, on the owner's catalog through the CLI (one revision per write, no PR): all 209 readings placed (`lessons:` where a reading covers some lessons, none where it covers the week, the 29 CS3230 LeetCode links made `practice`), and three checks written for each of the 139 notes that had none (417 checks), so every one of the 306 notes now has checks; `catalog status` prints, per course, the readings on a lesson and the concepts whose notes have checks | no PR |
