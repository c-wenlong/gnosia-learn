# Bring your own key

Accepted and built, 2026-09-30. The owner stores their model provider API keys
for the Gnosia tutor in the database, through Settings, instead of in `.env`.
The keys in the server's environment still work, as the fallback, so the
Vercel deployment runs unchanged.

The owner asked for this on 2026-09-30, when their own machine had no key and
the tutor was down. It stores secrets, so the decisions and the threat model
are written down here before anything else.

## What it is

| Piece | Where |
| --- | --- |
| The table | `provider_key`, migration `0018_provider_key`, declared in `packages/schema/src/state.ts` |
| The one module that reads and writes it | `services/catalog/src/state/provider-keys.ts` |
| Sealing and opening | `packages/tutor/src/server/seal.ts` (tests in `packages/tutor/test/seal.test.ts`) |
| The web app's store, per owner | `apps/web/src/lib/provider-keys/store.ts` |
| The studio runner's read of them (D12) | `services/studio/src/agent/byok-keys.ts`, the settings beside them in `services/studio/src/agent/byok.ts` |
| The order the tutor tries keys in | `orderCredentials` in `packages/tutor/src/providers.ts`, `tutorCredentials` in `apps/web/src/lib/agent/credentials.ts` |
| Save and remove | `POST` and `DELETE /api/learner/provider-key` |
| Test | `POST /api/learner/provider-key/test` |
| The Settings card | `apps/web/src/components/settings/ProviderKeys.tsx`, fed by `apps/web/src/lib/provider-keys/settings.ts` |

A key goes in once and never comes back out:

1. The owner pastes a key into a password field on Settings and saves.
2. The route checks the shape, seals the key and stores the sealed bytes,
   and answers with the provider, the last four characters and the date.
3. On a tutor turn, the route reads the signed-in owner's rows, opens them on
   the server, and calls the provider with them. The key exists in the clear
   only in that request's memory.

## Decisions

These were made by the lead on the owner's behalf. D7 to D11 were added while
building it, and D12 after the 2026-10 security audit.

**D1. Per owner, in its own table.** `provider_key`: `owner_id` (a foreign key
to `learner`), `provider` (`nvidia`, `gemini` or `openrouter`), `ciphertext`,
`iv`, `auth_tag`, `key_version`, `last4`, `created_at`, `updated_at`, with the
primary key `(owner_id, provider)`. Added through `packages/schema/src/` and
`npm run generate -w @gnosia/catalog`, with the copy guard of 0010
appended like every table since. `owner_id` has no default, unlike the content
tables, so a key is never filed under `local` by omission, and it cascades on
delete, so deleting an owner deletes their keys.

**D2. Encrypted at rest with AES-256-GCM.** The encryption key is HKDF-SHA256
over `AUTH_SECRET`, with a fixed salt and an info string naming the version
(`gnosia/provider-key/v1`). No new variable is needed. `key_version` names the
derivation, so a dedicated secret can come later as version 2 without a
migration. Every save draws a fresh 96-bit nonce. A key that does not decrypt
is treated as missing: the tutor skips it (falling back to the server's key
for that provider) and Settings says "Re-enter this key". It is never a 500.

**D3. Write-only.** After a save the plaintext never leaves the server.
Settings shows the provider, the last four characters and the date saved,
with Replace, Remove and Test. Test makes one minimal call (a one-token
completion) and reports "works", or the provider's error text with any echo
of the key taken out. Keys never go into logs, error messages,
`catalog export`, the nightly export, `learn vault pull`, the learner export
or any client bundle.

**D4. Resolved per request, for the signed-in owner.** (Since the model
chain, this is the order for an owner with no chain; an owner with one gets
the chain's order, each entry with the key D9 names:
[TUTOR-MODELS.md](TUTOR-MODELS.md), T1 and T3.) `currentOwner()`,
never a default `local`. The owner's saved keys come first, in the cascade's
order (NVIDIA, Gemini, OpenRouter, then the providers of TUTOR-MODELS.md T13); then the server's keys, in the same order,
for the providers the owner saved none for. The `providers` field of a tutor
error says where each key came from ("gemini (your key) → nvidia (server
key)") and nothing of the key. The missing-key message in the three tutor
surfaces now points at Settings.

