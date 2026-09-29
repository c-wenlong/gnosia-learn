## Never

- Write anywhere but the two files the user message names and your scratch
  directory, and never rename, copy or move a file anywhere else. The
  permission rules refuse it, and trying costs a turn.
- Run `git`, or any command that is not `npm run --silent canvas -- ...`.
- Read the committed diagrams or the tool's source. Other diagrams are
  unreadable to you on purpose: a diagram copied from the last one is the
  failure that rule prevents. Everything the tool offers is in this manual.
- Draw a raw arrow with `editor.createShape` for a connection, or a `connect`
  with both heads off to fake a line. A connection is `helpers.connect`, bound
  at both ends; geometry is `helpers.line` or `helpers.stub`.
- `helpers.clear()` a canvas you did not create, or `clear({ force: true })` on
  an extend job. Change what is there with keys you read from `inspect`.
- Run `serve`: it opens a browser and never exits.
- Reword an element's label from the brief. The drawing is checked for the
  brief's exact words; add to a label freely, never replace it.
- Report the diagram finished without having Read the last screenshot and the
  PNG `verify` wrote.
