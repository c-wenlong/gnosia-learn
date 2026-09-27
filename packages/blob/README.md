# @self-learn/blob

One interface for every place the catalog keeps bytes: videos, their posters and
sidecars, diagram SVGs. Postgres holds a `blob_object` row per object (its key,
size, hash and type); this package holds the bytes. It is step 0.4 of
[docs/CONTENT-MIGRATION.md](../../docs/CONTENT-MIGRATION.md#04-the-blob-store),
and decisions D5, D7 and D8 there say why the bytes live outside Postgres.

It connects to nothing and imports nothing of ours. Today it has one adapter,
`fsStore`, because the owner decided on 2026-09-27 that everything stays local
until the app goes live.

## The key scheme

```
<owner_id>/<sha256>.<ext>        local/9f86d0...0a08.mp4
```

Build keys with `key(ownerId, sha256, ext)` and never by hand. Every method
refuses any other shape with `BlobKeyError`.

- **Content addressed.** The key is the hash of the bytes, and `put` refuses
  bytes that do not hash to it. A row can therefore never point at the wrong
  bytes, an interrupted upload resumes by putting the same key again, and an
  old revision's SVG stays where it was.
- **Prefixed by owner**, so one tenant's objects can be listed, counted,
  capped and deleted with `list("<owner_id>/")` (D3, D5).
- **Lowercase throughout.** macOS's default filesystem ignores case and S3 and
  R2 do not, so a key that could differ only in case would be one file on the
  laptop and two objects in the cloud. The hash and extension are folded; an
  owner id with capitals is refused, since folding it could merge two owners.
- **Exactly two segments.** A key becomes a path in the `fs` adapter, so `..`,
  a leading `/` and a third segment are refused by the parser, not by each
  adapter.

## The contract

```ts
interface BlobStore {
  readonly provider: "fs" | "vercel-blob" | "r2";
  put(key: string, body: Readable, meta: { sha256: string; bytes: number; mime: string }): Promise<void>;
  head(key: string): Promise<{ bytes: number; sha256?: string } | null>;
  get(key: string, range?: { start: number; end: number }): Promise<Readable>;
  signedUrl(key: string, ttlSeconds: number): Promise<string | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): AsyncIterable<{ key: string; bytes: number; uploadedAt: Date }>;
}
```

| Method | Promise |
| --- | --- |
| `put` | Stores the body or stores nothing. The stream is hashed and counted as it arrives; a hash or length that differs from `meta`, or a `meta.sha256` that differs from the key, rejects with `BlobIntegrityError`, and a body that overruns `meta.bytes` is refused there instead of being read to the end. The object appears to `head`, `get` and `list` all at once. Putting an existing key succeeds. `put` owns the body and destroys it on any refusal |
| `head` | `null` when absent. `sha256`, when present, is what the store measured, never the key repeated back |
| `get` | Rejects with `BlobNotFoundError` before returning a stream. A range is inclusive at both ends; an `end` past the object is clamped; a `start` at or past the end, or a malformed pair, is `BlobRangeError` (HTTP's 416) |
| `signedUrl` | A URL that serves the bytes and honours `Range`, or `null`, meaning the caller streams through `get` |
| `delete` | Idempotent |
| `list` | Every key starting with the prefix, as a plain string prefix the way S3 lists, with its size and upload time (the orphan sweep in edge case 9 spares anything under a day old). Order unspecified; an in-flight `put` is never listed |

Two additions to the interface drawn in 0.4: `list`, which tenancy needs, and
`provider`, so the upload command can fill `blob_object.provider` from the
store it was handed rather than from a second setting that could disagree.

Every refusal is a `BlobError` with a stable `code` (`BLOB_KEY`,
`BLOB_INTEGRITY`, `BLOB_NOT_FOUND`, `BLOB_RANGE`, `BLOB_ROOT`, and the `fs`
adapter's `BLOB_LINK`).

## The `fs` adapter

`fsStore(root?)` keeps objects at `<root>/<owner_id>/<sha256>.<ext>`. The root
defaults to `$SELF_LEARN_HOME/blobs`, or `~/.self-learn/blobs` when that is
unset. A leading `~` is expanded and a relative value is refused.

- **Never inside the repository.** Moving the manimkc submodule on 2026-09-13
  deleted 25 rendered videos, because git does not carry gitignored files
  across a move. `fsStore` refuses a root inside any self-learn checkout,
  symlinks resolved, and says which.
- **No link under the root is followed.** An owner directory, `.tmp/` or an
  object that is a symlink would carry a write, read or delete somewhere the
  root check never saw, and `list` would not show it. Each is refused with
  `BLOB_LINK`, so what the store touches and what it lists are the same set.
  Objects are opened with `O_NOFOLLOW`, which Windows lacks, so `fsStore`
  refuses to start there; the repo runs on macOS and Linux.
- **Atomic writes.** A put streams into `<root>/.tmp/<uuid>.part`, flushed to
  disk, and is renamed into place only after the hash and length check. A
  refused put removes its temp file and never creates the owner directory.
  Anything left in `.tmp/` is a write a crash interrupted, and is safe to
  delete while no upload is running.
- **`head` hashes the file on every call.** The key's hash and a sidecar file
  are both the caller's claim written down; the callers of `head` (the upload
  confirming what it wrote, `catalog blob audit` looking for a missing or
  damaged object) are asking whether the bytes on disk are intact, and only
  reading them answers that. One sequential read of the largest video (37 MB)
  costs tens of milliseconds. A hot path that needs only the size, such as a
  Range request, takes it from the `blob_object` row.
- **`get` reads from an open handle**, so a delete that lands mid-read does not
  cut the stream short.
- **`signedUrl` is always `null`.** The route streams through `get`, reusing the
  Range parsing in `apps/web/src/lib/asset-files.ts`.
- **`mime` is not stored.** The `blob_object` row holds it, and a file on disk
  has no header to put it in.

## Adding a cloud adapter

Deferred with step 0.1 to go-live: R2 while the project is on Vercel Hobby,
Vercel Blob on Pro (open question 3 in the plan). A Vercel Blob adapter needs a
private store, `@vercel/blob` 2.3 or later and presigned `GET` URLs. Either one
is a file in `src/` and one test file:

```ts
// test/r2.test.ts
import { conformance } from "./conformance";
const token = process.env.R2_TOKEN;
conformance("r2", () => r2Store({ token: token! }), {
  skip: token ? undefined : "no R2_TOKEN set",
});
```

The adapter is done when [test/conformance.ts](test/conformance.ts) passes
against it unchanged. The suite writes under two owner ids unique to each run
and deletes them afterwards, so it can run against a bucket that holds real
data. What it demands that a cloud SDK does not give for free:

- the length and hash checked while streaming, with the upload aborted and
  nothing left behind on a mismatch, including a multipart upload's parts;
- `meta.sha256` checked against the key before anything is sent;
- `head().sha256` left out rather than copied from the key when the provider
  keeps no checksum of its own;
- `BlobNotFoundError` and `BlobRangeError` mapped from the provider's 404 and
  416;
- a signed URL that answers `Range: bytes=10-19` with a 206, because the
  browser's seeks go straight to the store (edge cases 10 and 15);
- `list` paginating to the end, since a provider returns a page at a time.
