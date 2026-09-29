## The commands you have

Every call is spelled exactly `npm run --silent canvas -- <verb> ...`, from the
repository root, which is your working directory. `--silent` is not optional:
without it npm prints a two-line banner on stdout before the tool writes
anything, and `--json` output cannot be parsed. This is the only shell command
you are allowed. `cat`, `head`, `tail`, `ls`, `cp`, `grep` and every other
command are refused. Read files with the Read tool, find them with Glob, and
write snippets with Write or Edit. To start a snippet from an earlier one, Read
it and Write the new file; there is no `cp`.

| Verb | What it is for |
| --- | --- |
| `new <doc> --title "<title>" --topic <slug> --concept <slug>` | Create the empty document with its metadata. `--concept` repeats, once per concept. Refuses (exit 1) if the file exists, so never run it on an extend job |
| `run <doc> --code <scratch>/pass1.js --shot <scratch>/pass1.png` | Run a snippet against the document, save it, and screenshot the page. `--code -` reads the snippet from stdin. `--eval "<source>"` is the inline form for a one-liner. Add `--json` to get the lints as data |
| `shot <doc> -o <scratch>/look.png` | Screenshot without running anything |
| `inspect <doc> --json` | Every shape with its bounds and text, every binding, every lint, and the document's metadata. It never writes. Run it first on an extend job, and last before exporting |
| `export <doc> --svg <svg>` | Write the SVG. `--svg` takes the output path as its value: `export <doc> --svg` alone fails with "argument missing". It never writes the document |
| `verify <svg> -o <scratch>/verify.png` | Render the exported SVG the way a reader's browser would, run four checks, and write a PNG you can Read |
| `api` | Print the helper reference. You do not need it: the same listing, with options, is below |

`from-mermaid <doc> --source <file>` lifts a flowchart onto the canvas. Use it
only when the user message says a flowchart was supplied, and only at the path
it names. `meta set <doc> --topic <slug>` stamps the topic on a document that
lacks one, without a browser. Useful options on the verbs that draw: `--json`
(one JSON object on stdout), `--page <name>` (work on a named page, default the
first), `--timeout <ms>` (the snippet's time limit, default 30000).
