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

The second setting is not optional. The app imports three workspace packages,
all of which sit above `apps/web/`; without it the build cannot see them at
all. `outputFileTracingRoot` in `apps/web/next.config.ts` is the matching half
on this side: it widens the file trace from `apps/web/` to the repository
root, so those packages are carried into the deployment. No content file is:
since phase 2 of [CONTENT-MIGRATION.md](CONTENT-MIGRATION.md) the app reads
courses, topics, notes and diagrams from the database only.

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

## Signing in

Gnosia has one reader, so authentication is a password and a signed cookie
rather than accounts. `/` is the public landing page and `/sign-in` the door;
everything else, `/api/*` included, needs the session. The check runs in
`apps/web/src/proxy.ts` before any page renders, and again in the `(app)`
layout before any query, so an anonymous request never reaches Postgres.

```bash
vercel env add OWNER_PASSWORD production      # what you type on /sign-in
vercel env add AUTH_SECRET production         # openssl rand -base64 32
```

Set both for Preview too if preview deployments should be usable. With either
missing the deployment fails closed: every protected page redirects to
`/sign-in`, which names the missing variable. Rotating `AUTH_SECRET` signs
every browser out; changing `OWNER_PASSWORD` does not, since the cookie is
signed with the secret and not the password. Sessions last thirty days.

The only brake on password guessing is a fixed 600ms delay per wrong attempt
in `apps/web/src/app/api/auth/sign-in/route.ts`. That is proportionate for one
owner with a long password; add a per-IP rule on `/api/auth/sign-in` with
`vercel firewall` before opening the deployment to anyone else. When accounts
arrive, `apps/web/src/lib/auth/` is the module to replace (Auth.js reads the
same `AUTH_SECRET` name) and `isSignedIn` in `session.ts` is the seam every
caller already goes through.

## Secrets and environment variables

