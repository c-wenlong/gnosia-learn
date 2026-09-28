# seed/

A small, real slice of the content, in the export format, that imports into an
empty database on its own. The tests read it, `npm run e2e -- --seed` builds
its database from it, and after phase 3 of
[docs/CONTENT-MIGRATION.md](../docs/CONTENT-MIGRATION.md) removes `content/`
and `learn/`, it is the only content a fresh clone has.

It is not the owner's content. That lives in the database; this is a copy of
part of it, cut once and kept still, so a test can assert exact counts without
asserting on whatever the owner wrote this week.

## What it holds

| Type | Count | Which |
| --- | --- | --- |
| Topics | 5, in 4 domains | `vector-and-linear-algebra-basics`, `transformer-architecture-and-training`, `agent-tool-use-and-reasoning-loops`, `agent-memory-and-state`, `tomasulo-algorithm` |
| Tags | 2 | `agentic-ai`, `transformers`: the course's own |
| Courses | 1, with 2 modules | `cp4284`, cut to `cp4284-m1` and `cp4284-m3`, the modules filed under those topics: 5 items, 4 links, 8 concept links |
| Concept notes | 11 | every note filed under those topics, with their 13 prerequisites |
| Session logs | 1 | `2026-08-19-react-agents` |
| Diagrams | 1 | `vector-as-a-list-of-numbers`, its `.tldr` and its `.svg` |
| Videos | 0 | videos never enter an export (D7), so every topic's `maps.manimkc` is empty |

The layout is the repository's (`content/topics.yaml`, `content/tags.yaml`,
`content/courses/`, `learn/concepts/<domain>/`, `learn/sessions/`,
`learn/assets/`), so `catalog import seed` reads it the way it reads any tree,
and [content/README.md](../content/README.md) describes every file.

## Importing it

```sh
createdb self_learn_seed
DATABASE_URL=postgres://localhost:5432/self_learn_seed npm run catalog -- migrate
DATABASE_URL=postgres://localhost:5432/self_learn_seed MANIMKC_ROOT=/nonexistent npm run catalog -- import seed
```

`MANIMKC_ROOT` points at a directory with no manimkc CLI so the import leaves
manimkc out. On a machine with the submodule checked out, the manimkc source
would otherwise read every rendered video and refuse each topic folder, since
no seed topic maps one. The diagram's SVG goes into the blob store
`SELF_LEARN_HOME` names; set it to a scratch directory unless you want it in
`~/.self-learn/blobs`.

## Regenerating it

Only with `catalog export --subset`, from a database that holds the full
content, never by hand: `services/catalog/test/catalog.test.ts` imports the
seed and exports it back, and fails on any byte the database would not write.

```sh
rm -rf seed/content seed/learn
npm run catalog -- export --out seed --subset \
  --topic vector-and-linear-algebra-basics \
  --topic transformer-architecture-and-training \
  --topic agent-tool-use-and-reasoning-loops \
  --topic agent-memory-and-state \
  --topic tomasulo-algorithm \
  --course cp4284 --session 2026-08-19-react-agents --diagram vector-as-a-list-of-numbers
```

The subset takes the named topics, the course's modules filed under them, every
note filed under them, the one log and the one diagram. It refuses, naming the
reference, anything that would leave the tree unable to import on its own: a
note whose prerequisite sits under a topic left out, an item concept or a
diagram outside the named topics. It also refuses a topic relation to a topic
left out, which the import would not miss but the seed would silently lose. It
never writes over the repository or over a tree the database imported from,
nor through a symlink out of the directory it was given. When the counts
change, `EXPECTED` in `catalog.test.ts` and the table above change in the same
commit.

Nothing a test runs may write here: `vitest.setup.ts` lists every file under
`seed/` before each test file and fails the file that changed one.
