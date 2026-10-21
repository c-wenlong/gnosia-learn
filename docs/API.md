# API

The three HTTP surfaces this system exposes, route by route: the web app's
own handlers, the sidecar the macOS app talks to, and the studio runner.
Each binds differently and on purpose — the web app is a deployed Next.js
service behind a session cookie, the other two are loopback-only locals that
answer no CORS headers, so a browser page elsewhere can neither read them
nor send them a JSON body.

Conventions worth knowing before the tables:

- **The web app fails closed.** `src/proxy.ts` asks for the owner cookie
  before any route runs, including every `/api/` path — a deployment missing
  its auth variables is a deployment with no door. Body-bearing learner
  routes share `handler()` from `src/lib/learner-api.ts`: same-origin check,
  a 60/minute rate limit, a bounded body, then validation. The agent routes
  carry the same two guards directly. Errors are `{ error, code }`; reads
  degrade (`reachable: false` and empty lists) where a blank page would lie.
- **The sidecar and the studio are loopback, and say so.** Both check that
  `Host` names their own socket, that a body is `application/json` (a type a
  cross-origin form cannot send), and that `Origin`/`Sec-Fetch-Site`, when
  present, name the server itself — DNS rebinding is the attack that shape
  exists for. Their errors are `{ error, code }` and `{ error, detail }`
  respectively.
- **Both local services write the same Postgres the web app uses.** There is
  no second catalog; the sidecar is another door onto it for one owner, and
  the studio's routes run its runner's own tables and files.

## The web app

`apps/web/src/app/api/**/route.ts`, 39 handlers. Agent calls are the
`packages/tutor` `*Turn` functions behind the app's guards — the same
functions the sidecar serves, so the two surfaces cannot disagree about what
a turn does.

### Auth

| Route | Body / query | Does |
| --- | --- | --- |
| `POST /api/auth/sign-in` | form fields `password`, `next` | A plain form post: 303 to `next` (vetted by `safeNextPath`) with the session cookie on success, to `/sign-in?error=` otherwise; same-origin checked before the body is read (login CSRF) |
| `POST /api/auth/sign-out` | none | Clears the session cookie, 303 to `/`; POST so a prefetched link cannot sign the owner out |

### Agent

One tutoring turn per route, all POST. Bodies are JSON objects; the routes
return the turn's own reply envelope.

| Route | Body | Does |
| --- | --- | --- |
| `/api/agent/chat` | `messages[]` plus exactly one shape's fields: `courseSlug`/`moduleSlug`/`topicId` (topic tutor), `conceptSlug` (concept tutor), `subject` (the open tutor, writes nothing), or `assetId` (+ `at`, the video position in seconds); optional `learnerNote` | `chatTurn`: the next tutor message, with sources the note or asset was read from on the server |
| `/api/agent/session` | `{ conceptSlug, step: "probe" \| "check", avoid?[] }` | `sessionQuestionTurn`: one multiple-choice question the model wrote as JSON, refused if it is not; writes nothing |
| `/api/agent/judge` | `{ conceptSlug, question, answer }` | `judgeTurn`: grades one recalled answer for the chat's recall check; nothing is written — only the learner's tap records, through `observe` |
| `/api/agent/summarize` | `{ courseSlug, moduleSlug, topicId, messages }` | `summarizeTurn`: a transcript condensed into a recap shape; writes nothing — the page persists it through `learner/recap` |

### Learner — writes

All POST under `handler()` (same-origin, `learner` rate limit, bounded body).
These are the only copy of the study record, so a write that cannot reach
the database fails rather than degrades.

