## What is in scope in a snippet

A snippet is the body of an async function, run in the page with three names in
scope:

| Name | What |
| --- | --- |
| `helpers` | The functions listed below. Prefer these: they keep arrows bound and layouts measured |
| `editor` | The live tldraw `Editor`, with no guard rails. For reads such as `editor.getShapePageBounds('shape:router')` |
| `tldraw` | The whole `tldraw` module: `createShapeId`, `toRichText`, `Box`, `Vec` and the rest |

Top-level `await` works, and whatever you `return` comes back as `result` in
`run --json`. A throw rolls back everything the snippet did.

Every helper takes a **key**: a lower-case slug naming the thing (`'router'`,
`'panel-tcp'`), or a full `shape:` id. The shape's id is `shape:<key>`, so
`helpers.box('router', ...)` makes `shape:router`, and passing either form
anywhere else works. Name keys after what they are, never `b1`. The layout
helpers (`row`, `column`, `grid`, `translate`, `boxShapes`, `alignContainers`)
and `connect` act on shapes that already exist: create them first, in this
snippet or an earlier one, or the snippet throws "no such shape exists".
An arrow made by `connect` has the key `arrow:<from>-><to>`.
