# Self-Learn · AY2026/27 Course Shortlist

A personal learning workspace with two halves that feed each other:

1. **The roadmap** — a docs-style hub over the NUS SoC AY2026/27 course
   shortlist. Track topic progress, attach notes and resources, launch
   Socratic micro-sessions, keep a durable recap of each one.
2. **The learning pipeline** — a local, file-backed tutoring loop that runs
   inside Claude Code. It measures what you know, plans a path from there,
   teaches one step at a time, and schedules what you will forget.

The roadmap says what is worth learning. The pipeline is how you actually
learn it, and what you learn flows back into a knowledge base the hub
renders. **[Full pipeline architecture →](learn/README.md)**

```
/learn <anything>     in Claude Code — probe, plan, teach, close
/review               spaced repetition over what is due
```

## What this is

A Next.js study hub that turns the shortlist roadmap into navigable modules:

| Surface | Purpose |
| --- | --- |
| `/` | Course catalog + overall progress |
| `/learn` | Knowledge base: mastery per concept, the frontier, the dependency graph |
| `/courses/[slug]` | Course overview, modules, capstone, related courses |
| `/courses/[slug]/[module]` | Topic checklist, notes, recaps, curated + user resources |
| `/courses/[slug]/[module]/session?topic=…` | Launch Agent Socratic micro-session |
| `POST /api/agent/chat` | Server proxy to the free provider cascade with injected system prompt |
| `POST /api/agent/summarize` | Turns a finished session transcript into a structured topic recap |

### Courses covered

- **CS2111** Human-Centred Computing *(inferred syllabus)*
- **CS4263** Artificial Intelligence Principles *(inferred)*
- **CP4281** AI for Graphics
- **CP4282** Gaussian Splatting
- **CP4283** Deep Generative Models
- **CP4284** LLM Reasoning Agents
- **CP4285** Modern Recommendation Systems
- **CS3216** Software Product Engineering for Digital Markets
- **CS3227** Agentic Software Engineering *(inferred)*
- **CS3249** Conversational User Interface

Inferred courses show a banner: topics come from the announcement + standard subject treatment until official NUSMods syllabi land.

## Features

- **Docs UX** — left sidebar, prose modules, light default + dark toggle
- **Progress** — per-topic checkboxes; module/course/global progress derived client-side
- **Notes** — expandable per-topic notes
- **Recaps** — durable per-topic record of what you actually established (see below)
- **Resources** — curated starter links per module + user-added links
- **Tags** — cross-course themes (`hci`, `agentic-ai`, `transformers`, …)
- **Launch Agent** — Socratic micro-learning with full context system prompt
  - Browser chat via free cascade: **NVIDIA NIM → Gemini Flash → OpenRouter free**
  - Copy system prompt / terminal launch pack always available

All learner state lives in **browser localStorage** (`self-learn:v1`, schema `version: 2`). No accounts or backend DB.

## Topic recaps (the recall layer)

Sessions are ephemeral; recaps are not. After a micro-session, **Save session recap** sends the transcript to `/api/agent/summarize`, which returns a structured record — summary, key points, misconceptions corrected, open questions — stored against the topic id.

That record then does three jobs:

1. **Recall** — it renders on the module page under the topic, so months later you can see what you concluded without re-reading anything.
2. **Continuation** — reopening the topic injects it into the tutor's system prompt. The session switches to resume mode: the tutor reflects the established ground back, then pushes on your open questions instead of re-introducing the topic. The Launch Agent button reads **Resume Agent** once a recap exists.
3. **Export** — **Copy as Markdown** lifts a recap out of localStorage so it can live in your notes or in git.

Recaps can also be written or corrected by hand (**Add recap** on any topic, **Write recap by hand** in a session), which is the fallback when no provider keys are set or a free model returns something unusable. A manual edit does not increment the session count.

Deliberate behaviours worth knowing:

- **Progress resets keep recaps.** `resetCourseProgress` clears checkboxes and notes only — resetting progress means "study this again", not "forget what I concluded". Use **Forget** on a recap to delete it.
- **The recap is frozen for the duration of a session**, so saving mid-session doesn't rewrite the premise the tutor is working from.
- **Summaries and lists are clamped** (`KNOWLEDGE_LIMITS` in `src/lib/storage.ts`) and a full quota surfaces as a visible error rather than a silent dropped write.
- **v1 state migrates automatically** — old progress carries over and gains an empty `knowledge` map.

## The learning pipeline

