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
| S1 | The homeserver gets its own `primary` database, seeded from a `pg_dump` of the laptop's, and the two are expected to diverge. | The owner's call (2026-10-04). A sync, when one is wanted, is a fresh dump and restore in either direction; nothing merges two primaries, and nothing here pretends to. Marking either side `copy` ([CONTENT-MIGRATION.md](CONTENT-MIGRATION.md), edge case 14) would stop every write there, which is not the shape wanted. |
| S2 | The database moves as a dump, never as an export. | `catalog export` is content only. The learner state (`event`, `mastery`, `review`, `progress`, `recap`), `content_revision`, the studio's `job`, `session` and `draft` rows, and the sealed `provider_key` are only in the dump. |
| S3 | The blob store moves as files, and the server's copy is re-claimed by its own database. | The `fs` store is content-addressed, so the bytes are the same on both machines and every key still resolves. Its `.owner` marker names the database by name, `pg_database` oid and port (`services/catalog/src/content/blob-owner.ts`), and a restored database has a new oid, so the copied marker names a database that is not there. Deleting it lets the first audit or upload write a new one. |
| S4 | `AUTH_SECRET` is the same on both machines. | The provider key saved in Settings is encrypted under a key derived from it ([BYOK.md](BYOK.md)). A different secret makes the restored row read as "re-enter this key". `OWNER_PASSWORD` can differ freely; it is checked, not used to encrypt anything. |
| S5 | The studio runs diagram jobs on the homeserver and no video jobs. | Diagram jobs are bounded by the Claude Code permission file and the `PreToolUse` hook in `services/studio/src/diagram-guard.ts`, which run anywhere `claude` does. Video jobs run inside a Seatbelt profile through `/usr/bin/sandbox-exec`, and the runner refuses them on any other platform (`toolchainProblems` in `services/studio/src/video/toolchain.ts`, decision V4 of [STUDIO-VIDEOS.md](STUDIO-VIDEOS.md)). The Linux boundary, bubblewrap, is designed there and not measured, and there is no unsandboxed fallback. Videos stay a Mac job until someone builds and measures that profile. |
| S6 | Plain http over Tailscale, no TLS terminator. | The session cookie is `Secure` only when the request arrived over https (`apps/web/src/app/api/auth/shared.ts`), so sign-in works on `http://<tailnet name>:3000`. Tailscale encrypts the hop. A reverse proxy is an addition, not a requirement. |
| S7 | The nightly export runs on the homeserver too, under a systemd timer. | It is the readable copy of the content ([DEPLOYMENT.md](DEPLOYMENT.md#the-nightly-export)), and a database that diverges from the laptop's needs its own. The launchd wrapper's logic (pull, `npm ci` when the commit moved, export) ports as a shell script; only the scheduler changes. |

## What moves, what stays

| On the laptop | On the homeserver | How |
| --- | --- | --- |
| Postgres `self_learn`, both halves | A `postgres:17` container from [services/catalog/compose.yaml](../services/catalog/compose.yaml) | `pg_dump -Fc`, `pg_restore` (S2) |
| `~/.self-learn/blobs` | `~/.self-learn/blobs` | `rsync`, delete `.owner`, `blob audit` (S3) |
| `apps/web/.env.local` and `services/catalog/.env` | The same two files | Written by hand; same `AUTH_SECRET` (S4) |
| `npm run dev` | `next build` then `next start` under systemd | A production build; the dev server is not for serving |
| The studio on `127.0.0.1:7250`, diagrams and videos | The studio, diagrams only | S5 |
| launchd nightly export | systemd timer | S7 |
| `~/.self-learn/manimkc`, the renders and TTS cache | Nothing | The videos the app serves are in the blob store; the data root is only for rendering, which stays on the Mac |
| `~/.self-learn/vault`, Obsidian's copy of the notes | Nothing, unless Obsidian runs there | `learn vault pull` rebuilds it from the database |
| `$STUDIO_HOME/work`, diagram checkouts | Nothing | `catalog diagram checkout` writes a fresh one from the row |

## The steps

### On the laptop

1. Dump the database. The dump carries the schema, every trigger (the
   append-only guard on `event`, the copy guards), the `catalog_instance`
   row saying `primary`, and the drizzle migration journal, so `migrate` on
   the other side is a hash check and not a replay:

   ```bash
   pg_dump -Fc self_learn > ~/self_learn.dump
   ```

2. Copy the dump and the blob store over the tailnet. The store was 1.3 GB
   on 2026-10-04:

   ```bash
   scp ~/self_learn.dump homeserver:~/
   rsync -a ~/.self-learn/blobs/ homeserver:~/.self-learn/blobs/
   ```

3. Have `OWNER_PASSWORD` and `AUTH_SECRET` from `apps/web/.env.local` to
   hand for step 8 (S4).

### On the homeserver

4. Install the toolchain: Node 22.22.2 or newer (the `engines` field in
   `package.json`), git, Docker with the compose plugin, and the Postgres 17
   client tools for `pg_restore`. ffmpeg is needed only to cut posters for
   new uploads, which this machine does not do.

   ```bash
   sudo apt install -y git postgresql-client-17 docker.io docker-compose-v2
   ```

   Node from NodeSource or `fnm`; Ubuntu's own package is too old. Check
   with `node --version`.

5. Clone and install. The four submodules are needed only for the studio's
   diagram jobs (tldrawkc) and for re-importing videos (the three video
   tools); serving needs none of them, so a plain clone is enough to start:

   ```bash
   git clone https://github.com/c-wenlong/self-learn ~/self-learn
   cd ~/self-learn && npm ci
   ```

6. Start Postgres and restore the dump. The compose file is the one CI's
   service and this machine share; the `catalog:catalog` credentials are
   fine because nothing but this host and the tailnet can reach the port:

   ```bash
   docker compose -f services/catalog/compose.yaml up -d
   pg_restore --no-owner -d postgres://catalog:catalog@localhost:5432/self_learn ~/self_learn.dump
   ```

   `--no-owner` because the dump's objects belong to the laptop's role and
   the container has only `catalog`.

7. Write `services/catalog/.env`. The catalog CLI reads this file and never
   `apps/web/.env.local`, so the connection string and the blob root go
   here (the comments in `services/catalog/.env.example` say why each one
   lives here):

   ```
   DATABASE_URL=postgres://catalog:catalog@localhost:5432/self_learn
   SELF_LEARN_HOME=~/.self-learn
   ```

8. Write `apps/web/.env.local`. Next reads `.env*` from `apps/web/`, never
   the repository root; a root copy is silently ignored and the symptom is a
   sign-in page refusing every password:

   ```
   DATABASE_URL=postgres://catalog:catalog@localhost:5432/self_learn
   OWNER_PASSWORD=<yours>
   AUTH_SECRET=<the laptop's, S4>
   NEXT_PUBLIC_SITE_URL=http://<tailnet name>:3000
   STUDIO_ENABLED=1
   ```

   Leave `STUDIO_ENABLED` out until step 12 is done, or `/studio` renders
   with no runner behind it.

9. Re-claim the blob store and check the whole thing (S3). `migrate` should
   report nothing to apply; `doctor` checks the completeness rules and that
   the instance is `primary`; `blob audit` exits 0 once every stored asset
   serves:

   ```bash
   rm ~/.self-learn/blobs/.owner
   npm run catalog -- migrate
   npm run catalog -- doctor
   npm run catalog -- blob audit
   ```

   An audit that lists `present` rows whose object is missing means the
   `rsync` was partial; run it again and re-audit.

10. Build and serve. `npm run start` is `next start` on port 3000, and the
    unit below keeps it up. Save it as
    `/etc/systemd/system/gnosia.service`, with your user and paths:

    ```ini
    [Unit]
    Description=Gnosia web app
    After=network-online.target docker.service
    Wants=network-online.target

    [Service]
    User=YOU
    WorkingDirectory=/home/YOU/self-learn
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

    Then open `http://<tailnet name>:3000`, sign in, and load `/home`,
    `/learn`, `/courses` and a video in `/library`. A page saying its
    content could not be read means the app connected to a database that
    has not flipped a type, or none at all: check `DATABASE_URL` in
    `apps/web/.env.local` against step 7's, since a value set in only one
    file migrates one database while the app connects to another.

11. The nightly export (S7). Save the wrapper from
    [DEPLOYMENT.md](DEPLOYMENT.md#the-nightly-export) as
    `~/.self-learn/bin/nightly-export.sh` with `NODE=` set from
    `which node` and `cd` pointed at `~/self-learn`, then a timer:

    ```ini
    # /etc/systemd/system/gnosia-export.service
    [Unit]
    Description=Gnosia nightly export

    [Service]
    Type=oneshot
    User=YOU
    Environment=SELF_LEARN_HOME=/home/YOU/.self-learn
    ExecStart=/bin/bash /home/YOU/.self-learn/bin/nightly-export.sh
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
    ls ~/.self-learn/archive/
    ```

    `Persistent=true` is launchd's missed-run behaviour: a night the machine
    was off runs at the next boot. Set `SELF_LEARN_HOME` in the unit even
    though `services/catalog/.env` names it, because the script takes the
    archive's location from its own environment only. The wrapper's `git
    pull` keeps the export code in step with the database the main checkout
    migrates; on this machine the two are the same clone, so the pull is
    also how the server picks up new code (step 14).

12. The studio, diagrams only (S5). `claude` must be logged in as the
    account the jobs should bill, since the runner strips every
    `ANTHROPIC_*` variable before spawning (`agentEnv` in
    `services/studio/src/agent.ts`) and `claude -p` uses the machine's
    login:

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
    `/studio/api/health` should report `video` off with the V4 reason and
    `manual` fresh. Set `STUDIO_DAILY_USD` in the unit's `Environment=` if
    the machine should have a spend cap.

13. The `/learn` and `/review` skills. They open with `npm run learn --
    status` against the database `services/catalog/.env` names, so a
    Claude Code session in `~/self-learn` on the homeserver writes to the
    homeserver's database, and one on the laptop to the laptop's (S1). The
    `learning` plugin is installed per machine
    (`~/.quiver/plugins/learning/learning`), as on the Mac.

14. Updating. A `git pull` in `~/self-learn`, `npm ci` when the lockfile
    moved, `npm run catalog -- migrate` when `services/catalog/drizzle/`
    did, `npm run build`, then `sudo systemctl restart gnosia` (and
    `gnosia-studio`). The nightly wrapper does the first two every night,
    so the only manual parts are the migration, the build and the restart.

## What to expect afterwards

- **Two databases, two histories.** A note written on the homeserver is not
  on the laptop and the other way round (S1). The nightly archives on each
  machine are the readable record of each. When a sync is wanted, dump the
  side with the history you want to keep and restore it over the other
  (`dropdb`, `createdb`, `pg_restore`), then delete that side's blob
  `.owner` marker and audit again, and `rsync` the blob store in the same
  direction so every key the restored rows name has an object.
- **Videos in `/library` play on both.** They are in the blob store, which
  moved whole. A video rendered on the Mac after the copy is on the Mac
  only until the next `rsync` and dump.
- **Diagram jobs from the homeserver's studio land in the homeserver's
  catalog.** They are rows and a blob there, and nothing carries them to the
  laptop but a sync.
- **The copy guard is not in play.** Both instances say `primary`, so
  nothing refuses a write on either side, and nothing stops the two
  disagreeing. That is the chosen state.

## Open

- [ ] A Linux video sandbox. Bubblewrap, designed in
      [STUDIO-VIDEOS.md](STUDIO-VIDEOS.md) and never measured; the hostile-scene
      test there is the bar. Until then the studio on Ubuntu refuses video
      jobs by design (S5).
- [ ] Whether the homeserver should also be the laptop's database over the
      tailnet, so there is one history again. S1 says not for now; the
      change would be the laptop's two `DATABASE_URL` values pointed at the
      container, its own instance marked `copy`, and its blob store `rsync`ed
      from the server rather than the other way.
- [ ] A reverse proxy with TLS, if the app is ever reached from outside the
      tailnet. Then the per-IP rate limit on `/api/auth/sign-in` that
      [DEPLOYMENT.md](DEPLOYMENT.md#signing-in) names becomes necessary too;
      today the 600 ms delay per wrong password is the only brake, and the
      tailnet is the perimeter.