**D5. Saving checks the shape only.** Surrounding whitespace is dropped (a
paste often carries a newline); then the key must be 16 to 512 characters of
printable ASCII with no spaces. The Test button is the real check. Saving and
removing go through the same guards as every Settings write: same origin, a
per-IP rate limit, and the session's owner.

**D6. The studio's BYOK harness spends these same keys, and keeps no copy
(amended 2026-10-30, D12).** By default the studio's agents run `claude`
under the machine's own login (AGENTS.md, "Diagram studio"), not these keys.
Its BYOK harness (Qwen Code on an OpenAI, Anthropic, Gemini, OpenRouter or
NVIDIA key, `TUTOR_TO_BYOK` in `apps/web/src/lib/byok-providers.ts`) runs on
the key the owner saved here. Until 2026-10-30 the web app sent each such key
to the runner in the clear, and the runner kept it in `$STUDIO_HOME/byok.json`
(mode 0600, inside the checkout by default), so D3 and the threat model's
first row held only while the studio was off (audit finding S7-01). D12
replaced that.

**D7. The additional data binds each row to its owner, provider and
version.** The GCM tag covers `["gnosia/provider-key", version, owner,
provider]` as well as the ciphertext. Someone who can write to the database
but does not hold `AUTH_SECRET` cannot move owner A's row onto owner B and
have B's tutor spend A's key, or relabel a Gemini key as NVIDIA. The cost:
renaming an owner id (the `on update cascade` on `learner.id`) leaves their
keys unreadable, and Settings asks for them again.

**D8. The tag length is pinned to 16 bytes.** Node's GCM decipher accepts any
tag from 4 to 16 bytes unless told otherwise, so a row holding only the first
4 bytes of the real tag would still open, a forgery needing about 2^32 tries
instead of 2^128. Both sides pass `authTagLength: 16`, the opener refuses any
other length before trying, and a CHECK constraint says 16 too. The tamper
test caught this while it was being built.

**D9. A saved key replaces the server's for that provider; it does not go
ahead of it.** Each provider is tried once. So a saved key that stops working
shows up as a failed attempt and a failed Test, instead of the server's key
quietly answering for it and hiding the problem.

**D10. The shape check has a floor of 16 characters.** Decision 5 named
non-empty, a length cap and no whitespace. The floor is added so the four
characters Settings shows are never a large part of the key. Every real key is
far longer: Gemini's are 39 characters, NVIDIA's and OpenRouter's about 70.
The ASCII rule is added too, because a header holding anything else throws
inside `fetch` on every tutor turn.

**D11. One module names the table.** `services/catalog/src/state/provider-keys.ts`
is the only code that reads or writes `provider_key`, and
`services/catalog/test/provider-keys.test.ts` scans every shipped source file
(comments skipped) and fails one that names it. The exports are built by type,
each from its own queries, so an exporter cannot read a table it never names.
The same test covers the other way in, code that walks every table without
naming any: iterating the schema's `tables` registry, listing the database's
tables, or running `pg_dump`. Each file that does is listed in the test with
what it does with the rows (`catalog status` counts them, the rehearsal's
backup is a database dump), and a new one fails until someone has read it.

**D12. The runner opens the sealed rows itself (2026-10-30).** The studio
runner reads the owner's `provider_key` rows when a BYOK turn spawns, through
`openSavedKeys` and `savedKeyStatuses` in
`packages/tutor/src/server/provider-keys.ts` (the catalog's one door, D11,
behind them), and opens them with the same `AUTH_SECRET`, held in
`services/studio/src/agent/byok-keys.ts`. The opened key goes into that
spawn's environment and nowhere else. What the runner keeps on disk is
`$STUDIO_HOME/byok-settings.json`: which providers Studio uses, which one
runs, and each one's Lite, Default and Max models, none of it a secret.

- **Nothing sends a key to the runner.** After a save the web app tells it
  only which provider joined (`PUT /api/settings/byok { provider, activate:
  false }`), and the runner refuses any body that carries `apiKey`. A blank
  key field in the studio's model list (`POST /api/settings/byok/models`)
  lists on the saved key, opened for that one call.
