# CLI reference (specification)

The command surface the implementing agent should build. Modelled on
`scripts/learn/cli.mjs` in this repo (single `parseArgs` options object,
first positional dispatches, every command takes `--json`) and on
`manimkc/tools/cli/manimkc` (`doctor`, `api`, `new`, `lint`, `preview`,
`build` as the agent-facing verbs).

## Invocation

```
tldrawkc <command> [file] [options]
```

`file` is a path to a `.tldr`. Relative paths resolve from the current
working directory. A missing file is an error for every command except
`new`, `run --create` and `from-mermaid`.

Positional arity is checked, not tolerated. `run`, `shot` and `new` take
exactly one file; `doctor` and `help` take none. A stray positional is a usage
error and exit 1, because it is almost always a quoting mistake
(`--eval helpers.box(...)` without quotes, say) and ignoring it would run
something other than what was typed.

Global options:

| Option | Default | What |
| --- | --- | --- |
| `--json` | off | Print exactly one JSON object on stdout and nothing else. Errors still go to stderr. |
| `--headed` | off | Show the Chromium window while the command runs. Debugging only. |
| `--chromium <path>` | auto | Executable to use. Otherwise `TLDRAWKC_CHROMIUM`, then Playwright's registry, then the Chrome and Chromium apps installed on the machine. |
| `--timeout <ms>` | 30000 | Cap on the `exec` step. |
| `--quiet` | off | Suppress the human summary. |
| `--allow-lints` | off | Turn exit code 3 into 0. For diagrams whose remaining lints are intentional and marked with `meta.lintIgnore`. Applies to `run`, `from-mermaid` and `inspect`. |
| `--page <name>` | first page | Operate on a named page. Applies to `run`, `shot`, `inspect`, `export`. |
| `--padding <px>` | 32 | Export padding around the shapes. Applies to `run`, `shot`, `export`. |
| `--pixel-ratio <n>` | 2 | Export resolution multiplier for PNG. Applies to `run`, `shot`, `export`. |

## Commands

### `doctor`

Checks the environment and prints one line per check. Exit 1 if any check
fails.

| Check | Passes when |
| --- | --- |
| node | `process.versions.node` >= 22 |
| page bundle | `dist/page/index.html` exists and is newer than `src/page/**` (warns, not fails, when stale) |
| chromium | An executable resolves and `--version` runs |
| page load | The page opens and the bridge answers `ping` with no failed network requests and nothing fetched from outside 127.0.0.1. A failed request is a `requestfailed` event or any response with status 400 or worse, because a missing font is a 404 |
| fonts | As built: the check awaits `document.fonts.ready`, then fails when a font request failed, when the bundle holds no font files, or when no `tldraw_*` font family came back loaded, which is what "labels render in a system font" looks like from Node |
| write access | A temp file can be written and renamed in the cwd |

### `new <file.tldr>`

Creates an empty document. Refuses to overwrite. `--from <other.tldr>`
copies a starting point. Prints the path.

It goes through the browser (`load(null)`, then `save()`) rather than writing
a hand-built envelope, so the file carries the schema version and migration
state of the installed tldraw. The write is exclusive, so the refusal to
overwrite holds even when something else creates the file while the page is
starting up.

| Option | What |
| --- | --- |
| `--title <text>` | document metadata: a human title |
| `--topic <slug>` | document metadata: one vocabulary slug |
| `--concept <slug>` | document metadata: a concept slug, repeatable |
| `--source <text>` | document metadata: what prompted this diagram |

The four are optional and independent: a `new` with none of them still draws.
Passing any of them stamps `meta.tldrawkc` on the fresh document the same way
`meta set` would afterwards; see "What a diagram is about" below.

Output (`--json`):

```json
{
  "file": "/home/you/self-learn/learn/assets/attention.tldr",
  "meta": { "kc": 1, "title": "Attention", "topic": "attention-and-transformers",
            "concepts": [], "source": "", "created": "2026-09-13T04:12:08.991Z" },
  "ms": 780
}
```

`meta` is `null` when none of the four flags were given and `--from` did not
copy an existing document with metadata already on it; otherwise it is what
landed on the document record, so a caller does not have to run `inspect`
straight after `new` to find out.

### `run <file.tldr> --code <snippet.js> [--shot <out.png>] [--svg <out.svg>] [--create]`

