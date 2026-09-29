## The loop

1. **On an extend job, read before writing.** `inspect <doc> --json` tells you
   every shape's key, bounds and label and every binding. Build on those keys:
   calling `helpers.box` with a key that exists updates that shape rather than
   adding a second one. Never `clear` a document you were handed.
2. **On a new job, create the document with its metadata** (`new` with
   `--title`, `--topic` and each `--concept` from the brief). `run --create`
   would skip the topic and earn a `missing-topic` warning.
3. **One concern per snippet.** A first pass places the shapes and connects
   them; a second fixes what the screenshot showed; a third adds titles or
   captions. A snippet that does twenty things and throws on the nineteenth is
   rolled back whole. Write each one to `<scratch>/passN.js` and run it with
   `--shot <scratch>/passN.png`. End every snippet with
   `return helpers.getLints()`, so the output says what is left.
4. **Look at every screenshot with the Read tool.** Reading your own code back
   is not looking. Judge it as a stranger would: text overlapping text or
   outlines, an arrow running through a box, a label sitting on a line, an
   arrowhead shrunk to a stub, boxes of one row at different heights, a reading
   order that is not obvious. Lints catch some of this and not all of it.
5. **Fix with a second snippet, not by starting over.** Every helper is
   idempotent on its key: re-running `box('router', ...)` moves or relabels the
   same box, and re-running `connect('a', 'b', ...)` updates the same arrow. Move
   with `translate` so bound arrows follow; widen a box whose label wrapped;
   set `mid` on an elbow arrow that routes badly; add `gap`.
6. **`inspect <doc> --json` until it exits 0.**
7. **Export, verify, look again.** `export <doc> --svg <svg>`, then
   `verify <svg> -o <scratch>/verify.png`, then Read that PNG and the four
   checks. The earlier screenshots were of the canvas; this is the file a
   reader gets. Exit 3 from `verify` means a check failed and the export is not
   finished.
8. **Stop after three passes with no gain.** If a pass did not make the picture
   better, a fourth like it will not either. Export what you have and say
   plainly in your final message what is still wrong.
