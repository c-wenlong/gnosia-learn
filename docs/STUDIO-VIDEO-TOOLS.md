# The studio picks a video tool

How the studio's video path stops being manimkc only. The planner proposes
which of the three video tools makes each video, with a one-line reason; the
confirm card shows that choice as a chip the person can switch; Make video
stays the one approval; and the video runner gains a backend per tool, so a
revideokc video (and later a remotionkc one) is made unattended, inside the
same kind of per-job sandbox manimkc runs in today.

**Status: proposed, 2026-09-30, and being built in phases.** The owner asked
for this after [VIDEO-TOOLS.md](VIDEO-TOOLS.md) (#248) wrote down what each
tool is for and a routing procedure for agents at a terminal. The one thing
that could have sunk it, headless Chrome inside the job sandbox, was measured
before this was written ("Chrome inside the job sandbox", below). Numbers
marked *measured* come from that spike on the owner's M4 Pro; every other
number is a guess and says so.

**Why a file of its own** rather than a section of
[STUDIO-VIDEOS.md](STUDIO-VIDEOS.md): that file is the manimkc runner's
design, 1,974 lines, and this change touches every layer of it (the brief, the
planner, the card, the runner, the sandbox, the gate, the accept path) for a
second and third tool. Decisions continue the studio's numbering at D71.

## What changes for the person

A video brief card gains one row: the tool, as a chip ("revideokc"), with the
planner's reason beside it ("real depth and light for the cache levels;
runner-up manimkc"). Once the studio can make more than one tool, pressing
the chip opens a menu of those tools, each with the line that says what it is
best at; a tool the studio cannot make yet is not offered, and the planner's
reason names it as the runner-up instead (D73). Picking another tool is an
edit of the brief, like any other edit, and the planner is told. Make video works exactly
as it does today. After the press the job carries the tool, and a later
change to that video keeps it.

What does not change: every job starts from a press (D29); the planner has no
tools (the seals in `planner.ts`); the brief is the script and the gate holds
the video to it (D48); a studio video lands as a `video` row and blobs (D49);
the spend cap and the settings panel's model and effort (D53) apply to every
tool alike.

```mermaid
flowchart TD
  A[Person asks for a video] --> P[Planner writes the script<br/>and proposes a tool with a reason]
  P --> C{Confirm card}
  C -- switch the chip --> E[Brief edit, planner told]
  E --> C
  C -- Make video --> R[Runner picks that tool's backend]
  R --> J[Job: synthetic checkout, sandbox profiles,<br/>wrapper verbs, gate, all per tool]
  J --> V[Review and Accept, as today]
```

## Where the work is

Two read-only surveys of the code (2026-09-30) found the tool is assumed at
every layer, and abstracted at none but the catalog's importer.

| Layer | Today | What changes |
| --- | --- | --- |
| Brief | `VideoBrief` in `services/studio/src/video/brief.ts`; `validateVideoBrief` rebuilds the object from a fixed field list, so an unknown field is dropped | `tool` and `toolReason` fields (phase 1) |
| Planner | `planner-prompt.ts` holds the VIDEO section and data blocks (VOICES, VIDEOS); `PLANNER_VIDEO_FIELDS` in `planner.ts` whitelists what a brief may carry | A TOOLS data block and a paragraph in VIDEO (phase 1) |
| Draft and edits | `brief` is opaque JSON on disk and in `draft.brief` (jsonb); `EDITABLE_VIDEO_FIELDS` picks what `PUT /api/drafts/{id}/brief` may change | Nothing to migrate; `tool` becomes editable through the field list (phase 1) |
| Card | `ConfirmCardVideo.tsx`, read-only; availability from health's `video` block (`videoAvailability` in `lib/studio-drafts.ts`) | A tool chip with a `FilterMenu` switch; availability per tool (phase 1) |
| Runner | `video/runner.ts` sets up a manimkc job inline: `buildCheckout`, three Seatbelt profiles, `scaffold`, `apiListing`, wrapper, guard, clip seeding | Setup moves behind a backend interface (phase 2a) |
| Sandbox | `video/sandbox.ts`: `(deny default)`, exec of Python, ffmpeg and manimkc's trees, one Mach service (Metal), no network | A second profile shape for Chrome (phase 2c, measured below) |
| Wrapper | `bin/video` with verbs `api`, `lint`, `narrate`, `preview`, `build` | Verbs per backend (phase 2c) |
| Gate | Ten steps; step 1 parses Python in the sandbox, step 2 is `manimkc lint`, step 3 matches scene classes, `voiceover` literals and labels | Steps 1 to 3, 7 and 10 per backend; 4 to 6, 8, 9 shared (phase 2c) |
| Accept | `catalog video put`; `SOURCE_NAME` accepts `*.py` and `topic.yml` only | Accepts a revideokc topic's sources; the brief records the tool (phase 2c) |
| Catalog importer | `index/video-tool.ts` already has `VideoToolName` and a descriptor per tool | Nothing |

## Decisions

### D71. The planner proposes the tool, from a data block pinned to VIDEO-TOOLS.md

The planner writes `tool` and `toolReason` in every video brief. It reads the
choice from a TOOLS data block in its system prompt, the same way it reads
VOICES: one line per tool (its name, what it is best at, whether the studio
can make it), the "Pick by what the video needs" rows of
[VIDEO-TOOLS.md](VIDEO-TOOLS.md), top row first, and that page's capability
matrix.

The rows alone are not the routing: VIDEO-TOOLS.md's procedure also puts a
tool the person named first, keeps a series' tool, and checks a second visual
against the matrix. So the video section of the planner's prompt restates
the procedure's steps in the studio's terms, in order: the tool the person
named, when the studio can make it; a change keeps its video's tool; a week
of a series keeps the series' tool; the main visual's row; a second beat the
matrix says that tool cannot do moves the choice to a tool that can do both,
else the beat is simplified; and `toolReason` names the step or row and the
runner-up. Step 1 of the page's procedure (unattended or not) is the TOOLS
block's "available here" column, since every studio video is unattended.

The planner has no tools and never reads a file, so the block is built from
TypeScript constants in `services/studio/src/video/tools.ts`. A test reads
the table and the matrix in VIDEO-TOOLS.md and fails when a constant and the
doc disagree, and the prompt's procedure is quoted in STUDIO-MENTIONS.md and
pinned there as the rest of the prompt is. A change to the procedure's steps
in VIDEO-TOOLS.md still needs the prompt's paragraph changed by hand; the
test holds the rows and the matrix, which are the parts that change most.

`toolReason` is one sentence of at most 160 characters naming the row that
chose the tool and the runner-up, the procedure's step 6. The planner is told
to keep the series' tool for a new week of a series, as the table's first row
says, and that the person can overrule it with one click, so it never argues
for its pick in prose.

**Why not let the runner choose.** The runner sees the brief after the press;
the person should see and be able to change the choice before anything is
spent, and the planner is the one reading the request.

### D72. `tool` is optional, defaults to manimkc, and must be one the studio has a backend for

A brief without `tool` is a manimkc brief, so every draft, job and video from
before this change keeps its meaning with no rewrite. The validator refuses a
tool the runner has no backend for ("revideokc is not in the studio yet"),
the same `BriefError` path a bad voice takes, so the planner hears it as a
STUDIO note and picks again. Whether this machine can run a tool it has a
backend for is the video doctor's answer, checked at the press as today, and
shown on the card as the press's reason; the validator stays a pure function
of the brief, so the planner's brief never changes meaning with the doctor's
mood.

The alternative was letting the planner propose a tool the studio cannot make,
with a "make it at a terminal" hint. Refused: a card whose button cannot work
is worse than a card that names the better tool in its reason ("runner-up
revideokc, not in the studio yet").

### D73. The card shows the tool as a chip, and switching it is a brief edit

The video card gains one row under the summary line: the tool as a chip,
with `toolReason` beside it in `--text2` (or, once a person has switched,
what the new tool is best at). When the studio can make two or more tools,
the chip is a `FilterMenu` trigger whose options are those tools, each with
its strength as the option's `detail` line; a tool the studio cannot make is
not offered, and the planner's reason names it as the runner-up instead. A
menu of one is just the chip, which is all phase 1 shows. There is no label:
the chip's content says what it is (DESIGN.md, "Sentence case").

Picking one is `PUT /api/drafts/{id}/brief` with the new `tool` and no
`toolReason` (the planner's was for the old tool), through the existing base
check, so a switch that races a new brief is refused like any
edit. `describeVideoBriefEdit` tells the planner "The person switched the tool
to revideokc", so its next brief keeps the choice. The card is otherwise still
read-only; in-place editing of the script is a separate change.

### D74. The tool is fixed from the press on

Before the press, the tool is a field like any other. The press copies the
brief into the job record, so the job's tool is whatever the card showed. A
`change` brief (D52) edits the source files of its parent video, which only
the parent's tool can read, so the validator refuses a change whose tool
differs from the parent's, and the TOOLS block tells the planner a change
keeps its video's tool. The parent's tool comes from the brief stored on its
`video` row (`source.brief.tool`, absent meaning manimkc).

### D75. One runner, one backend per tool

The video runner keeps everything that is not about a tool: the queue, the
lease, the claim, the agent spawn with its settings and guard, the hang timer
(D54), the gate loop, cost, Accept and Discard. Everything else moves behind
an interface, one implementation per tool, chosen by `brief.tool` at claim
time:

| Backend method | What manimkc's does today |
| --- | --- |
| `toolchain()`, `problems()` | Discovers python, the venvs, kokoro, ffmpeg; the reasons a job cannot run |
| `prepare(job)` | Synthetic checkout, scaffold, clip seeding |
| `profiles(job)` | The render, narrate and gate Seatbelt profiles |
| `env(kind, job)` | The environment each profile runs with, built from nothing |
| `verbs` and `argv(verb, args)` | The wrapper's verbs and what each runs |
| `sourcePattern` | Which files are the video's source (`^[a-z0-9_]+\.py$`, `topic.yml`) |
| `scan(job)` | The gate's steps 1 to 3: parse, lint, structure against the brief |
| `outputs(job)` | Where the deliverable, sidecars and sheets land |
| `manual()`, `prompt(job)` | The agent's system prompt and first message |
| `doctor()` | The fixture render that proves the backend works on this machine |

Phase 2a moves manimkc's code behind it with no change in behaviour: the
profiles it writes must be byte-identical before and after, which a test
checks against the current `buildProfile` output. Only then does a second
backend arrive, so a regression in the move cannot hide inside new work.

**Why not a second runner per tool** (as D43 made the video runner separate
from the diagram one): the video runners would share the queue's one-at-a-time
limit, the cost meter, the gate loop and Accept, and differ only in setup. A
second runner would copy the 1,196 lines of `runner.ts` to change about 200.

### D76. Chrome runs inside the job's Seatbelt profile, with its own sandbox off

revideokc and remotionkc render through headless Chrome driven by puppeteer.
The job profile is the security boundary, as it is for manimkc's Python;
Chrome's own sandbox cannot start inside it (Chrome's children fail with
"sandbox initialization failed: Operation not permitted", *measured*), so
Chrome runs with `--no-sandbox` and every Chrome process is confined by the
job profile instead. The agent's code runs only in Chrome's renderer: Vite
serves `scene.tsx` to the page, and nothing in Node imports it.

What the render profile gains over manimkc's, each measured necessary in the
spike below:

| Rule | Why |
| --- | --- |
| exec: `node`, the Chrome app bundle, `node_modules/@ffmpeg-installer`, `@ffprobe-installer` | The renderer, the browser and its helpers, Revideo's own ffmpeg and ffprobe |
| read: the tool's `node_modules` | Vite resolves the symlinked `node_modules` to its real path |
| network: bind, inbound and outbound on `localhost:<port>` and `<port>+1` only | Revideo's Vite server, one per worker; the port pair is chosen per job and set with `strictPort` |
| puppeteer `pipe: true` | DevTools over a pipe, not a TCP port, so no other port is needed |
| unix sockets and symlink creation under `render/tmp` only | Chrome's `SingletonSocket` and `SingletonLock`; `MAC_CHROMIUM_TMPDIR` points Chrome's temp dir there, because Chrome ignores `TMPDIR` on macOS |
| `mach-register` of `com.google.Chrome.*` | Chrome's `MachPortRendezvousServer` |
| `mach-lookup` of 13 services | Metal's compiler, fonts, logd, the window server, CARenderServer, libinfo, notification_center, FSEvents, diagnosticd, tccd.system, distributed_notifications, launchservicesd, and Chrome's own rendezvous |
| Vite `cacheDir` under `render/cache/vite` | Vite otherwise writes `node_modules/.vite` in the real checkout |
| `DISABLE_TELEMETRY=true` | Revideo's renderer reports to PostHog otherwise; the profile blocks it anyway |

Denied, and measured to cost nothing: the pasteboard, AppleEvents,
LaunchServices' databases (`lsd.*`), coreservicesd, the keychain
(`SecurityServer`, `securityd`), CoreLocation, iCloud (`bird`), Spotlight,
usernoted, the Dock, analyticsd, DNS configuration, and every outside network.

### D77. The gate holds a revideokc video to the brief through `narration.json`

In manimkc the spoken lines are string literals in the scene file, so the gate
parses Python to find them. revideokc keeps the script in `narration.json`
(chapters with their lines), which makes the check simpler: the gate compares
each chapter's name and lines with the brief's scenes and `say` lines, allowing
the respellings D47 allows, and looks for each beat's labels as string
literals in `scene.tsx`. That file is parsed with the TypeScript compiler's
parser by a small Node script run inside the gate profile, the way manimkc's
scan runs Python's `ast` inside the render profile: parsing runs no code, but
every process that reads an agent-written file stays inside a job profile,
and the runner only reads the script's JSON answer. Step 2's lint is
`tsc --noEmit` in the render profile. Steps 4 to 6, 8 and 9 (the topic, the
copy, the probe, the length, the poster) are the same code for every tool.
Step 7 (narration in sync) reads the transcript sidecar, which revideokc
writes in manimkc's shape. Step 10 (the agent looked) needs the agent to have
Read the stills sheet after its last scene edit and the build's sheet after
the last build.

The agent may edit `scene.tsx` and files it adds beside it; `topic.yml`,
`narration.json` and `lib/` are the runner's, written from the brief, as
`topic.yml` is today.

### D78. Narration stays the tool's own verb, run in the shared narrate profile

revideokc's `narrate` calls manimkc's `lib/narration.py` in manimkc's TTS venv,
so the narrate profile, the kokoro model and the per-job clip cache are
manimkc's, reached through `MANIMKC_ROOT` pointing at a read-only view of the
real checkout. The remotionkc session is moving narration into its own
package, gnosia-audio, with a JSON CLI; when that lands, every backend's
narrate step becomes one call to it and this decision is replaced. Until then,
nothing here builds a second narration path.

### D79. The catalog records the tool in the brief, and needs no migration

`catalog video put` widens `SOURCE_NAME` to a revideokc topic's files
(`scene.tsx`, `narration.json`, `topic.yml` and `.ts` or `.tsx` files beside
them), and requires at least one scene file for the tool the brief names. The
brief is already stored whole on the row (`source.brief`), so the tool rides
there; `video list` returns it so a change job can find its parent's tool.
`origin` stays `studio`: a studio video is the studio's, whichever tool drew
it, and the importers never prune it (videos.ts, the `video:` namespace).

### D80. remotionkc is the same interface, built third

remotionkc renders through the same Chrome, so its profile is D76's with its
own bundler's needs. Its backend is phase 3, after revideokc's has been
measured on real jobs, and is coordinated with the session that owns
remotionkc. Remotion's licence is free for this project today (VIDEO-TOOLS.md,
"Risks").

## Chrome inside the job sandbox (the spike, 2026-09-30)

The question that decided whether this design was worth writing: can a
revideokc render run inside a profile as tight as manimkc's? The spike built
a synthetic checkout like a job's (the topic, `lib/`, `src/`, `tools/`, a
symlinked `node_modules`), staged the narration, and ran
`revideokc still <topic> 20s --no-narrate` under `sandbox-exec` with a profile
written from `buildProfile`'s shape, loosening one rule at a time on each
logged denial and then cutting back.

