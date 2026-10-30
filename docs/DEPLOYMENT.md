# Deployment

Production deploys when a GitHub release is published, and at no other time.
`.github/workflows/deploy.yml` runs `vercel deploy --prod` from the repository
root on the release's tag, and Vercel builds it with the project's Production
environment variables. Vercel's Git integration is still connected but builds
nothing: `apps/web/vercel.json` sets `git.deploymentEnabled` to `false`, so a
pull request gets no preview and a merge to `main` changes nothing that is
live. Every PR and every merge used to build a deployment, and on the free
plan's 100 deployments a day the busy days ran out (2026-10-04).

- **Production alias:** https://gnosia-one.vercel.app
- **Project:** `kaichen/gnosia`, linked to `https://github.com/c-wenlong/gnosia-learn`
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

1. Changes land on `main` through pull requests. Nothing deploys.
2. Cut a release: `gh release create v<x.y.z> --generate-notes` (or the
   Releases page). Publishing it starts the Deploy workflow.
3. The workflow's first job runs `npm run build` on the tag, with no
   database and no keys. This is the only place CI builds the app: pull
   requests skip it (`ci.yml` builds only on a manual run). A release that
   does not compile stops here, before any upload or deployment.
4. The second job uploads the tree (less what `.vercelignore` leaves out:
   `docs/`, `tools/`), Vercel builds it from the Root Directory, and on
   success promotes it to the production alias. A failed build leaves the
   previous deployment serving.

The workflow needs one repository secret, `VERCEL_TOKEN`, a token from
https://vercel.com/account/tokens (`gh secret set VERCEL_TOKEN`). Without it
the deploy job fails on its first step and says so. The org and project ids are in
the workflow itself; they are identifiers, not secrets.

To redeploy without a new release (a retry, or a rollback to an older tag),
run the workflow by hand: **Actions → Deploy → Run workflow**, choosing the
tag, or `gh workflow run deploy.yml --ref v<x.y.z>`. A manual run refuses a
branch, a tag with no release, and a draft release. `vercel rollback` also
works and builds nothing.

To see what is live and what produced it:

```bash
vercel ls gnosia --prod            # recent production deployments
vercel inspect <deployment-url>        # target, aliases, build output
```

A deployment made by the workflow reports `source: cli`.

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
every browser out, and makes the provider keys saved in Settings unreadable
until they are entered again ([docs/BYOK.md](BYOK.md), "Rotation"); changing
`OWNER_PASSWORD` does neither, since the cookie is signed with the secret and
not the password. Sessions last thirty days.

