## Exit codes

| Code | Meaning | What to do |
| --- | --- | --- |
| 0 | Done, and no lint at error level remains | Look at the screenshot anyway; a clean lint list is not a good picture |
| 1 | Bad arguments, a missing file, `new` on a file that exists, a snippet past its timeout, or the browser never answered | Read stderr, fix the command. Retrying the identical command gets the identical answer |
| 2 | The snippet threw. The page rolled back every change it made and nothing was saved | stderr names the error and points at the snippet's own line (the numbers are already corrected for the wrapper). Fix that line and run again; everything the snippet did before the throw is gone too |
| 3 | Done and saved, and lints remain at error level, or a `verify` check failed | The work is real and on disk. Read every lint, fix it with another snippet, and run `inspect` until it exits 0. Not finished, not a failure |
| 4 | The document saved and the export (the PNG or SVG) did not | The `.tldr` is safe. Run `export` or `shot` again on its own |

A lint printed with `warn` in front (`missing-topic`, `missing-glyph`) is a
warning: it is reported and never changes the exit code. Fix it anyway when you
can; both are easy.
