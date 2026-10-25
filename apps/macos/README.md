# Gnosia

The native macOS reader for the gnosia catalog: the library surface of
`apps/web` reimplemented as a real SwiftUI app, not a webview. A work in
progress — v1 is the video library.

## Build and run

```sh
cd apps/macos
swift build          # the gate; headless, no Xcode project needed
swift run Gnosia     # opens the window (runs unbundled)
swift test           # GnosiaTests: the session arithmetic and learner.db writes
```

macOS 14+, Swift 6 toolchain. There are no external SPM dependencies: the app
links the SDK's libsqlite3 through a module map (`Sources/CSQLite3`), and uses
only Foundation, SwiftUI, AVKit/AVFoundation, PDFKit and ImageIO.

## Where the data comes from

The catalog itself is one SQLite file (`CATALOG_DB`, else `DATABASE_URL`,
else `$GNOSIA_HOME/catalog.db`), but the app does not open it directly: the
live schema stores instants as millisecond integers and carries tables the
app never draws, so the app reads a smaller mirror of it, written by the
snapshot script and opened read-only:

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
Re-run it whenever the catalog moves; the file is disposable.

Where the app looks for the mirror, in order:

1. `GNOSIA_CATALOG` (environment)
2. The Settings pane's "Catalog SQLite file" field (⌘,)
3. `$GNOSIA_HOME/app-catalog.db` (then `~/.gnosia`)

Blobs are found the same way the blob store lays them out:
`$GNOSIA_BLOBS` or `<data home>/blobs`, plus the
asset's `blob_key` (`local/<sha256>.<ext>`) as the path under it.

### The mirrored schema

`user_version = 3`. Timestamps are `REAL` seconds since 1970-01-01 UTC —
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

## What works today (v1)

- Library list of every `kind='video'` asset, grouped by tool or by topic,
  with a search box and poster thumbnails (downsampled via ImageIO).
- Detail pane: AVPlayer playback straight from the blob file, the catalog's
  PDF as a second pane via PDFKit, transcript/chapters/captions presence
  badges, and the row's provenance.
- Read-only: the app opens the database `SQLITE_OPEN_READONLY` and never
  writes to the blob store.

## Later

Notes/concepts/link assets in the list, day/course/conversation groupings,
transcript and chapter display in the player, collections, search across
sidecar contents, and an .app bundle once the surface settles. The read model
stays in `Sources/Gnosia/CatalogStore.swift` so the snapshot's transport —
the mirrored schema above — stays the only storage the views know about.
