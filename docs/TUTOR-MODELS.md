# The tutor's model chain

Accepted and built, 2026-09-30. The owner picks the models the Gnosia tutor
calls, in order, from Settings, instead of relying on one hard-coded default
per provider. An owner who never adds one gets the built-in defaults, exactly
as before, so the Vercel deployment runs unchanged on its environment keys.

The owner asked for this on 2026-09-30, right after the hard-coded NVIDIA
default (`meta/llama-3.1-8b-instruct`) was retired and started answering 410
Gone: the tutor kept working only because it quietly fell through to Gemini,
and changing the model meant a code change or an environment variable. It
sits on the tutor's request path next to the stored keys of
[BYOK.md](BYOK.md), so the decisions are written down here. They carry the
prefix T to keep them apart from BYOK's D1 to D11.

## What it is

| Piece | Where |
| --- | --- |
| The table | `tutor_model`, migration `0020_tutor_model`, declared in `packages/schema/src/state.ts` |
| The one module that writes it | `services/catalog/src/state/tutor-models.ts` |
| The web app's store, per owner | `apps/web/src/lib/tutor-models/store.ts` |
| The order the tutor tries | `tutorSteps` and `keyFor` in `apps/web/src/lib/agent/providers.ts`, `tutorCredentials` in `apps/web/src/lib/agent/credentials.ts` |
| A provider's model list | `listProviderModels` in `providers.ts`, cached by `apps/web/src/lib/tutor-models/model-list.ts` |
| Add, remove, move | `POST`, `DELETE` and `PATCH /api/learner/tutor-model` |
| Move or delete a whole provider | `PATCH` and `DELETE /api/learner/tutor-model/provider` (T12) |
| Test one entry | `POST /api/learner/tutor-model/test` |
| List a provider's models | `POST /api/learner/tutor-model/models` |
| The Settings card | `apps/web/src/components/settings/Providers.tsx`, fed by `apps/web/src/lib/providers/view.ts` (T12) |

A turn of the tutor, with and without a chain:

| The owner has | The tutor tries |
| --- | --- |
| No chain | The built-in defaults: each provider with a key, in the order NVIDIA, Gemini, OpenRouter, own keys first, each with its default model or `<PROVIDER>_MODEL` (BYOK D4, D9) |
| A chain | The chain's entries, top to bottom, each with its own model id and its provider's key, own before server. An entry whose provider has no key is passed over and recorded. Nothing after the last entry |

## Decisions

T1 to T5 were made by the lead on the owner's behalf; T6 to T9 were added
while building it, T10 and T11 after the independent review of #250, and T12
on the owner's request of 2026-10-05. T2's Models card and the Provider keys
card are one Providers card since T12.

**T1. One ordered list per owner, in its own table.** `tutor_model`:
`owner_id` (a foreign key to `learner`, cascading on delete and on update,
with no default), `position`, `provider` (`nvidia`, `gemini` or
`openrouter`), `model`, `created_at`. The primary key is `(owner_id,
provider, model)`, so an entry appears once; a unique index on `(owner_id,
position)` and a CHECK of 0 to 9 on `position` keep one entry per place. The
tutor tries the entries top to bottom and stops at the first that answers.
The chain replaces the fixed provider order for its owner, and once it holds
an entry the built-in defaults are not tried behind it, even when every entry
fails: a default answering after the owner's chain would hide an entry that
stopped working, the same reasoning as BYOK D9.

**T2. Settings gets a Models card.** Add a model picks a provider (only those
with a usable key, saved or server) and then a model id, from that provider's
live list or typed by hand. The list is fetched on the server from
`<base URL>/models` with the key the tutor would use and cached in memory for
five minutes per owner and provider, keyed by a fingerprint of the key and
base URL; the key never reaches the browser. The form asks the server once
per provider each time it opens, so a key replaced on the same page gets its
own account's list, and switching provider inside one open reuses what it
asked rather than spending the route's rate limit. A list that failed shows
Try again, and switching back to its provider asks again too. A list is read at most 8 MB
and an error body at most 64 KB, counted as the bytes arrive, whatever the
provider declares. The
id field is the kit's `Combobox` over the listed ids ("free" under the free
ones), so choosing from the list and typing an id are the same field, and a
list that failed or is incomplete costs nothing. Test sends one minimal chat request (one token)
to exactly that entry and shows "works" or the provider's error, redacted the
way the key Test is. Remove, Move up and Move down are buttons; every control
works by keyboard, and after a move or a remove focus returns to the entry
acted on or the one that took its place. Adding does not require a passing
Test. The last Test result per entry is shown, held in the page's memory only.

