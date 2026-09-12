# How an agent uses it

This is the draft of the skill that will live in the tool repo as
`.claude/skills/tldrawkc-diagram/SKILL.md` and be symlinked into
`self-learn/.claude/skills/`, the same way `manimkc-video` is today. It is
also the brief for updating the `diagram-maker` subagent in the `learning`
plugin, which currently writes SVG by hand and reads it back.

## The loop

```mermaid
flowchart LR
    R[read: inspect] --> D[draw: run --code]
    D --> S[shot]
    S --> L[look at the png with Read]
    L -->|something is off| D
    L -->|clean and lints empty| E[export --svg]
```

1. **Read before writing.** `tldrawkc inspect <file> --json` if the file
   exists. Know what is there and what the ids are. Never clear a canvas you
   did not create.
2. **Draw with the helpers.** Write a snippet to a temp file and run
   `tldrawkc run <file> --code <snippet> --shot <png> --create`. Use
   `helpers.box` and `helpers.connect`; never build raw arrow shapes for a
   real connection. Use stable, readable ids.
3. **Look.** Open the PNG with the Read tool. Judge it as a stranger would:
   clipped or overlapping text, arrows that cross boxes, labels sitting on
   lines, a reading order that is not obvious.
4. **Fix with a second snippet**, not by starting over. Nudge positions,
   change anchors or `mid` on the arrows that route badly, widen boxes whose
   labels wrap. Re-shot.
5. **Stop when the lints are empty and the picture reads.** Three passes
   without improvement means return what you have and say plainly what is
   still wrong. Then `tldrawkc export <file> --svg <out.svg>`.

Never report a diagram finished without having looked at the last
screenshot. Exit code 3 exists so this cannot be skipped by accident.

## Where files go in self-learn

| File | Path | Committed |
| --- | --- | --- |
| Canvas source | `learn/assets/<concept-id>.tldr` | yes |
| Final export | `learn/assets/<concept-id>.svg` | yes, and embedded in the session log as `![[<concept-id>.svg]]` exactly as today |
| Iteration screenshots | `/tmp` or the scratchpad, never `learn/` | no |
| Snippets | scratchpad | no, unless the snippet is worth keeping as a fixture |

The `.tldr` next to the `.svg` is what makes the diagram editable later: a
human can `tldrawkc serve` it and drag things, and the next session's agent
can `inspect` it and extend it rather than redraw.

## Starting from mermaid

Every diagram in this repo today is mermaid. To lift one:

```
tldrawkc from-mermaid learn/assets/x.tldr --source x.mmd --shot /tmp/x.png
```

then look, then fix. `learn/map.md` is a generated mermaid file and should
stay mermaid: it is a derived cache the pipeline rebuilds, not a teaching
diagram.

## What makes a teaching diagram work

Carried over from the current `diagram-maker` brief, because none of it
changes with the tool:

- One idea per diagram. If it needs a legend, it is doing too much.
- Show the mechanism, not a summary of it. A box labelled "attention"
  teaches nothing; three vectors and the products between them does.
- Label directly on the elements.
- Before and after, or step by step, beats a static tangle for any process.
- The words on a card are the card's label, not a separate text shape.
- Minimum readable size: keep boxes at 160 by 60 or larger at the default
  font, and check the PNG at 2x before trusting it.

## Snippet conventions

- Ids are lower-case slugs that name the concept: `helpers.box('query',
  ...)`, not `helpers.box('b1', ...)`.
- Place with `after` and `below` where the layout is a grid; use absolute
  `x`, `y` only for the first shape in a cluster.
- Choose `kind: 'elbow'` for anything architectural or ERD-like, `arc` for
  intuition diagrams where a curve reads better.
- Return `helpers.describe().lints` at the end so the run's JSON says what
  still needs work.
- Keep one snippet per pass. A pass that does twenty things and fails half
  way is rolled back as a whole.

## For a human watching

`tldrawkc serve learn/assets/x.tldr` opens the canvas in a normal browser
tab and reloads when the agent writes the file, keeping the human's camera.
Cmd+S in that tab saves hand edits back to the same file. The agent's next
`inspect` sees them.
