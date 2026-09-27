# Authored content

Three files and two folders hold the content this repo authors, and each is on
its way from being the truth to being an **export format**: the files the
database writes out and reads back, in the repository's own layout
([docs/CONTENT-MIGRATION.md](../docs/CONTENT-MIGRATION.md), D1). Until a type
flips, `catalog index` reads its files into Postgres; from its flip on, the
rows are the truth and the files are what `catalog export` writes from them.

**The vocabulary and the tags are written through the catalog now.**
`catalog topic add|edit|rename|relate|archive|restore` and `catalog tag
add|edit` write the rows with an author and a `--reason`, and rewrite
[`topics.yaml`](topics.yaml) or [`tags.yaml`](tags.yaml) from the rows in the
same transaction, so these two files are always the database's own export.
Do not edit them by hand: a writer refuses to overwrite a file holding an edit
the database has not imported, and once the type is flipped `catalog import`
refuses the edited file by name and names the command to use instead.

| Type | Writer | Truth until its flip | After |
| --- | --- | --- | --- |
| Topics, relations | `catalog topic ...`; `learn concept add --topic` for `maps.concepts` | `content/topics.yaml` | `topic`, `topic_relation`, `manimkc_topic` rows; the file is the export |
| Tags | `catalog tag ...` | `content/tags.yaml` | `tag` rows; the file is the export |
| Courses | the course files, until Track B | `content/courses/*.yaml` | `collection` and `curriculum_item` rows |
| Notes, session logs, diagrams | the `learn` CLI and the studio, until Tracks C and D | `learn/` | rows and blobs |

Everything under `content/` is parsed by one reader,
[`packages/content`](../packages/content/src/index.ts), which the web app and
the catalog both import. That is deliberate: while the courses existed as both
YAML here and TypeScript literals in the web app, only a parity test stood
between the two, and a parity test can notice drift but not prevent it.

| Folder | What it holds | Read by |
| --- | --- | --- |
| [`content/topics.yaml`](topics.yaml) | The shared topic vocabulary: one entry per subject, with its domain, summary, aliases, relations and the videos, course modules and concept notes it covers. Written by `catalog topic`. | `catalog index`, the web app, until topics flip |
| [`content/courses/`](courses/README.md) | One YAML file per course: modules, curriculum items, subtopics and curated resources. | `catalog index`, the web app |
| [`content/tags.yaml`](tags.yaml) | The cross-course themes a course's `tags:` names, and how related courses find each other. Written by `catalog tag`. | `catalog index`, the web app, until tags flip |
| [`learn/`](../learn/README.md) | The knowledge base: concept notes under `learn/concepts/`, diagrams under `learn/assets/`, session logs under `learn/sessions/`. The learner state that used to sit beside them is in Postgres. | `catalog index`, the `learn` CLI |

`learn/` has not moved and is not going to move in this bundle. It is listed
here because "where is the authored content" has more than one answer, and
finding only some of them is how a source gets missed.

## topics.yaml

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
rewrites the course files that name it, and records one `rename` revision per
entity it touched (edge case 2 of the plan).

**Where each field comes from in the database.** `maps.manimkc` is the topic's
`manimkc_topic` rows; `maps.concepts` is every live concept whose
`topic_slug` is this topic, in `topic_position` order; `maps.courses` is every
live module whose topic row names it, in that row's `topic_position` order.
So a concept joins a topic through `learn concept add --topic`, and a module
through its course file, never by editing `maps`.

Each id under `maps` appears in exactly one topic. `catalog index` refuses to
run when a mapping names something that does not exist, or when two topics claim
the same source, so a typo is an error at index time rather than a row that
joins to nothing. That includes a `maps.concepts` entry with no note behind it:
the mapping is stored as the note's own topic, so one with no note has nowhere
to live and would vanish from the next export.

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
dividers, and `git diff` after an export into the working tree is empty. The
course path breaks ties by `maps.concepts` order, so that order is content, not
formatting.

## Export, import and parity

Postgres becomes the owner of this content one type at a time
([docs/CONTENT-MIGRATION.md](../docs/CONTENT-MIGRATION.md)). Until a type
flips, these files are its truth and `catalog index` reads them; from its
flip on they are an export, written by `catalog export` and refused by
`catalog import` if they were edited by hand.

```bash
npm run catalog -- export --out /tmp/export     # the database as content/ and learn/
npm run catalog -- import /tmp/export           # and back; `index` is `import` of the repo
npm run catalog -- parity .                     # entity by entity; exits 1 on any mismatch
```

## Writing the vocabulary and the tags

Every write names why, and each prints the revisions it wrote and the file it
rewrote. `--json` on each gives the same as data; `--dry-run` on `topic add`
validates and places the topic and lists existing topics that look like it
(trigram similarity of 0.45 or more on a title, alias or slug) without writing.

```bash
npm run catalog -- topic add --slug tcp-congestion-control --title "TCP congestion control" \
  --domain networking --alias AIMD --relate broader:computer-networks --reason "..." [--dry-run]
npm run catalog -- topic edit tcp-congestion-control --summary "..." --add-alias "slow start" --reason "..."
npm run catalog -- topic relate tcp-congestion-control precedes quic-transport --reason "..."
npm run catalog -- topic rename --from tcp-congestion-control --to tcp-congestion --reason "..."
npm run catalog -- topic archive <slug> --reason "..."     # once the database owns topics; refused while in use
npm run catalog -- topic ls --json                        # every topic, its relations and maps, for the planner
npm run catalog -- tag add --id networks --label Networks --description "..." --reason "..."
npm run catalog -- history topic tcp-congestion           # who wrote what, and why
```

A write refuses, before changing anything, when the file under the tree the
type was last imported from is not what the database would export: an edit
made by hand and never imported. Import it (`catalog index --only topics`)
while the type is still on files, or put the file back.
