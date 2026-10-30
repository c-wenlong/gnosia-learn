# Running Gnosia on a homeserver

A working document, started 2026-10-04. It says how to stand the app up on
an Ubuntu machine behind Tailscale with a copy of the laptop's data, what
carries over from the laptop and what does not, and the decisions behind
each step. [DEPLOYMENT.md](DEPLOYMENT.md) is the Vercel story; this page is
the one for a machine you own. Where the two agree the text here is shorter
and points there.

## Decisions

| | Decision | Why |
| --- | --- | --- |
| S1 | The homeserver gets its own `primary` database, seeded from a copy of the laptop's database file, and the two are expected to diverge. | The owner's call (2026-10-04, when the copy was a `pg_dump`). A sync, when one is wanted, is a fresh copy of the file in either direction; nothing merges two primaries, and nothing here pretends to. Marking either side `copy` ([CONTENT-MIGRATION.md](CONTENT-MIGRATION.md), edge case 14) would stop every write there, which is not the shape wanted. |
| S2 | The database moves as a copy of its file, never as an export. | `catalog export` is content only. The learner state (`event`, `mastery`, `review`, `progress`, `recap`), `content_revision`, the studio's `job`, `session` and `draft` rows, and the sealed `provider_key` are only in the database. The catalog is one SQLite file ([SQLITE-MIGRATION.md](SQLITE-MIGRATION.md)), so the copy is that file, taken with SQLite's backup API rather than `cp`: a plain copy of a file in WAL mode can miss committed pages still in its `-wal` (`copyDatabase` in [scripts/lib/sqlite.mjs](../scripts/lib/sqlite.mjs)). |
| S3 | The blob store moves as files without its `.owner` marker, and the server's copy is claimed by its own database. | The `fs` store is content-addressed, so the bytes are the same on both machines and every key still resolves. Its `.owner` marker names the database by its file's resolved path (`ownerIdentity` in [blob-owner.ts](../services/catalog/src/content/blob-owner.ts), `databaseIdentity` in [import-root.ts](../services/catalog/src/content/import-root.ts)), and the server's file has another path (`/home/...` where the laptop's is `/Users/...`), so a copied marker would name a database that is not there and the root would refuse uploads and `--fix`. Left out of the copy, `blob audit --fix` or the first upload claims the root by writing a new one (`claimRoot` in that module); a plain audit only reads. |
| S4 | `AUTH_SECRET` is the same on both machines. | The provider key saved in Settings is encrypted under a key derived from it ([BYOK.md](BYOK.md)). A different secret makes the copied row read as "re-enter this key", in the app and in the studio runner, which opens the same rows with the same secret (step 12). `OWNER_PASSWORD` and `SESSION_EPOCH` can differ freely: they go into the key the session cookie is signed with (`sessionKey` in `apps/web/src/lib/auth/core.ts`), and neither seals anything. |
| S5 | The studio runs diagram jobs on the homeserver and no video jobs. | Diagram jobs are bounded by the Claude Code permission file and the `PreToolUse` hook in `services/studio/src/diagram/diagram-guard.ts`, which run anywhere `claude` does. Video jobs run inside a Seatbelt profile on macOS and a bubblewrap one on Linux (`services/studio/src/video/bwrap.ts`, decision V4 of [STUDIO-VIDEOS.md](STUDIO-VIDEOS.md)), and the runner refuses them where the sandbox does not come up; there is no unsandboxed fallback. The bubblewrap side is written but not yet measured against the hostile-scene test, and Ubuntu 24.04's `kernel.apparmor_restrict_unprivileged_userns=1` refuses the user namespaces it needs until the packaged `/etc/apparmor.d/bwrap` profile is installed. Videos stay a Mac job until both are done on the server. |
| S6 | `tailscale serve` in front of port 3000, tailnet only, no Funnel. | The owner's setup (2026-10-04): every served port on the machine is `tailscale serve` with tailnet-only access and an empty `AllowFunnel`. Serve terminates TLS with the machine's tailnet certificate, keeps the incoming `Host` (`r.Out.Host = r.In.Host` in `ipn/ipnlocal/serve.go`) and sets `X-Forwarded-Proto: https`, which is exactly what the app reads: the session cookie goes `Secure` on that header (`apps/web/src/app/api/auth/shared.ts`) and the same-origin check builds the origin from `Host` plus that header (`originFromHeaders` in `apps/web/src/lib/auth/core.ts`), so sign-in and every POST work with no app-side setting. The sign-in limits (`apps/web/src/lib/auth/sign-in-limit.ts`, [DEPLOYMENT.md](DEPLOYMENT.md#signing-in)) apply as anywhere, and with no `TRUST_PROXY` set every client shares the per-client bucket: ten attempts in fifteen minutes for the whole tailnet, beside the fifty wrong passwords from everyone and the 600 ms per wrong password. That is proportionate while the tailnet is the perimeter; turning Funnel on would need a per-IP limit that can trust the client's address first (see Open). Plain `http://<machine>:3000` inside the tailnet also works, since the cookie is `Secure` only over https. |
| S7 | The nightly export runs on the homeserver too, under a systemd timer. | It is the readable copy of the content ([DEPLOYMENT.md](DEPLOYMENT.md#the-nightly-export)), and a database that diverges from the laptop's needs its own. The schedule ports from launchd to a timer; the Mac wrapper's pull and `npm ci` do not, because the server has one checkout, the one it serves from, and the timer runs the script there directly (step 11). |

## What moves, what stays

| On the laptop | On the homeserver | How |
| --- | --- | --- |
| The catalog, `~/.gnosia/catalog.db`, both halves | `~/.gnosia/catalog.db` | `sqlite3 .backup`, `scp` (S2) |
| `~/.gnosia/blobs` | `~/.gnosia/blobs` | `rsync`, delete `.owner`, `blob audit` (S3) |
| `apps/web/.env.local` and `services/catalog/.env` | The same two files | Written by hand; same `AUTH_SECRET` (S4) |
| `npm run dev` | `next build` then `next start` under systemd | A production build; the dev server is not for serving |
| The studio on `127.0.0.1:7250`, diagrams and videos | The studio, diagrams only | S5 |
| launchd nightly export | systemd timer | S7 |
| `~/.gnosia/manimkc`, the renders and TTS cache | Nothing | The videos the app serves are in the blob store; the data root is only for rendering, which stays on the Mac |
| `~/.gnosia/vault`, Obsidian's copy of the notes | Nothing, unless Obsidian runs there | `learn vault pull` rebuilds it from the database |
| `$STUDIO_HOME` (`.studio/` in the checkout by default): job workspaces, draft transcripts, diagram checkouts | Nothing; the server's studio starts empty | The runner lists jobs and drafts from its own files, and the `job`, `session` and `draft` rows the copied file carries are a mirror of them, so a laptop job or draft cannot be resumed or reviewed on the server. Its permission files name the laptop's home directory, so copying them would not help. `catalog diagram checkout` writes a fresh checkout from the row |

## The steps

### On the laptop

1. Copy the database file. The copy carries the schema, every trigger (the
   append-only guard on `event`, the copy guards), the `catalog_instance`
   row saying `primary`, and the drizzle migration journal
   (`__drizzle_migrations`), so `migrate` on the other side is a hash check
   and not a replay. `.backup` is the SQLite backup API, the one
   `copyDatabase` in [scripts/lib/sqlite.mjs](../scripts/lib/sqlite.mjs)
   uses: it reads a consistent snapshot with the app and the studio still
   running, where a `cp` could miss pages still in the `-wal` (S2). macOS
   ships the `sqlite3` command. If `CATALOG_DB` or `DATABASE_URL` points the
   laptop at another file, copy that one instead (`databaseUrl()` in
   [env.ts](../services/catalog/src/env.ts)):

   ```bash
   sqlite3 ~/.gnosia/catalog.db ".backup $HOME/gnosia.db"
   ```

2. Copy the database and the blob store over the tailnet. The store was
   1.3 GB on 2026-10-04:

   ```bash
   ssh homeserver 'mkdir -p ~/.gnosia'
   scp ~/gnosia.db homeserver:~/.gnosia/catalog.db
   rsync -a --exclude .owner ~/.gnosia/blobs/ homeserver:~/.gnosia/blobs/
   ```

   The `mkdir` first: neither `scp` nor `rsync` creates a missing parent,
   so on a fresh machine the copy fails without it. The file lands where
   the catalog looks by default, `~/.gnosia/catalog.db`, so nothing on the
   server restores it: there is no database server to load it into. The
   `--exclude .owner` leaves the laptop's marker behind (S3): copied, it
   would name a database the server does not have, and the server's
   uploads and `blob audit --fix` would refuse the root.

3. Have `OWNER_PASSWORD` and `AUTH_SECRET` from `apps/web/.env.local` to
   hand for step 8 (S4).

### On the homeserver

4. Install the toolchain: Node 22.22.2 or newer (the `engines` field in
   `package.json`), git, and the `sqlite3` command, for step 6's check and
   for a sync back to the laptop. There is no database server to install:
   the catalog opens its file with better-sqlite3
   ([services/catalog/package.json](../services/catalog/package.json)),
   which ships prebuilt binaries for `linux-x64` and `linux-arm64` inside
   its package. `npm ci` still runs node-gyp over it (its `binding.gyp`),
   and node-gyp needs `python3` and `make` even when the prebuild leaves it
   nothing to compile; a compiler matters only on a platform with no
   prebuild. `build-essential` brings `make` and the compiler. ffmpeg is
   needed only to cut posters for new uploads, which this machine does not
   do.

   ```bash
   sudo apt install -y git sqlite3 build-essential python3
   ```

   Node from NodeSource, which installs `/usr/bin/node` and `/usr/bin/npm`
   for every user; Ubuntu's own package is too old. The systemd units below
   name `/usr/bin/npm`, so a per-user installer (`fnm`, `nvm`) does not
   work for them: its `npm` lives under one user's home and is not on a
   service's `PATH`. Check with `node --version` and `which npm`.

5. Clone and install. The five submodules are needed only for the studio's
   diagram jobs (tldrawkc) and for re-importing videos (the four video
   tools); serving needs none of them, so a plain clone is enough to start:

   ```bash
   git clone https://github.com/c-wenlong/gnosia-learn ~/gnosia
   cd ~/gnosia && npm ci
   ```

6. Check that the copied file arrived whole. Nothing listens on a port and
   nothing has to start: only this machine's own app and CLI open the file
   (S1), and the file is reachable from this host's filesystem and nowhere
   else. `integrity_check` prints `ok` for a sound file:

   ```bash
   sqlite3 ~/.gnosia/catalog.db 'pragma ignore_check_constraints = on; pragma integrity_check'
   ```

   The first pragma is needed. The schema's checks call a `regexp` the
   catalog registers on each connection (`connect` in
   [db.ts](../services/catalog/src/db.ts)), and the `sqlite3` shell's own
   `regexp`, where it has one, rejects some of those patterns (a `-` at
   the end of a bracket), so without it a sound file reports a run of
   `CHECK constraint failed in blob_object` lines. Step 9's `migrate` and
   `doctor` then open the file through the catalog itself.

7. Write `services/catalog/.env`. The catalog CLI reads this file and never
   `apps/web/.env.local`, and the web app reads it too, through the same
   `databaseUrl()` and `blobRoot()` in [env.ts](../services/catalog/src/env.ts),
   so the database file and the blob root go here and only here. Both
   values below are the defaults, written out so the file says which
   database this machine opens. The catalog expands a leading `~` in both,
   reads `CATALOG_DB` before `DATABASE_URL`, and refuses a `postgres://`
   URL in either (`databasePath()`), so a `.env` carried over from the
   Postgres days needs its `DATABASE_URL` line deleted:

   ```
   CATALOG_DB=~/.gnosia/catalog.db
   GNOSIA_HOME=~/.gnosia
   ```

8. Write `apps/web/.env.local`. Next reads `.env*` from `apps/web/`, never
   the repository root; a root copy is silently ignored and the symptom is a
   sign-in page refusing every password. It names no database, for the
   reason step 10 ends on:

   ```
   OWNER_PASSWORD=<yours>
   AUTH_SECRET=<the laptop's, S4>
   NEXT_PUBLIC_SITE_URL=https://<machine>.<tailnet>.ts.net
   STUDIO_ENABLED=1
   ```

   Leave `STUDIO_ENABLED` out until step 12 is done, or `/studio` renders
   with no runner behind it.

9. Check the whole thing and claim the blob store. `migrate` should
   report nothing to apply; `doctor` checks the completeness rules and
   that the instance is `primary`; `blob audit` exits 0 once every stored
   asset serves, and `--fix` is what writes the store's `.owner` marker
   for this database (S3), since a plain audit only reads:

   ```bash
   npm run catalog -- migrate
   npm run catalog -- doctor
   npm run catalog -- blob audit
   npm run catalog -- blob audit --fix
   ```

   Run the plain audit first. One that lists `present` rows whose object
   is missing means the `rsync` was partial; run that again and re-audit
   before `--fix`, which would send those rows back to `pending`. Otherwise
   `--fix` deletes only objects no row names once they are a day old, and
   day-old `pending` rows with no object and nothing pointing at them
   (`blob-audit.ts` in `services/catalog/src/content/`); a store copied at
   the same time as the database file has no orphans, so on a clean audit
   it claims the root and changes little else.

10. Build and serve. `npm run start` is `next start` on port 3000, and the
    unit below keeps it up. Save it as
    `/etc/systemd/system/gnosia.service`, with your user and paths:

    ```ini
    [Unit]
    Description=Gnosia web app
    After=network-online.target
    Wants=network-online.target

    [Service]
    User=YOU
    WorkingDirectory=/home/YOU/gnosia
    Environment=NODE_ENV=production
    ExecStart=/usr/bin/npm run start
    Restart=always
    RestartSec=5

    [Install]
    WantedBy=multi-user.target
    ```

    ```bash
    npm run build
    sudo systemctl daemon-reload && sudo systemctl enable --now gnosia
    ```

    Then put serve in front of it, from any shell on the machine:

    ```bash
    tailscale serve --bg --https=443 http://127.0.0.1:3000
    tailscale serve status
    ```

    `--bg` makes it persistent across reboots, and `status` prints the
    `https://<machine>.<tailnet>.ts.net` URL, which is what step 8's
    `NEXT_PUBLIC_SITE_URL` should say. Then open that URL, sign in, and load `/home`,
    `/learn`, `/courses` and a video in `/library`. A page saying its
    content could not be read means the app opened a database that has
    not flipped a type, or an empty one: opening a path where no file is
    creates a new, empty database there rather than failing (`connect` in
    [db.ts](../services/catalog/src/db.ts)). Check that
    `apps/web/.env.local` sets no `CATALOG_DB` or `DATABASE_URL` of its
    own: Next loads that file first and the catalog never overrides a
    variable already set (`loadEnv` in
    [env.ts](../services/catalog/src/env.ts)), so a value there reaches the
    app alone, and `migrate` checks one database while the app opens
    another.

11. The nightly export (S7). On the Mac the job runs from a second clone
    with a wrapper that pulls first, because that clone could drift from
    the checkout that migrates the database. Here there is one checkout,
    the one the app is served from, so the export runs the code that is
    running and needs no pull; and a pull from a timer would swap
    `node_modules` under the live services, which is step 14's job to do
    on purpose. So the unit runs the script directly:

    ```ini
    # /etc/systemd/system/gnosia-export.service
    [Unit]
    Description=Gnosia nightly export

    [Service]
    Type=oneshot
    User=YOU
    WorkingDirectory=/home/YOU/gnosia
    Environment=GNOSIA_HOME=/home/YOU/.gnosia
    ExecStart=/usr/bin/node scripts/nightly-export.mjs
    ```

    ```ini
    # /etc/systemd/system/gnosia-export.timer
    [Unit]
    Description=Gnosia nightly export at 03:00

    [Timer]
    OnCalendar=*-*-* 03:00:00
    Persistent=true

    [Install]
    WantedBy=timers.target
    ```

    ```bash
    sudo systemctl daemon-reload && sudo systemctl enable --now gnosia-export.timer
    sudo systemctl start gnosia-export.service    # one run now, to check
    ls ~/.gnosia/archive/
    ```

    `Persistent=true` is launchd's missed-run behaviour: a night the machine
    was off runs at the next boot. Set `GNOSIA_HOME` in the unit even
    though `services/catalog/.env` names it, because the script takes the
    archive's location from its own environment only.

12. The studio, diagrams only (S5). `claude` must be logged in as the
    account the jobs should bill, since the runner strips the Anthropic
    auth variables (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` and the rest)
    before spawning (`agentEnv` in `services/studio/src/agent/agent.ts`)
    and `claude -p` uses the machine's login:

    ```bash
    git submodule update --init tools/tldrawkc
    (cd tools/tldrawkc && npm ci && npm run build)
    npm run --silent canvas -- doctor      # names the Chromium it found, or what to install
    claude --version && claude -p 'say ok'
    ```

    `canvas doctor` on a bare Ubuntu usually wants the shared libraries
    headless Chromium links against; it prints the `apt` line. Then a
    second unit, `gnosia-studio.service`, shaped like step 10's with
    `ExecStart=/usr/bin/npm run studio`; it binds `127.0.0.1:7250` and
    the web app reaches it through its own route handler. Set
    `STUDIO_ENABLED=1` in `apps/web/.env.local` and restart `gnosia`.
    `/studio/api/health` should report `video` off with the V4 reason (no
    `bwrap`, or the kernel refusing its user namespaces) and `manual`
    fresh. Set `STUDIO_DAILY_USD` in the unit's `Environment=` if the
    machine should have a spend cap.

    The runner opens the provider keys saved in Settings itself, for a
    BYOK chat, with the app's `AUTH_SECRET` (S4); it keeps no copy of them.
    Started without the secret, as this unit starts it, it reads it from
    `apps/web/.env.local` through `scripts/lib/dev-env.mjs` (`fromWebEnv`
    in `services/studio/src/agent/byok-keys.ts`) and takes it out of its
    environment before spawning anything. `/studio/api/health` reports
    `byokKeys`, with the reason when it could not open them; Claude chats
    do not depend on it.

13. The `/learn` and `/review` skills. They open with `npm run learn --
    status` against the database `services/catalog/.env` names, so a
    Claude Code session in `~/gnosia` on the homeserver writes to the
    homeserver's database, and one on the laptop to the laptop's (S1). The
    `learning` plugin is installed per machine
    (`~/.quiver/plugins/learning/learning`), as on the Mac.

14. Updating, by hand and in this order, since nothing else on the machine
    touches the checkout: stop the services, `git pull` in `~/gnosia`,
    `npm ci` when the lockfile moved, `npm run catalog -- migrate` when
    `services/catalog/drizzle-sqlite/` did (`MIGRATIONS_FOLDER` in
    [migrations.ts](../services/catalog/src/migrations.ts)), `npm run build`, then start them
    again:

    ```bash
    sudo systemctl stop gnosia gnosia-studio gnosia-export.timer \
      && while systemctl show -p ActiveState --value gnosia-export.service | grep -Eqx 'active|activating'; do sleep 10; done \
      && git pull --ff-only && npm ci && npm run catalog -- migrate && npm run build \
      && sudo systemctl start gnosia gnosia-studio gnosia-export.timer
    ```

    One chain, so a pull, install, migration or build that fails leaves
    everything stopped for you to fix, rather than starting the app on
    new dependencies with an old `.next/`. Leave `gnosia-studio` out of
    both lists until step 12 has created it: `systemctl` refuses a unit it
    does not know, and the chain would stop at the first command with
    nothing updated. The export timer is stopped so an export cannot fire
    mid-install and run from a half-replaced `node_modules`; the `while`
    lets one already running finish rather than killing it, since a
    killed export is that night's archive lost, where a wait of a few
    seconds costs nothing. It reads `ActiveState` rather than calling
    `is-active`, because a `Type=oneshot` unit is `activating`, not
    `active`, for as long as its command runs, and `is-active` answers
    no for that state. Stopping before the pull matters because
    `npm ci` replaces `node_modules` under a running `next start`, and
    `next build` rewrites `.next/` while it is being served.

## What to expect afterwards

- **Two databases, two histories.** A note written on the homeserver is not
  on the laptop and the other way round (S1). The nightly archives on each
  machine are the readable record of each. When a sync is wanted, copy the
  file of the side with the history you want to keep (`sqlite3 ... .backup`,
  step 1) and put it in place of the other's: stop everything on the
  receiving side that opens the file first (on the server, `sudo systemctl
  stop gnosia gnosia-studio gnosia-export.timer` and then step 14's `while`
  until no `gnosia-export.service` is still running, since stopping the
  timer does not stop an export already under way; on the Mac,
  `npm run dev:down` or quitting Gnosia Web.app, and the native macOS app,
  away from the nightly export's 03:00), since each holds the file open and
  keeps its `-wal` and `-shm` beside it; take a `.backup` of the receiving side's own
  file too, since its history is what the sync gives up; then delete its
  `catalog.db` with its `-wal` and `-shm`, as `dropDatabase` in
  [scripts/lib/sqlite.mjs](../scripts/lib/sqlite.mjs) does, because a
  `-wal` left beside a replaced file belongs to no database SQLite knows;
  then copy the new file in; then `rsync --exclude .owner` the blob store
  in the same direction so every key the copied rows name has an object.
  The receiving side's own `.owner` still names its own file's path, which
  is the path the copy now sits at, so it needs no change. Then
  `blob audit` and start the clients again.
- **Videos in `/library` play on both.** They are in the blob store, which
  moved whole. A video rendered on the Mac after the copy is on the Mac
  only until the next `rsync` and file copy.
- **Diagram jobs from the homeserver's studio land in the homeserver's
  catalog.** They are rows and a blob there, and nothing carries them to the
  laptop but a sync.
- **The copy guard is not in play.** Both instances say `primary`, so
  nothing refuses a write on either side, and nothing stops the two
  disagreeing. That is the chosen state.

## Open

- [ ] The Linux video sandbox, measured. Bubblewrap is implemented
      (`services/studio/src/video/bwrap.ts`, the "What is not covered" list in
      [STUDIO-VIDEOS.md](STUDIO-VIDEOS.md)); what is left is the hostile-scene
      test on a Linux host, which first needs
      `kernel.apparmor_restrict_unprivileged_userns` lifted for `bwrap` (the
      packaged `/etc/apparmor.d/bwrap` profile) and the toolchain installed.
      Until then the studio on Ubuntu refuses video jobs by design (S5).
- [ ] Whether the homeserver should also be the laptop's database over the
      tailnet, so there is one history again. S1 says not for now. On
      Postgres the change was a port bound to the Tailscale address and the
      laptop's `DATABASE_URL` pointed at it. The catalog is now a file each
      machine opens locally ([SQLITE-MIGRATION.md](SQLITE-MIGRATION.md)),
      with no server to point at, so that path is gone and no replacement
      has been designed.
- [ ] Funnel, if the app is ever reached from outside the tailnet. Serve
      already terminates TLS, so the one thing missing is a per-IP limit on
      `/api/auth/sign-in` ([DEPLOYMENT.md](DEPLOYMENT.md#signing-in)), which
      Funnel does not provide. The app's own per-client bucket keys on the
      first `X-Forwarded-For` entry once `TRUST_PROXY=1` is set (`clientIp`
      in `packages/tutor/src/guards.ts`), which is safe only behind a proxy
      that overwrites that header; whether serve overwrites it or appends to
      a client's own value has not been checked here. Until it is, the plan
      is an nginx `limit_req` or Caddy rate limiter between serve and port
      3000, before `AllowFunnel` is set.
      Every connection that limiter sees comes from serve over loopback, so
      a limit keyed on the connection's address is one bucket for every
      visitor; it has to key on the client address serve forwards in
      `X-Forwarded-For`, and trust that header only from `127.0.0.1`
      (nginx: `set_real_ip_from 127.0.0.1` with `real_ip_header
      X-Forwarded-For`, then `limit_req_zone $binary_remote_addr`; Caddy:
      `trusted_proxies 127.0.0.1` on the server, then `client_ip` in the
      limiter), since a client can send that header itself and would
      otherwise pick its own bucket. Today the app's limits, one bucket for
      every client (S6), are the brake, and the tailnet is the perimeter.