| Name | Purpose | Where it is needed |
| --- | --- | --- |
| `DATABASE_URL` | Postgres holding the learner state and the catalog | Vercel (once a cloud database exists), CI, locally |
| `OWNER_PASSWORD` | The one password that opens the app (see [Signing in](#signing-in)) | Vercel, locally |
| `AUTH_SECRET` | Signs the session cookie; 32+ characters from `openssl rand -base64 32` | Vercel, locally |
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
  nothing was there to lose, but nothing new is recorded either, so the
  production app is read-only until this is set.
- Content is the exception, since phase 2: the courses, topics and notes are
  rows, so a page that shows them renders the shell with a panel saying its
  content could not be read (`app/(app)/error.tsx`), where it used to fall
  back to the files. The landing page and sign-in read no content and are
  unaffected. That is edge case 20 of the plan, the one availability property
  the move to the database gives up, and it lasts until the cloud database
  exists.

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
write nobody authorised is being able to put the rows back. The owner password
([Signing in](#signing-in)) now stands in front of every learner route, which
is what the plan called "future auth" (`#27`); accounts are still to come.

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

## The blob store

Videos, their posters and sidecars, and diagram SVGs are moving out of the
repository and the manimkc data root into a content-addressed blob store
(docs/CONTENT-MIGRATION.md 0.4, D5). Until go-live it is local only: the `fs`
adapter in `packages/blob`, keeping objects under `$SELF_LEARN_HOME/blobs`, or
`~/.self-learn/blobs` when the variable is unset.

- **Set `SELF_LEARN_HOME` in `services/catalog/.env`**, if at all, not in
  `apps/web/.env.local`. Both the catalog CLI (which uploads) and the web app
  (which serves) resolve the root through `blobRoot()` in
  `services/catalog/src/env.ts`, which reads that file the way `DATABASE_URL`
  is read, so one setting reaches both. A value only the app can see would
  have it serve from one store while the CLI uploads to another.
- **Absolute, or starting with `~/`.** A relative value is refused rather than
  resolved against wherever a command runs, and a root inside a self-learn
  checkout is refused outright, since a git operation can delete it. Moving the
  manimkc submodule once deleted 25 rendered videos that way.
- **Vercel reads no blob store today.** The `fs` store is on the laptop and a
  function cannot reach it, so the file routes serve nothing in production,
  as they serve nothing now. The cloud adapter (R2 on Hobby, Vercel Blob on
  Pro, open question 3 of the plan) and its token arrive with the cloud
  database in step 0.1, and the bytes move with the rows in the same window.

### Filling it

```bash
npm run catalog -- asset upload --source manimkc --dry-run   # what would move
npm run catalog -- asset upload --source manimkc
```

It reads `manimkc topics --json` (so the rendered files are found wherever
manimkc's `MANIMKC_HOME` puts them), and for every video and sidecar the
catalog already has a row for: hashes the file, refuses it by name if the
bytes are no longer the ones the last `catalog index --only manimkc` recorded,
uploads it (`pending` row, put, `head`, `present`), cuts a poster per video
with ffmpeg and uploads that too, then points each asset row at its blob with
one revision each. When a video's bytes changed and no new poster can be cut
(no ffmpeg, or ffmpeg found no frame), its old poster is unhooked from it in the
same write, so the card shows its placeholder rather than the old render,
until a later upload makes a new one. Measured on 2026-09-28 against a copy of the local
database: 36 videos, 87 sidecars and 36 posters, 433.6 MB, in about ten
seconds. A rerun skips everything already `present` without reading a file,
so an interrupted run is finished by running it again. With no ffmpeg on the
machine the posters are skipped and the output says so; `FFMPEG_PATH` points
at one elsewhere. A scratch run sets `SELF_LEARN_HOME` to a temporary folder
for the whole run; there is no flag for another root, because the web app
reads its root from that variable alone and a flag would write rows pointing
at bytes it never serves.

Each root names the database that writes it, in `<root>/.owner`, written by
the first upload or the first `catalog blob audit --fix`. `--fix` deletes
objects no row names, so it refuses a root whose marker names another
database: a `createdb -T` copy sharing `~/.self-learn/blobs` would otherwise
delete the primary's objects as orphans. An upload refuses such a root too,
since the owner's `--fix` would delete what it wrote. `--fix` also sweeps `.tmp/*.part`
files a crashed upload left, once they are a day old.

A later `catalog index --only manimkc` keeps every key whose bytes it hashes
again unchanged; a re-rendered video loses its key and answers `not-uploaded`
until the next upload.

### Serving from it

`/api/assets/{id}/file` and `/api/assets/{id}/poster` serve an asset from the
store when its row names a blob, and a note, a session log or a `.tldr` from
its row. There is no third place: since phase 2 of
[CONTENT-MIGRATION.md](CONTENT-MIGRATION.md#phase-2-readers-go-database-only)
the app reads no file off the disk, and the `ASSET_FILES_ENABLED` switch that
gated the old file branch is gone (a value left in `apps/web/.env.local` is
ignored). With the `fs` store the route streams the object with Range
support; a cloud store's signed URL (an hour) would be a 302 instead, so a
video never streams through a Vercel function (edge case 10 of the plan). An
asset with no blob, a blob that is `pending`, or an object the store has lost
answers 404 with the code `not-uploaded`; the poster route serves only a
stored poster. The pages decide per row the same way, and the library counts
what is not uploaded in one notice that names the upload command.

### Checking it

```bash
npm run catalog -- blob audit          # list; exits 1 while anything cannot be served
npm run catalog -- blob audit --fix    # act on what it lists
```

It lists objects with no row, `present` rows whose object is gone or no
longer hashes to its key, stale `pending` rows, objects nothing points at (the
old bytes of a re-render), and posters whose video is gone. `--fix` deletes an
orphan object once it is a day old, sends a broken row back to `pending` (its
asset then answers `not-uploaded` until the upload reruns), and deletes a
day-old `pending` row with no object and nothing pointing at it. It never
deletes a row or an object that anything references. It exits 1 while the
table and the store disagree or while any asset points at a `pending` blob,
including one `--fix` just sent back, so a clean exit means every stored asset
serves.

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