The main verb. Loads the file, runs the snippet with `editor`, `helpers`
and `tldraw` in scope, saves the file, optionally exports.

| Option | What |
| --- | --- |
| `--code <path>` | Path to a JavaScript file. Also accepts `-` to read stdin, so an agent can heredoc a snippet. |
| `--eval <source>` | Inline source, for one-liners. Mutually exclusive with `--code`. |
| `--shot <out.png>` | Write a PNG of the current page after the snippet, framed to shape bounds. |
| `--svg <out.svg>` | Write an SVG export after the snippet. |
| `--create` | Start from an empty document if the file does not exist. |
| `--no-save` | Run and export but leave the file untouched. For "what would this look like" experiments. |

Output (`--json`):

```json
{
  "file": "/home/you/self-learn/learn/assets/attention.tldr",
  "result": { "created": ["shape:q", "shape:k", "shape:v"] },
  "shapeCount": 7,
  "lints": [],
  "shot": "/home/you/self-learn/out/attention.png",
  "svg": null,
  "ms": 1840
}
```

Every path in `--json` output is the resolved absolute path, never the one
that was typed. An agent's cwd and the reader's are not reliably the same.
The one exception is `api`, whose `path` names a source file rather than a
file the command wrote.

Every verb that exports refuses an export path equal to its own document.
`run --svg map.tldr` would otherwise hand the atomic rename an SVG under the
document's name and destroy the drawing, and the same holds for `--shot`,
`--png`, `shot -o` and `from-mermaid`.

`result` is whatever the snippet returned, JSON-serialised. A snippet that
throws is rolled back, the file is left as it was, and the command exits 2
with the error and the offending line on stderr. The line numbers in that
stack are two higher than the snippet's own, because of the `AsyncFunction`
header; see the `exec` row in [ARCHITECTURE.md](ARCHITECTURE.md).

### `shot <file.tldr> [-o|--output <out.png>] [--ids a,b,c]`

Screenshot without running anything. Without `-o` the PNG goes to the
system temp directory as `tldrawkc-<basename>-<timestamp>.png` and the path
is printed; it never lands next to the source, because PNGs are for looking
at, not committing. `--output` is the long form of `-o`. `--ids` frames only
those shapes.

Output (`--json`):

```json
{
  "file": "/home/you/self-learn/learn/assets/attention.tldr",
  "shot": "/tmp/tldrawkc-attention-2026-09-13T04-12-08-991Z.png",
  "width": 1904,
  "height": 764,
  "bounds": { "x": 60, "y": 60, "w": 920, "h": 350 },
  "ms": 910
}
```

`width` and `height` are the PNG's pixels; `bounds` is the page-space box the
shapes occupy.

### `inspect <file.tldr>`

Prints what is on the canvas, for the agent to read before editing. Human
mode prints one line per shape; `--json` prints the bridge's `inspect()`
structure exactly as defined in [ARCHITECTURE.md](ARCHITECTURE.md), with
`bounds` set to `null` on an empty page, since there is no union of no
shapes. The structure carries a `meta` key alongside `shapes`, `bindings` and
`lints`: the document metadata described under "What a diagram is about"
below, or `null` when the document has none. Exits 3 when lints are present,
like `run`. It loads and reads and never writes the file: a read that
rewrites what it read is a trap.

### `export <file.tldr> (--svg <out.svg> | --png <out.png>) [--ids ...]`

The final export step. `--svg` is what gets committed next to notes;
`--png` is `shot` under a name that reads as intentional. It loads and
exports and never writes the `.tldr`, so the only thing that can fail is the
export.

Output (`--json`):

```json
{
  "file": "/home/you/self-learn/learn/assets/map.tldr",
  "svg": { "path": "/home/you/self-learn/learn/assets/map.svg", "width": 2322, "height": 2394 },
  "png": null,
  "ms": 611
}
```

`svg` and `png` are each an object or `null`, depending on which was asked
for. `width` and `height` are pixels for the PNG and the SVG's own viewport
for the SVG.

`--svg` stamps the document's metadata onto the file it writes: the title as
a `<title>` element and the topic as `data-kc-topic` on the root `<svg>`. A
document with neither a title nor a topic exports untouched. See "What a
diagram is about" below.

### `from-mermaid <file.tldr> --source <diagram.mmd> [--append] [--shot <out.png>]`