A four-phase loop — **Probe → Plan → Teach → Close** — driven by a
dependency-free Node CLI and orchestrated by Claude Code skills. Full detail
in **[learn/README.md](learn/README.md)**; the short version:

| Phase | What happens |
| --- | --- |
| **Probe** | Adaptive diagnostic. Questions are chosen by expected information gain, so it binary-searches the edge of your understanding instead of marching through a syllabus. Measuring does not count as teaching. |
| **Plan** | Topologically ordered path from what you hold to the goal, with mastered prerequisites dropped. Claims get fact-checked by a subagent; the DAG gets rendered before any teaching starts. |
| **Teach** | One reasoning step at a time at the frontier, with a check after each. Diagrams come from a subagent that views its own SVG and fixes it. |
| **Close** | Concept notes written, checks stored, session logged, map and index regenerated, review scheduled. |

State lives in `learn/` as plain files:

```
learn/concepts/*.md    atomic notes (Obsidian-compatible, wikilinked)
learn/sessions/*.md    one log per session, written live
learn/state/           model.json · reviews.json · events.jsonl · index.json
learn/map.md           generated mermaid knowledge map
```

`events.jsonl` is the source of truth — an append-only trajectory of every
answer with its before/after belief. Everything else is derived and can be
rebuilt, which is what makes the model auditable and its parameters safe to
change.

Mastery uses **Bayesian Knowledge Tracing**; review scheduling uses **SM-2**.
Both are implemented from scratch in ~200 lines each with no dependencies —
see the architecture doc for the formulas, defaults, and the honest list of
what these models get wrong.

```bash
npm run learn -- status      # where you are
npm run learn -- doctor      # validate the concept graph
npm run learn -- help        # the full primitive surface
```

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Learning pipeline: plain Node ESM (`scripts/learn/`), zero dependencies
- Vitest for unit tests
- Free OpenAI-compatible chat providers for agent sessions (NVIDIA / Gemini / OpenRouter)
- Vercel for hosting; GitHub Actions for CI/CD

## Local development

```bash
npm install
cp .env.example .env.local   # set free provider keys for live agent chat
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit tests (CI) — covers `src/` and `scripts/` |
| `npm run test:watch` | Vitest watch mode |
| `npm run learn -- <cmd>` | The learning pipeline CLI (`help` for the full surface) |

### Environment variables (free cascade)

Production does **not** use Grok/xAI. The chat route tries providers in order and falls through on errors/rate limits:

| Order | Variable | Default model | Notes |
| --- | --- | --- | --- |
| 1 | `NVIDIA_API_KEY` | `meta/llama-3.1-8b-instruct` | NVIDIA NIM via `integrate.api.nvidia.com` (OpenAI-compatible free tier on build.nvidia.com) |
| 2 | `GEMINI_API_KEY` | `gemini-2.5-flash` | Google AI Studio free tier; OpenAI-compatible Gemini endpoint |
| 3 | `OPENROUTER_API_KEY` | `openrouter/free` | Free model router; individual free models can 429 under load |

Optional overrides: `NVIDIA_MODEL`, `GEMINI_MODEL`, `OPENROUTER_MODEL`.

Without any of these keys, the site still works; Launch Agent supports **Copy system prompt** and **Copy terminal launch pack**.

## Project layout

```
src/
  app/                    # App Router pages + API routes
    api/agent/chat/       # Tutor proxy (injects system prompt server-side)
    api/agent/summarize/  # Transcript → structured topic recap
    learn/                # Knowledge base view (reads learn/state/index.json)
    courses/[slug]/…
  components/             # UI (shell, checklist, agent session, recap card, graph)
  data/courses/           # Typed curriculum (10 courses)
  data/tags.ts
  lib/
    agent/                # Prompt builder, objectives, topic lookup, recap summariser
    kb/                   # Server-only loader for the knowledge base snapshot
    progress.ts           # Progress math
    storage.ts            # localStorage reducers + v1→v2 migration
    learner-context.tsx   # Client state store

scripts/learn/            # The learning pipeline (plain Node ESM, no deps)
  cli.mjs                 # `npm run learn -- <command>`
  lib/
    bkt.mjs               # Bayesian Knowledge Tracing
    graph.mjs             # Concept DAG: cycles, topo sort, frontier, planning
    schedule.mjs          # SM-2 spaced repetition
    markdown.mjs          # Frontmatter, wikilinks, check blocks
    store.mjs             # Atomic reads/writes over learn/
    render.mjs            # Mermaid map + web index

.claude/
  skills/learn/           # The Probe → Plan → Teach → Close orchestrator
  skills/review/          # Spaced-repetition session
  agents/                 # concept-mapper · fact-checker · diagram-maker

