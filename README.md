# Self-Learn · AY2026/27 Course Shortlist

Docs-style self-study hub for the NUS SoC AY2026/27 course shortlist. Track topic progress, attach notes and resources, explore cross-course themes, and launch **Grok 4.5** Socratic micro-sessions per topic.

## What this is

A Next.js study hub that turns the shortlist roadmap into navigable modules:

| Surface | Purpose |
| --- | --- |
| `/` | Course catalog + overall progress |
| `/courses/[slug]` | Course overview, modules, capstone, related courses |
| `/courses/[slug]/[module]` | Topic checklist, notes, curated + user resources |
| `/courses/[slug]/[module]/session?topic=…` | Launch Agent Socratic micro-session |
| `POST /api/agent/chat` | Server proxy to xAI (Grok) with injected system prompt |

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
- **Resources** — curated starter links per module + user-added links
- **Tags** — cross-course themes (`hci`, `agentic-ai`, `transformers`, …)
- **Launch Agent** — Socratic micro-learning with full context system prompt
  - Browser chat via free cascade: **NVIDIA NIM → Gemini Flash → OpenRouter free**
  - Copy system prompt / terminal launch pack always available

All learner state lives in **browser localStorage** (`self-learn:v1`). No accounts or backend DB.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
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
| `npm run test` | Vitest unit tests (CI) |
| `npm run test:watch` | Vitest watch mode |

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
    api/agent/chat/       # Grok proxy (injects system prompt server-side)
    courses/[slug]/…
  components/             # UI (shell, checklist, agent session, …)
  data/courses/           # Typed curriculum (10 courses)
  data/tags.ts
  lib/
    agent/                # Prompt builder, objectives, topic lookup
    progress.ts           # Progress math
    storage.ts            # localStorage reducers
    learner-context.tsx   # Client state store
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
- Agent prompt/objectives/lookup (Grok 4.5 default, context embedding)

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
