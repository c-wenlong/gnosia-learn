# Gnosia

The native macOS app for gnosia: the web app's surfaces reimplemented in
SwiftUI, not a webview. It reads a mirror of the catalog, keeps the
learner's own writes in a local file, and mirrors those writes into the
catalog through the sidecar. A work in progress; the web app is the
reference for every rule it shares.

## Build and run

```sh
cd apps/macos
swift build          # the gate; headless, no Xcode project needed
swift run Gnosia     # opens the window (runs unbundled)
swift test           # GnosiaTests: the session arithmetic, learner.db writes and the data contracts
```

To look at the screens without running the app, draw them to PNGs:

```sh
# from the repo root
node apps/macos/scripts/ui-snapshots.mjs [--out DIR]
```

It builds a catalog from `seed/` (with a few answers recorded so the map,
Home and Review have state), mirrors it, and runs the `UISnapshots` suite
(`Tests/GnosiaTests/UISnapshotTests.swift`), which draws Home, the shell,
Learn, the Library, a concept with its tutor's check cards, a session with
"How sure are you?", Review, a course and a module, the Studio home and a
conversation with a consent card and a planner picture, and Settings, at
1280x800 in light and dark. The PNGs go to `DIR`, else
`GNOSIA_SNAPSHOT_DIR`, else `<OS temp>/gnosia-ui-snapshots`, never into the
repository. Nothing touches `~/.gnosia` or a running studio: the studio's
and the sidecar's routes are answered from fixtures. A screen is drawn in
an off-screen window rather than with `ImageRenderer`, which runs none of a
view's `.task` work; `home-imagerenderer.png` is written beside the rest to
show what it gives. Note bodies and chat bubbles are WKWebViews and draw
their plain-text stand-in.

macOS 14+, Swift 6 toolchain. There are no external SPM dependencies: the app
links the SDK's libsqlite3 through a module map (`Sources/CSQLite3`), and uses
only Foundation, SwiftUI, AVKit/AVFoundation, PDFKit and ImageIO.

## Where the data comes from

Three paths, each one way:

| Path | What | Where |
| --- | --- | --- |
| Read | Courses, topics, concepts, assets, sessions and the learner's catalog rows, mirrored by the snapshot script and opened read-only | `<data home>/app-catalog.db`, `CatalogStore.swift` |
| Local write | Every learner write the app makes (answers, review grades, favourites, playback, progress, notes, names, visits), so it shows at once and survives an outage | `<data home>/learner.db`, `LearnerStore.swift` |
| Mirror | Each local write sent to the catalog through the sidecar's web routes, queued and retried until it lands. An answer's or review grade's reply carries what the catalog recorded and the mastery and review rows it moved, which replace the app's own estimate | `services/sidecar`, `SidecarManager.swift`, `SidecarClient.swift`, `LearnerStore.applyRecorded` |

The sidecar is a loopback service the app spawns (`npx tsx
services/sidecar/src/index.ts`): the tutor (chat, session questions) and
the learner writes run the web's own code there, so Swift never
reimplements a route. The studio surface talks to `services/studio`; the
app starts that runner, detached, only when asked from the studio screen.

The catalog itself is one SQLite file (`CATALOG_DB`, else `DATABASE_URL`,
else `$GNOSIA_HOME/catalog.db`), but the app does not open it directly: the
live schema stores instants as millisecond integers and carries tables the
app never draws, so the app reads a smaller mirror of it, written by the
snapshot script. The app runs the script itself on launch and when it comes
to the front (`--if-stale`, so it writes only when the mirror is behind);
by hand:

```sh
# from the repo root
npm install                        # once, puts better-sqlite3 in place
node apps/macos/scripts/catalog-snapshot.mjs
# or: npm run snapshot --workspace @gnosia/macos
```

`catalog-snapshot.mjs` resolves the source the way every catalog command
does — `CATALOG_DB`, then `services/catalog/.env`'s `DATABASE_URL` — and
mirrors the parts the app draws into `<data home>/app-catalog.db` (not
`catalog.db`: the live database owns that name, and the script refuses to
snapshot a file onto itself).
The file is disposable. The app and the desktop shell take the
environment they hand the script, the studio runner and the sidecar from
one resolver, `services/sidecar/src/child-env.ts`, so all of them open the
same catalog file.

Where the app looks for the mirror, in order:

1. `GNOSIA_CATALOG` (environment)
2. The Settings pane's "Catalog SQLite file" field (⌘,)
3. `$GNOSIA_HOME/app-catalog.db` (then `~/.gnosia`)

Blobs are found the same way the blob store lays them out:
`$GNOSIA_BLOBS` or `<data home>/blobs`, plus the
asset's `blob_key` (`local/<sha256>.<ext>`) as the path under it.

### The mirrored schema

`user_version = 5` (`SCHEMA_VERSION` in the script, which is the source
for the full table list; below is the asset half). Timestamps are `REAL` seconds since 1970-01-01 UTC —
the live schema's millisecond integers divided by 1000.0 at snapshot time.
`asset.generated_by` is the one computed column (`manimkc` / `remotionkc` /
`revideokc` / `blenderkc` / `video` / `other`, from the id's prefix after
unwrapping `pdf:` / `poster:`); the app computes the same rule itself when
the column is absent.

```
asset            (id, kind, title, path, url, content_hash, inputs_hash,
                  bytes, source_repo, blob_key, resource_type,
                  generated_by, created_at, updated_at)
asset_derivation (asset_id, source_asset_id)
asset_topic      (asset_id, topic_slug)
asset_concept    (asset_id, concept_slug)
topic            (slug, title, domain, summary, position, archived_at)
concept          (slug, title, summary, topic_slug, path, domain, body,
                  topic_position, archived_at)
snapshot_meta    (key, value)     -- generator, schema_version, taken_at, ...
```

## What works today

- Home, Learn (the map and the board), Review, Courses (modules, lessons,
  progress ticks and notes, the week check), the Library (videos, PDFs,
  links, favourites, names), the Studio and Ask, in one sidebar.
- The concept tutor's chat, with the tutor's choice and recall checks drawn
  as cards, and the session page's steps with confidence. An answer's p(L)
  move and next review are the app's estimate, marked "not yet recorded",
  until the catalog's reply lands; from then on they are the catalog's.
- Video playback from the blob store, resuming where the web or the app
  last stopped; only the stretches actually played count as watched.
- Settings: the catalog mirror's path and its last refresh, provider keys
  and the tutor's model chain (through the sidecar).

Writes reach the catalog only through the sidecar. The mirror is opened
`SQLITE_OPEN_READONLY`, and the app never writes to the blob store.

## Later

Day and conversation groupings, search across sidecar contents, and the
consent card's note for a kind the runner cannot make right now. The read
model stays in `Sources/Gnosia/CatalogStore.swift`, so the mirrored schema
stays the only storage the views read.
