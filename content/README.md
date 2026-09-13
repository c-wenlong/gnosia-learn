# Authored content

Three files and two folders hold the content this repo authors. The catalog in
[`services/catalog/`](../services/catalog/SCHEMA.md) reads all three and derives
a Postgres index from them; nothing here is generated, and nothing here is
written by the catalog.

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
joins to nothing.