- **The old file is deleted at start.** The first start after the upgrade
  deletes `byok.json` (and any temp file a write of it left), carries its
  provider picks and tier models into `byok-settings.json` (never its keys),
  and prints which providers had a key there but none saved in Settings, so
  the owner knows which to enter again. It is deleted whether or not the
  catalog can be read, and whether or not it can be read itself. The settings
  are written first; when they cannot be, the old file is rewritten without
  its keys so the next start can carry them, and deleted if even that fails.
  A file that cannot be deleted stops nothing but is printed on stderr.
- **A provider whose key goes stays listed.** Removed in Settings, or
  unreadable after a rotation, it is marked "no key saved" with its tiers
  kept, and cannot run until the key is back.
- **The runner's secrets never reach a child.** At start the runner takes
  `AUTH_SECRET`, `OWNER_PASSWORD`, `SESSION_EPOCH` and `GNOSIA_LOCAL_TOKEN`
  out of its own environment (`takeKeySecret`), before anything is spawned,
  so no agent, render or catalog CLI inherits them, whichever env builder
  that spawn uses.
- **Where the secret comes from.** The runner's environment first (the
  desktop shell and the macOS app hand it the web's). A runner started
  without one (`npm run dev:up` hands its pane the catalog's variables, not
  `apps/web/.env.local`) asks `scripts/lib/dev-env.mjs` once, the helper
  `scripts/dev.sh` already uses: it reads the app's files with Next's own
  loader as `next dev` does, and resolves the catalog file the app opens. The
  runner keeps the secret and opens that same file, so it reads the rows the
  web wrote with the secret the web sealed them under.
- **Without it, BYOK is off and says why.** No `AUTH_SECRET` (or one too
  short), or no catalog file, is `byokKeys: { ok: false, problem }` in the
  runner's `/api/health` and the `error` of `GET /api/settings/byok`, which
  the Settings card prints. A BYOK chat is refused with that sentence;
  Claude and Codex chats, which never used these keys, run as before. The
  runner never creates a catalog file that is not there.
- **One more process opens the catalog.** The runner reached the catalog only
  through its CLI before; this one read is in-process, because a CLI verb
  that printed opened keys would be one any shell could call.

## Threat model

What each kind of attacker gets.

