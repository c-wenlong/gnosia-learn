# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is continuously deployed and not versioned; entries are grouped by date.

## [Unreleased]

### Changed

- **The database is the only home of the content; `content/` and `learn/`
  are gone from the repository.** Phase 3 of
  [docs/CONTENT-MIGRATION.md](docs/CONTENT-MIGRATION.md) is the cut-over. The
  topics, tags, courses, concept notes, session logs and diagrams are rows,
  and once a database owns all six types a write changes rows and no file.
  `catalog export --out <dir>` writes them out when someone wants files, and
  `npm run export:nightly` keeps a dated archive under
  `$SELF_LEARN_HOME/archive/`, pruned to the newest 30. The last tree the
  repository held is at the tag `content-files-final`.

  `CONTENT_SOURCE` defaults to the database, and `files` survives only as a
  test override. The `learn` CLI's file half runs only against a tree
  `LEARN_ROOT` names, never creates `learn/` in the repository, and refuses a
  type the database does not own (or an unreachable database) with a message
  where it used to read an empty folder. A bare `catalog import` on a database
  that owns every type refreshes manimkc and the mirror ledger and reads
  nothing else.

  A fresh clone builds its database from `seed/` (README.md, "Install"), and
  `npm run e2e` does the same by default; `--copy` copies `self_learn`
  instead. The documents moved with the files: `content/README.md` is now the
  export format's section of [seed/README.md](seed/README.md), the course file
  format is [seed/COURSES.md](seed/COURSES.md), and the pipeline's
  documentation is [docs/LEARN.md](docs/LEARN.md).

- **Configuration that was hard-coded in source now has an environment
  variable, and every one of them has a default that needs no configuration.**
  An audit found four; none held a secret, so this is purely about being able
  to point the code somewhere else.

  `MANIMKC_ROOT` and `TLDRAWKC_ROOT` name the two submodule checkouts, and both
  default to where `.gitmodules` puts them. They exist because that location has
  moved once already: relocating the pair from the repo root into `tools/` on
  2026-09-13 cost a day. `MANIMKC_ROOT` is deliberately manimkc's own variable
  carrying manimkc's own meaning: its CLI resolves the checkout as `--root`,
  then `$MANIMKC_ROOT`, then a walk up from the cwd. One name for one thing is
  the only version of this that stays true across two repos. It is not
  `$MANIMKC_HOME`, the data root, which the indexers still take from each
  report's `outRoot` and never from a path set here. `--manimkc-root` still wins
  over both for a single run.

  `npm run canvas` reads `TLDRAWKC_ROOT` through the same function, so the tool
  and the diagram indexer cannot end up running different builds of it. It goes
  through a launcher (`services/catalog/src/canvas.ts`) rather than expanding
  the variable in the shell, because a shell cannot apply the rule: it sees only
  the process environment, so a root set in `services/catalog/.env` would reach
  the indexer and not the tool, and it leaves a `~` that arrived inside a
  variable literal. The launcher forwards every argument, writes nothing to
  stdout and exits with the tool's own code, so `--json` output and `inspect`'s
  exit 3 are unchanged.

  Both roots resolve the way `DATABASE_URL` does (shell, then
  `services/catalog/.env`, then the default), with two rules a connection string
  never needs: a relative value resolves against the repo root rather than the
  working directory, since a variable is set once and read from anywhere, and a
  leading `~` is expanded, since `process.loadEnvFile` performs no shell
  expansion.

  `NVIDIA_BASE_URL`, `GEMINI_BASE_URL` and `OPENROUTER_BASE_URL` point a
  provider at a proxy or a local mock, matching the `*_MODEL` variables that
  were already there. Exercising the cascade's fallback path against the real
  endpoints spends free-tier quota, which is the reason.

  The OpenRouter attribution header falls back to the site URL the app already
  resolves, instead of the literal `https://self-learn-one.vercel.app`. A fork
  that configured its own site and nothing else was crediting its requests to
  this deployment. `resolveSiteUrl` moved out of `apps/web/src/app/layout.tsx`
  into `apps/web/src/lib/site-url.ts` so both callers share one parse: a second
  one in the provider had the two disagreeing on bad input, with the layout
  falling back to localhost while the header carried the malformed string on to
  OpenRouter. The empty-string handling the layout already had (`||` over `??`,
  because `new URL("")` throws) now covers the header too.

  `LEARN_ROOT` was read but documented only in ARCHITECTURE.md; it is in
  [services/catalog/.env.example](services/catalog/.env.example) now, marked as
  the test-fixture override it is, and `repoRoot()` reads it through `loadEnv`
  so that documentation is true rather than aspirational.

