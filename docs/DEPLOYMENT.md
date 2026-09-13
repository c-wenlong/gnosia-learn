# Deployment

Production is deployed by Vercel's Git integration. The Vercel project is
connected to the GitHub repo, so every push to the default branch builds and
promotes a production deployment, and every pull request gets a preview
deployment with its own URL. There is no deploy workflow in `.github/` and
nothing to trigger by hand.

- **Production alias:** https://self-learn-one.vercel.app
- **Project:** `kaichen/self-learn`, linked to `https://github.com/c-wenlong/self-learn`
- **Root Directory:** `apps/web`, with **Include source files outside of the
  Root Directory in the Build Step** on

## Root Directory: the one setting this repo cannot set for itself

The Next app used to be the repository root. It is `apps/web/` now, one
workspace beside `packages/`, `services/` and the two submodules under
`tools/`, and Vercel has to be told:

1. **Settings → Build and Deployment → Root Directory** → `apps/web`
2. In the same panel, turn on **Include source files outside of the Root
   Directory in the Build Step**

Both are account settings, held in the Vercel project and not in git, so a pull
request cannot change them. Until the first is set, Vercel keeps building from
the repository root, finds no `next.config.ts` and no `app/` there, and the
deployment check on every PR is red while lint, typecheck, test and build are
green. That is the expected state between merging the re-layout and flipping
the switch, not a regression to debug.

The second setting is not optional. The app reads `content/*.yaml` at request
time and imports three workspace packages, all of which sit above `apps/web/`;
without it the build cannot see them at all.
`outputFileTracingRoot` in `apps/web/next.config.ts` is the matching half on
this side: it widens the file trace from `apps/web/` to the repository root, so
those files are carried into the deployment.

`apps/web/vercel.json` names the framework and one override:
`installCommand: cd ../.. && npm ci`. Without it Vercel runs `npm ci` inside
`apps/web`, and npm, finding itself inside a workspace, scopes the install to
that workspace: the app and the packages it depends on arrive, the root
devDependencies (vitest, eslint, tsx) do not. The first deploy after the move
failed exactly that way, with `next build` type-checking a test file that
imports `vitest`. Installing from the repository root, where the lockfile is,
gives the deploy the same tree a clone gets. The `buildCommand` override is
gone: `next build` in the Root Directory is the default.

Test files are also excluded from `apps/web/tsconfig.json`, which is the config
`next build` type-checks with; `tsconfig.typecheck.json` adds them back for
`npm run typecheck`. A deploy should never depend on a test-only package.

## How a deploy happens

1. A commit lands on `main` (normally a squash-merge from a pull request).
2. Vercel's GitHub app sees the push and starts a build with the project's
   Production environment variables.
3. On success the deployment is promoted to the production alias. A failed
   build leaves the previous deployment serving.

Pull requests get the same treatment against the Preview environment, which is
where the "Vercel: Deployment has completed" check on each PR comes from.

To see what is live and what produced it:

```bash
vercel ls self-learn --prod            # recent production deployments
vercel inspect <deployment-url>        # target, aliases, build output
```

A deployment made by the integration reports `source: git` and carries the
commit SHA and branch in its metadata. If production ever stops updating after
a merge, check the project's **Settings → Git** on vercel.com first: the repo
connection is the whole pipeline.

## Bounding the agent routes

`/api/agent/chat` and `/api/agent/summarize` spend provider quota for whoever
calls them, and the app has no accounts to authenticate against. The in-code
ceilings in `apps/web/src/lib/agent/guard.ts` are a floor that works everywhere; the
real per-IP bound is a Vercel WAF rate-limit rule, which lives on the platform
and not in this repo:

```bash
vercel firewall rules list                              # what exists
vercel firewall rules inspect "Rate limit agent API" --expand
vercel firewall diff                                    # staged, not yet live
vercel firewall publish --yes                           # make it live
```

Rule changes stage as drafts and do nothing until published. Roll a new one
out as `--rate-limit-action log` first, read the real traffic at
**Firewall → Traffic** filtered by the rule id, then tighten to `rate_limit`.
Counters are per region, so N regions can collectively exceed the number by
roughly N times. `--duration` needs Pro or Enterprise.

## Secrets and environment variables

