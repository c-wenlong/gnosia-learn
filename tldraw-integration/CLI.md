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
| page load | The page opens and the bridge answers `ping` with no failed network requests |
| fonts | `shot` on a one-box fixture renders with tldraw's draw font (checked by comparing to a known-good hash range, or simply by "no failed font requests") |
| write access | A temp file can be written and renamed in the cwd |

### `new <file.tldr>`

Creates an empty document. Refuses to overwrite. `--from <other.tldr>`
copies a starting point. Prints the path.

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
  "file": "learn/assets/attention.tldr",
  "result": { "created": ["shape:q", "shape:k", "shape:v"] },
  "shapeCount": 7,
  "lints": [],
  "shot": "out/attention.png",
  "svg": null,
  "ms": 1840
}
```

`result` is whatever the snippet returned, JSON-serialised. A snippet that
throws is rolled back, the file is left as it was, and the command exits 2
with the error and the offending line on stderr.

### `shot <file.tldr> [-o <out.png>] [--ids a,b,c]`

Screenshot without running anything. Without `-o` the PNG goes to the
system temp directory as `tldrawkc-<basename>-<timestamp>.png` and the path
is printed; it never lands next to the source, because PNGs are for looking
at, not committing. `--ids` frames only those shapes.

### `inspect <file.tldr>`

Prints what is on the canvas, for the agent to read before editing. Human
mode prints one line per shape; `--json` prints the bridge's `inspect()`
structure exactly as defined in [ARCHITECTURE.md](ARCHITECTURE.md). Exits 3
when lints are present, like `run`.

### `export <file.tldr> (--svg <out.svg> | --png <out.png>) [--ids ...]`

The final export step. `--svg` is what gets committed next to notes;
`--png` is `shot` under a name that reads as intentional.

### `from-mermaid <file.tldr> --source <diagram.mmd> [--append] [--shot <out.png>]`

Builds a document from a mermaid `flowchart` or `graph` definition
(`TD`, `TB`, `LR`, `RL`, `BT`), using bound arrows and a simple layered
layout. Without `--append` the file must not already exist. Node shapes map
to tldraw geo shapes: `[text]` rectangle, `(text)` rounded rectangle,
`{text}` diamond, `([text])` oval, `((text))` ellipse. Edge labels become arrow
labels. Subgraphs become `helpers.boxShapes` containers. Anything the parser
does not understand is reported, not silently dropped.

The point of this command is migration: every diagram this repo has today
is mermaid, and the agent should be able to lift one onto the canvas and
then fix it by hand.

### `serve <file.tldr> [--port <n>] [--no-open]`

Starts the mirror page and opens it in the default browser. Default port is
`DEFAULT_SERVE_PORT` (7240), falling back to a free one if taken; the URL
is printed either way. Keeps running until SIGINT. See "Serve mode" in [ARCHITECTURE.md](ARCHITECTURE.md).

### `api`

Prints the helper reference from [HELPERS.md](HELPERS.md) with one usage
line per function, generated from JSDoc in `src/page/helpers/`, so the docs
and the code cannot drift. `manimkc api` does the same job for the same
reason.

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