Builds a document from a mermaid `flowchart` or `graph` definition
(`TD`, `TB`, `LR`, `RL`, `BT`), using bound arrows and a simple layered
layout. Without `--append` the file must not already exist. Node shapes map
to tldraw geo shapes: `[text]` rectangle, `(text)` rounded rectangle,
`{text}` diamond, `([text])` oval, `((text))` ellipse. Edge labels become arrow
labels. Subgraphs become `helpers.boxShapes` containers. Anything the parser
does not understand is reported, not silently dropped.

Output (`--json`):

```json
{
  "file": "/home/you/self-learn/learn/assets/map.tldr",
  "nodes": { "mermaidId": "shape:id" },
  "edges": ["shape:arrow:a->b"],
  "containers": ["shape:container:render"],
  "unsupported": ["classDef mastered fill:#dcfce7"],
  "shapeCount": 102,
  "lints": [],
  "shot": "/home/you/out/map.png",
  "ms": 921
}
```

Without `--append` the file is claimed with an exclusive write, not merely
checked for first. The early existence check is only there to answer fast,
and it cannot cover a file created while the page was starting up.
Overwriting a canvas someone has since fixed by hand is the one unrecoverable
mistake available here.

A page bundle whose helpers bag has no `mermaid()` is exit **1**, not 2. The
command probes for it before it draws, because the bridge's own capability
check cannot see one level down into the bag, and without the probe a stale
build fails inside the snippet as `helpers.mermaid is not a function`, which
reads like the diagram's fault.

The point of this command is migration: every diagram this repo has today
is mermaid, and the agent should be able to lift one onto the canvas and
then fix it by hand.

### What a diagram is about

`new` and `meta set` can stamp a small versioned object on the document
record, under `meta.tldrawkc`:

```json
{ "kc": 1,
  "title": "A vector as a list of numbers",
  "topic": "vector-and-linear-algebra-basics",
  "concepts": ["vector-as-a-list-of-numbers"],
  "source": "learn/concepts/linear-algebra/vector-as-a-list-of-numbers.md",
  "created": "2026-09-13T10:00:00.000Z" }
```

`topic` is one slug from whatever vocabulary the host repo keeps (in
self-learn, `content/topics.yaml`); `concepts` are concept ids under it.
`source` is free text, not a checked path: a session id, a note path,
whatever prompted the diagram. `kc` is the schema version this build writes;
a reader keeps a version it does not recognise, a writer refuses one, so an
older `tldrawkc` never folds a patch into a newer object and silently drops
what that version added. Nothing here is required: a document with none of it
still draws, exports and loads, and `meta` reads back `null`.

### `list [dir]`

Every `.tldr` under a directory, no browser. Defaults to `learn/assets`.
Cheap enough to run on every index, which running a browser per file would
not be.

Human mode is a table, topic first:

```
topic                            shapes  svg  path
vector-and-linear-algebra-basics     43  yes  vector-as-a-list-of-numbers.tldr
(none)                               12  no   scratch.tldr
2 diagrams, 1 with a topic, 0 unreadable
```

Output (`--json`):

```json
{
  "dir": "/home/you/self-learn/learn/assets",
  "diagrams": [
    {
      "path": "/home/you/self-learn/learn/assets/vector-as-a-list-of-numbers.tldr",
      "relative": "vector-as-a-list-of-numbers.tldr",
      "name": "vector-as-a-list-of-numbers",
      "meta": { "kc": 1, "title": "A vector as a list of numbers",
                "topic": "vector-and-linear-algebra-basics",
                "concepts": ["vector-as-a-list-of-numbers"],
                "source": "learn/concepts/foundations/vector-as-a-list-of-numbers.md",
                "created": "2026-09-12T23:51:55.236Z" },
      "shapes": 43,
      "svg": { "path": "/home/you/self-learn/learn/assets/vector-as-a-list-of-numbers.svg", "exists": true },
      "png": { "path": "/home/you/self-learn/learn/assets/vector-as-a-list-of-numbers.png", "exists": false },
      "modified": "2026-09-12T23:51:55.237Z"
    }
  ],
  "errors": [],
  "ms": 1
}
```

Sorted by path. `meta` is `null` for a diagram that carries none. A `.tldr`
that will not parse goes in `errors` with its path and a message, never
thrown past: one corrupt file in a directory of thirty should not cost the
answer for the other twenty-nine.

