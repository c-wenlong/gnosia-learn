# Services structure

Each service under `services/` keeps its entrypoint and its few shared leaves —
the modules every domain imports (path resolution, environment, subprocess
spawning, the job record) — at the root of `src/`, and groups everything else
into one directory per domain, named for what the code is about rather than
what kind of file it is. A domain directory can be as big as the domain is
(`video/` holds thirty-odd files plus a subdirectory per backend); what it may
not be is a type bucket like `utils/` or `lib/`. When a second pipeline of the
same shape appears, it gets a twin directory (`diagram/` and `video/` both hold
a `runner`, a `brief`, a `gate` and a `settings`, each its own kind's), and the
modules both pipelines share stay at the root rather than moving into a common
dir. Tests are not grouped with the code: they stay flat in `test/` beside
`src/`, named after the module they cover, the way `services/catalog` and
`services/studio` both lay them out.

## services/catalog/src

| Path | Domain |
| --- | --- |
| `cli.ts`, `canvas.ts`, `env.ts`, `db.ts`, `connection-failure.ts`, `migrations.ts`, `sql-order.ts` | Root: the entrypoint and the shared leaves (environment, the pool, the launcher) |
| `commands/` | The `catalog` verbs, one file each |
| `content/` | Reads and writes of catalog-owned content (with `readers/` for the read-side seam) |
| `index/` | The indexers that turn trees into rows |
| `state/` | The exported state API (`./state` is the package's only export) |
| `learn/` | The `learn` CLI's domain |
| `pdf/`, `poster/` | The document pipelines |

## services/studio/src

| Path | Domain |
| --- | --- |
| `index.ts`, `api.ts`, `paths.ts`, `config.ts`, `proc.ts`, `cost.ts` | Root: the process, its HTTP surface, and the shared leaves (paths, env, subprocess, spend) |
| `agent/` | The agent harnesses — `claude -p`, `codex exec`, BYOK `qwen` — and the model/effort resolution and Bash-guard scaffold they share |
| `diagram/` | The diagram job pipeline: the runner, brief, prompt, permission settings, guard, gate, compare, live shot and review |
| `drafts/` | The chat-first conversations: the draft records, the planner, its prompt and the pruner |
| `canvas/` | tldrawkc: the CLI wrapper, the diagram corpus the screens read, and the per-document `serve` mirrors |
| `data/` | Reaching the catalog's data: the `catalog` CLI client, the blob store, the last-good-read cache, and the job write-ahead log |
| `probes/` | Answers kept warm so a route spawns nothing: the probe, the health checks and the cached lists |
| `manual/` | The tldraw manual the drawing agent is handed, assembled from the installed tool |
| `video/` | The video job pipeline, with `backends/` and one subdirectory per tool (`remotionkc/`, `revideokc/`) |
