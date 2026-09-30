# seed/

A small, real slice of the content, in the export format, that imports into an
empty database on its own. The tests read it, `npm run e2e` builds its
database from it, and since phase 3 of
[docs/CONTENT-MIGRATION.md](../docs/CONTENT-MIGRATION.md) removed `content/`
and `learn/` from the repository, it is the only content a fresh clone has.

It is not the owner's content. That lives in the database; this is a copy of
part of it, cut once and kept still, so a test can assert exact counts without
asserting on whatever the owner wrote this week.

This file also documents the export format itself, under [The export
format](#the-export-format) below: the layout `catalog export --out <dir>`
writes and `catalog import <dir>` reads. The course file has a document of its
own, [COURSES.md](COURSES.md).

## What it holds

| Type | Count | Which |
| --- | --- | --- |
| Topics | 5, in 4 domains | `vector-and-linear-algebra-basics`, `transformer-architecture-and-training`, `agent-tool-use-and-reasoning-loops`, `agent-memory-and-state`, `tomasulo-algorithm` |
| Tags | 2 | `agentic-ai`, `transformers`: the course's own |
| Courses | 1, with 2 modules | `cp4284`, cut to `cp4284-m1` and `cp4284-m3`, the modules filed under those topics: 5 items, 4 links, 8 concept links, and its cover photo (`cp4284.cover.webp`) |
| Concept notes | 11 | every note filed under those topics, with their 13 prerequisites |
| Session logs | 1 | `2026-08-19-react-agents` |
| Diagrams | 1 | `vector-as-a-list-of-numbers`, its `.tldr` and its `.svg` |
| Videos | 0 | videos never enter an export (D7), so every topic's `maps.manimkc` is empty |

The layout is the export format's (`content/topics.yaml`, `content/tags.yaml`,
`content/courses/`, `learn/concepts/<domain>/`, `learn/sessions/`,
`learn/assets/`), so `catalog import seed` reads it the way it reads any
export, and [The export format](#the-export-format) describes every file.

## Importing it

A fresh clone's database is this, imported and then flipped so the database
owns every type (the web app reads nothing else):

```sh
createdb self_learn
npm run catalog -- migrate
MANIMKC_ROOT=/nonexistent REMOTIONKC_ROOT=/nonexistent REVIDEOKC_ROOT=/nonexistent npm run catalog -- import seed
for t in topics tags concepts sessions courses diagrams; do npm run catalog -- flip $t; done
```

The flips go in the order `scripts/lib/flip-order.mjs` keeps: topics, tags,
then concepts, sessions, courses and diagrams. `npm run e2e` builds exactly
this database on its own, under a throwaway name. For a second database beside
your own, put `DATABASE_URL=postgres://localhost:5432/self_learn_seed` in front
of each command after a `createdb self_learn_seed`.

`MANIMKC_ROOT` points at a directory with no manimkc CLI so the import leaves
manimkc out, and `REMOTIONKC_ROOT` and `REVIDEOKC_ROOT` do the same for
remotionkc and revideokc, whose topic.yml files name topics the seed does not
hold. On a machine with the submodule checked out, the manimkc source
would otherwise read every rendered video and refuse each topic folder, since
no seed topic maps one. The diagram's SVG and the course's cover photo go
into the blob store `SELF_LEARN_HOME` names; set it to a scratch directory
unless you want them in `~/.self-learn/blobs`.

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

## The export format

The content is rows in Postgres, and the database is its only truth. The
export format is how those rows leave the database as files and come back:
`catalog export --out <dir>` writes the layout below from the rows, and
`catalog import <dir>` reads it into a database. The repository holds no copy
of it; `seed/` is one small instance, the nightly export
(`npm run export:nightly`, into `$SELF_LEARN_HOME/archive/`) is the full one,
and the last tree the repository itself held is at the tag
`content-files-final` (`git show content-files-final:content/topics.yaml`).

```bash
npm run catalog -- export --out /tmp/export     # the database as content/ and learn/
npm run catalog -- import /tmp/export           # and back into a database
npm run catalog -- parity /tmp/export           # entity by entity; exits 1 on any mismatch
```

On a database that owns a type, `catalog import` skips that type when the
directory holds exactly the database's last export of it, or (once the
database owns every type) none of its files at all, and refuses its files by
name when they were edited. So an export is
never the way to change content: every change goes through the command for
its type, which writes the rows with an author and a `--reason` and leaves a
revision `catalog history` can show. Into a fresh database, where no type is
owned yet, the import reads everything; that is how the seed above, or a
restored archive, becomes a database.

| Path in the tree | What it holds | Written in the database by |
| --- | --- | --- |
| `content/topics.yaml` | The shared topic vocabulary: one entry per subject, with its domain, summary, aliases, relations and the videos, course modules and concept notes it covers | `catalog topic ...`; `learn concept add --topic` files a note under a topic |
| `content/tags.yaml` | The cross-course themes a course's `tags:` names, and how related courses find each other | `catalog tag ...` |
| `content/courses/<code>.yaml` | One course: modules, curriculum items, subtopics and curated resources ([COURSES.md](COURSES.md)) | `catalog course import`, and `catalog item archive\|restore\|purge` |
| `content/courses/<code>.cover.<webp\|jpg\|png>` | A course's cover photo, named by its file's `cover:` with its credit. A blob in the database, written out here from the store and stored back by an import | `catalog course cover` |
| `learn/concepts/<domain>/<id>.md` | Concept notes | the `learn` CLI: `concept add\|edit\|checkout\|commit`, `check add`, `vault push` ([docs/LEARN.md](../docs/LEARN.md)) |
| `learn/sessions/<id>.md` | Session logs | the `learn` CLI's `session` and `observe` |
| `learn/assets/<slug>.tldr`, `.svg` | Diagrams: the editable canvas and its export | the studio, `catalog diagram put\|commit`, `learn diagram commit` |