**T3. No chain behaves exactly as before.** A new owner, an owner who removed
every entry, and any request whose chain cannot be read (the database is
down) get `orderCredentials` unchanged: the built-in defaults, the env
overrides, the existing provider order. The card says the tutor is using the
built-in defaults until you add a model, and lists them. The defaults stay in
code only as that fallback.

**T4. An entry without a key is skipped, not fatal.** When nothing holds a
key for an entry's provider (the owner removed their key and the server has
none), the entry stays in the chain and in place. The tutor passes over it
and records it in `attempts` as `{ provider, model, message: "no key for
<provider label>", skipped: true }`, then goes on. A successful tutor turn
returns the skips as `skipped`; a `MISSING_API_KEY` or
`ALL_PROVIDERS_FAILED` answer returns them in `attempts`. The card marks the
entry "no key for <provider label>, so the tutor skips it". Only when no
entry at all has a key is the turn `MISSING_API_KEY`, and its message then
says which case it is (`missingKeyMessage`): with no chain and no key, "No
model provider key is set"; with a chain whose providers all lack keys, which
providers need a key and which providers that do have one could take a model
instead. A person reads a provider's label (NVIDIA NIM, Google Gemini,
OpenRouter, `PROVIDER_LABELS` in `packages/schema/src/shared.ts`), never its
id, in every message, card and attempt.