learn/                    # The knowledge base itself (see learn/README.md)
```

## Launch Agent (micro-learning)

Each topic row has **Launch Agent**. The session page builds a system prompt that includes:

1. Full course / module / topic context  
2. Why the session exists  
3. Socratic micro-learning angle  
4. Focus topic + subtopics  
5. End-of-session objectives (“what you should be able to answer”)

Teaching rules force short turns, one diagnostic question at a time, and an exit ticket — not lecture dumps.

Runtime provider selection is server-side only (`src/lib/agent/providers.ts`). The client never sees API keys.

## Testing

Unit tests (Vitest) cover:

- Curriculum integrity (10 courses, unique topic IDs, inferred flags, related tags)
- Progress counting and formatting
- Learner state reducers (toggle, notes, resources, reset, theme)
- Knowledge recaps (session counting, clamping, reset survival, v1→v2 migration)
- Recap summariser (tolerant JSON parsing, resume-mode prompt switching, Markdown export)
- Agent prompt/objectives/lookup (free cascade default, context embedding)
- Pipeline: BKT update formulas and convergence, information gain ordering
- Pipeline: DAG cycle detection, topological order, frontier advance, path planning
- Pipeline: SM-2 interval ladder, lapses, leeches, interval ceiling
- Pipeline: frontmatter round-trip, wikilink extraction, check parsing

```bash
npm run test
```

These run on every PR and main push in CI.

## CI/CD

### Continuous Integration — `.github/workflows/ci.yml`

On **push** and **pull_request** to `main`/`master`:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build`

### Continuous Deployment — `.github/workflows/deploy.yml`

On **push** to `main`/`master` (and manual `workflow_dispatch`):

1. Same quality gates as CI  
2. `vercel pull` / `vercel build --prod` / `vercel deploy --prebuilt --prod`

#### GitHub secrets for deploy

| Secret | Purpose |
| --- | --- |
| `VERCEL_TOKEN` | Vercel personal/access token |
| `VERCEL_ORG_ID` | From `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` |
| `NVIDIA_API_KEY` | Primary free agent provider |
| `GEMINI_API_KEY` | Backup free agent provider |
| `OPENROUTER_API_KEY` | Final free agent backup |

Also set the same keys in the Vercel project **Environment Variables** for Production/Preview so serverless routes can call free providers.

## Production

Live deployment (Vercel):

- **Production alias:** https://self-learn-one.vercel.app  
- Project: `kaichen/self-learn` (linked to `https://github.com/c-wenlong/self-learn`)

Vercel’s Git integration is connected, so pushes to the default branch can also trigger Vercel builds. GitHub Actions (below) adds lint/test gates and an optional prebuilt production deploy.

## Deploy with Vercel CLI

```bash
# one-time: log in + link project
vercel login
vercel link

# production deploy from local tree
vercel --prod
```

After the first link, commit the repo (not `.vercel/`) and rely on GitHub Actions for production deploys, or keep using the CLI.

### Wire GitHub Actions deploy secrets

From `.vercel/project.json` after linking:

| Secret | Value |
| --- | --- |
| `VERCEL_ORG_ID` | `team_…` (orgId) |
| `VERCEL_PROJECT_ID` | `prj_…` (projectId) |
| `VERCEL_TOKEN` | Create at https://vercel.com/account/tokens |

```bash
# example (requires gh + a Vercel token in $VERCEL_TOKEN)
gh secret set VERCEL_TOKEN --body "$VERCEL_TOKEN"
gh secret set VERCEL_ORG_ID --body "team_…"
gh secret set VERCEL_PROJECT_ID --body "prj_…"
# free agent cascade for GH-built deploys:
gh secret set NVIDIA_API_KEY --body "$NVIDIA_API_KEY"
gh secret set GEMINI_API_KEY --body "$GEMINI_API_KEY"
gh secret set OPENROUTER_API_KEY --body "$OPENROUTER_API_KEY"
```

Also add `NVIDIA_API_KEY`, `GEMINI_API_KEY`, and `OPENROUTER_API_KEY` in the Vercel dashboard → Project → Settings → Environment Variables for Production (and Preview if desired).

## Notes for curriculum edits

- Course data lives under `src/data/courses/*.ts` and is aggregated in `index.ts`.
- Prefer stable public URLs for curated resources.
- Keep topic IDs stable (`cs2111-m1-t1` style) so learner localStorage progress remains meaningful.

## License

Private project unless otherwise stated.
