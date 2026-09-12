# Course data

One YAML file per course, named `<code>.yaml` in lowercase (e.g. `cs2111.yaml`).
Each file mirrors the `Course` shape in `src/lib/types.ts` field for field: id,
slug, code, title, credits, the optional prereq/track/notes, inferred, tags,
modules, capstone. A module carries id, slug, title, order, a `topic` slug,
topics (id, title, subtopics), and resources (id, title, url, type). Array
order matches the TypeScript source; it is the catalog and sidebar order.

**Topic ids are permanent.** Learner progress, notes and recaps are keyed by
topic id in browser storage, so an id must never be renamed or renumbered.
See [docs/CURRICULUM.md](../../docs/CURRICULUM.md) for the full rule and how
to add new topics safely.

Each module's `topic:` value is a slug from `content/topics.yaml`, the shared
topic vocabulary. It is a lookup key, not free text: add or rename a topic
there, not here.

These files are not yet read by the app; `src/data/courses/*.ts` remains the
source the web app loads until the catalog loader lands.