Password guessing is bounded in `apps/web/src/lib/auth/sign-in-limit.ts`:
ten attempts per client in fifteen minutes, and fifty wrong passwords from
everyone together in fifteen minutes, after which the form refuses every
attempt (the owner's too) until the window ends. Each wrong password also
waits 600ms. "Per client" means the address in `X-Forwarded-For` only where a
proxy sets that header: Vercel does (`VERCEL=1` is set for you), and anywhere
else set `TRUST_PROXY=1` only when a reverse proxy in front of `next start`
overwrites it. Without either, every client shares one bucket, since a client
can send any value it likes. The counts live in one process's memory, so on
Vercel each instance counts on its own: add a per-IP rule on
`/api/auth/sign-in` with `vercel firewall` before opening the deployment to
anyone else. Every other rate limit in the app is keyed by the signed-in
owner, never by a header. When accounts
arrive, `apps/web/src/lib/auth/` is the module to replace (Auth.js reads the
same `AUTH_SECRET` name) and `isSignedIn` in `session.ts` is the seam every
caller already goes through.

## Response headers

Every response carries `X-Content-Type-Options: nosniff`, a
`Referrer-Policy`, a `Permissions-Policy` that turns off the camera,
microphone and location, and no `X-Powered-By`. Every page also carries a
Content-Security-Policy and `X-Frame-Options: DENY`. The proxy writes the
policy with a fresh nonce per request, so only the scripts Next and the two
layouts write can run; images, media, fonts and fetches are limited to this
origin (plus `data:` and `blob:`), and frames to this origin and the studio's
loopback canvas. `apps/web/src/lib/auth/csp.ts` lists each directive and why.
A new page that needs another host (an embed, a CDN, an image from elsewhere)
fails with a console message naming the directive: widen it there, never by
turning the policy off.

## Secrets and environment variables

| Name | Purpose | Where it is needed |
| --- | --- | --- |
| `DATABASE_URL` | Postgres holding the learner state and the catalog | Vercel (once a cloud database exists), CI, locally |
| `OWNER_PASSWORD` | The one password that opens the app (see [Signing in](#signing-in)) | Vercel, locally |
| `AUTH_SECRET` | Signs the session cookie, and seals the provider keys saved in Settings; 32+ characters from `openssl rand -base64 32` | Vercel, locally |
| `NVIDIA_API_KEY` | Provider 1 of the tutoring chat cascade, the fallback for an owner who saved no NVIDIA key | Vercel (optional) |
| `GEMINI_API_KEY` | Provider 2, likewise | Vercel (optional) |
| `OPENROUTER_API_KEY` | Provider 3, likewise | Vercel (optional) |
| `CODECOV_TOKEN` | Codecov **upload** token, from the repo's Configuration page on app.codecov.io | GitHub Actions only (optional) |

The tutor's provider keys live in the database now: the owner saves them in
the app's own Settings, under Provider keys, sealed with AES-256-GCM under a
key derived from `AUTH_SECRET` ([docs/BYOK.md](BYOK.md)). Nothing needs a
restart, and a local machine needs no key in `.env.local` at all. The three
variables above are the fallback: the tutor tries the owner's saved keys
first, then the server's for any provider the owner saved none for, so a
deployment that sets them keeps working unchanged. Set them in the Vercel
project's **Settings → Environment Variables** (Production, and Preview if you
want previews to run live chat); the serverless routes read them at request
time. CI needs neither: `npm run build` runs without keys, and the tutoring
chat degrades to the copy-the-prompt fallbacks when there are none.

Rotating `AUTH_SECRET` makes every saved provider key unreadable as well as
signing every browser out. Settings then asks for each key again, and the
tutor uses the server's keys meanwhile; nothing fails. A database backup is
safe to store only where `AUTH_SECRET` is not: the two together open every
saved key.

**When NVIDIA retires the model.** The default is `google/gemma-4-31b-it`
(`DEFAULT_NVIDIA_MODEL` in `packages/tutor/src/providers.ts`), and
`NVIDIA_MODEL` overrides it without a deploy of new code. The owner can also
skip the defaults altogether: Settings, Models, lists each provider's live
models and keeps the owner's own order ([TUTOR-MODELS.md](TUTOR-MODELS.md)). A retired NVIDIA
model answers 410 Gone, and the cascade then quietly falls through to Gemini,
so the server logs one `agent: nvidia answered 410 for model ...` line per
retired model per server instance. To pick a replacement without a key,
`curl https://integrate.api.nvidia.com/v1/models` lists what is served today
(retired models are absent), and a chat request for a retired model answers 410
even with no `Authorization` header, where a live one answers 401. That shows a
model is not retired; only a real key shows it answers.

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
`postgres://localhost:5432/gnosia`, which is the Homebrew install a laptop
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
pg_dump gnosia > gnosia.sql          # the local database, both halves
psql "$CLOUD_URL" < gnosia.sql
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

### The role Vercel connects as, and whose rows a request touches

D19 of [CONTENT-MIGRATION.md](CONTENT-MIGRATION.md#d19-vercel-connects-with-a-role-that-cannot-write-content):
when the cloud database arrives, Vercel connects as `app_web`, which has
`SELECT` on the content tables and writes on the state tables only. That has
not changed. What phase 4 added is the owner every request acts as:
`currentOwner()` in `apps/web/src/lib/owner.ts` resolves it from the signed-in
session (today the owner's cookie, which is `local`), every read passes it to
the catalog, and every `/api/learner/*` write is made as that learner or
answered with a 401 before the database is asked. So a content-writing route,
when the web editor brings one, is gated on `currentOwner()` being resolved and
passes it to the write seam as `owner`, which stamps the row and refuses one
another owner holds. Until that editor exists no Vercel function writes content,
and `app_web` gets no content writes before it does.

## The blob store

Videos, their posters and sidecars, diagram SVGs and course cover photos have
moved out of the repository and the manimkc data root into a content-addressed
blob store
(docs/CONTENT-MIGRATION.md 0.4, D5). Until go-live it is local only: the `fs`
adapter in `packages/blob`, keeping objects under `$GNOSIA_HOME/blobs`, or
`~/.gnosia/blobs` when the variable is unset.

- **Set `GNOSIA_HOME` in `services/catalog/.env`**, if at all, not in
  `apps/web/.env.local`. Both the catalog CLI (which uploads) and the web app
  (which serves) resolve the root through `blobRoot()` in
  `services/catalog/src/env.ts`, which reads that file the way `DATABASE_URL`
  is read, so one setting reaches both. A value only the app can see would
  have it serve from one store while the CLI uploads to another.
- **Absolute, or starting with `~/`.** A relative value is refused rather than
  resolved against wherever a command runs, and a root inside a gnosia
  checkout is refused outright, since a git operation can delete it. Moving the
  manimkc submodule once deleted 25 rendered videos that way.
- **Vercel reads no blob store today.** The `fs` store is on the laptop and a
  function cannot reach it, so the file routes serve nothing in production,
  as they serve nothing now. The cloud adapter (R2 on Hobby, Vercel Blob on
  Pro, open question 3 of the plan) and its token arrive with the cloud
  database in step 0.1, and the bytes move with the rows in the same window.
- **Course covers show only where the `fs` store is.** A course row names its
  cover by blob key (`collection.cover_blob_key`), and the web app serves it
  from `/api/courses/<slug>/cover`, so a deployment with no store to read
  draws every card's code placeholder instead of a photo. That is the
  intended degrade, not a failure: the course list reads the covers
  separately from the courses and falls back to none, and the route answers
  a 404 or 503 the card never asks for. The photos come back in production
  with the cloud adapter, with no change to the rows or the page.

### Course covers

```bash
npm run catalog -- course cover cs2111 --file ./cs2111.webp \
  --photographer "Compagnons (@sigmund)" --source https://unsplash.com/photos/... \
  --licence "Unsplash License" --reason "why" [--dry-run]
npm run catalog -- course cover cs2111 --clear --reason "why"
```

The image must be a WebP, JPEG or PNG by its first bytes and at most 2 MiB (a
card shows it at 960x540). It is stored first (`pending` row, put, `head`,
`present`), then the course row is pointed at its key and given the credit in
one revision. The same image and credit again changes nothing.

### Filling it

```bash
npm run catalog -- asset upload --source manimkc --dry-run   # what would move
npm run catalog -- asset upload --source manimkc
```

It reads `manimkc topics --json` (so the rendered files are found wherever
manimkc's `MANIMKC_HOME` puts them), and for every video and sidecar the
catalog already has a row for: hashes the file, refuses it by name if the
bytes are no longer the ones the last `catalog import --only manimkc` recorded,
uploads it (`pending` row, put, `head`, `present`), cuts a poster per video
with ffmpeg and makes each video's PDF (one page per narration beat from its
transcript, or a frame every fifteen seconds for a silent cut,
`services/catalog/src/pdf/`) and uploads those too, then points each asset
row at its blob with one revision each. When a video's bytes changed and no
new poster or PDF can be made
(no ffmpeg, or ffmpeg found no frame), its old one is unhooked from it in the
same write, so the card shows its placeholder rather than the old render,
until a later upload makes a new one. Measured on 2026-09-28 against a copy of the local
database: 36 videos, 87 sidecars and 36 posters, 433.6 MB, in about ten
seconds. A rerun skips everything already `present` without reading a file,
so an interrupted run is finished by running it again. With no ffmpeg on the
machine the posters are skipped and the output says so; `FFMPEG_PATH` points
at one elsewhere. A scratch run sets `GNOSIA_HOME` to a temporary folder
for the whole run; there is no flag for another root, because the web app
reads its root from that variable alone and a flag would write rows pointing
at bytes it never serves.

Each root names the database that writes it, in `<root>/.owner`, written by
the first upload or the first `catalog blob audit --fix`. `--fix` deletes
objects no row names, so it refuses a root whose marker names another
database: a `createdb -T` copy sharing `~/.gnosia/blobs` would otherwise
delete the primary's objects as orphans. An upload refuses such a root too,
since the owner's `--fix` would delete what it wrote. `--fix` also sweeps `.tmp/*.part`
files a crashed upload left, once they are a day old.

A later `catalog import --only manimkc` keeps every key whose bytes it hashes
again unchanged; a re-rendered video loses its key and answers `not-uploaded`
until the next upload.

### Serving from it

`/api/assets/{id}/file`, `/api/assets/{id}/poster` and `/api/assets/{id}/pdf`
serve an asset from the
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

It also prints each owner's totals (objects, bytes, and new objects in the
last 24 hours, by `owner_id`, which the table ties to the key's `<owner_id>/`
prefix) and the per-owner caps in force.

### Per-owner caps

Two variables set them, both unset by default, which is no cap:
`GNOSIA_OWNER_BYTES_CAP` (bytes one owner may store) and
`GNOSIA_OWNER_UPLOADS_PER_DAY` (new objects one owner may upload in a
rolling 24 hours, measured on the database's clock). Set them in
`services/catalog/.env` beside `GNOSIA_HOME`, since the catalog CLI is
what uploads.

- **What is measured.** Only a new object: one whose key has no
  `blob_object` row. It is checked under a lock per owner, before a byte
  moves, and a refusal stores and records nothing; `asset upload` lists it as
  refused and carries on. A pending row counts, bytes and day both, since an
  upload in flight is about to be stored. A key that already has a row is
  never refused, so a rerun can always put back an object the store lost, and
  `blob audit --fix` deleting a stale pending row cannot slip a new object
  past the check (the row is locked while it is asked about, and the audit's
  delete takes the same owner lock).
- **A value that cannot be read** (not a whole number, or larger than
  2^53 - 1) refuses every new object with the variable named, rather than
  dropping the cap. It never refuses a key that already has a row, so an
  unchanged `catalog import` or `diagram put` still goes through. `catalog
  doctor` and `catalog status` print it, and `catalog blob audit` exits 1 on
  it.
- **Whose cap.** An object is its row's owner's: `asset upload` keys each
  file by its row's owner and writes the row as that owner, so a commons
  video's bytes count against the commons. A row another tenant holds is
  refused by name before a byte is read.
- **A dry run** (`asset upload --dry-run`) asks the caps too, counting what it
  has already planned (a key once, as a real run's row would), and lists as
  refused the files a real run would refuse. A poster it would cut is asked
  against the day's count only: its size is known once it is cut.
- **`--json`**: a command that fails on a cap carries `code: "BLOB_CAP"` with
  the owner and the cap (`bytes` or `uploads-per-day`), or `code:
  "BLOB_CAP_CONFIG"` for a value that cannot be read.
- **Flip day** (`scripts/flip-rehearsal.mjs`) runs every step with both caps
  off: it stores some 160 objects the owner already has in one sitting, and a
  day cap below that would refuse part of it halfway through a forward-only
  procedure. The day window still counts those objects for the 24 hours
  after it, so a day cap set on flip day refuses new uploads until they age
  out.

## The nightly export

Since the phase 3 cut-over the content is authored in the database and the
repository holds none of it, so git is no longer a readable copy of what was
written. `scripts/nightly-export.mjs` is that copy
([CONTENT-MIGRATION.md](CONTENT-MIGRATION.md#phase-3-cut-over)):

```bash
npm run export:nightly                     # node scripts/nightly-export.mjs
node scripts/nightly-export.mjs --keep 60 --json
```

It runs `catalog export --out` into `$GNOSIA_HOME/archive/<UTC time>/`
(`~/.gnosia/archive/` when the variable is unset), a whole tree in the
export layout that `catalog import <dir>` reads back and anyone can read
without a database. It writes into a hidden `.<UTC time>.partial` first and
renames it into place only when the export finished, so every dated folder is
a whole export. It then points `archive/latest` at the new one by renaming a
fresh link over the old, so the link is never missing, deletes all but the
newest 30 exports (`--keep N`), and removes a failed run's partial once it is
more than a day old. It refuses an archive inside the gnosia checkout, for
the reason the blob store does: a `git clean` or a relayout can delete it. It
records nothing on the database, since an export records its hash only into a
tree a type was imported from. Exit 0 is exported, 1 is an export or a prune
that failed, 2 is a wrong invocation.

It is a copy of the content only. The learner state (`event`, `mastery`,
`review`, `progress`, `recap`) and `content_revision` are not in an export,
so it does not replace the `pg_dump` under [The database](#the-database).

**Scheduling it on the laptop** is a launchd agent. Save this as
`~/Library/LaunchAgents/com.gnosia.nightly-export.plist`, with every
path made absolute for your machine (launchd expands neither `~` nor
`$HOME`), `which node` for the first argument, and your own connection
string in place of the placeholder:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.gnosia.nightly-export</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/YOU/path/to/gnosia/scripts/nightly-export.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/YOU/path/to/gnosia</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DATABASE_URL</key>
    <string>postgres://USER@localhost:5432/gnosia</string>
    <key>GNOSIA_HOME</key>
    <string>/Users/YOU/.gnosia</string>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/YOU/Library/Logs/gnosia-nightly-export.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOU/Library/Logs/gnosia-nightly-export.log</string>
</dict>
</plist>
```

```bash
plutil -lint ~/Library/LaunchAgents/com.gnosia.nightly-export.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.gnosia.nightly-export.plist
launchctl kickstart gui/$(id -u)/com.gnosia.nightly-export    # one run now, to check
launchctl bootout gui/$(id -u)/com.gnosia.nightly-export      # to stop it
```

**A checkout under `~/Desktop`, `~/Documents` or `~/Downloads` cannot be
the one the job runs.** macOS folder protection lets a process read those
folders only once the user has granted it access, and a launchd agent is its
own process: it inherits nothing from the terminal, and no prompt appears for
it. The first run from such a checkout fails before the script loads, with
`EPERM: operation not permitted, open '.../scripts/nightly-export.mjs'` in
the log and `last exit code = 1` in `launchctl print`. Granting the node
binary Full Disk Access would work, and is a security setting only the owner
should change. The route that needs no grant is a second clone outside those
folders, made for this job alone (`mkdir -p ~/.gnosia && git clone <repo>
~/.gnosia/checkout && cd ~/.gnosia/checkout && npm ci`, no submodules
needed), with both paths in the plist pointing at it. That clone reads the
same database and the same blob store, so the export is the same. It does
drift: `catalog migrate`'s status walks the migration files in the clone it
runs from, so a database the main checkout has since migrated is not
refused, and an old clone keeps exporting with old code and says nothing.
So the job should refresh the clone first. A wrapper the plist runs in place
of node: `mkdir -p ~/.gnosia/bin`, save this as
`~/.gnosia/bin/nightly-export.sh`, `chmod +x` it, and put the `node`
from `which node` on its `NODE=` line, since launchd hands the script no
`PATH` worth trusting (npm is taken from the same directory):

```zsh
#!/bin/zsh
set -u
NODE=/opt/homebrew/bin/node
NPM="$(dirname "$NODE")/npm"
cd "$HOME/.gnosia/checkout" || exit 2
before=$(git rev-parse HEAD)
if git pull -q --ff-only; then
  if [ "$before" != "$(git rev-parse HEAD)" ]; then
    "$NPM" ci --silent || { echo "npm ci failed; back to ${before:0:7}"; git reset -q --hard "$before"; }
  fi
else
  echo "git pull failed; exporting with $(git rev-parse --short HEAD)"
fi
exec "$NODE" scripts/nightly-export.mjs "$@"
```

Then `ProgramArguments` becomes `/bin/zsh` followed by that path. A pull that
fails (no network) is logged and the export still runs on the code already
there: a copy from slightly old code beats no copy. An install that fails
puts the clone back on the commit it was installed at, so the code and its
`node_modules` stay a pair and the next run pulls and retries, instead of
exporting from a half-installed tree every night until someone looks.

Set `GNOSIA_HOME` in the plist even when `services/catalog/.env` names
it: the catalog reads that file, so the export would find the diagram SVGs in
the right blob store, but the script itself takes the archive's location from
its own environment only. A run the laptop sleeps through starts when it
wakes, since that is how launchd treats a missed `StartCalendarInterval`.

**The archive is local, and pushing it anywhere is the owner's decision.**
Nothing here creates a remote copy. One shape that would work later: make
`$GNOSIA_HOME/archive` a private git repository and add a second job
after this one that commits and pushes it, which would also keep the exports
the 30-deep prune has deleted. Until someone decides that, the archive lives
on one disk beside the database it copies.

## Deploying from the command line

For a one-off deploy from the local tree, without going through `main`:

```bash
# one-time: log in and link the project
vercel login
vercel link

# production deploy from the local tree
vercel --prod
```

Run both from the repository root, as the Deploy workflow does: the upload
has to carry the workspace packages above `apps/web/`, and the project's Root
Directory setting points the build at the app. `vercel link` writes
`.vercel/project.json`, which is where the org and project ids come from.
That directory is gitignored and should stay that way.