| The attacker has | They get | They do not get |
| --- | --- | --- |
| A database dump alone (a backup, flip day's `pg_dump`, a leaked replica, a read-only SQL injection) | Which providers each owner saved a key for, the last four characters, the dates | Any key. AES-256-GCM under a 256-bit key derived from a secret that is not in the database |
| Write access to the database alone | The power to delete or corrupt rows, which reads as "re-enter this key" | A key, or the use of one owner's key for another (D7), or a key of their own choosing slipped in (they cannot seal one) |
| The environment alone (`AUTH_SECRET`, as in a leaked Vercel variable or `.env.local`) | A forged session, so the use of the owner's keys through the tutor and Test, bounded by the rate limits; and the server's fallback keys, which sit in the environment in the clear as they always have | The stored keys. The app never returns one, and without the database there is no ciphertext |
| Write access to the environment (a Vercel project member, a tampered `.env.local`) | Every owner's decrypted key, on their next tutor turn: setting `NVIDIA_BASE_URL`, `GEMINI_BASE_URL` or `OPENROUTER_BASE_URL` to a host of their own makes the server send each saved key there as the `Authorization` header | Nothing, beyond what the next rows grant. **Accepted while there is one owner**, who is also the only person who can write the environment. **Revisit before accounts arrive**, for example by pinning the base URLs used with saved keys to the providers' own hosts, so an operator's environment cannot redirect an owner's key |
| Both the database and the environment | Every stored key, decrypted | Nothing more to protect. This is where the keys were before this change, when they sat in `.env` in the clear |
| Code running on the server | Every key it touches, in memory | Out of scope: no design that lets the server call a provider can hide the key from the server |
| Script running in the Settings page (an XSS) | A key while it is being typed, and the use of saved keys through Test | A saved key: no response carries one |
| A copy of the checkout or of `STUDIO_HOME` (a backup, the homeserver copy, any agent session working in the repository) | Which providers Studio uses and their models, from `byok-settings.json` | Any key: the runner keeps none (D12). A checkout that also holds `apps/web/.env.local` carries `AUTH_SECRET`, which is the environment row above, and still no ciphertext unless the catalog file is copied too |
| A studio agent (a planner, diagram or video job, a BYOK turn) | A BYOK turn's own key, in its environment, which is what it runs on | `AUTH_SECRET` or any other saved key: the runner takes its secrets out of its environment before it spawns anything (D12) |

So the design moves the keys from "anyone with the environment" to "anyone
with the environment and the database". Keep the two apart: a database
backup should never be stored beside `AUTH_SECRET`. (The nightly export holds
no keys at all, D11.)

Things that could leak a key, and what stops each:

- **Logs.** Nothing logs a key or a driver error's message. A drizzle error's
  message is the failed SQL with its bind parameters, which on a write is the
  ciphertext and `last4`, so the new routes and store log only a code
  (`failureCode` in `store.ts`), and do not go through `handler`, whose
  failure path logs the message.
- **A provider quoting the key back.** Provider errors reach the browser in
  the tutor's `attempts` and in a Test result. `redactSecrets` in
  `packages/tutor/src/redact.ts` removes the whole key and any word
  sharing six characters in a row with it, which covers masked echoes such as
  `sk-or-v1-ab***yz`.
- **The exports.** D11.
- **The client bundle.** `store.ts`, `settings.ts` and `credentials.ts`
  import `server-only`, so a client component reaching them fails the build.
  The seal itself is `@gnosia/tutor/server/seal`, which only those modules and
  the two key routes import. The Settings card is handed `ProviderKeyView` rows: a
  provider, the last four characters, a date and two booleans.
- **Responses.** Every answer from the two routes is `Cache-Control:
  no-store` and carries at most the last four characters. The route tests
  check every answer against the key and against the stored ciphertext, nonce
  and tag in hex and base64.

## Rotation

**Rotating `AUTH_SECRET`** signs every browser out (docs/DEPLOYMENT.md,
"Signing in") and makes every stored key unreadable. Settings then shows each
one as "Your saved key can no longer be read ... Re-enter this key", and until
it is re-entered the tutor uses the server's key for that provider, if there
is one. Nothing re-encrypts the rows, since that would need the old secret
beside the new one; re-entering a key is the whole procedure. Rotate the
secret after any suspected leak of the environment, and rotate the provider
keys at the provider as well if the database may have leaked with it.

**Introducing a dedicated secret** later: add version 2 to `deriveKey` in
`packages/tutor/src/server/seal.ts`, deriving from the new variable, and make `sealKey` write version 2.
Rows still at version 1 keep opening while `AUTH_SECRET` is unchanged, and
each moves to version 2 when its key is next saved. No migration.

**Rotating a provider key** is Replace in Settings, then Test.

**The studio runner** opens the same rows for a BYOK turn (D12), so it needs
the same `AUTH_SECRET` too: rotating it turns every Studio provider into
"no key" until each key is re-entered in Settings, and the runner needs a
restart to pick up a new value.

**The macOS app's sidecar** (`services/sidecar`) opens and seals the same rows,
so it needs the same `AUTH_SECRET`. It reads the environment the web reads, in
the web's order: what the process exports, then `$GNOSIA_HOME/.env`, then
`apps/web/.env.local` and its siblings through Next's own loader
(`services/sidecar/src/env.ts`). Its `/api/health` answers `secret: false`
when it has none, and the app's Settings says so.

## Out of scope

- Accounts beyond the one owner. The table and every function take the owner,
  so a second account needs nothing here, but `currentOwner()` still answers
  `local` for every signed-in request.
- A key management service or hardware module. The derivation seam
  (`key_version`) is where one would go.
- Re-encrypting stored keys when `AUTH_SECRET` rotates.
- A log of which key paid for which turn, and per-owner spend caps.
- Choosing the base URL of a built-in provider per owner. Its base URL still
  comes from the environment (`<PROVIDER>_BASE_URL`), so an owner's key for
  it cannot point the server at a host of their choosing. A provider the
  owner adds themselves (TUTOR-MODELS.md, T14) has the base URL they type,
  `https://` or loopback `http://`, and is sent only their key for that
  provider, never a built-in provider's key or a server key. The other side of that is the
  environment-write row of the threat model: whoever sets the base URL
  receives the saved keys, which must be closed before a second account
  exists. The model is the owner's to choose since the model chain
  ([TUTOR-MODELS.md](TUTOR-MODELS.md)), which chooses among these same
  providers and their configured base URLs.
