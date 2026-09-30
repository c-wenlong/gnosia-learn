<p align="center">
  <img src="apps/web/public/banner.png" alt="A staircase of teal books climbing through clouds towards a glowing four-point star, with the Gnosia mascot, a floating book with bright eyes and a ribbon tail, hovering beside it" width="800">
</p>

<h1 align="center">
Gnosia
</h1>

<p align="center">
  <strong>A book that grows as you do: a living knowledge model, a tutoring loop in Claude Code, and a video renderer.</strong>
</p>

<p align="center">
  <a href="https://github.com/c-wenlong/self-learn/actions/workflows/ci.yml"><img src="https://github.com/c-wenlong/self-learn/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <a href="https://app.codecov.io/gh/c-wenlong/self-learn"><img src="https://codecov.io/gh/c-wenlong/self-learn/graph/badge.svg?token=LRJZ81XZA4&branch=main" alt="Test coverage"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/typescript-5-blue.svg" alt="TypeScript 5"></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/next.js-16-black.svg" alt="Next.js 16"></a>
</p>

<p align="center">
  <a href="#why-this-exists">Why</a> ·
  <a href="#whats-inside">What's inside</a> ·
  <a href="#install">Install</a> ·
  <a href="#the-learning-pipeline">Pipeline</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#development">Development</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

**Self-Learn** is a personal study workspace built around the NUS School of Computing AY2026/27 course shortlist. A Next.js hub renders each course as a docs-style roadmap: topic checklists, notes, curated resources, and short Socratic tutoring sessions whose conclusions are saved back against the topic.

Behind the hub sits a tutoring loop that runs inside Claude Code. It measures what you already know, plans a path from there to a goal, teaches one reasoning step at a time, and schedules what you will forget. Everything it writes lands in Postgres, each change a revision with an author and a reason that `catalog history` shows, and `learn vault pull` hands the notes back as plain Markdown you can read and edit.

A third part, the `tools/manimkc/` submodule, renders narrated animations for concepts that text and SVG cannot carry.

```
/learn <anything>     in Claude Code: probe, plan, teach, close
/review               spaced repetition over what is due
```

<p align="center">
  <img src="apps/web/public/screenshot.png" alt="The Self-Learn Today page: a top bar with Today, Courses, Learn, Library and Review, the next concept on the path with Continue teaching, a list of reviews due with Start review, recent study activity, and a right column with today's target, a seven-day streak strip and courses in progress" width="900"><br>
  <em>Today, the home page, live at <a href="https://self-learn-one.vercel.app">self-learn-one.vercel.app</a>.</em>
</p>

## Why this exists

Knowing what is worth learning and actually learning it are two different problems, and most tools solve only one. The roadmap answers the first: a shortlist of courses broken into topics you can tick off. The pipeline answers the second, by keeping a real model of what you hold rather than a list of what you have read. Asset generation is the third piece, for the ideas that only make sense in motion, so the loop can end in a video rather than a paragraph.

## What's inside

| Part | Where | What it does |
| --- | --- | --- |
| Roadmap | `apps/web/` | Next.js hub over the AY2026/27 shortlist: progress, notes, resources, tutoring sessions, topic recaps |
| Learning pipeline | `scripts/learn/`, `services/catalog/src/learn/` | Probe → Plan → Teach → Close loop over a knowledge base in Postgres |
| Asset generation | `tools/manimkc/` (submodule) | Narrated manim animations for concepts with moving parts |
| Asset generation | `tools/remotionkc/` (submodule) | Narrated Remotion explainer videos, indexed like manimkc's and labelled "remotion" |
| Asset generation | `tools/revideokc/` (submodule) | Narrated Revideo explainer videos, indexed like manimkc's and labelled "revideo" |
| Diagrams | [`tools/tldrawkc/`](tools/tldrawkc/README.md) (submodule) | Teaching diagrams drawn on a real tldraw canvas, exported as self-contained SVG with the editable `.tldr` committed beside it |
| Catalog | `packages/schema/`, `services/catalog/` | The Postgres database that owns the content and the learner state, and the `catalog` CLI that writes and reads it |

Ten courses are covered (CS2111, CS4263, CP4281 through CP4285, CS3216, CS3227, CS3249). Three have inferred syllabi and say so in a banner until official NUSMods data lands. Learner state — ticks, notes, recaps, preferences — lives in Postgres alongside the catalog; there are no accounts yet, just one learner row behind one owner password (`/sign-in`). A browser that used the old `localStorage` document imports it once, automatically, on first load.