- **The catalog resolves manimkc files against the report's `outRoot`, not the
  submodule.** manimkc gained a data root (`$MANIMKC_HOME`) so its renders, TTS
  cache and state can live outside a checkout that a repo relayout can delete —
  the move from `manimkc/` into `tools/` on 2026-09-13 took 25 rendered videos
  and the whole clip cache with it, because git does not carry gitignored files
  across a move. Both `manimkc topics --json` and `manimkc mirrors --json` now
  report that root as a top-level absolute `outRoot`, and the two indexers join
  onto it. `--manimkc-root` still names the *checkout*, which is a different
  question from where its output landed, and with no data root configured the
  two are the same directory so nothing observable changes.

  The `out/…` strings are untouched: they remain `asset.path`, the `manimkc:`
  asset id, and the literal key the mirror ledger is matched on. Only the base
  they resolve against moved.

  `--only mirrors` now runs `manimkc` first. Those keys carry no trace of the
  root they were built against, so a `mirrors` run under a different
  `$MANIMKC_HOME` than the last `manimkc` run would match every path by string
  and attach the audit to assets hashed somewhere else, in silence. Re-reading
  `manimkc` in the same process makes that unrepresentable. `mirrors` records the `outRoot` it audited in
  `index_run.metadata`, and says so when *nothing* matched, since every path
  unmatched at once means the two reports disagree about their base rather than
  a few sidecars being absent.

### Fixed

- **The three asset-presentation components now reset their own state when the
  file they are showing changes.** `VideoPlayer` kept the playback position,
  `DiagramView` kept a failed load and `AssetCard` kept a failed thumbnail, so
  a re-render with a new `src` showed the previous file's state. The two image
  cases were the worse half: a failed load swaps the `<img>` out for the
  message, which leaves nothing to load the next file, so one missing diagram
  poisoned every diagram the component was handed afterwards.

  The reset lives inside each component rather than as a `key` at the caller.
  `/library/[id]` renders `VideoPlayer` and `DiagramView` without one, and a
  key there would have been cheaper, but the diagram studio renders the same
  components from another route and the next caller does not inherit a
  guarantee it never saw. It is done during render, not in an effect, so the
  swapped-in file is never painted through the previous one's state.

  Not reachable through `/library` today: every link between two assets of the
  same kind is a plain `<a>`, which loads a new document, and each list keys
  its cards by asset id. It is reachable the moment any caller re-renders with
  a new `src`, which is what the studio will do.

- **A seek `VideoPlayer` could not perform is now retried rather than
  dropped.** Clicking a chapter or a transcript line before the element has its
  metadata moved the highlight and left the video where it was, so the next
  play started from the top. The seek is held against the load it was asked
  for, applied at `loadedmetadata`, and discarded once the element has moved
  past that load. It is keyed to a load counter rather than to the URL, so
  going from one video to another and back does not resurrect it. Chromium
  never takes this path: it accepts the write as a default playback start
  position rather than throwing, so this is a guard for the engines that do,
  which is what the original `catch` was written for.

### Added