### `meta set <file.tldr> [--title <text>] [--topic <slug>] [--concept <slug>] [--source <text>]`

Backfills metadata on an existing document with no browser: for the diagrams
drawn before this command existed, and for scripted bulk edits where opening
Chromium once per file would be the slow part. At least one flag is required;
`meta set` with none is a usage error rather than a no-op that looks like it
worked.

Idempotent: `created` is written once and preserved on every later call, so
an identical second call reports `changed: false` and leaves the file's bytes
untouched.

Output (`--json`):

```json
{
  "file": "/home/you/self-learn/learn/assets/vector-as-a-list-of-numbers.tldr",
  "meta": { "kc": 1, "title": "A vector as a list of numbers",
            "topic": "vector-and-linear-algebra-basics",
            "concepts": ["vector-as-a-list-of-numbers"],
            "source": "learn/concepts/foundations/vector-as-a-list-of-numbers.md",
            "created": "2026-09-12T23:51:55.236Z" },
  "changed": false,
  "ms": 1
}
```

The human summary is `wrote <file>` or `unchanged <file>`, then one line of
the metadata as written.

### `serve <file.tldr> [--port <n>] [--no-open]`

Starts the mirror page and opens it in the default browser. Default port is
`DEFAULT_SERVE_PORT` (7240), falling back to a free one if taken; the URL
is printed either way. Keeps running until SIGINT. See "Serve mode" in [ARCHITECTURE.md](ARCHITECTURE.md).

### `api`

Prints the helper reference with one usage line per function, generated from
JSDoc so the docs and the code cannot drift. `manimkc api` does the same job
for the same reason.

The extraction reads exactly one file, `src/page/helpers/index.ts`, as text at
build time, and `npm run build:api` writes the result to `dist/api.json`,
which the command prints. That file is where the bag is assembled, so the
reference is the bag and cannot list a helper a snippet could not call.
Reading the page's sources from Node is fine; importing them would break
layering rule 1, which is why `src/lib/api.ts` is a parser.

An entry appears when three things hold: the `/** ... */` block sits directly
above the declaration with no blank line between them, the declaration is a
named function or an interface method signature, and the block carries an
`@example`. Without an example the entry is dropped, because the point of the
reference is a line an agent can copy.

Output (`--json`) is a bare array, not an object:

```json
[
  {
    "name": "connect",
    "kind": "function",
    "path": "src/page/helpers/index.ts",
    "signature": "connect(fromKey, toKey, opts = {})",
    "summary": "Draw a bound arrow between two shapes and return its id.",
    "examples": ["helpers.connect('agent', 'page', { label: 'exec' })"],
    "params": ["fromKey the shape the arrow leaves"]
  }
]
```

`path` is relative to the package root, and it is the one exception to D19.
Every other path under `--json` names a file the command wrote, where the
reader's cwd is unknown; this one names a source file inside the tool's own
checkout, and relative is the form that stays true across checkouts.

### `help`

Usage for every command.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done, no lints |
| 1 | Bad arguments, missing file, environment failure (`doctor` failed) |
| 2 | The snippet threw. Nothing was written. |
| 3 | Done and saved, but lints remain. The agent should read them and run again. |
| 4 | Export failed after a successful save (the `.tldr` is safe, the PNG or SVG is not) |

`3` is deliberate: the file is saved because the work is real, but the
non-zero code stops an agent from declaring the diagram finished. Pass
`--allow-lints` to turn it into 0 for intentionally decorative arrows,
paired with `meta.lintIgnore` on those shapes.

## Environment variables

| Variable | What |
| --- | --- |
| `TLDRAWKC_CHROMIUM` | Path to a Chromium or Chrome executable |
| `TLDRAWKC_TIMEOUT_MS` | Default for `--timeout` |
| `TLDRAWKC_HEADED` | `1` to default `--headed` on |

## Running it from self-learn

The repo root `package.json` gets one script, mirroring `npm run learn`:

```json
"canvas": "node tldrawkc/dist/cli/index.js"
```

so the skill can say `npm run canvas -- run learn/assets/x.tldr --code
/tmp/x.js --shot /tmp/x.png`. The shim at `tldrawkc/bin/tldrawkc` covers
running it from inside the submodule or after `npm link`.