| Surface | Purpose |
| --- | --- |
| `/` | The public landing page; a signed-in owner is sent to `/today` |
| `/sign-in` | The owner password (docs/DEPLOYMENT.md, "Signing in"); everything below needs the session |
| `/today` | Today: what to study next, reviews due, recent activity, the daily target and streak |
| `/courses` | The course catalog and overall progress |
| `/courses/[slug]` | The course path: units of topic nodes coloured by mastery, with each topic's checklist, notes, recaps and resources in its panel |
| `/learn` | Knowledge base: mastery per concept, the frontier, the dependency graph |
| `/learn/[concept]` | One concept's workspace: its note and sources, a tutor grounded in the note, checks, assets |
| `/learn/[concept]/session` | Focus-mode session: probe, teach, check, close, each graded answer recorded as evidence |
| `/review` | Spaced-repetition review of what is due |
| `/library`, `/library/[id]` | Every indexed asset (videos, diagrams, notes), searchable, with the concepts each explains |
| `/settings` | Daily target, streak leeway, theme (palette Classic or Gnosia, appearance Light, Dark or System), tutor style; export and reset |
| `/courses/[slug]/[module]/session?topic=…` | The older Socratic micro-session for one topic |
| `POST /api/agent/chat`, `POST /api/agent/summarize` | Server proxy to the free provider cascade (system prompt injected server-side), and transcript to structured topic recap |

```
apps/web/         The Next.js app: src/app · src/components · src/data · src/lib · public/
packages/content/ One reader for the export format's content/, and the content types
packages/schema/  Drizzle tables: the single source of the catalog's row shapes
services/catalog/ Migrations, the database connection and the catalog CLI
scripts/learn/    Pipeline CLI: bkt · graph · schedule · markdown · store · render
seed/             A small slice of the content in the export format: a fresh clone's data
docs/             Long-form docs, the pipeline's among them (docs/LEARN.md)
tools/manimkc/    Submodule: narrated manim videos
tools/remotionkc/ Submodule: narrated Remotion videos
tools/revideokc/  Submodule: narrated Revideo videos
tools/tldrawkc/   Submodule: tldraw diagrams
.claude/          launch.json, plus the three skills symlinked from the submodules
```

Three of those are npm workspaces (`apps/*`, `packages/*`, `services/*`), so
one `npm ci` at the root installs the lot and `npm run lint`, `typecheck` and
`test` cover all of them from there. `tools/` is not a workspace: both
submodules carry their own lockfiles and toolchains.