*Measured:*

- The showcase topic (a three.js stage with a spotlight, shadow maps and glass
  cards) renders correctly inside the final profile; the still matches the
  unsandboxed one.
- 40 seconds inside against 27 outside for a 62-second, 1,863-frame topic
  (`still` renders the whole video to cut its frames).
- From Node inside the final profile: Postgres (5432) and the studio runner
  (7250) refused with `EPERM`, the internet unreachable, `~/.ssh`, `~/.zshrc`
  and `apps/web/.env.local` unreadable, a write into the checkout refused, and
  `/usr/bin/open` refused at exec. The job's own port answers.
- The failures on the way, in order: `SingletonLock` (a symlink, denied
  everywhere by the manimkc profile), Chrome's socket directory (it uses the
  Darwin user temp dir, not `TMPDIR`), the socket's `bind`, the rendezvous
  service's registration, Chrome's nested sandbox, the bundled ffprobe's exec,
  and with a tight Mach list, `distributed_notifications` and
  `launchservicesd`.

What the spike did not settle, for phase 2c: a full `build` with two workers
(the second worker's port), the narrate step in the profile, and the doctor's
fixture.

## Phases

Each phase is one PR through the usual loop, in order; a later phase never
lands before the earlier one is merged.

### Phase 1. The tool in the brief

- `services/studio/src/video/tools.ts`: the three tools, their strengths,
  `VIDEO_TOOL_ROUTES` and the capability matrix from VIDEO-TOOLS.md, and
  which the runner has a backend for (manimkc only).
- `brief.ts`: `tool` (optional, default manimkc) and `toolReason` (at most 160
  characters); refuse a tool this machine cannot drive (D72) and a change
  whose tool differs from its parent's (D74).
- `planner.ts`: both fields in `PLANNER_VIDEO_FIELDS`. `planner-prompt.ts`: the
  TOOLS block after VOICES, the routing steps and the JSON example's two
  lines in VIDEO, and the tool in `changingSummary`. STUDIO-MENTIONS.md's quoted prompt
  updated in the same change, since a test compares them.
- `drafts.ts`: the edit note for a tool switch.
- Health's `video` block gains `tools`, each `{ok, reason}`.
- Web: `tool` on the card's brief type, the chip and menu on
  `ConfirmCardVideo.tsx`, the switch through `saveBrief`.
- Tests: validator cases, prompt order and content, the doc-pinning test, the
  edit note, the card's option list.
- Docs: STUDIO-VIDEOS.md's brief table, VIDEO-TOOLS.md's "Not built yet".

Done when: a studio conversation asking for a video shows a manimkc brief with
the tool chip and a reason naming a runner-up, health lists revideokc and
remotionkc as not in the studio yet, and a brief the planner writes with an
unavailable tool is refused and rewritten.

### Phase 2a. The backend interface, manimkc only

Move manimkc's setup, profiles, verbs, scan and outputs behind D75's
interface. No behaviour changes: the written profiles, wrapper and settings
are byte-identical to today's for the same job, checked by a test; the video
suites pass unchanged.

### Phase 2b. revideokc, ready to be sandboxed (in c-wenlong/revideokc)

- puppeteer `pipe: true` always; `DISABLE_TELEMETRY=true` always.
- Vite's `cacheDir` under the data root's `cache/vite`, so a render never
  writes into `node_modules`.
- `REVIDEOKC_VITE_PORT` (a base port, `strictPort`) and `REVIDEOKC_CHROME_ARGS`
  honoured by `still` and `build`.
- Then the submodule pointer here, per Workflow 1.

### Phase 2c. The revideokc backend

The synthetic checkout, the profile of D76 with the job's port pair, the verbs
(`api`, `narrate`, `lint` as `tsc --noEmit`, `still`, `build`), the gate
adapter of D77, the manual (from the `revideokc-video` skill and
CAPABILITIES.md, as manimkc's manual came from its skill), the doctor fixture
(a small three.js topic rendered in the profile), `catalog video put` for its
sources (D79), and revideokc enabled in `tools.ts`. Then one paid job end to
end, measured: time, cost, gate verdict, and what the agent Read.

### Phase 3. The remotionkc backend

The same, for remotionkc, with the remotionkc session.

## Open questions

None blocks phase 1. Two for later phases:

1. Whether two jobs of different tools may run at once. The video runner runs
   one job at a time today (`config.ts`); a Chrome render and a ManimGL render
   compete for the same cores, so one at a time stays until measured.
2. Whether a revideokc job should reuse the checkout's `node_modules` read-only
   (the spike did) or install its own. Read-only reuse is what the spike
   measured and costs nothing; an install per job would take minutes and the
   network the profile denies.