| Name | Purpose | Where it is needed |
| --- | --- | --- |
| `DATABASE_URL` | Postgres holding the learner state and the catalog | Vercel (once a cloud database exists), CI, locally |
| `NVIDIA_API_KEY` | Provider 1 of the tutoring chat cascade | Vercel |
| `GEMINI_API_KEY` | Provider 2 | Vercel |
| `OPENROUTER_API_KEY` | Provider 3 | Vercel |
| `CODECOV_TOKEN` | Codecov **upload** token, from the repo's Configuration page on app.codecov.io | GitHub Actions only (optional) |

The three provider keys go in the Vercel project's **Settings → Environment
Variables** (Production, and Preview if you want previews to run live chat),
because the serverless routes read them at request time. CI does not need
them: `npm run build` runs without keys, and the tutoring chat degrades to the
copy-the-prompt fallbacks when none are set.

`CODECOV_TOKEN` is the only GitHub Actions secret the repo uses, and CI skips
the coverage upload when it is absent:

```bash
gh secret set CODECOV_TOKEN --body "$CODECOV_TOKEN"
```

Codecov has two tokens and they are not interchangeable. The upload token above
is a secret: CI uses it to send `coverage/lcov.info` and nothing else may see
it. The **graph token** that appears in the README badge URL
(`badge.svg?token=…`) is a different, read-only value that only unlocks badge
and graph SVGs for a private repo. Codecov generates it for exactly this
purpose, so it is fine in a public file. Both come from **Configuration** on
the repo's Codecov page: the upload token under General, the graph token under
Badges & Graphs.

## The database

`DATABASE_URL` points at the Postgres holding the catalog. It defaults to
`postgres://localhost:5432/self_learn`, which is the Homebrew install a laptop
uses and needs no configuration; CI sets it to its `postgres:17` service.

**Production has no database yet.** That is a deliberate state and not a
broken one, and two things make it survivable:

- `npm run build` never touches it. Every read calls `connection()` first, so
  it belongs to a request rather than to the build, and a deploy succeeds with
  the variable unset.
- Every read degrades. A page renders with an empty learner snapshot and says
  the database is unreachable rather than failing; a write comes back 503 with
  `STORE_UNAVAILABLE` and the UI shows "not saved". Nothing is lost, because
  nothing was there to lose — but nothing new is recorded either, so the
  production app is read-only until this is set.

**Setting it is also the moment the learner routes become writable by anyone.**
`/api/learner/*` has no account to authenticate: the only check is the same
`enforceSameOrigin` the agent routes use, and a forged `Origin` header walks
straight through it. Today that costs nothing, because production has no
database and there is nothing to write. Once it does, a stranger who guesses a
curriculum item id can tick, untick and overwrite the study record, and those
rows are the only copy. Two things go in before the connection string:

```bash
vercel firewall rules list                              # what exists
# add a per-IP rate limit on /api/learner, the same shape as the agent rule
vercel firewall publish --yes
```

and a `pg_dump` on a schedule, because the one bound that matters against a
write nobody authorised is being able to put the rows back. Real
authentication is the plan's answer (`#27`: "no localStorage except future
auth") and is not in this bundle.

When the cloud database arrives (Neon or Supabase from Vercel, or Postgres on
the homeserver over Tailscale — the plan has not chosen):

```bash
pg_dump self_learn > self_learn.sql          # the local database, both halves
psql "$CLOUD_URL" < self_learn.sql
vercel env add DATABASE_URL production       # then redeploy
npm run catalog -- migrate                   # against the cloud URL
```

The dump carries the append-only trigger with the schema, so the guarantee
survives the move. Migrations are keyed by file hash, so `migrate` against a
restored dump is a no-op rather than a replay.

`NEXT_PUBLIC_SITE_URL` is optional in production: Vercel supplies the
deployment domain, and the app falls back to `http://localhost:3000` locally.
Set it only if you want social preview images to resolve against a specific
canonical origin.

## Deploying from the command line

For a one-off deploy from the local tree, without going through `main`:

```bash
# one-time: log in and link the project
vercel login
vercel link

# production deploy from the local tree
vercel --prod
```

Run both from `apps/web/`, not from the repository root: `vercel` deploys the
directory it is invoked in, and the project's Root Directory only applies to
builds the Git integration starts. `vercel link` writes
`apps/web/.vercel/project.json`, which is where the org and project ids come
from. That directory is gitignored and should stay that way.