The catalog is the join the content never had: one `topic` vocabulary every
asset points at, typed link tables with foreign keys at both ends, and an
append-only `event` log the learner state is replayed from. It owns the
courses, topics, tags, notes, session logs and diagrams outright; every change
goes through a `catalog` or `learn` command with a reason, and `catalog export
--out <dir>` writes them out as files whenever you want a copy. `npm run
catalog -- import <dir>` reads such a tree into a database, and a bare
`import` refreshes what it reads from `manimkc topics --json`,
`remotionkc topics --json` and `revideokc topics --json`. Agents read it
back in layers with `ls`, `show`, `path` and `search`, every one of them
`--json` and bounded. The design is in
[services/catalog/SCHEMA.md](services/catalog/SCHEMA.md), the export format in
[seed/README.md](seed/README.md#the-export-format).

`.claude/` holds no learning skills. `/learn`, `/review` and the three subagents live in the globally installed `learning` plugin, so they work in every project; see [AGENTS.md](AGENTS.md) for why copying them back here would be a mistake.

`tools/manimkc/` is its own repo with its own venvs and build system. It currently holds 28 topics across 15 domains, filed as `topics/<domain>/<topic>/` and mirrored into `out/`. Narration syncs TTS to the animation through a `voiceover()` context manager with six backends (`local`, `soprano`, `kokoro`, `chatterbox`, `elevenlabs`, `sarvam`), defaulting to the offline `local` voice, with clip caching so re-renders cost no API quota. Agents drive it through `tools/manimkc/tools/cli/manimkc` and the `manimkc-video` skill; read [`tools/manimkc/AGENTS.md`](tools/manimkc/AGENTS.md) before working in there.

## Install

```bash
git clone --recursive https://github.com/c-wenlong/self-learn   # two submodules under tools/
cd self-learn
npm ci
cp .env.example apps/web/.env.local   # Next reads it from apps/web/, never the root
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Node 22 or newer is required.

The app reads its courses, topics, notes and diagrams from Postgres, and nothing else, so it needs Postgres 17 running locally (`brew install postgresql@17 && brew services start postgresql@17`). The repository holds no content of its own beyond [`seed/`](seed/README.md), a small real slice in the export format, so a fresh clone builds its database from that. With Postgres up, the first time:

```bash
createdb self_learn                                         # first checkout only; a second checkout reuses it
npm run catalog -- migrate                                  # creates the tables, or brings them up to date
MANIMKC_ROOT=/nonexistent REMOTIONKC_ROOT=/nonexistent REVIDEOKC_ROOT=/nonexistent npm run catalog -- import seed    # the seed, leaving the video tools out
for t in topics tags concepts sessions courses diagrams; do npm run catalog -- flip $t; done   # the database owns each type
```

The flips run in that order, the one `scripts/lib/flip-order.mjs` keeps. `MANIMKC_ROOT=/nonexistent` leaves manimkc out, since no seed topic maps a video folder and the import would refuse the renders it found, and `REMOTIONKC_ROOT=/nonexistent` and `REVIDEOKC_ROOT=/nonexistent` do the same for remotionkc and revideokc, whose folders name topics the seed does not hold; the seed's README says more. With your own content, import an export of it (`catalog import <dir>`) in place of `seed`. Once topics map their folders (`catalog topic map`), a bare `npm run catalog -- import` takes in the submodules' videos and `npm run catalog -- asset upload --source manimkc` (and `--source remotionkc`, `--source revideokc`) copies them, their captions and posters into the blob store. `npm run e2e` builds exactly this database on its own, under a throwaway name, so the smoke test needs none of these steps.

A type that has not been flipped is refused by name rather than read from the files: the page says it could not read its content, and the server log names the `catalog flip` to run ([CONTENT-MIGRATION.md](docs/CONTENT-MIGRATION.md) has the flip-day details). Without Postgres the app shows a banner saying nothing you change is saved, and each page that shows content says it could not read it.

Both the app and the catalog CLI default to `postgres://localhost:5432/self_learn`. If you point `DATABASE_URL` anywhere else, set the same value in `services/catalog/.env` (copy `services/catalog/.env.example`): the CLI reads that file and never `apps/web/.env.local`, so a value set in only one place migrates one database while the app connects to another. Already cloned without `--recursive`? Run `git submodule update --init --recursive` to fetch `tools/manimkc/` and the manim clone nested inside it. Pulling a clone that predates the move needs `git submodule sync --recursive` first, because both submodules changed path.

The diagram tool in `tools/tldrawkc/` needs one extra step, because `npm run canvas` runs a compiled CLI that is not committed:

```bash
git submodule update --init tools/tldrawkc
(cd tools/tldrawkc && npm ci && npm run build)
npm run canvas -- doctor       # says which Chromium it found
```

Skip it if you are not drawing diagrams; nothing else in the repo depends on it.

## The learning pipeline

Four phases, driven by a dependency-free Node CLI. **Probe** ranks concepts by expected information gain, so it binary-searches the edge of your understanding instead of marching through a syllabus; being asked does not count as being taught. **Plan** returns a topologically ordered path from what you hold to the goal, with mastered prerequisites dropped and claims fact-checked before anything is taught. **Teach** hands back one concept at a time at the frontier, with a check after each step. **Close** writes the concept notes, stores the checks, logs the session, and schedules the reviews.

Mastery uses Bayesian Knowledge Tracing; review scheduling uses SM-2. Both are written from scratch in under 200 lines each with no dependencies. The `event` table is the source of truth, an append-only record of every answer with its before and after belief (append-only enforced by a trigger, not by convention), so the mastery model and the schedule are both projections that can be thrown away and replayed, and the model parameters are safe to change. Concept notes and session logs are rows too, one revision per write; `learn vault pull` writes them out as a folder of Markdown for Obsidian, and `learn map` prints the map.

```bash
npm run learn -- status      # where you are
npm run learn -- doctor      # validate the concept graph
npm run learn -- help        # the full primitive surface
```

The `/learn` and `/review` skills are not in this repo. They live in the globally installed `learning` plugin, and both open by running `npm run learn -- status` so they refuse to improvise a session that records nothing. Full architecture, formulas, and an honest list of what these models get wrong: **[docs/LEARN.md](docs/LEARN.md)**.

## Drawing diagrams

`tools/tldrawkc/` draws teaching diagrams on a real tldraw canvas: a snippet places boxes and arrows, the agent looks at a screenshot and fixes what reads wrong, then exports a self-contained SVG. Both the editable `.tldr` and the exported `.svg` are stored in the catalog as one revision (`catalog diagram commit`, or Accept in the studio at `/studio`); the PNGs used to look at a diagram mid-edit are scratch and never stored.

| Entry point | How | When |
| --- | --- | --- |
| `/learn`'s Teach phase | Spawns the `diagram-maker` subagent, which drives the tool and falls back to a hand-written SVG if `doctor` fails | Automatic, nothing to type |
| The `tldrawkc-diagram` skill | Symlinked into `.claude/skills/` | You ask an agent to draw a diagram or lift a mermaid flowchart onto the canvas |
| The CLI | `npm run --silent canvas -- <verb>` | You, or any script |
| The library | A relative import, e.g. `import { run } from "../tools/tldrawkc/dist/lib/index.js"` from `scripts/`. `tools/` is not an npm workspace, so there is no bare `"tldrawkc"` specifier | Node code that wants the verbs without a shell |
| `serve` | A real browser tab, open until Ctrl+C | A human watching and nudging shapes by hand |

The deployed web app is not an entry point. It reads the diagrams from the catalog and serves the stored SVGs; it never runs the tool, because a Vercel build has no local Chromium and no business writing local files.

A CLI session, start to finish (needs the submodule built first, see [Install](#install)):

```bash
npm run --silent canvas -- doctor
npm run --silent catalog -- diagram checkout probe-and-frontier --dir /tmp/diagrams   # a new slug: a record, no file yet
npm run --silent canvas -- run /tmp/diagrams/probe-and-frontier.tldr --create \
  --shot /tmp/probe-and-frontier.png --code - <<'JS'
helpers.box('probe', 'probe', { x: 60, y: 60, w: 160, h: 64 })
helpers.box('teach', 'teach', { after: 'probe', gap: 120, w: 160, h: 64 })
helpers.connect('probe', 'teach', { label: 'frontier' })
return helpers.describe().lints
JS
# look: the "frontier" label wraps, gap is too small. fix with a second snippet:
npm run --silent canvas -- run /tmp/diagrams/probe-and-frontier.tldr \
  --shot /tmp/probe-and-frontier.png --code - <<'JS'
helpers.box('teach', 'teach', { after: 'probe', gap: 160, w: 160, h: 64 })
return helpers.describe().lints
JS
# look again: fixed. file it, export, and store both in the catalog:
npm run --silent canvas -- meta set /tmp/diagrams/probe-and-frontier.tldr \
  --topic vector-and-linear-algebra-basics
npm run --silent canvas -- export /tmp/diagrams/probe-and-frontier.tldr \
  --svg /tmp/diagrams/probe-and-frontier.svg
npm run --silent catalog -- diagram commit probe-and-frontier --dir /tmp/diagrams --reason "probe feeds teach"
```

| Verb | What |
| --- | --- |
| `doctor` | check node, the page bundle, Chromium and the page |
| `api` | what a snippet can call, from the helpers' own JSDoc |
| `new` | create an empty document, refuses to overwrite |
| `run` | load, run a snippet, save, export |
| `shot` | screenshot without running anything |
| `inspect` | print every shape, binding, lint and the metadata. Exits 3 on lints |
| `export` | write the files that get committed |
| `from-mermaid` | build a document from a mermaid flowchart |
| `list` | every .tldr in a directory, no browser (its default, `learn/assets`, no longer exists here, so name one) |
| `meta set` | stamp metadata on an existing document, no browser |
| `serve` | mirror the document in a real browser tab until Ctrl+C |

Three things that bite:

- `npm run canvas` without `--silent` prints npm's own banner ahead of the tool's stdout, which breaks `--json` parsing. Same for `npm run learn`.
- Exit 3 means the file saved but lints remain: read them and run again, or pass `--allow-lints`. Exit 2 means the snippet threw and nothing was written.
- A new `.tldr` needs `meta set --topic <slug>` (or `new --topic <slug>`) with a slug from the vocabulary (`catalog topic ls`) before the catalog will store it.

## How it works

```mermaid
flowchart LR
    subgraph PLUGIN["learning plugin (global)"]
        SK["/learn · /review"]
        AG["concept-mapper<br/>fact-checker<br/>diagram-maker"]
    end
    subgraph CODE["the learn CLI (this repo)"]
        C["17 commands"]
        LIB["bkt · graph<br/>schedule"]
        ST["the learner store"]
    end
    subgraph KB["the notes (rows in postgres)"]
        REC["concept · session_log_entry<br/>(authored during Close)"]
        MAP["learn map<br/>(derived, printed)"]
    end
    subgraph PG["postgres"]
        EV[("event<br/>source of truth, append-only")]
        DER["mastery · review<br/>(projections, replayable)"]
        STA["progress · recap · preference<br/>(the web hub's state)"]
    end
    WEB["/learn page · course pages"]
    SK --> AG
    SK --> C
    C --> LIB
    C --> REC
    C --> MAP
    C --> ST
    ST --> EV
    EV --> DER
    WEB --> ST
    ST --> STA
    DER --> WEB
```

## Configuration

| Path | Purpose | Shipped? |
| --- | --- | --- |
| `concept`, `session_log_entry`, `diagram` (Postgres) | Atomic concept notes (Obsidian-compatible and wikilinked once pulled), one log per session written live, and the diagrams drawn while teaching. `catalog export` or the nightly export is the copy | not in git |
| `seed/` | A small slice of the content in the export format, for a fresh clone and the tests | tracked |
| `~/.self-learn/` (`SELF_LEARN_HOME`) | The blob store (`blobs/`), the Obsidian vault (`vault/`) and the nightly export (`archive/`, `npm run export:nightly`) | outside the repo |
| `event`, `mastery`, `review` (Postgres) | The trajectory and its projections. `event` is the only copy | not in git |
| `progress`, `recap`, `preference` (Postgres) | The web hub's ticks, notes and recaps. Also the only copy | not in git |
| `apps/web/.env.local` | `OWNER_PASSWORD`, `AUTH_SECRET`, `DATABASE_URL`, provider keys; read from `apps/web/`, never the root | gitignored |
| `tools/manimkc/out/`, `tools/manimkc/cache/` | Rendered videos and the TTS cache | gitignored |

Tutoring chat tries three free providers in order and falls through on errors and rate limits. Every variable is optional: with no keys the site still works, and Launch Agent falls back to **Copy system prompt** and **Copy terminal launch pack**.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Vercel domain in production, `http://localhost:3000` locally | Canonical origin that social preview images resolve against |
| `NVIDIA_API_KEY` | unset | Provider 1, NVIDIA NIM |
| `GEMINI_API_KEY` | unset | Provider 2, Google AI Studio free tier |
| `OPENROUTER_API_KEY` | unset | Provider 3, OpenRouter free models |
| `NVIDIA_MODEL` · `GEMINI_MODEL` · `OPENROUTER_MODEL` | `meta/llama-3.1-8b-instruct` · `gemini-2.5-flash` · `openrouter/free` | Model override per provider |
| `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE` | unset | Attribution headers sent to OpenRouter |

Keys are read server-side only (`apps/web/src/lib/agent/providers.ts`); the browser never sees them. Production also needs them set in the Vercel project's environment variables. Deployment details are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and editing the curriculum is covered in [docs/CURRICULUM.md](docs/CURRICULUM.md).

## Development

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run test` | Vitest, single run |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with v8 coverage, lcov for Codecov |
| `npm run e2e` | Headless smoke test of a production build against a throwaway database it builds from `seed/`. Needs `npm run build` and Postgres first; see [CONTRIBUTING.md](CONTRIBUTING.md#end-to-end-smoke) |
| `npm run learn -- <cmd>` | The learning pipeline CLI |
| `npm run canvas -- <cmd>` | The `tools/tldrawkc/` diagram CLI. Needs `npm ci && npm run build` inside the submodule first |
| `npm run catalog -- <cmd>` | The catalog CLI: `migrate`, `import` (`index` is its old name), `status`, `ls`, `show`, `path`, `search`. Needs `createdb self_learn` against a local Postgres 17 |

Thirteen Vitest files cover the three halves. On the web side: curriculum integrity, progress counting, learner-state reducers, topic recaps and the v1 to v2 migration, the recap summariser, and agent prompt/provider/objective selection. On the pipeline side: BKT update formulas and information-gain ordering, DAG cycle detection and frontier advance, the SM-2 interval ladder and leech handling, frontmatter and wikilink parsing, and `scripts/learn/cli.test.mjs` over the command surface itself. On the catalog side: migrations applying from empty and staying idempotent, and the constraints that make the database worth having — an unknown foreign key, a prerequisite kind outside `requires|assumes`, a `collection_item` with zero or two targets, and an `UPDATE` on `event`. Those need a reachable Postgres and skip themselves with a named reason without one, so `npm test` stays green on a machine that has none; CI runs a `postgres:17` service so they are a real gate there.

`.github/workflows/ci.yml` runs `lint` → `typecheck` → `test:coverage` → `build` on every push and pull request, against a `postgres:17` service container, then uploads the lcov report to Codecov. Production deploys go through Vercel's Git integration on every push to the default branch; there is no deploy workflow to maintain. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for the branch, test and PR conventions, and [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is shaped. Found a security problem? [SECURITY.md](SECURITY.md) says how to report it. [AGENTS.md](AGENTS.md) is the source of truth for coding agents working here, including a gotchas log of traps not worth rediscovering; `CLAUDE.md` just imports it.

## License

MIT. See [LICENSE](LICENSE).