| Route | Body | Writes |
| --- | --- | --- |
| `/api/learner/progress` | `{ curriculumItemId, completed }` | A checklist tick on or off |
| `/api/learner/note` | `{ curriculumItemId, note }` | The scratch note on one curriculum item; empty clears |
| `/api/learner/reset` | `{ curriculumItemIds[] }` | Clears those items' ticks and notes and bumps the epoch; recaps survive |
| `/api/learner/recap` | `{ curriculumItemId, summary, keyPoints[], misconceptions[], openQuestions[], source, countSession? }` | Upserts or clears the recap, clamped by `KNOWLEDGE_LIMITS`; `countSession` (default true) counts it as a session |
| `/api/learner/preference` | `{ key, value }` | One preference — an allow-list (`theme`, `lastVisited`, the learner's links, inactive courses, `tutorStyle`, `reducedMotion`, pinned, …), never an arbitrary key; `lastVisited` also feeds `recentModules` and appends a `visit` event |
| `/api/learner/import` | the legacy `self-learn:v1` document (`completed`, `notes`, `knowledge`, `userResources` objects) | The one-time carry-over from a browser's old localStorage; database-first merge, unknown item ids skipped and counted |
| `/api/learner/watched` | `{ assetId }` | One `watched` event: study, never evidence |
| `/api/learner/playback` | `{ assetId, duration, position, ranges[] }` | Merges the save into the `playback:<id>` preference; the save that crosses 90% coverage appends the `watched` event, in one transaction under the learner lock |
| `/api/learner/observe` | `{ conceptSlug, correct, source: "probe" \| "teach", requestId, sessionId?, question?, answer?, chosen?, closeSession?, module?, sessionTitle?, sessionGoal? }` | One graded answer as `learn observe` records it: the event, the BKT update with propagation, the review card; opens or closes the session row; idempotent on `requestId` |
| `/api/learner/session/close` | `{ sessionId }` | One `session-close` event and the row to `closed`, once |
| `/api/learner/asset-name` | `{ assetId, name }` | The learner's own title for an asset; null/empty clears |
| `/api/learner/favorite` | `{ assetId, favorite }` | The star on an asset the owner can read |
| `/api/learner/name` | `{ name }` | The display name; empty clears |
| `/api/learner/avatar` | `{ avatar }` | One of the allowed avatars |
| `/api/learner/recent` | `{ action: "pin", row: { key, kind, title, href } }` or `{ action: "unpin", key }` | The sidebar's pinned rows, under the row lock; a conversation's name is the studio's job (`PUT /api/drafts/{id}/name`), not this route's |

### Learner — reads

| Route | Query | Does |
| --- | --- | --- |
| `GET /api/learner/home` | — | The `HomeModel` the page renders; degrades to `reachable: false` with empty lists |
| `GET /api/learner/ask` | `?q=` | Concepts, courses, modules and videos matching the query, best first (`rankAsk`); 240/minute since the box asks as the owner types |
| `GET /api/learner/export` | — | Everything the learner recorded as a JSON download: snapshot, every preference row, the whole event log, the tutor model chain — never provider keys; 503 rather than an empty file |
| `GET /api/learner/recent` | `?pages=`, `?drafts=0`, `?q=` | The Recent model (module visits, sessions, drafts, assets), paginated; degrades to `reachable: false` |

### Learner — settings

The BYOK and model-chain routes. `POST`/`PUT`/`PATCH`/`DELETE` as below;
`GET`s for these do not exist here — the web reads them server-side, and the
sidecar adds the two read routes the native pane needs.

| Route | Body | Does |
| --- | --- | --- |
| `POST /api/learner/provider-key` | `{ provider, key }` | Saves the owner's key for a provider (AES-256-GCM under a key from `AUTH_SECRET`; docs/BYOK.md) |
| `DELETE /api/learner/provider-key` | `{ provider }` | Removes it |
| `POST /api/learner/provider-key/test` | `{ provider }` | A probe call on the effective key, so a bad key fails in Settings, not mid-session |
| `POST /api/learner/provider-key/sync` | `{ provider }` | Copies the saved tutor key into the studio runner's `byok.json` |
| `POST /api/learner/tutor-model` | `{ provider, model }` | Appends the entry to the chain |
| `PUT /api/learner/tutor-model` | `{ provider, model }` | Makes it the whole chain |
| `PATCH /api/learner/tutor-model` | `{ provider, model, direction: "up" \| "down" }` | Moves the entry |
| `DELETE /api/learner/tutor-model` | `{ provider, model }` | Removes it |
| `PATCH /api/learner/tutor-model/provider` | `{ provider, direction }` | Moves a provider's whole group |
| `DELETE /api/learner/tutor-model/provider` | `{ provider }` | Removes the provider's entries and its saved key |
| `POST /api/learner/tutor-model/test` | `{ provider, model }` | A probe call on that model |
| `POST /api/learner/tutor-model/models` | `{ provider }` | Lists the models a provider offers |
| `POST /api/learner/custom-provider` | `{ label, baseUrl, key }` | Creates an OpenAI-compatible provider, atomically |
| `PATCH /api/learner/custom-provider` | `{ provider, label?, baseUrl?, key? }` | Edits one |

### Review, assets, content

| Route | Query | Does |
| --- | --- | --- |
| `GET /api/review/due` | `?concept=` | The due cards as the review page renders them plus `nextDue`; the focus concept first, due or not |
| `POST /api/review/grade` | `{ conceptId, grade: 0..3, requestId? }` | One rating through `gradeReview`, the function `learn review grade` calls; the event, the card, the mastery entry; replays answer with the first write's grade |
| `GET /api/assets/[id]/file` | `?download=1` | The one door from an `asset` row to its bytes: a blob served or 302'd to a signed URL, row text streamed, `Range` honoured; the id is percent-encoded in the segment, never a path |
| `GET /api/assets/[id]/poster` | — | The poster frame `catalog asset upload` stored, `etag`/`304` aware; a video with none is `404 not-uploaded`, a non-video `404 not-a-video` |
| `GET /api/assets/[id]/pdf` | — | The video's pages-as-PDF the same way, `inline` so the browser's viewer opens it |
| `GET /api/assets/[id]/status` | `?for=poster` | `{ ok: true }` or `{ ok: false, code }` with the status the byte route would have used — a post-`onError` probe, never a pre-render one |
| `GET /api/concepts/[slug]` | — | The `ConceptWorkspace` object; 400/404/503 by name |
| `GET /api/courses/[slug]/cover` | `?v=` the cover version | The course's cover from the blob store, through the session check on purpose — a path ending in an image extension would sail past `proxy.ts` unsigned-out |

### The studio, from the web app

Two routes are the web app's edge of `services/studio`, both under `(app)/`:

| Route | Does |
| --- | --- |
| `(app)/studio/api/[...segments]` (`GET`, `POST`, `PUT`, `DELETE`) | The proxy every studio fetch goes through: forwards to `127.0.0.1:7250`, strips browser-origin headers (`host`, `origin`, `cookie`, `sec-fetch-*`, …) and adds the signed-in `STUDIO_OWNER_HEADER`; 401 with no owner, `502 RUNNER_DOWN` when nothing listens; streams bodies so the SSE routes work |
| `GET /studio/made/[draft]` | The catalog rows a conversation's runs landed; `reachable: false, made: []` rather than an error when the catalog is down |

## The sidecar

`services/sidecar/src/api.ts` — one `TURNS` map, method-aware, and the whole
surface. It serves the web app's tutor contract verbatim for the macOS app:
the same paths, the same `*Turn` functions, the same reply envelopes, plus
the two reads the web does server-side. `GET /api/health` is the one route
the web app does not have.

| Route | Method | Turn / does |
| --- | --- | --- |
| `/api/agent/chat` | POST | `chatTurn` |
| `/api/agent/judge` | POST | `judgeTurn` |
| `/api/agent/session` | POST | `sessionQuestionTurn` |
| `/api/agent/summarize` | POST | `summarizeTurn` |
| `/api/learner/provider-key` | GET | `providerKeyStatusTurn` — which providers hold keys |
| | POST | `providerKeySaveTurn` |
| | DELETE | `providerKeyRemoveTurn` |
| `/api/learner/provider-key/test` | POST | `providerKeyTestTurn` |
| `/api/learner/tutor-model` | GET | `tutorModelChainTurn` — the owner's chain |
| | POST | `tutorModelAddTurn` |
| | PUT | `tutorModelSetTurn` |
| | PATCH | `tutorModelMoveTurn` |
| | DELETE | `tutorModelRemoveTurn` |
| `/api/learner/tutor-model/provider` | PATCH | `tutorProviderMoveTurn` |
| | DELETE | `tutorProviderRemoveTurn` |
| `/api/learner/tutor-model/test` | POST | `tutorModelTestTurn` |
| `/api/learner/tutor-model/models` | POST | `modelListTurn` |
| `/api/health` | GET | `{ ok, service: "gnosia-sidecar", owner }` |

The dispatch contract, enforced before any turn runs: an unknown path is a
404 `NOT_FOUND`, a known path with a wrong method a 405
`METHOD_NOT_ALLOWED`, an unreadable JSON body a 400 `BAD_REQUEST`, a body
over 64 KiB a 413 `PAYLOAD_TOO_LARGE`, and a failed origin/host guard a 403
`ORIGIN_MISMATCH`. `GET` routes receive `null` as their body; non-GET reads
and parses the JSON.

## The studio

`services/studio/src/api.ts` plus `src/video/routes.ts` for the video half
of the jobs surface; drafts route through the same file's `draftRoutes`. All
JSON, all behind the runner's loopback guard and owner check.

### Jobs

`POST /api/jobs` dispatches on the body's own `kind`: `"video"` goes to the
video runner, `"diagram"` (or omitted) to the diagram runner, anything else
a 400. Video jobs — recognised by record, not prefix — take the video
table's routes.

| Route | Does |
| --- | --- |
| `GET /api/jobs?limit=&state=` | Both runners' jobs merged, newest first (limit 1–200, default 25) |
| `POST /api/jobs` | `{ kind: "diagram" \| "video", …brief }`: enqueue; idempotent on the brief's key — a repeat answers 200 naming the existing job, a fresh one 201 with `jobsAhead` |
| `GET /api/jobs/{id}` | The job view plus its brief |
| `GET /api/jobs/{id}/events` | SSE: replays from `Last-Event-ID`, then live |
| `GET /api/jobs/{id}/log?from=&limit=` | A window of the run log |
| `POST /api/jobs/{id}/cancel` | Ask the run to stop |
| `POST /api/jobs/{id}/accept` | Land the candidate: `catalog diagram put --job` for a diagram, the video gate's commit for a video |
| `POST /api/jobs/{id}/discard` | Reject it; a revised-from-review parent goes in the same transaction, marked `replacedBy` |
| `POST /api/jobs/{id}/reindex` | The recovery accept needs: re-run `job accept` alone when the diagram landed but the job row never recorded it (diagram jobs) |
| `GET /api/jobs/{id}/shot?which=before\|after\|live` | The comparison PNG (diagram jobs) |
| `POST /api/jobs/{id}/compare` | Re-run the before/after comparison (diagram jobs) |
| `POST /api/jobs/{id}/revise` | `{ changes }`: queue a change-of job; carried along its draft while the job is the slot's newest |
| `POST /api/jobs/{id}/resume` | Queue a continuation of an interrupted job |
| `GET /api/jobs/{id}/sheets` | The scene sheets, latest copy each, in play order (video jobs) |
| `GET /api/jobs/{id}/sheets/{scene}.png` | One sheet, checked against the brief's scene classes (video jobs) |
| `GET /api/jobs/{id}/media/{file}` | The gate's copies — the mp4, `.vtt`, transcript JSON, poster — from a fixed name list, `Range` honoured, `O_NOFOLLOW` (video jobs) |

### Diagrams, mirrors, drafts

| Route | Does |
| --- | --- |
| `GET /api/diagrams` | The corpus the grid lists |
| `GET /api/diagrams/{name}` | One diagram plus its checkout state |
| `GET /api/diagrams/{name}/svg` | Its stored SVG |
| `POST /api/diagrams/{name}/export` | Re-export the SVG from the checkout |
| `POST /api/diagrams/{name}/verify` | The canvas lints on the checkout |
| `POST /api/diagrams/{name}/inspect` | The canvas's structural read |
| `POST /api/diagrams/{name}/commit` | `{ reason }`: `catalog diagram commit` the checkout |
| `GET /api/mirrors` | Which documents a `canvas serve` holds open |
| `POST /api/mirrors` | `{ file }`: open one, or hand back the one already open |
| `DELETE /api/mirrors?file=` | Close it |
| `GET /api/drafts?limit=` | The planner conversations, newest first |
| `POST /api/drafts` | `{ source, idempotencyKey? }`: create one — `source: null` a blank conversation; the key makes a retry land on the same draft |
| `GET /api/drafts/{id}` | The draft and its transcript |
| `POST /api/drafts/{id}/messages` | `{ text, mentions? }`: a person turn to the planner; mentions are `{kind,start,end}` triples checked against the text |
| `GET /api/drafts/{id}/events` | SSE for a live conversation |
| `POST /api/drafts/{id}/draw` | `{ kind, idempotencyKey? }`: the in-force brief of that kind, queued as a job |
| `POST /api/drafts/{id}/abandon` | Close it |
| `PUT /api/drafts/{id}/name` `/model` `/harness` `/brief` | Rename it, pin its planner model, pin its harness, pin its live brief |
| `POST /api/drafts/{id}/slots/{kind}/stop-waiting` | The `{kind}` brief is no longer asked for |
| `POST /api/drafts/{id}/slots/{kind}/use?base=<seq>` | Take a held `{kind}` brief back into force; the planner hears it on its next turn |

### Listings, settings, health

| Route | Does |
| --- | --- |
| `GET /api/videos` | The owner's landed studio videos, for the poster tiles |
| `GET /api/vocabulary` | The topic vocabulary as the screens show it, from the last-good cache |
| `GET /api/settings/agent` | The two agents' model and effort |
| `PUT /api/settings/agent` | `{ kind: "video" \| "diagram", model, effort }` — `default` or a valid Claude CLI model, `default` or a configured effort |
| `GET /api/settings/byok` | Which providers the runner can bill |
| `PUT /api/settings/byok` | `{ provider, apiKey, model? }`: store it in `$STUDIO_HOME/byok.json`, mode 600 |
| `DELETE /api/settings/byok` | `{ provider }`: remove it |
| `POST /api/settings/byok/models` | `{ provider, apiKey? }`: the provider's model list, using the stored key when `apiKey` is blank |
| `PUT /api/settings/byok/models` | `{ provider, models: { lite?, default?, max? } }`: tier picks, merged — omitted keeps, empty clears |
| `PUT /api/settings/byok/active` | `{ provider }`: which connected provider a `byok` turn runs on |
| `GET /api/health` | The blocked-or-ready answer in one read: dependencies, cached-probe freshness, jobs and queues, agent settings, catalog reachability, vocabulary, cost caps, diagram and video readiness, manual and tool health |

## What the native app calls

`SidecarClient.swift` and `StudioClient.swift` are the whole boundary. The
sidecar surface is consumed in full — health, all four agent turns, every
provider-key and tutor-model route — because the native Settings pane owns
the same edits the web Settings page does.

Against the studio the app reads health, diagrams (+ one diagram, its svg,
and the export/verify/inspect/commit verbs), vocabulary, the merged jobs
list, one job, its log and shot and sheets, the media route for the AVPlayer,
the videos listing, drafts (+ one draft, messages, draw, abandon, create),
and `POST /api/mirrors` for Open canvas. It deliberately does not call the
SSE routes (`jobs/{id}/events`, `drafts/{id}/events`) — a four-second poll
is the whole progress story there — nor the settings routes, the mirrors
reads and close, the draft `PUT`s and slot routes: those stay the web
surface's, which is why the app's Studio page says the runner applies its
own defaults.

The sidecar routes named `GET /api/learner/provider-key` and
`GET /api/learner/tutor-model` exist only on the sidecar: the web app reads
both server-side while rendering Settings and has no GET handler for them.
