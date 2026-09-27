# Authored content

Three files and two folders hold the content this repo authors. The catalog in
[`services/catalog/`](../services/catalog/SCHEMA.md) reads all three and derives
a Postgres index from them. Nothing here is written by the catalog unless you
ask it to: `catalog export --out .` rewrites these files from the database, and
writes them back byte for byte while the database holds what they say.

[docs/CONTENT-MIGRATION.md](../docs/CONTENT-MIGRATION.md) is the plan that
moves this content into Postgres, and this document describes the
files-as-truth state that holds for each type until it flips.

Everything under `content/` is parsed by one reader,
[`packages/content`](../packages/content/src/index.ts), which the web app and
the catalog both import. That is deliberate: while the courses existed as both
YAML here and TypeScript literals in the web app, only a parity test stood
between the two, and a parity test can notice drift but not prevent it.

| Folder | What it holds | Read by |
| --- | --- | --- |
| [`content/topics.yaml`](topics.yaml) | The shared topic vocabulary: one entry per subject, with its domain, summary, aliases and the videos, course modules and concept notes it covers. | `catalog index`, the web app |
| [`content/courses/`](courses/README.md) | One YAML file per course: modules, curriculum items, subtopics and curated resources. | `catalog index`, the web app |
| [`content/tags.yaml`](tags.yaml) | The cross-course themes a course's `tags:` names, and how related courses find each other. | `catalog index`, the web app |
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

**The slug is permanent.** It is the foreign key every asset link, curriculum
item and concept row points at. Renaming one silently re-homes everything that
named it, so add a new topic and move the mappings instead.

Each id under `maps` appears in exactly one topic. `catalog index` refuses to
run when a mapping names something that does not exist, or when two topics claim
the same source, so a typo is an error at index time rather than a row that
joins to nothing. That includes a `maps.concepts` entry with no note behind it:
the mapping is stored as the note's own topic, so one with no note has nowhere
to live and would vanish from the next export.

**`relations:`** is a list of typed edges to other topics, each
`{kind: <kind>, to: <slug>}`, stored as `topic_relation` rows. No topic carries
one yet; Track A of the content migration adds `catalog topic relate`.

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