**T5. Owner scope, guards and validation.** Every route resolves the owner
with `currentOwner()` and has no `local` default; every function below takes
the owner and has none either. The routes use the provider-key routes'
`guard` (same origin, a per-IP rate limit, the session's owner) under their
own `tutor-model:*` buckets: 60 writes a minute (a move is a write, and moving
an entry three places is three), 10 Tests, 20 model lists. The model list
goes only to the provider's configured base URL (`providerConfigs`); no body
field can change it, and the route test sends `url` and `baseUrl` fields to
prove it. A model id is 1 to 200 characters of printable ASCII with no
whitespace (`checkModelId` in `packages/schema/src/shared.ts`), checked in
the route, the catalog function and a CHECK constraint. Adding a model when
the saved keys cannot be read (the database is down) is a 503 asking to try
again, not a 400 saying there is no key. Model ids are not
secret, but everything a provider sends back that reaches the browser still
goes through `providerText`: a Test's error, the model a Test says answered,
and a list's ids, where an id that echoes the key is dropped rather than
shown redacted.

**T6. The chain goes in the learner export, not in `catalog export`.** The
chain is owner configuration with no secret in it, like the tutor style
preference, and it goes where that goes: `GET /api/learner/export` carries it
as `tutorModels: [{ provider, model }]`, so a person keeping their data keeps
their chain. `catalog export` (and the nightly export, which is `catalog
export`) does not: it writes the authored content tree that `catalog import`
reads back (topics, tags, courses, notes, logs, diagrams) and carries no
learner state at all, no preferences, mastery or events, so the chain would
be the one piece of learner configuration in a content tree with no reader
for it. The provider keys stay out of both (BYOK D11).

**T7. The rows are rewritten whole under the learner lock.** Every change
reads the owner's chain, computes the new order and writes the chain back in
one transaction holding `withLearnerLock`. Two tabs changing the chain at
once are serialised, and `position` is 0 to n-1 with no gaps after every
change. Updating positions in place was the alternative, but a swap trips the
unique `(owner_id, position)` index halfway, because Postgres checks a
non-deferrable unique index row by row, and drizzle cannot declare a
deferrable one. A rewrite keeps each entry's `created_at`.

**T8. At most ten entries.** A failing turn walks the chain until an entry
answers or the turn's deadline (T10) runs out, so the cap bounds how many
provider requests one turn can spend. It does not bound how long a person
waits; T10 does. A CHECK on `position` repeats it.

**T9. The key Test calls the model the tutor would call that key with first.**
Before the chain, the key Test in the Provider keys card always sent the
provider's default model, so a retired default made a working key look
broken, which is how the 410 surfaced. Now it sends the owner's first chain
entry for that provider, else the default (`keyTestModel`). The Provider keys
card shows that model on each row and says "Tested with <model>" in the
result; when the owner has a chain with no entry for the provider, the row
names the built-in default and says the tutor is not using that key.

**T10. A turn has a deadline, and each call its own limit.** Before this, no
call passed a signal, so a provider that accepted the connection and never
answered held the whole turn until the platform killed the function, and the
person got a bare 504 with no attempts. Each call now has
`AbortSignal.timeout` of 20 seconds (`TUTOR_ATTEMPT_TIMEOUT_MS`), and the
walk has one deadline of 60 seconds (`TUTOR_TURN_DEADLINE_MS`), both between
1 and 300 seconds. A call cut off by its own limit is recorded with
`timedOut: true` ("No answer within 20 seconds, so the tutor moved on") and
the walk goes on; the one cut off by the deadline is recorded the same way
("Cut off: the turn ran out of its 60 seconds, so N more models were not
tried") and the walk stops, returning the attempts so far as
`ALL_PROVIDERS_FAILED`. A reply is read through the same capped reader as a
model list (2 MB for a reply, 64 KB for an error body), and so is the key
and entry Test.

**T11. A model id is never an API key.** A chain row is stored in the clear
and goes into the learner export, so a key pasted into the model field must
not reach it. `checkModelId` refuses an id with a known key prefix (`nvapi-`,
`sk-`, `AIza`) or a run of 20 or more letters and digits holding both, which
random key material has and model ids, whose words are split by `-`, `.`, `/`
and `:`, do not; the catalog function and every route share it. The add route
also refuses an id that is, contains, or is a 12-character-or-longer part of
any key the owner's tutor could call with, saved or server, for any provider.
Neither refusal repeats the value. A listed id that looks like a key is
dropped from the list.

## What this does not change

- The base URLs. `<PROVIDER>_BASE_URL` still comes from the environment, so
  the environment-write row of BYOK's threat model applies to chain entries as
  it does to the defaults: whoever sets a base URL receives the keys sent to
  it. No request can set one.
- Which providers exist. The chain chooses among NVIDIA, Gemini and
  OpenRouter; a fourth provider is a code change, as before.
- The studio's agents, which run `claude` under the machine's own login.

## Out of scope

- Drag to reorder. The buttons do the job and work by keyboard.
- Storing Test results. They are held in the page and gone on reload.
- A per-entry temperature or token limit. Every entry is called as the
  defaults are.
- Filtering a list to chat models. NVIDIA's list includes embedding and
  reranking models; Test tells them apart.

## T12. One Providers card, and the chain grouped by provider

The owner asked on 2026-10-05 for the models to live inside their provider:
the key and the models of one provider sat on two cards, and a model could
not be changed next to the key it calls with. Settings now has one
Providers card (`Providers.tsx`) in place of Provider keys and Models.

- **The card.** Add provider takes a provider not listed yet and its key. A
  row shows its key's state, its model count (or the built-in default while
  the chain is empty), Edit (replace the key), Delete, Move up and Move down,
  and an arrow at the far right that opens it onto its models. Rows start
  closed. Inside: each model with Test, Move up, Move down and Remove, and
  Add model, the kit's `Combobox` over the provider's live list (T2's list,
  fetched the first time the row opens). With no models, a row offers Test
  the key, which sends what T9 says.
- **Grouped.** Every write stores the chain grouped by provider
  (`groupByProvider` in `packages/schema/src/shared.ts`): an added model goes
  to the end of its provider's models, a model moves only among its
  provider's, and a provider's models move together past the next
  provider's (`moveTutorProvider`). A provider's place in the order is where
  its models sit, so a provider with no models has none and no Move buttons.
  Reads group too (`readChain`), so a chain stored before this, whose
  providers could interleave, is walked and shown as its next write will
  store it.
- **A provider with no models is skipped** once any provider has one: T1
  already said the chain alone is tried. Until the chain holds a model, the
  built-in defaults apply (T3) and each row names its default.
- **Delete** removes the provider's models, then the owner's saved key, in
  one request, in that order: a failure between them leaves a key with no
  models, which the tutor skips and Delete finishes, never models with no
  key. A server key is the environment's and stays, so the row stays listed.

