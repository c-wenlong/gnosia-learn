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
| S3 | The blob store moves as files without its `.owner` marker, and the server's copy is claimed by its own database. | The `fs` store is content-addressed, so the bytes are the same on both machines and every key still resolves. Its `.owner` marker names the database by name, `pg_database` oid and port (`services/catalog/src/content/blob-owner.ts`), and a restored database has a new oid, so a copied marker would name a database that is not there and the root would refuse uploads and `--fix`. Left out of the copy, `blob audit --fix` or the first upload claims the root by writing a new one (`claimRoot` in that module); a plain audit only reads. |
| S4 | `AUTH_SECRET` is the same on both machines. | The provider key saved in Settings is encrypted under a key derived from it ([BYOK.md](BYOK.md)). A different secret makes the restored row read as "re-enter this key". `OWNER_PASSWORD` can differ freely; it is checked, not used to encrypt anything. |
| S5 | The studio runs diagram jobs on the homeserver and no video jobs. | Diagram jobs are bounded by the Claude Code permission file and the `PreToolUse` hook in `services/studio/src/diagram-guard.ts`, which run anywhere `claude` does. Video jobs run inside a Seatbelt profile through `/usr/bin/sandbox-exec`, and the runner refuses them on any other platform (`toolchainProblems` in `services/studio/src/video/toolchain.ts`, decision V4 of [STUDIO-VIDEOS.md](STUDIO-VIDEOS.md)). The Linux boundary, bubblewrap, is designed there and not measured, and there is no unsandboxed fallback. Videos stay a Mac job until someone builds and measures that profile. |
| S6 | `tailscale serve` in front of port 3000, tailnet only, no Funnel. | The owner's setup (2026-10-04): every served port on the machine is `tailscale serve` with tailnet-only access and an empty `AllowFunnel`. Serve terminates TLS with the machine's tailnet certificate, keeps the incoming `Host` (`r.Out.Host = r.In.Host` in `ipn/ipnlocal/serve.go`) and sets `X-Forwarded-Proto: https`, which is exactly what the app reads: the session cookie goes `Secure` on that header (`apps/web/src/app/api/auth/shared.ts`) and the same-origin check builds the origin from `Host` plus that header (`originFromHeaders` in `apps/web/src/lib/auth/core.ts`), so sign-in and every POST work with no app-side setting. The 600 ms per wrong password stays the only brake on `/api/auth/sign-in`, which is proportionate while the tailnet is the perimeter; turning Funnel on would need a per-IP rate limit in front first (see Open). Plain `http://<machine>:3000` inside the tailnet also works, since the cookie is `Secure` only over https. |
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
| `$STUDIO_HOME` (`.studio/` in the checkout by default): job workspaces, draft transcripts, diagram checkouts | Nothing; the server's studio starts empty | The runner lists jobs and drafts from its own files, and the `job`, `session` and `draft` rows the dump carries are a mirror of them, so a laptop job or draft cannot be resumed or reviewed on the server. Its permission files name the laptop's home directory, so copying them would not help. `catalog diagram checkout` writes a fresh checkout from the row |

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
   ssh homeserver 'mkdir -p ~/.self-learn'
   rsync -a --exclude .owner ~/.self-learn/blobs/ homeserver:~/.self-learn/blobs/
   ```

   The `mkdir` first: `rsync` creates the last path element and not a
   missing parent, so on a fresh machine the copy fails without it. The
   `--exclude .owner` leaves the laptop's marker behind (S3): copied, it
   would name a database the server does not have, and the server's
   uploads and `blob audit --fix` would refuse the root.

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

   Node from NodeSource, which installs `/usr/bin/node` and `/usr/bin/npm`
   for every user; Ubuntu's own package is too old. The systemd units below
   name `/usr/bin/npm`, so a per-user installer (`fnm`, `nvm`) does not
   work for them: its `npm` lives under one user's home and is not on a
   service's `PATH`. Check with `node --version` and `which npm`.

5. Clone and install. The four submodules are needed only for the studio's
   diagram jobs (tldrawkc) and for re-importing videos (the three video
   tools); serving needs none of them, so a plain clone is enough to start:

   ```bash
   git clone https://github.com/c-wenlong/self-learn ~/self-learn
   cd ~/self-learn && npm ci
   ```

6. Start Postgres and restore the dump. The compose file publishes the port
   on `127.0.0.1` only, so the `catalog:catalog` credentials are reachable
   from this host and nothing else: not the LAN, and not the tailnet
   either, which is deliberate while nothing but this machine's own app
   and CLI connect (S1). Docker publishes ports past `ufw`, so a
   `0.0.0.0` binding would have been open to every interface the machine
   has, whatever the firewall said:

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
   before `--fix`. `--fix` deletes only objects no row names and that are
   a day old, and a store copied whole from the database it was dumped
   with has none, so on a clean audit it claims the root and changes
   nothing else.

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

    Then put serve in front of it, from any shell on the machine:

    ```bash
    tailscale serve --bg --https=443 http://127.0.0.1:3000
    tailscale serve status
    ```

    `--bg` makes it persistent across reboots, and `status` prints the
    `https://<machine>.<tailnet>.ts.net` URL, which is what step 8's
    `NEXT_PUBLIC_SITE_URL` should say. Then open that URL, sign in, and load `/home`,
    `/learn`, `/courses` and a video in `/library`. A page saying its
    content could not be read means the app connected to a database that
    has not flipped a type, or none at all: check `DATABASE_URL` in
    `apps/web/.env.local` against step 7's, since a value set in only one
    file migrates one database while the app connects to another.

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
    WorkingDirectory=/home/YOU/self-learn
    Environment=SELF_LEARN_HOME=/home/YOU/.self-learn
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
    ls ~/.self-learn/archive/
    ```

    `Persistent=true` is launchd's missed-run behaviour: a night the machine
    was off runs at the next boot. Set `SELF_LEARN_HOME` in the unit even
    though `services/catalog/.env` names it, because the script takes the
    archive's location from its own environment only.

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

14. Updating, by hand and in this order, since nothing else on the machine
    touches the checkout: stop the services, `git pull` in `~/self-learn`,
    `npm ci` when the lockfile moved, `npm run catalog -- migrate` when
    `services/catalog/drizzle/` did, `npm run build`, then start them
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
  machine are the readable record of each. When a sync is wanted, dump the
  side with the history you want to keep and restore it over the other:
  stop the receiving side's clients first (`sudo systemctl stop gnosia
  gnosia-studio` on the server, `npm run dev` and the studio on the Mac),
  since the app holds a connection pool and `dropdb` refuses a database
  anyone is connected to; then `dropdb`, `createdb`, `pg_restore`; then
  `rsync --exclude .owner` the blob store in the same direction so every
  key the restored rows name has an object, and delete the receiving
  side's own `.owner`, which names the database just dropped (after the
  `rsync`, not before, so nothing copies a marker back over the gap);
  then `blob audit` and `blob audit --fix`, which writes a new one, and
  start the clients again.
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
      change would be the compose port bound to the machine's Tailscale
      address instead of `127.0.0.1` (step 6), a real password in place of
      `catalog`, the laptop's two `DATABASE_URL` values pointed at it, its
      own instance marked `copy`, and its blob store `rsync`ed from the
      server rather than the other way.
- [ ] Funnel, if the app is ever reached from outside the tailnet. Serve
      already terminates TLS, so the one thing missing is the per-IP rate
      limit on `/api/auth/sign-in` that [DEPLOYMENT.md](DEPLOYMENT.md#signing-in)
      names, which Funnel does not provide: an nginx `limit_req` or Caddy
      rate limiter between serve and port 3000, before `AllowFunnel` is set.
      Every connection that limiter sees comes from serve over loopback, so
      a limit keyed on the connection's address is one bucket for every
      visitor; it has to key on the client address serve forwards in
      `X-Forwarded-For`, and trust that header only from `127.0.0.1`
      (nginx: `set_real_ip_from 127.0.0.1` with `real_ip_header
      X-Forwarded-For`, then `limit_req_zone $binary_remote_addr`; Caddy:
      `trusted_proxies 127.0.0.1` on the server, then `client_ip` in the
      limiter), since a client can send that header itself and would
      otherwise pick its own bucket. Today the 600 ms delay per wrong
      password is the only brake, and the tailnet is the perimeter.
