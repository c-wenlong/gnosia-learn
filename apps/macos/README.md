# Gnosia

The native macOS reader for the self-learn catalog: the library surface of
`apps/web` reimplemented as a real SwiftUI app, not a webview. A work in
progress — v1 is the video library.

## Build and run

```sh
cd apps/macos
swift build          # the gate; headless, no Xcode project needed
swift run Gnosia     # opens the window (runs unbundled)
```

macOS 14+, Swift 6 toolchain. There are no external SPM dependencies: the app
links the SDK's libsqlite3 through a module map (`Sources/CSQLite3`), and uses
only Foundation, SwiftUI, AVKit/AVFoundation, PDFKit and ImageIO.

## Where the data comes from

The app never talks to Postgres. It opens one SQLite file, read-only, written
by the snapshot script:

```sh
# from the repo root
npm install                        # once, puts better-sqlite3 + pg in place
node apps/macos/scripts/catalog-snapshot.mjs
# or: npm run snapshot --workspace @self-learn/gnosia
```

`catalog-snapshot.mjs` reads the same Postgres every catalog command reads —
`DATABASE_URL`, then `services/catalog/.env`, then
`postgres://localhost:5432/self_learn` — and mirrors the parts the app draws
into `$SELF_LEARN_HOME/catalog.db` (`~/.self-learn/catalog.db` by default).
Re-run it whenever the catalog moves; the file is disposable.

Where the app looks for the file, in order:

1. `GNOSIA_CATALOG` (environment)
2. The Settings pane's "Catalog SQLite file" field (⌘,)
3. `$SELF_LEARN_HOME/catalog.db`
4. `~/.self-learn/catalog.db`

Blobs are found the same way the blob store lays them out:
`$GNOSIA_BLOBS` or `$SELF_LEARN_HOME/blobs` or `~/.self-learn/blobs`, plus the
asset's `blob_key` (`local/<sha256>.<ext>`) as the path under it.

### The mirrored schema

`user_version = 1`. Timestamps are `REAL` seconds since 1970-01-01 UTC.
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
stays in `Sources/Gnosia/CatalogStore.swift` so the Postgres-to-SQLite
migration can match the schema above (or replace the transport entirely)
without touching the views.
