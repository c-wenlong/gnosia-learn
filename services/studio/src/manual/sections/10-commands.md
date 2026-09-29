## The commands you have

Every call is spelled exactly `npm run --silent canvas -- <verb> ...`, from the
repository root, which is your working directory. `--silent` is not optional:
without it npm prints a two-line banner on stdout before the tool writes
anything, and `--json` output cannot be parsed. This is the only shell command
you are allowed, and only as that one command: no pipe, `;`, `&&`, redirect or
`$( )`, and every file you name is an absolute path to your document, its SVG, or
a file in your scratch directory. Put a title holding `$` in single quotes
(`--title 'Save $50'`). Anything else is refused before it runs.
`cat`, `head`, `tail`, `ls`, `cp`, `grep` and every other command are refused.
Read files with the Read tool, find them with Glob, and write snippets with Write
or Edit. To start a snippet from an earlier one, Read it and Write the new file;
there is no `cp`.

| Verb | What it is for |
| --- | --- |
| `new <doc> --title "<title>" --topic <slug> --concept <slug>` | Create the empty document with its metadata. `--concept` repeats, once per concept. Refuses (exit 1) if the file exists, so never run it on an extend job |
| `run <doc> --code <scratch>/pass1.js --shot <scratch>/pass1.png` | Run a snippet against the document, save it, and screenshot the page. `--eval '<source>'` is the inline form for a one-liner: in single quotes anything but a single quote is literal, and in double quotes `$`, backtick and backslash are refused. Add `--json` to get the lints as data |
| `shot <doc> -o <scratch>/look.png` | Screenshot without running anything |
| `inspect <doc> --json` | Every shape with its bounds and text, every binding, every lint, and the document's metadata. It never writes. Run it first on an extend job, and last before exporting |
| `export <doc> --svg <svg>` | Write the SVG. `--svg` takes the output path as its value: `export <doc> --svg` alone fails with "argument missing". It never writes the document |
| `verify <svg> -o <scratch>/verify.png` | Render the exported SVG the way a reader's browser would, run four checks, and write a PNG you can Read |
| `api` | Print the helper reference. You do not need it: the same listing, with options, is below |

`from-mermaid <doc> --source <file>` lifts a flowchart onto the canvas. Use it
only when the user message says a flowchart was supplied, and only at the path
it names. It creates the document and refuses one that exists (add `--append`
to add to it), so on a new job it comes **instead of** `new`, followed by
`meta set <doc> --title "<title>" --topic <slug> --concept <slug>`, which
stamps the metadata without a browser. Useful options on the verbs that draw: `--json`
(one JSON object on stdout), `--page <name>` (work on a named page, default the
first), `--timeout <ms>` (the snippet's time limit, default 30000).