- **Course cover photos are blobs, named by the course row.** The ten photos
  that were `apps/web/public/course-covers/` move into the blob store:
  migration 0015 adds `collection.cover_blob_key` (a course only, always with
  `metadata.coverCredit`: photographer, source page, licence), and the web
  app serves each from `/api/courses/<slug>/cover` to the signed-in owner,
  cached for good under a URL versioned by the image's hash. `catalog course
  cover <id> --file IMAGE --photographer P --source URL --licence L --reason R`
  sets or replaces one (`--clear` removes it), and
  `node scripts/move-course-covers.mjs --from <dir>` moved the ten. An export
  writes `content/courses/<code>.cover.<ext>` beside the course file, which
  names it under `cover:`, and an import stores it back under the same key;
  the seed's course carries its cover. Until the cloud adapter arrives,
  covers show only where the `fs` store is, and a card with none draws its
  code placeholder.

- **The asset library: `/library` and `/library/[id]`.** Every piece that made
  this possible landed separately — the queries, the components, the file route
  — and this is the surface that puts them together. `Library` is in the
  sidebar.

  **The default view shows 135 of 206 rows, and says so.** The catalog holds
  link 68, note 32, video 30, captions 23, transcript 23, chapters 23, session
  3, diagram_svg 2, diagram_source 2. Sixty-nine of those are a `.vtt`, a
  `.transcript.json` and a `.chapters.json` written beside each of the thirty
  videos, and two more are the `.tldr` each diagram was exported from. Rendered
  flat and sorted by kind they would also sort *above* the videos, so the first
  two screens of a library would be caption files. So the default is everything
  that stands on its own, and the 71 companions keep their own chips with their
  true counts, their own linkable `?kind=` views, and a place on the page of
  whatever they belong to. The rule is a set of kinds in
  `apps/web/src/lib/library.ts`, not "anything with a derivation": a video is
  the *source* of its sidecars and a diagram SVG is *derived* from its `.tldr`,
  so the derivation test would keep the transcripts and drop the drawings.

  **Filters are the query string**, so `?kind=` and `?topic=` are linkable, the
  back button undoes one, and the whole rail is `<a>` elements with no client
  JavaScript. Eighty topics carry assets, which is why they sit behind a native
  `<details>` that opens itself when a topic filter is on.

  **The detail page renders what the thing is.** A video gets `VideoPlayer`
  with its chapter rail and transcript; a diagram gets `DiagramView`; a note,
  session log or caption track gets its own words; a link gets the link, since
  a row with a URL and no file has nothing else to give. The transcript is
  read and validated on the server and passed down as `cues`, never fetched
  from the browser: the components already take props, and a server read needs
  no loading state. `apps/web/src/lib/transcript.ts` is where a truncated or
  half-written sidecar costs the transcript panel and nothing else.

  **Files unavailable is a first-class view, not an error.** Three states, and
  the page tells them apart: `ASSET_FILES_ENABLED` unset (the default, and what
  a fresh clone and production both look like), manimkc never indexed here, and
  a manimkc index that predates the run recording its data root. Each says what
  to run. Nothing renders a dead player or a broken image in any of them, and
  the titles, topics, sizes and paths stay real throughout.

  New query: `assetDerivations` in `services/catalog/src/state/assets.ts`, both
  directions of `asset_derivation` in one answer. `catalog show` now calls it
  instead of the four statements it had inline, so the CLI and a page cannot
  disagree about what an asset was made from.

- **A route that serves an indexed asset's bytes:
  `GET /api/assets/<encodeURIComponent(asset.id)>/file`.** The catalog has held
  rows for 30 videos, 69 sidecars and a pair of diagrams with nothing able to
  play or show one, because the videos sit under manimkc's data root outside
  this repository and the diagrams sit in `learn/assets/`, outside
  `apps/web/public/`. Next serves neither.

  **The URL carries an id, never a path.** Nothing from it is joined onto
  anything: the id is a primary key, looked up through `assetsByIds`, and every
  filesystem decision is made from the row that comes back. An id of
  `manimkc:out/../../../../etc/passwd` finds no row and stops. The stored path
  is then checked anyway, because an indexer walks a real tree and the row
  outlives the run that wrote it: it must be relative, it must resolve inside
  the root its `source_repo` names, and it must still be inside it after
  `realpath`, so a symlink in the tree cannot point out of it. The comparison
  is `path.relative`, not a prefix test, which would accept
  `/data/out-old` for a root of `/data/out`.

  **Range requests, so a video can be scrubbed.** `Accept-Ranges: bytes`, a 206
  with `Content-Range` for a range the file can satisfy, a 416 with the real
  length for one past the end, and the whole file for a header that is
  malformed, multi-range or in a unit we do not speak, which RFC 9110 permits.
  The slice is streamed from the offset rather than read whole.

  **Content type from a closed list** (`mp4`, `svg`, `vtt`, `json`, `md`,
  `png`), and an extension that is not on it is refused rather than sent as
  `application/octet-stream`. Every response carries `nosniff`, so the
  extension decides the type, and a CSP whose `sandbox` and `script-src 'none'`
  are what make `image/svg+xml` safe: an SVG is a document, and one served from
  this origin could otherwise run script with this origin's storage. The policy
  still names `style-src 'unsafe-inline'`, `font-src data:` and `img-src data:`,
  because a tldrawkc export writes its CSS inline and embeds its fonts, and
  blocking those returns a 200 that renders as an unstyled diagram.
  `Content-Disposition` is `inline`, because the point is a `<video>` and an
  `<img>` and `attachment` would break both.

  **Off unless `ASSET_FILES_ENABLED` is set**, the shape the studio's
  `STUDIO_ENABLED` gate uses (decision D11 in
  [docs/TLDRAWKC-INTEGRATION.md](docs/TLDRAWKC-INTEGRATION.md)). Production has
  none of these files, so a request there is a 404 rather than a stat of a path
  that cannot exist. Deliberately not keyed on `NODE_ENV`: the documented way
  to look at this app locally is a production build, so that gate would be off
  on the one machine that has the files.

- **The manimkc index run records the data root its paths are relative to.**
  `index_run.metadata.outRoot`, from the same report the indexer already stats
  files with. `source_root` could not carry it: that column is the directory
  the run *read*, which for manimkc is the checkout and for `concepts`,
  `diagrams` and `sessions` is a repo-relative folder, and overloading it would
  make one column mean two things and misreport every other source.

  Without this the value existed only in a log line. The live database recorded
  the checkout, `tools/manimkc`, while all 99 manimkc files sat under
  `~/.self-learn/manimkc`, so a route resolving against `source_root` would
  have 404'd every video at once. Reading `$MANIMKC_HOME` instead is not an
  option: nothing in this repository reads it, and the data root belongs to the
  checkout that was indexed rather than to the environment the server booted
  with. `indexedRoot()` in `services/catalog/src/state/assets.ts` reads it back
  through the web app's one door.

  An index run from before this change has no `outRoot`, and the route answers
  503 naming `npm run catalog -- index --only manimkc` rather than 404. "The
  file is gone" and "your index is older than this feature" are different
  problems with different fixes, and a 404 conflates them.

- **`listAssets` and `assetCounts`, the queries a library page needs.**
  `assetsForTopic`, `assetsForConcept` and `assetsForCollection` all answer
  "what belongs to this one thing"; a library page's first screen has no
  single subject yet; it wants everything, filtered and paged. `listAssets`
  takes `kind`, `topicSlug`, `sourceRepo`, `limit` and `offset`, every one
  optional, and returns `AssetWithTopics[]` — an `AssetRef` plus the topic
  slugs each asset is filed under, so a grid can render a topic chip without a
  second query per row. `assetCounts` is one grouped `count() ... group by
  kind` for the filter chips that show how many of each kind exist.

  One statement, not two. The topics come back as a correlated scalar
  subquery in the select list — `coalesce(array_agg(topic_slug order by
  topic_slug), '{}')` over `asset_topic` for that row's `asset.id` — rather
  than a second round trip for the ids the first query kept. A two-query
  version worked and was reviewed, but under READ COMMITTED each query gets
  its own snapshot: a `catalog index` run committing between them could hand
  back an asset whose chips no longer matched the membership that selected
  it for a `topicSlug` filter. One statement has one snapshot, so the race
  does not need reasoning about, and the query is shorter than the two-query
  version was, not longer. `ORDER BY kind, id` is still what orders the
  list — the same stable order `assetsForTopic` uses, for the reason the
  `byKindThenId` comment in the same file gives — and the subquery's own
  `order by topic_slug` is what orders the topics within one asset, so
  neither ordering is redone in TypeScript. `topicSlug` filters by
  membership through an `IN` against `asset_topic` rather than a join, for
  the same reason the topics themselves are a subquery and not a join: a
  join would multiply an asset filed under three topics into three rows and
  break both the paging and the one-row-per-asset contract every other query
  in the file keeps.

- **Four components that put an asset on a page: `VideoPlayer`,
  `TranscriptPanel`, `DiagramView` and `AssetCard`**, in
  `apps/web/src/components/`, with the shapes and the index arithmetic they
  share in `media.ts`.

  All four are pure presentation. Every one takes what it needs as props: none
  queries the catalog, imports `@self-learn/catalog/state` or builds a URL, so
  the parent that lists the rows and the route that serves the bytes can be
  written beside these rather than after them.

  `VideoPlayer` is a native `<video controls>` with a chapter rail and the
  transcript beside it, and no player library: every browser already ships
  play/pause, a scrubber, captions and fullscreen that the keyboard and a
  screen reader know, and a study surface gains nothing from a worse second
  copy. Chapters seek, and the transcript, the chapter highlight and the video
  all read one clock. Its layout is driven by container queries rather than
  viewport breakpoints, because the app's content column is capped at 48rem
  whatever the screen is doing: a `lg:` rule there would leave the video
  narrower than its own transcript.

  `TranscriptPanel` holds the behaviour worth having. The line being spoken is
  highlighted and the lines already spoken recede; the highlight rests on the
  last line through a pause instead of blinking out; clicking a line seeks; and
  the panel keeps the current line in view until the reader scrolls somewhere
  else, at which point it stops and offers to follow again. Its own scroll is
  told apart from the reader's by the position it expected to land on.

  `DiagramView` renders the SVG as an `<img>`, not inline. A committed export
  is 200kB to 300kB and self-contained, so inlining would put every byte in the
  HTML of every page uncached, and drop its ids, `<defs>` and `<style>` into the
  page's one global namespace where two diagrams start borrowing each other's
  clip paths. Inlining buys one thing, restyling from CSS, and that is the
  wrong thing here: the drawings carry their own meaning-bearing colours, so a
  dark-mode `filter: invert()` would turn a red warning box cyan. They are
  given a constant near-white mat in both themes instead, framed like a plate
  in a book.

  `AssetCard` has two shapes, not one. A video and a diagram are worth looking
  at before opening and get a preview tile; a transcript, a note or a link is
  text and gets a compact row, because a grid of empty 16:9 rectangles is not a
  gallery. It degrades honestly: a kind it has never seen still reads as
  itself, a video with no poster says so, an asset with no title falls back to
  its filename in mono and admits to `Untitled <kind>` only when there is no
  name at all, and a preview that fails to load says that where the picture
  would have been.

  The transcript and chapter props are typed to what manimkc actually writes
  (`<name>.transcript.json` is `{ video, duration, chapters, segments }`), not
  to an invented shape.

  These are the first components in the app with tests, which CONTRIBUTING.md
  and ARCHITECTURE.md both say are unnecessary. The exception is deliberate and
  narrow: the follow-then-give-up scroll, the seek and the four empty states
  are behaviour rather than markup, and looking at the running app does not
  catch a regression in them. The tests render with `react-dom/client` and
  React's own `act` rather than a testing library, so the dependency list is
  unchanged, and coverage scope is untouched.

- **The asset queries are behind the door the web app comes through.** A new
  `services/catalog/src/state/assets.ts` owns `assetsForTopic`,
  `assetsForConcept`, `assetsForCollection` and `assetsByIds`, plus the
  `AssetRef` shape and the `byKind` grouping, and `@self-learn/catalog/state`
  exports all of it.

  They were private functions inside `services/catalog/src/commands/show.ts`,
  which meant the CLI could name a video and the web app could not: `apps/web/`
  may import that one module of this package and nothing else
  (ARCHITECTURE.md layering rule 1). The catalog had indexed 200-odd assets
  that no page could reach. `show.ts` now calls the same functions, so
  `catalog show` and a page cannot drift apart about what an asset row is.

  No `assetsForCurriculumItem`. Assets attach to `topic` slugs, and a
  curriculum item inherits its module's single topic, so the join would answer
  every checklist row in a module with the same list. The pages that would
  render an asset already hold what they need: the course, module and session
  pages hold the whole `Module`, whose `topic` is that slug, and `/learn` holds
  concept slugs. It can be added the day something asks for it.

  Rule 4 in ARCHITECTURE.md still says `state/` is the only *writer* of the
  state tables, which is still true; it now also says out loud that read-only
  content queries live there, because `knowledge-base.ts` had been doing that
  since bundle 5 and the module header described neither.

- **The catalog's indexers and read commands.** `npm run catalog -- index`
  fills Postgres from six sources: `content/topics.yaml`, `content/courses/`,
  `learn/concepts/`, `manimkc topics --json`, `learn/assets/` and
  `learn/sessions/`. Each is a pure "read files, return rows" module behind one
  shared writer that upserts in a single transaction per source and prunes what
  the source no longer produces. An unresolved topic or concept slug stops the
  run with the file and the slug named, and every unresolved reference in a
  source is reported at once rather than one per run.
- **`content/topics.yaml`, the shared topic vocabulary.** 81 topics across 22
  domains, each with aliases and the manimkc folders, course modules and
  concept notes it covers. It is the join the three content trees never had:
  every video, note, diagram, session and curriculum item now points at the same
  `topic` row. Every module id and concept slug appears in exactly one entry,
  and `catalog index` refuses a mapping claimed by two topics.
- **`content/courses/*.yaml`.** The ten courses as data, generated from the
  TypeScript objects rather than transcribed. They are now the only copy: the
  web app reads them too.
- **Four read commands, all `--json` and all bounded.** `ls` gives domains,
  topics or a collection's tree as titles and counts; `show` gives one topic,
  concept, collection, curriculum item or asset with everything pointing at it;
  `path` gives the prerequisite chain between two concepts in learning order,
  and says so when the arguments are the wrong way round; `search` covers topic
  titles and aliases, concept titles and asset titles, top 20. `show` returns
  paths, never bodies — the database says which file to read, git holds the
  words.
- **`status` grew a `sources` block**, backed by a new `index_run` table, so
  "is the manimkc half of this database stale" has an answer that is not
  "re-index and diff".
- **`topic.aliases`**, so `search "common data bus"` finds Tomasulo's algorithm.
- **`index --only` expands to the sources downstream of what it names**, and
  says which it added. Pruning a topic cascades into the links every other
  source owns, so running one source alone could leave the rest silently
  unlinked.
- **Open-source hygiene files.** MIT `LICENSE`, `CONTRIBUTING.md`,
  `SECURITY.md`, `ARCHITECTURE.md` and this changelog. `ARCHITECTURE.md` is
  written from the code rather than the README: the three layers, the
  directory tables, the localStorage schema, the provider cascade, every
  threshold in the BKT and SM-2 implementations, and a numbered set of
  layering rules each verified by grep.
- **GitHub templates and automation.** Bug report and feature request issue
  forms, a pull request template whose checklist covers the real gate
  (`lint`, `typecheck`, `test`, `build`, no secrets, no dirty submodule
  pointer), a template config that routes vulnerabilities to the security
  policy instead of a public issue, and a Dependabot config watching npm and
  GitHub Actions monthly, with version-locked families grouped so a bump
  cannot arrive unable to install, and `@types/node` majors ignored while the
  runtime is Node 22.
- `@types/node` moved from `^20` to `^22`, matching the Node 22 the `engines`
  field and CI already required.
- **Coverage reporting.** `npm run test:coverage` runs vitest with v8
  coverage scoped to `src/lib`, `src/data` and `scripts/learn`, and CI uploads
  the lcov report to Codecov. `codecov.yml` keeps the project status
  informational so a new baseline cannot block a merge, holds patch coverage
  at 80%, and ignores the App Router pages and React components, which are
  covered by the build rather than by unit tests.
- **A README header card** with the banner, the badges and a one-line
  statement of what the project is.
- **`packages/content`, one reader for `content/`.** `loadCourses`,
  `loadTopics` and `loadTags`, plus the `Course`/`Module`/`Topic`/`Resource`/
  `TagMeta` types, imported by both the web app and `catalog index`. The
  validation the parity test used to do after the fact now happens on the way
  in: unique course, module, topic and resource ids across every file, a
  `topic:` that resolves against `content/topics.yaml`, required slugs, a real
  boolean for `inferred`, a known resource type, and a filename that matches
  the course code. Every refusal names the file, and unresolved topics are
  reported together rather than one per run.
- **`content/tags.yaml`.** The eight cross-course themes, moved out of
  `src/data/tags.ts`.

### Changed

- **The repository is laid out around the catalog.** The Next app moved from
  the root into `apps/web/`, with its own `package.json` (`@self-learn/web`),
  its `public/`, `next.config.ts` and `vercel.json`; the two submodules moved
  from the root into `tools/manimkc/` and `tools/tldrawkc/`. Four homes for
  code, and a rule that tells them apart: `apps/` is deployed, `packages/` is
  imported, `services/` owns a connection or a command surface, `tools/`
  belongs to another repo. Nothing behavioural changed. The root keeps one
  ESLint config, one vitest config and the delegating `dev`, `build`, `start`,
  `learn`, `catalog` and `canvas` scripts, so every command still runs from
  the repo root. An existing clone needs
  `git submodule sync --recursive && git submodule update --init` once,
  because both submodule paths moved, and the Vercel project needs its Root
  Directory set to `apps/web` with "include files outside the root" on.
- **The web app reads `content/`, and `src/` holds no course data.** The ten
  `src/data/courses/*.ts` files and `src/data/tags.ts` are gone;
  `src/data/courses/index.ts` is a thin `server-only` module over
  `loadCourses()`, memoised per process, keeping the same exported lookups.
  `server-only` means a `"use client"` module reaching course data fails the
  build with the import chain printed instead of shipping a YAML parser and
  the whole curriculum to the browser, so the sidebar and the header progress
  bar take a nav projection as a prop from the root layout, and `TagChip` takes
  the resolved theme rather than its id. Every one of the 135 routes renders
  byte-identical text to before; the only markup difference is one fewer
  client chunk.
- **Courses carry an `order:`.** The shortlist's reading order used to be the
  order of an array in `index.ts`. Sorting ten files by name is a different
  sequence and nothing would have said so, so the key is authored, unique, and
  checked.
- `HANDOFF.md` moved out of the repository root into `docs/`, renamed with the
  date of the handoff it records.

### Security

- **Bounded what an anonymous call to the agent routes can cost.** Both
  `/api/agent/*` routes spend the owner's provider quota and the app has no
  user accounts, so there was nothing stopping anyone with the URL from
  driving them. `src/lib/agent/guard.ts` adds three cheap ceilings, checked
  cheapest first so a refused request never reaches a provider: a same-origin
  comparison of the request's own `Origin` and `Host` (403), a payload ceiling
  of 40 messages and 24000 characters (413), and a per-IP fixed window of 20
  requests a minute for chat and 6 for summarize (429, with `Retry-After`).
  The character budget counts the learner note, which reaches the system
  prompt unclamped, and measures non-string message content by its serialised
  length, since the chat route forwards content of any shape. Each limit is
  documented with what it does not stop.

### Removed

- **`src/data/courses/*.ts`, `src/data/tags.ts` and
  `src/data/courses/parity.test.ts`.** The parity test existed to keep two
  representations of the same courses in step; with one representation left
  there is nothing for it to compare. Its curriculum invariants moved to
  `packages/content/test/courses.test.ts`, where they assert on the files
  rather than on a TypeScript literal.
- **`globalProgress()` from `src/lib/progress.ts`.** It reached into the course
  data to find every topic id, which a client component can no longer do.
  `AppShell` calls `countsFromIds` over the ids the server layout handed it.
- **The `deploy.yml` GitHub Actions workflow.** Vercel's Git integration has
  been deploying every push to `main` on its own (the deployment metadata
  says `source: git`, `githubCommitRef: main`), while the workflow failed on
  every run with an invalid `VERCEL_TOKEN`. Fixing the token would only have
  deployed each commit twice. With it gone, the only GitHub secret the repo
  needs is the optional `CODECOV_TOKEN`.

### Fixed

- **`catalog show <course-or-module>` reported no assets at all, for every
  collection in the catalog.** It resolved a collection's assets through
  `collection_item.asset_id`, and no indexer has ever written that column:
  `services/catalog/src/index/courses.ts` is the only writer of
  `collection_item` in the repo, every row it writes names the module's topic,
  and the course YAML's resources are filed as `asset_topic` rows. The join
  matched zero rows every time and the command printed nothing, which looks
  exactly like a module with no resources.

  `assetsForCollection` now resolves all three member shapes the
  `collection_item_one_target_check` constraint permits: `topic_slug` into
  `asset_topic`, `concept_slug` into `asset_concept`, and `asset_id` directly.
  The last two have no rows today and are asked anyway, because a query that
  ignores a shape the schema allows is the same bug again. Results are deduped
  by asset id, since two member topics can share one asset and a module listing
  the same video twice is a rendering bug that reads as a data bug.

  This changes what `catalog show` prints for a collection: a module now lists
  the assets of the subject it covers. That is the first time the field has
  ever been non-empty, so nothing was relying on the old output, and no golden
  test had recorded it. There is one now.

  The bug predates the move to `state/`, and the audit that found it turned up
  no second instance: the only other readers of `collection_item` are
  `commands/ls.ts` and `commands/show.ts`, both of which read `topic_slug`
  under an `isNotNull`, and `collection_item.asset_id` and
  `.concept_slug` are the only always-null columns in the content half.

- **`concept` rows could never be deleted.** The `event` append-only guard was
  written `FOR EACH STATEMENT`, so it fired on the `ON DELETE SET NULL` that
  Postgres runs against `event.concept_slug` whenever any concept is deleted —
  even with `event` completely empty. Migration `0003_append_only_per_row`
  makes both triggers `FOR EACH ROW`, which keeps the guarantee and drops the
  false positive. It was invisible until the indexers became the first thing to
  try deleting a concept.
- `catalog status` failed against a partially migrated database instead of
  reporting the outstanding migrations: `head` is non-null at 0000 or 0001 but
  `index_run` does not exist until 0002, so the row counts threw "relation does
  not exist".
- `catalog show <concept>` read mastery filtered by concept alone and took the
  first row, which would have returned another learner's belief once there is
  more than one. Now scoped to the learner explicitly.
- `catalog ls <collection>` reported only direct children, so a deeper level
  would have been silently absent. It stays one level deep, deliberately, but
  now counts what is below each child and names the command to see it.
- Documentation audit: counts, paths and command names that had drifted from
  the code they describe.

## 2026-09-12

### Added

- **A pixel-art app icon, README banner and social card**
  ([#1](https://github.com/c-wenlong/self-learn/pull/1)). The icon and the
  touch icon use the Next file conventions; the Open Graph card is declared
  by hand in the root layout, because under Turbopack the
  `app/opengraph-image.png` convention ignores the documented
  `opengraph-image.alt.txt` sidecar and would ship the card with no alt text.
  `resolveSiteUrl()` computes `metadataBase` from `NEXT_PUBLIC_SITE_URL`, then
  Vercel's injected production domain, then localhost, warning rather than
  throwing on an unusable value.
- **The learning-system architecture notes** under `docs/`, alongside the
  roadmap.sh reference PDFs.
- **The `manimkc-video` skill**, linked into this project so a topic with
  moving parts can be turned into a narrated animation.

### Changed

- manimkc bumped several times: nine narrated topics committed, Tex rendering
  routed through Tectonic shims, a `test_tex` fix for apt `dvisvgm`, and a
  README refresh with two new explainers.

## 2026-09-06

### Changed

- manimkc bumped: its `tools/` tree reorganised by function with a test suite
  added, the publish destination resolved from `.env`, faststart deliverables,
  and a Google Drive publish step.

## 2026-09-03

### Changed

- manimkc bumped: a `topics/` taxonomy, six narration backends, and a
  knowledge tree.

## 2026-08-30

### Added

- **manimkc as a submodule**, documented as the repo's third part: asset
  generation. Its own `AGENTS.md` covers the ManimGL versus Manim Community
  split, the no-LaTeX constraint, the shared scene library, the narration
  cache and the render-then-look verification loop. A fresh clone needs
  `git submodule update --init --recursive`, since manim is nested inside it.

### Changed

- `AGENTS.md` and `CLAUDE.md` unified, so there is one set of project
  instructions and `CLAUDE.md` only imports it.

## 2026-08-22

### Changed

- The `/learn` and `/review` skills moved out of this repo into the `learning`
  plugin under the `learning` marketplace, installed globally so they work
  from any project. A copy under `.claude/` would shadow the plugin and drift,
  so there is none.

## 2026-08-20

### Added

- **Propagation.** A correct answer now moves belief in the concepts it rests
  on, each prerequisite counted once at its shortest hop distance, attenuated
  by 0.4 per hop and capped at 0.9 so indirect evidence can never confer
  mastery on its own.
- **Two kinds of edge.** `requires` gates teaching and carries evidence;
  `assumes` orders the plan and does neither. The split exists because one
  relation was doing both jobs and the strictest reading won.
- **A live session log.** The exchange is written into the session file as
  Obsidian callouts as it happens, rather than summarised at the end.
- **`learn void`**, to retract a session's evidence as unreliable, and varied
  multiple-choice answer positions.
- **Domain folders for concepts.** Notes sit one level deep under
  `concepts/<domain>/`, while ids stay bare slugs so edges, wikilinks and the
  event log keep resolving.
- **Two-way links between sessions and concepts**, and a review slot for every
  answered question.

### Fixed

- **SM-2 conformance:** a failed item restarts the interval sequence but its
  E-Factor is left untouched. Penalising ease on a lapse punished it twice.
- **The frontier gates on readiness (0.75), not mastery (0.95).** Gating on
  mastery meant answering every prerequisite to near-certainty before the
  system would teach the concept you actually came for.
- A false claim that `reviews.json` was rebuildable from the event log. It is
  not: review events are logged but nothing replays them.

## 2026-08-18

### Added

- **The Probe → Plan → Teach → Close learning pipeline.** The `learn` CLI in
  `scripts/learn/`, plain Node ESM with no dependencies, plus the knowledge
  base in `learn/`: concept notes, session logs, an append-only event log and
  the caches derived from it. Bayesian Knowledge Tracing for mastery, SM-2 for
  spaced repetition, a concept DAG for ordering, and a mermaid map and JSON
  index generated for the web hub.

## 2026-08-05

### Added

- **Per-topic session recaps**, persisted with the rest of learner state and
  clamped on the way in so one runaway session cannot fill the localStorage
  quota. Recaps survive a progress reset: clearing progress means "study this
  again", not "forget what I concluded".

## 2026-07-17

### Fixed

- GitHub Actions deploy secrets wiring.

## 2026-07-16

### Added

- **The initial study hub.** A Next.js App Router app over the AY2026/27
  course shortlist: courses, modules, topics, progress, notes and resources
  held in browser localStorage, with a free agent cascade (NVIDIA, then
  Gemini, then OpenRouter) behind the tutoring chat.