Everything under `content/` in an export is parsed by one reader,
[`packages/content`](../packages/content/src/index.ts), which `catalog import`
and `catalog course import` both use, and whose types the database's readers
return. That is deliberate: while the
courses existed as both YAML and TypeScript literals in the web app, only a
parity test stood between the two, and a parity test can notice drift but not
prevent it.

### topics.yaml

The vocabulary is the join every asset goes through. A video, a diagram, a
concept note and a course module about the same subject all name the same topic
slug, and that is the only reason a query can find them together.

```yaml
topics:
  - slug: tomasulo-algorithm          # permanent; everything else may change
    title: Tomasulo's algorithm
    domain: computer-architecture
    summary: Reservation stations and a common data bus let instructions ...
    aliases: [tomasulo, reservation stations, common data bus]
    relations:                        # optional; omitted when empty
      - {kind: broader, to: out-of-order-execution}
    maps:
      manimkc: [computer-architecture/instruction-level-parallelism/tomasulo]
      courses: []                     # course *module* ids, e.g. cp4284-m3
      concepts: []                    # concept note ids
```

**The slug is permanent, and one command changes it.** It is the foreign key
every asset link, curriculum item and concept row points at, so a slug changes
only through `catalog topic rename --from <old> --to <new> --reason "..."`,
which moves every reference in one transaction, keeps the old slug as an alias,
and records one `rename` revision per entity it touched (edge case 2 of the
plan).

**Where each field comes from in the database.** `maps.manimkc` is the topic's
`manimkc_topic` rows; `maps.concepts` is every live concept whose
`topic_slug` is this topic, in `topic_position` order; `maps.courses` is every
live module whose topic row names it, in that row's `topic_position` order.
So a concept joins a topic through `learn concept add --topic`, a module
through its course's `topic:` and `catalog course import`, and a manimkc
folder through `catalog topic map <slug> --manimkc <path> --reason "..."`
(`--remove` to unmap it). None of them is set by editing `maps` in an export,
which the next import would refuse. A folder belongs to one topic, so mapping
one another topic holds is refused, naming it.

Each id under `maps` appears in exactly one topic. `catalog import` refuses to
run when a mapping names something that does not exist, or when two topics claim
the same source, so a typo in a tree being imported is an error rather than a
row that joins to nothing. That includes a `maps.concepts` entry with no note
behind it: the mapping is stored as the note's own topic, so one with no note
has nowhere to live and would vanish from the next export.

**`relations:`** is a list of typed edges to other topics, each
`{kind: <kind>, to: <slug>}`, stored as `topic_relation` rows and written by
`catalog topic relate <slug> <kind> <other> [--remove]` (or `--relate
kind:slug` on `topic add`). A `broader` or `precedes` edge that would close a
loop is refused.

| Kind | Means |
| --- | --- |
| `broader` | `to` is the wider subject this one sits under |
| `related` | the two are related, in no direction |
| `precedes` | learn this topic before `to` |

The reader refuses a relation to a slug that is not a topic, to the topic
itself, a kind outside the three, and the same kind and target twice. A
`related` edge is symmetric and stored once, under the alphabetically smaller
slug, so it is written once, under that topic: listed under the other one, the
export would move it and the file that came back would not be the file that
went in.

**Every list keeps its order.** The topics, each topic's `relations:` and each
of its `maps` lists are stored with their positions, so `catalog export`
writes this file back as it was written, down to the header and the domain
dividers, and two exports of an unchanged database are byte for byte the same.
The course path breaks ties by `maps.concepts` order, so that order is
content, not formatting.

### Writing the vocabulary and the tags

Every write names why, and each prints the revisions it wrote. `--json` on
each gives the same as data; `--dry-run` on `topic add` validates and places
the topic and lists existing topics that look like it (trigram similarity of
0.45 or more on a title, alias or slug) without writing.

```bash
npm run catalog -- topic add --slug tcp-congestion-control --title "TCP congestion control" \
  --domain networking --alias AIMD --relate broader:computer-networks --reason "..." [--dry-run]
npm run catalog -- topic edit tcp-congestion-control --summary "..." --add-alias "slow start" --reason "..."
npm run catalog -- topic relate tcp-congestion-control precedes quic-transport --reason "..."
npm run catalog -- topic map tcp-congestion-control --manimkc networking/tcp-congestion --reason "..."
npm run catalog -- topic rename --from tcp-congestion-control --to tcp-congestion --reason "..."
npm run catalog -- topic archive <slug> --reason "..."     # refused while in use
npm run catalog -- topic ls --json                        # every topic, its relations and maps, for the planner
npm run catalog -- tag add --id networks --label Networks --description "..." --reason "..."
npm run catalog -- tag edit networks --description "..." --reason "..."
npm run catalog -- history topic tcp-congestion           # who wrote what, and why
```

Once the database owns every type, a write changes rows and no file: there is
no tree in the repository to keep in step, and an export is something you run
when you want one. While a database is still part-way through its flips, a
write also rewrites `topics.yaml` or `tags.yaml` in the tree the type was last
imported from, and refuses, before changing anything, when that file holds an
edit the database never imported.

### Courses

A course is edited as its export: `catalog course export <id> --out <file>`,
edit the file, then `catalog course import <file> --reason "..."`. The file's
shape, its permanent ids and what the reader refuses are in
[COURSES.md](COURSES.md); the whole loop and the item verbs are in
[docs/CURRICULUM.md](../docs/CURRICULUM.md).
