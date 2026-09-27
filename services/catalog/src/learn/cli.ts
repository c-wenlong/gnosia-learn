#!/usr/bin/env node
/**
 * `learn` — the primitive surface of the learning pipeline.
 *
 * Every phase of the loop is a command an agent (or a human) can call, and
 * every call that carries evidence appends to an append-only trajectory log.
 * Nothing about the pipeline lives only in a conversation: the model, the
 * graph and the schedule are all things you can read and diff.
 *
 *   learn status                     where am I
 *   learn concept add …              define a concept and its prerequisites
 *   learn probe --goal …             which concepts to ask about next
 *   learn observe --concept … …      record one answer  (the RL step)
 *   learn plan --goal …              ordered path from known to goal
 *   learn teach --goal …             the single next concept to teach
 *   learn review due|grade           spaced repetition
 *   learn session start|log|close    the session log
 *   learn map|index|doctor|model     derived artefacts and health
 *
 * What changed in bundle 5: the notes, the session logs and `map.md` are still
 * files, and `learn/state/` is not. `events.jsonl`, `model.json`,
 * `reviews.json` and `index.json` are the `event`, `mastery` and `review`
 * tables and a query. Every command name and every `--json` shape is
 * unchanged, because the `/learn` and `/review` skills parse them.
 *
 * The maths is not reimplemented here. `bkt.mjs`, `graph.mjs`,
 * `schedule.mjs`, `markdown.mjs`, `render.mjs` and `session-log.mjs` are
 * imported from `scripts/learn/lib/` exactly as they were, with their own
 * tests still guarding them.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import {
  DEFAULT_PARAMS,
  MASTERY_THRESHOLD,
  expectedInfoGain,
  masteryLabel,
} from "../../../../scripts/learn/lib/bkt.mjs";
import {
  buildGraph,
  danglingEdges,
  findCycles,
  frontier,
  masteryOf,
  planPath,
  summarize,
  topoSort,
} from "../../../../scripts/learn/lib/graph.mjs";
import {
  dueCards,
  forecast,
} from "../../../../scripts/learn/lib/schedule.mjs";
import {
  buildIndex,
  renderMapDocument,
  renderMermaid,
} from "../../../../scripts/learn/lib/render.mjs";
import {
  appendCheck,
  appendSessionLink,
  parseChecks,
  slugify,
} from "../../../../scripts/learn/lib/markdown.mjs";
import {
  renderQuestion,
  renderResult,
} from "../../../../scripts/learn/lib/session-log.mjs";

import { ContentError, TOPICS_FILE } from "@self-learn/content";
import { LOCAL_LEARNER_ID } from "@self-learn/schema";

import { connect, type CatalogDatabase, type Connection } from "../db";
import { databaseUrl, redactUrl } from "../env";
import { IndexError } from "../index/errors";
import { runIndex } from "../index/run";
import {
  assertMigrated,
  EXIT_MIGRATIONS_OUTSTANDING,
  migrationStatus,
  MigrationsOutstanding,
} from "../migrations";
import {
  appendEvent,
  endSession,
  ensureSession,
  assertKnownConcepts,
  gradeReview,
  ensureLearner,
  readEvents,
  readModel,
  readReviews,
  recordObservation,
  replayMastery,
  StateError,
  writeModel,
  writeReviews,
  type BktParams,
  type Model,
  type ReviewCard,
} from "../state";
import {
  appendSession,
  conceptCollisions,
  ensureDirs,
  listConcepts,
  listDomains,
  listSessions,
  readConcept,
  sessionPath,
  writeConcept,
} from "./files";
import { conceptsDir, kbDir, mapFile, rel, repoRoot } from "./paths";
import { replayReviews } from "./replay";
import { checkItem, CourseEditError, listConceptOnItem } from "./course-edit";
import { FileLockError } from "./file-lock";
import { checkConceptTopic, fileConceptUnderTopic, TopicError } from "../content/topics";
import { WriteThroughError } from "../content/write-through";
import { NoteError, readNote } from "../content/notes";

/** A message meant for the learner, not a stack trace. Exit 1, same as before. */
class CliError extends Error {}

function fail(message: string): never {
  throw new CliError(message);
}

function out(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else {
    process.stdout.write(`${String(value)}\n`);
  }
}

function bool(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "y", "correct"].includes(String(value).toLowerCase());
}

function list(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function pct(x: number): string {
  return `${String(Math.round(x * 100)).padStart(3)}%`;
}

function bar(x: number, width = 16): string {
  const filled = Math.round(x * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

/* -------------------------------------------------------------------------- */
/* The database, opened on demand                                             */
/* -------------------------------------------------------------------------- */

/**
 * `concept add`, `check add` and `session log` touch only files, and there is
 * no reason a learner writing a note should need Postgres running. So the
 * connection is lazy: the first command that asks for it opens it, and one
 * that never asks never notices the database is down.
 *
 * The flip side is that `status` — which the `/learn` and `/review` skills run
 * first and stop on — does ask, and fails loudly when it cannot connect. That
 * is the intended gate: a session that cannot record anything should not start.
 */
class Session {
  private connection: Connection | null = null;

  async db(): Promise<CatalogDatabase> {
    if (this.connection === null) {
      this.connection = connect();
      try {
        await ensureLearner(this.connection.db);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CliError(
          `cannot reach the database at ${redactUrl(databaseUrl())}\n` +
            `  ${message}\n` +
            `  Start Postgres, or set DATABASE_URL. See services/catalog/.env.example.`,
        );
      }
    }
    return this.connection.db;
  }

  async close(): Promise<void> {
    if (this.connection !== null) {
      await this.connection.close();
      this.connection = null;
    }
  }
}

/**
 * Typed views over the untyped pure modules.
 *
 * `scripts/learn/lib/*.mjs` is plain ESM with no annotations, so TypeScript
 * infers what it can and reads `DEFAULT_PARAMS.pL0` as the literal `0.25`
 * rather than as a number. Declaring the handful of shapes this file actually
 * uses, in one place, beats a cast at forty call sites — and beats a parallel
 * set of `.d.mts` files, which would be free to drift from the code they claim
 * to describe while still type-checking.
 */

interface GraphNode {
  id: string;
  title?: string;
  summary?: string;
  requires: string[];
  assumes: string[];
  tags?: string[];
  sources?: string[];
  domain?: string | null;
}

interface Graph {
  nodes: Map<string, GraphNode>;
  dependents: Map<string, string[]>;
}

interface FrontierEntry {
  id: string;
  title: string;
  pL: number;
  requires: string[];
}

interface PlanStep {
  id: string;
  title: string;
  pL: number;
  mastered: boolean;
  gap: boolean;
  requires: string[];
}

interface Plan {
  goal: string;
  steps: PlanStep[];
  incomplete: boolean;
  skipped: number;
}

interface Check {
  id: string;
  question: string;
  answer: string;
  why: string;
  source: string;
}

/**
 * `bkt.mjs` reads its `params` argument off the frozen `DEFAULT_PARAMS`
 * literal, so TypeScript types the four numbers as the literals they happen to
 * default to. Widened here rather than at each call site.
 */
const bktParams = (params: BktParams) => params as unknown as typeof DEFAULT_PARAMS;

/**
 * `frontier`'s options default to `{ goal = null }`, so TypeScript reads the
 * parameter as `{ goal?: null }` and refuses a goal. One wrapper, typed the
 * way the function actually behaves.
 */
function frontierOf(graph: Graph, model: Model, goal: string | null = null): FrontierEntry[] {
  return frontier(graph, model, { goal } as never) as FrontierEntry[];
}

/** Exactly the flags `OPTIONS` declares, with the types `parseArgs` returns. */
interface Values {
  json?: boolean;
  goal?: string;
  concept?: string;
  correct?: string;
  source?: string;
  grade?: string;
  opportunity?: string;
  schedule?: string;
  noPropagate?: boolean;
  question?: string;
  answer?: string;
  why?: string;
  reason?: string;
  options?: string;
  chosen?: string;
  explain?: string;
  note?: string;
  session?: string;
  id?: string;
  title?: string;
  summary?: string;
  requires?: string;
  assumes?: string;
  domain?: string;
  tags?: string;
  sources?: string;
  body?: string;
  text?: string;
  topic?: string;
  item?: string;
  limit?: string;
  days?: string;
  mermaid?: boolean;
  rebuild?: boolean;
  force?: boolean;
}

interface Parsed {
  values: Values;
  positionals: string[];
}

type Command = (parsed: Parsed, session: Session) => Promise<void>;

/** The concept graph, built from the notes on disk. */
async function loadGraph(): Promise<Graph> {
  return buildGraph(await listConcepts()) as Graph;
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

const commands: Record<string, Command> = {};

commands.init = async (_parsed, session) => {
  await ensureDirs();
  const db = await session.db();
  await ensureLearner(db);
  const status = await migrationStatus(db);

  out(
    [
      `Initialised knowledge base at ${rel(kbDir())}/`,
      `  concepts/   atomic concept notes`,
      `  sessions/   per-session logs`,
      `  assets/     generated diagrams`,
      ``,
      `State lives in ${redactUrl(databaseUrl())}:`,
      `  event · mastery · review  (was learn/state/*.json)`,
      status.pending.length > 0
        ? `  ${status.pending.length} migration(s) outstanding — run: npm run catalog -- migrate`
        : `  migrations up to date at ${status.head ?? "(none)"}`,
      ``,
      `Next: npm run learn -- concept add --title "…" --requires …`,
    ].join("\n"),
    false,
  );
};

commands.status = async ({ values }, session) => {
  const db = await session.db();
  const graph = await loadGraph();
  const model = await readModel(db);
  const reviews = await readReviews(db);
  const stats = summarize(graph, model);
  const due = dueCards(reviews);
  const front = frontierOf(graph, model);
  const sessions = await listSessions();

  if (values.json) {
    return out(
      { stats, due: due.length, frontier: front.slice(0, 8), sessions: sessions.length },
      true,
    );
  }

  const domains = (await listDomains())
    .sort((a, b) => b.count - a.count)
    .map((d) => `${d.domain ?? "unfiled"} ${d.count}`)
    .join(" · ");

  const lines = [
    `Knowledge base: ${rel(kbDir())}`,
    `Concepts:  ${stats.total}  (${stats.mastered} mastered · ${stats.learning} learning · ${stats.untouched} untouched)`,
    `Domains:   ${domains || "none"}`,
    `Reviews:   ${due.length} due now`,
    `Sessions:  ${sessions.length} logged`,
    ``,
  ];

  if (front.length > 0) {
    lines.push("Frontier — teach here next:");
    for (const f of front.slice(0, 6)) {
      lines.push(`  ${bar(f.pL)} ${pct(f.pL)}  ${f.id}  ${f.title}`);
    }
  } else if (stats.total > 0) {
    lines.push("Frontier is empty — everything reachable is mastered.");
  } else {
    lines.push('No concepts yet. Add one with: npm run learn -- concept add --title "…"');
  }

  out(lines.join("\n"), false);
};

commands.concept = async ({ values, positionals }, session) => {
  const sub = positionals[1];

  if (sub === "add") {
    if (values.title === undefined) fail("concept add requires --title");
    const id = values.id ? slugify(values.id) : slugify(values.title);
    if (!id) fail("could not derive an id from --title; pass --id");

    // `--topic` is checked here, before a byte is written. The whole point of
    // the flag is that a session never leaves a note the vocabulary has never
    // heard of, and writing the note first and then discovering the slug was a
    // typo would produce exactly that.
    let topicSlug = values.topic?.trim();
    if (values.topic !== undefined && !topicSlug) {
      fail("concept add --topic needs a topic slug");
    }

    // `--item` is the course-side half: the row the note teaches. Its module
    // names the topic the note must be mapped to, so the flag implies
    // `--topic`, and the two are refused together when they disagree, since
    // the course reader would refuse the file that resulted.
    const itemId = values.item?.trim();
    if (values.item !== undefined && !itemId) {
      fail("concept add --item needs a curriculum item id, e.g. cp4284-m1-t1");
    }
    let itemFile: string | undefined;
    if (itemId !== undefined) {
      try {
        const check = checkItem(repoRoot(), itemId, id);
        itemFile = check.file;
        if (topicSlug === undefined) topicSlug = check.moduleTopic;
        else if (topicSlug !== check.moduleTopic) {
          fail(
            `--item ${itemId} is in a module whose topic is "${check.moduleTopic}", not ` +
              `"${topicSlug}". A row's concepts sit under its module's topic; drop --topic, ` +
              `or pick a row under "${topicSlug}".`,
          );
        }
      } catch (error) {
        if (error instanceof CourseEditError || error instanceof ContentError) {
          fail(error.message);
        }
        throw error;
      }
    }

    // The topic is a row now, and the concept's topic is its `topic_slug`,
    // written through the catalog. Everything that could refuse that write is
    // asked here, before the note exists.
    if (topicSlug !== undefined) {
      try {
        await checkConceptTopic(await session.db(), { concept: id, topic: topicSlug, root: repoRoot() });
      } catch (error) {
        if (error instanceof TopicError || error instanceof WriteThroughError || error instanceof ContentError) {
          fail(error.message);
        }
        throw error;
      }
    }

    const existing = await readConcept(id);
    if (existing !== null && !values.force) {
      fail(`concept "${id}" already exists (pass --force to overwrite)`);
    }

    // With --force over an existing note, a field no flag names keeps what
    // the note has. A re-run is then a way to finish a half-done `--item`
    // without undoing edits made to the note in between, which is what the
    // failure message for that case promises.
    const kept = (flag: string | undefined, prior: unknown): string[] =>
      flag !== undefined ? list(flag) : Array.isArray(prior) ? prior.map(String) : [];
    const concept = {
      id,
      title: values.title,
      summary:
        values.summary ?? (typeof existing?.summary === "string" ? existing.summary : ""),
      requires: kept(values.requires, existing?.requires),
      assumes: kept(values.assumes, existing?.assumes),
      tags: kept(values.tags, existing?.tags),
      sources: kept(values.sources, existing?.sources),
      created:
        typeof existing?.created === "string" ? existing.created : new Date().toISOString(),
    };

    const sections = [
      `# ${values.title}`,
      values.summary || `> One-paragraph statement of the idea.`,
      `## Why it matters`,
      `## The idea`,
      `## Worked example`,
      `## Failure modes`,
    ];
    if (concept.requires.length > 0) {
      sections.push(`## Prerequisites\n\n${concept.requires.map((r) => `- [[${r}]]`).join("\n")}`);
    }
    const body = values.body ?? existing?.body ?? `${sections.join("\n\n")}\n`;

    const file = await writeConcept(
      { ...concept, body },
      { domain: values.domain === undefined ? null : values.domain || null },
    );
    await ensureDirs();

    // A note is not in the catalog until it is indexed, and it cannot be
    // indexed until it is filed under a topic. `--topic` does both, so the
    // note a session just wrote can carry evidence at the very next
    // `observe`. Without it the note is a file and nothing else, which is
    // worth saying loudly here rather than at the first refusal.
    let indexed = false;
    if (topicSlug !== undefined) {
      try {
        // The topic first: the course reader refuses a listed concept its
        // module's topic does not map, so the listing cannot go in ahead of
        // it. `concept.topic_slug` through the seam, and topics.yaml
        // rewritten from the rows, whose `maps.concepts` is that column.
        // Read back as the concepts indexer reads it, so the row written
        // here is the row that index would write, body included.
        const note = readNote(await fs.readFile(file, "utf8"), rel(file), path.basename(file, ".md"));
        const folder = path.relative(conceptsDir(), path.dirname(file));
        await fileConceptUnderTopic(
          await session.db(),
          {
            concept: id,
            topic: topicSlug,
            row: {
              title: note.title,
              summary: note.summary,
              path: rel(file),
              prerequisites: (["requires", "assumes"] as const).flatMap((kind) =>
                note[kind].map((slug) => ({ slug, kind })),
              ),
              note: {
                domain: folder === "" ? null : folder,
                body: note.body,
                tags: note.tags,
                sources: note.sources,
                authoredAt: note.created,
              },
            },
          },
          {
            author: LOCAL_LEARNER_ID,
            authorKind: "person",
            reason: values.reason?.trim() || `learn concept add ${id} --topic ${topicSlug}`,
          },
        );
        if (itemId !== undefined) {
          // The mapping is in place by now and has no inverse, so a listing
          // that fails (the course file's lock held past its timeout, say)
          // leaves the note mapped and unlisted. Every step is idempotent, so
          // the way out is the same command again with --force, and the
          // message says so rather than leaving the state to be worked out.
          try {
            await listConceptOnItem(repoRoot(), itemId, id);
          } catch (error) {
            if (error instanceof CourseEditError || error instanceof ContentError) {
              fail(
                `${rel(file)} was written and mapped to "${topicSlug}", but not listed on ` +
                  `${itemId}: ${error.message}\n  The note and the mapping are in place. Re-run the ` +
                  `same command with --force to finish: the note keeps its body and any field ` +
                  `no flag names, and the mapping and listing are idempotent.`,
              );
            }
            throw error;
          }
        }
        // Concepts, and courses behind it, which is what writes the row's link.
        await runIndex(await session.db(), { only: ["concepts"], repoRoot: repoRoot() });
      } catch (error) {
        if (
          error instanceof TopicError ||
          error instanceof WriteThroughError ||
          error instanceof FileLockError ||
          error instanceof CourseEditError ||
          error instanceof ContentError ||
          error instanceof IndexError ||
          error instanceof NoteError
        ) {
          fail(`${rel(file)} was written, but it is not in the catalog: ${error.message}`);
        }
        throw error;
      }
      indexed = true;
    } else {
      indexed = await isIndexed(session, id);
    }

    if (values.json) {
      return out(
        { id, path: rel(file), topic: topicSlug ?? null, item: itemId ?? null, indexed },
        true,
      );
    }

    out(`Wrote ${rel(file)}`, false);
    if (topicSlug !== undefined) {
      out(`Filed "${id}" under topic "${topicSlug}" in the catalog, rewrote ${TOPICS_FILE}, and indexed it.`, false);
      if (itemId !== undefined) out(`Listed "${id}" on ${itemId} in ${itemFile ?? ""}.`, false);
    } else if (!indexed) {
      out(
        `Not in the catalog yet, so nothing can record mastery about it.\n` +
          `  Re-run with --topic <slug> --force to file "${id}" under that topic (its ` +
          `maps.concepts in ${TOPICS_FILE}) and index it in one step.\n` +
          `  Pick the slug with: npm run --silent catalog -- search <term> --json`,
        false,
      );
    }
    return;
  }

  if (sub === "edit") {
    const id = positionals[2] ?? values.id;
    if (id === undefined) fail("concept edit requires an id");
    const concept = await readConcept(id);
    if (concept === null) fail(`no such concept: ${id}`);

    // Only touch what was passed. An explicit empty string clears a list,
    // which is how you drop a prerequisite without hand-editing frontmatter.
    const patch: Record<string, unknown> = {};
    for (const field of ["title", "summary"] as const) {
      if (values[field] !== undefined) patch[field] = values[field];
    }
    for (const field of ["requires", "assumes", "tags", "sources"] as const) {
      if (values[field] !== undefined) patch[field] = list(values[field]);
    }
    if (Object.keys(patch).length === 0 && values.domain === undefined) {
      fail("concept edit needs at least one field to change");
    }

    // writeConcept drops body/path/id/domain from the frontmatter itself.
    // Passing domain moves the file; omitting it leaves the note where it is.
    const moved = values.domain !== undefined;
    const file = await writeConcept(
      { ...concept, ...patch },
      moved ? { domain: values.domain || null } : {},
    );
    if (moved) patch.domain = values.domain || "(unfiled)";

    if (values.json) {
      return out({ id, changed: Object.keys(patch), path: rel(file), ...patch }, true);
    }
    return out(
      `Updated ${id}: ${Object.entries(patch)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") || "(none)" : v}`)
        .join("  ")}`,
      false,
    );
  }

  if (sub === "list") {
    const db = await session.db();
    const graph = await loadGraph();
    const model = await readModel(db);
    const rows = [...graph.nodes.values()].map((node) => ({
      id: node.id,
      title: node.title ?? node.id,
      pL: masteryOf(model, node.id) as number,
      requires: node.requires,
      assumes: node.assumes,
      tags: node.tags ?? [],
      domain: node.domain ?? null,
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id));

    if (values.json) return out(rows, true);
    if (rows.length === 0) return out("No concepts yet.", false);

    const line = (r: (typeof rows)[number]) =>
      `  ${bar(r.pL)} ${pct(r.pL)}  ${r.id.padEnd(30)} ${r.title}${
        r.requires.length ? `  ← ${r.requires.join(", ")}` : ""
      }${r.assumes.length ? `  (assumes ${r.assumes.join(", ")})` : ""}`;

    const grouped = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.domain ?? "(unfiled)";
      const bucket = grouped.get(key);
      if (bucket === undefined) grouped.set(key, [r]);
      else bucket.push(r);
    }

    const blocks = [...grouped]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([domain, items]) => [`${domain}/  (${items.length})`, ...items.map(line)].join("\n"));
    out(blocks.join("\n\n"), false);
    return;
  }

  if (sub === "show") {
    const id = positionals[2] ?? values.id;
    if (id === undefined) fail("concept show requires an id");
    const concept = await readConcept(id);
    if (concept === null) fail(`no such concept: ${id}`);
    const model = await readModel(await session.db());
    if (values.json) {
      return out({ ...concept, pL: masteryOf(model, id) }, true);
    }
    out(
      `${concept.title} (${id})\nmastery ${pct(masteryOf(model, id) as number)}\n\n${concept.body.trim()}`,
      false,
    );
    return;
  }

  fail("usage: concept add|edit|list|show");
};

/** Is this slug a row in the catalog? Used only to warn, never to gate. */
async function isIndexed(session: Session, id: string): Promise<boolean> {
  try {
    await assertKnownConcepts(await session.db(), [id]);
    return true;
  } catch {
    // Includes "the database is down", which is not a reason to withhold the
    // note the learner just wrote. The warning is skipped, the file is on disk.
    return false;
  }
}

commands.check = async ({ values, positionals }) => {
  const sub = positionals[1];

  if (sub === "add") {
    const id = values.concept;
    if (id === undefined) fail("check add requires --concept");
    if (values.question === undefined) fail("check add requires --question");
    const concept = await readConcept(id);
    if (concept === null) fail(`no such concept: ${id}`);

    const body = appendCheck(concept.body, {
      question: values.question,
      answer: values.answer ?? "",
      why: values.why ?? "",
      source: values.sources ?? "",
    }) as string;
    // writeConcept strips body/path/id itself, so pass the note straight back.
    await writeConcept({ ...concept, body });

    const checks = parseChecks(body) as Check[];
    if (values.json) return out({ concept: id, checks: checks.length }, true);
    return out(`Added check ${checks.length} to ${id}`, false);
  }

  if (sub === "list") {
    const ids =
      values.concept !== undefined ? [values.concept] : (await listConcepts()).map((c) => c.id);
    const rows: Record<string, unknown>[] = [];
    for (const id of ids) {
      const concept = await readConcept(id);
      if (concept === null) continue;
      for (const check of parseChecks(concept.body) as Check[]) {
        rows.push({ concept: id, ...check });
      }
    }
    if (values.json) return out(rows, true);
    if (rows.length === 0) return out("No checks yet.", false);
    return out(
      rows.map((r) => `${r.concept} ${r.id}\n  Q ${r.question}\n  A ${r.answer}`).join("\n"),
      false,
    );
  }

  fail("usage: check add|list");
};

/**
 * Which concepts to ask about, ranked by expected information gain.
 * This is what makes the probe a binary search: ask where the belief is
 * least certain, not where the syllabus happens to start.
 */
commands.probe = async ({ values }, session) => {
  const db = await session.db();
  const graph = await loadGraph();
  const model = await readModel(db);
  const limit = Number(values.limit ?? 8);

  let scope: string[] = [...graph.nodes.keys()] as string[];
  if (values.goal !== undefined) {
    if (!graph.nodes.has(values.goal)) fail(`unknown concept: ${values.goal}`);
    const { steps } = planPath(graph, model, values.goal) as Plan;
    scope = steps.map((s) => s.id);
    // planPath drops mastered prerequisites; probing should still consider
    // them, since a stale belief is exactly what a probe exists to correct.
    const { order } = topoSort(graph, [
      values.goal,
      ...(graph.nodes.get(values.goal)?.requires ?? []),
    ]) as { order: string[] };
    scope = [...new Set([...scope, ...order])];
  }

  const ranked = scope
    .filter((id) => graph.nodes.has(id))
    .map((id) => {
      const pL = masteryOf(model, id) as number;
      const entry = model.concepts[id];
      const node = graph.nodes.get(id);
      return {
        id,
        title: node?.title ?? id,
        pL,
        mastery: masteryLabel(pL) as string,
        observations: entry?.observations ?? 0,
        infoGain: expectedInfoGain(pL, bktParams(model.params)) as number,
        depth: node?.requires.length ?? 0,
      };
    })
    .sort((a, b) => b.infoGain - a.infoGain || a.depth - b.depth)
    .slice(0, limit);

  if (values.json) return out({ goal: values.goal ?? null, ask: ranked }, true);
  if (ranked.length === 0) return out("Nothing to probe.", false);

  out(
    [
      `Ask about these next (highest expected information gain first):`,
      ``,
      ...ranked.map(
        (r) =>
          `  ${r.infoGain.toFixed(3)} bits  ${pct(r.pL)} ${r.mastery.padEnd(9)} ${r.id}  ${r.title}`,
      ),
    ].join("\n"),
    false,
  );
};

/** The RL step: one observation updates belief and schedule, and is logged. */
commands.observe = async ({ values }, session) => {
  const id = values.concept;
  if (id === undefined) fail("observe requires --concept");
  if (values.correct === undefined) fail("observe requires --correct true|false");

  const db = await session.db();
  const graph = await loadGraph();
  if (!graph.nodes.has(id) && !values.force) {
    fail(`unknown concept: ${id} (add it first, or pass --force)`);
  }
  // `--force` used to mean "record it anyway". It cannot any more: every state
  // table names the concept through a foreign key, so evidence about a slug the
  // catalog has never seen has nowhere to go. The check is explicit so the
  // message says what to do rather than naming a constraint.
  await assertKnownConcepts(db, [id]);

  const correct = bool(values.correct);
  const source = values.source ?? "probe";

  // The write itself is `recordObservation` in `state/observe.ts`, the same
  // function `POST /api/learner/observe` runs: the event, the mastery update
  // with propagation, and the card, under the learner lock in one
  // transaction. What stays here is what only a terminal has: the notes on
  // disk as the graph, the markdown log, and the printing.
  const recorded = await recordObservation(db, {
    conceptId: id,
    correct,
    graph,
    source,
    // A probe measures; it does not teach. Only teaching and review get the
    // BKT transit step, otherwise probing alone would inflate mastery.
    opportunity: bool(values.opportunity, source !== "probe"),
    propagate: !bool(values.noPropagate),
    schedule: bool(values.schedule, true),
    grade: values.grade !== undefined ? Number(values.grade) : undefined,
    question: values.question ?? null,
    answer: values.answer ?? null,
    session: values.session ?? null,
  });
  const before = recorded.pLBefore;
  const after = recorded.pLAfter;
  const propagated = recorded.propagated;
  const due = recorded.due;

  // Recording evidence and writing the log are one act. Keeping them separate
  // is how the first real session ended up with five observations and an empty
  // log: the model updated, and the learner had nothing to read.
  let logged = false;
  if (values.session !== undefined && values.question !== undefined) {
    const options = values.options ? String(values.options).split("|") : [];
    const blocks = [
      renderQuestion(
        values.question,
        options.map((o) => o.trim()).filter(Boolean),
      ),
      renderResult({
        correct,
        chosen: values.chosen ?? "",
        answer: values.answer ?? "",
        note: values.note ?? "",
        explain: values.explain ?? "",
      }),
    ];
    await appendSession(values.session, blocks.join("\n\n"));
    logged = true;
  }

  const result = {
    concept: id,
    correct,
    pLBefore: before,
    pLAfter: after,
    delta: after - before,
    mastery: masteryLabel(after),
    mastered: after >= MASTERY_THRESHOLD,
    due,
    logged,
    propagated,
  };

  if (values.json) return out(result, true);
  out(
    `${correct ? "✓" : "✗"} ${id}  ${pct(before)} → ${pct(after)}  (${masteryLabel(after)})` +
      (result.due ? `  next review ${result.due.slice(0, 10)}` : "") +
      (propagated.length > 0 ? `  · ${propagated.length} prereq(s) nudged` : "") +
      (logged ? "  · logged" : ""),
    false,
  );
};

commands.frontier = async ({ values }, session) => {
  const db = await session.db();
  const graph = await loadGraph();
  const model = await readModel(db);
  const front = frontierOf(graph, model, values.goal ?? null);

  if (values.json) return out(front, true);
  if (front.length === 0) return out("Frontier is empty.", false);
  out(
    front.map((f) => `${bar(f.pL)} ${pct(f.pL)}  ${f.id.padEnd(28)} ${f.title}`).join("\n"),
    false,
  );
};

commands.plan = async ({ values }, session) => {
  if (values.goal === undefined) fail("plan requires --goal");
  const db = await session.db();
  const graph = await loadGraph();
  const model = await readModel(db);

  let plan;
  try {
    plan = planPath(graph, model, values.goal) as Plan;
  } catch (error) {
    fail((error as Error).message);
  }

  if (values.json) return out(plan, true);

  const scope = new Set([values.goal, ...plan.steps.map((s) => s.id)]);
  const lines = [
    `Path to ${values.goal} — ${plan.steps.length} step${plan.steps.length === 1 ? "" : "s"}` +
      (plan.skipped ? ` (${plan.skipped} already mastered, skipped)` : ""),
    ``,
    ...plan.steps.map(
      (s, i) =>
        `${String(i + 1).padStart(2)}. ${pct(s.pL)} ${String(masteryLabel(s.pL)).padEnd(9)} ${s.id}  ${s.title}`,
    ),
  ];

  if (plan.incomplete) {
    lines.push("", "WARNING: a dependency cycle blocks part of this path (run: doctor).");
  }
  if (values.mermaid) {
    lines.push("", renderMermaid(graph, model, { scope }) as string);
  }
  out(lines.join("\n"), false);
};

/** The single next concept to teach, with everything the tutor needs. */
commands.teach = async ({ values }, session) => {
  const db = await session.db();
  const graph = await loadGraph();
  const model = await readModel(db);
  const front = frontierOf(graph, model, values.goal ?? null);

  if (front.length === 0) {
    const payload = { next: null, reason: "frontier-empty" };
    return values.json ? out(payload, true) : out("Nothing to teach.", false);
  }

  const next = front[0] as FrontierEntry;
  const node = graph.nodes.get(next.id) as GraphNode;
  const concept = await readConcept(next.id);
  const payload = {
    next: {
      id: next.id,
      title: node.title ?? next.id,
      summary: node.summary ?? "",
      pL: next.pL,
      mastery: masteryLabel(next.pL),
      requires: node.requires,
      prerequisiteMastery: node.requires.map((dep) => ({
        id: dep,
        pL: masteryOf(model, dep),
      })),
      tags: node.tags ?? [],
      sources: node.sources ?? [],
      body: concept?.body ?? "",
    },
    alsoAtFrontier: front.slice(1, 5).map((f) => f.id),
    goal: values.goal ?? null,
  };

  if (values.json) return out(payload, true);
  out(
    [
      `Teach next: ${payload.next.id} — ${payload.next.title}`,
      `Mastery ${pct(next.pL)} (${payload.next.mastery})`,
      payload.next.requires.length
        ? `Rests on: ${payload.next.requires.join(", ")}`
        : `No prerequisites.`,
      payload.next.summary ? `\n${payload.next.summary}` : ``,
    ]
      .filter(Boolean)
      .join("\n"),
    false,
  );
};

commands.review = async ({ values, positionals }, session) => {
  const sub = positionals[1] ?? "due";
  const db = await session.db();
  const reviews = await readReviews(db);
  const graph = await loadGraph();

  if (sub === "due") {
    const due = dueCards(reviews, { limit: Number(values.limit ?? 20) }) as ReviewCard[];
    const rows = [];
    for (const card of due) {
      const concept = await readConcept(card.conceptId);
      rows.push({
        id: card.conceptId,
        title: graph.nodes.get(card.conceptId)?.title ?? card.conceptId,
        due: card.due,
        intervalDays: card.intervalDays,
        lapses: card.lapses,
        leech: card.leech,
        // Carry the stored checks so a review has something concrete to
        // ask instead of improvising a question each time.
        checks: concept !== null ? (parseChecks(concept.body) as Check[]) : [],
      });
    }
    if (values.json) return out(rows, true);
    if (rows.length === 0) return out("Nothing due.", false);
    return out(
      rows
        .map(
          (r) =>
            `${r.due.slice(0, 10)}  ${r.id.padEnd(28)} ${r.title}` +
            `${r.leech ? "  [leech]" : ""}${r.checks.length ? `  (${r.checks.length} checks)` : "  (no checks)"}`,
        )
        .join("\n"),
      false,
    );
  }

  if (sub === "grade") {
    const id = values.concept;
    if (id === undefined) fail("review grade requires --concept");
    if (values.grade === undefined) fail("review grade requires --grade 0-5");
    const grade = Number(values.grade);
    if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
      fail("--grade must be between 0 and 5");
    }
    // The transaction is `gradeReview` in `state/review.ts`, the same function
    // the web app's rating buttons call, so the terminal and the page cannot
    // record a grade two different ways. It takes the learner lock for the
    // reason `observe` does: it reads the card and the model and writes both.
    const { card, pL } = await gradeReview(db, { conceptId: id, grade, now: new Date() });

    const result = {
      concept: id,
      grade,
      due: card.due,
      intervalDays: card.intervalDays,
      ease: Number(card.ease.toFixed(2)),
      lapses: card.lapses,
      leech: card.leech,
      pL,
    };
    if (values.json) return out(result, true);
    return out(
      `${id}  grade ${grade}  next in ${card.intervalDays}d (${card.due.slice(0, 10)})  ease ${result.ease}` +
        (card.leech ? "  [leech — reformulate this one]" : ""),
      false,
    );
  }

  if (sub === "forecast") {
    const f = forecast(reviews, { days: Number(values.days ?? 14) }) as {
      overdue: number;
      buckets: number[];
    };
    if (values.json) return out(f, true);
    return out(
      [
        `${f.overdue} overdue`,
        ...f.buckets.map(
          (count, i) => `+${String(i).padStart(2)}d  ${"▇".repeat(count)}${count ? ` ${count}` : ""}`,
        ),
      ].join("\n"),
      false,
    );
  }

  // New in bundle 5. `learn/README.md` used to say reviews.json "is not backed
  // up by anything", because grades were logged and nothing replayed them.
  // They are replayed here, with each grade applied at its own event's instant
  // so the rebuilt due dates are the ones that were originally written.
  if (sub === "rebuild") {
    const events = await readEvents(db);
    const { reviews: rebuilt, applied } = replayReviews(events);
    await writeReviews(db, rebuilt);
    const count = Object.keys(rebuilt.cards).length;
    if (values.json) return out({ cards: count, grades: applied, events: events.length }, true);
    return out(
      `Rebuilt ${count} card(s) from ${applied} graded answer(s) in ${events.length} events.`,
      false,
    );
  }

  fail("usage: review due|grade|forecast|rebuild");
};

commands.session = async ({ values, positionals }, session) => {
  const sub = positionals[1];

  if (sub === "start") {
    const topic = values.topic ?? values.goal ?? "session";
    const stamp = new Date().toISOString().slice(0, 10);
    const id = values.id ?? `${stamp}-${slugify(topic)}`;
    const header = [
      `---`,
      `title: ${topic}`,
      `date: ${new Date().toISOString()}`,
      `goal: ${values.goal ?? ""}`,
      `type: learning-session`,
      `---`,
      ``,
      `# ${topic}`,
      ``,
      `> Live log. The tutor appends here as the session runs.`,
      ``,
    ].join("\n");

    await ensureDirs();
    const existing = await fs.readFile(sessionPath(id), "utf8").catch(() => null);
    if (existing === null) await fs.writeFile(sessionPath(id), header, "utf8");
    const db = await session.db();
    // The `session` row before the event that references it. This is what let
    // `event.session_id` become a foreign key in migration `0006`: the referent
    // now exists at write time, where before it was a markdown file nothing had
    // indexed yet.
    await ensureSession(db, { id, kind: "tutor", title: topic, goal: values.goal ?? null });
    await appendEvent(db, {
      type: "session-start",
      session: id,
      goal: values.goal ?? null,
    });

    if (values.json) return out({ id, path: rel(sessionPath(id)) }, true);
    return out(`Session ${id}\n  ${rel(sessionPath(id))}`, false);
  }

  if (sub === "log") {
    const id = values.id;
    if (id === undefined) fail("session log requires --id");
    const text = values.text ?? "";
    if (!text.trim()) fail("session log requires --text");
    const file = await appendSession(id, text);
    if (values.json) return out({ path: rel(file) }, true);
    return out(`Appended to ${rel(file)}`, false);
  }

  if (sub === "close") {
    const id = values.id;
    if (id === undefined) fail("session close requires --id");
    const db = await session.db();
    const graph = await loadGraph();
    const model = await readModel(db);
    const events = await readEvents(db);
    const mine = events.filter((e) => e.session === id && e.type === "observation");
    const touched = [...new Set(mine.map((e) => e.concept as string))];

    const summaryLines = [
      `## Close`,
      ``,
      `- Questions answered: ${mine.length} (${mine.filter((e) => e.correct).length} correct)`,
      `- Concepts touched: ${touched.length}`,
      ...touched.map((c) => {
        const pL = masteryOf(model, c) as number;
        return `  - [[${c}]] → ${pct(pL)} ${masteryLabel(pL)}`;
      }),
      ``,
      `Closed ${new Date().toISOString()}`,
    ];

    await appendSession(id, summaryLines.join("\n"));

    // Link back from every concept the session touched, so the graph is
    // navigable in both directions and a concept carries its own history.
    const reviews = await readReviews(db);
    const linked: string[] = [];
    const unchecked: string[] = [];
    for (const conceptId of touched) {
      const concept = await readConcept(conceptId);
      if (concept === null) continue;

      const answered = mine.filter((e) => e.concept === conceptId);
      const right = answered.filter((e) => e.correct).length;
      const detail = `${right}/${answered.length} correct, ${pct(masteryOf(model, conceptId) as number).trim()}`;
      const body = appendSessionLink(concept.body, id, detail) as string;
      if (body !== concept.body) {
        await writeConcept({ ...concept, body });
        linked.push(conceptId);
      }

      // A scheduled concept with no stored check gives /review nothing to ask.
      if (reviews.cards[conceptId] && (parseChecks(concept.body) as Check[]).length === 0) {
        unchecked.push(conceptId);
      }
    }

    await appendEvent(db, { type: "session-close", session: id, concepts: touched });
    // The event is the evidence; the row is the state. A close replayed against
    // a session that already ended moves nothing, which is why this reports
    // rather than asserts.
    await endSession(db, id, "closed");

    const front = frontierOf(graph, model);
    const result = {
      session: id,
      answered: mine.length,
      correct: mine.filter((e) => e.correct).length,
      concepts: touched,
      linked,
      unchecked,
      nextFrontier: front.slice(0, 3).map((f) => f.id),
    };
    if (values.json) return out(result, true);

    const lines = [
      `Closed ${id}: ${result.answered} answered, ${touched.length} concepts touched.`,
      linked.length ? `Linked ${linked.length} concept note(s) back to this session.` : null,
      unchecked.length
        ? `WARNING: scheduled for review with no checks written: ${unchecked.join(", ")}\n` +
          `  Add one each, or /review will have to improvise a question:\n` +
          `  npm run learn -- check add --concept <id> --question "…" --answer "…"`
        : null,
    ].filter(Boolean);
    return out(lines.join("\n"), false);
  }

  if (sub === "list") {
    const sessions = await listSessions();
    if (values.json) return out(sessions, true);
    return out(sessions.length ? sessions.join("\n") : "No sessions yet.", false);
  }

  fail("usage: session start|log|close|list");
};

/**
 * Retract a session's evidence without deleting it.
 *
 * Sometimes a session measures nothing real: the questions were leading, the
 * answer was visible, the learner was guessing. Keeping that evidence poisons
 * the model, but deleting rows from an append-only log destroys the record of
 * what happened. So voiding appends a marker instead, and `model --rebuild`
 * skips the voided observations while the history stays readable.
 */
commands.void = async ({ values }, session) => {
  const target = values.session ?? values.id;
  if (target === undefined) fail("void requires --session");
  if (values.reason === undefined) fail("void requires --reason (why this evidence is unreliable)");

  const db = await session.db();
  const events = await readEvents(db);
  const affected = events.filter(
    (e) => e.session === target && (e.type === "observation" || e.type === "review"),
  );
  if (affected.length === 0) {
    fail(`no observations found for session "${target}"`);
  }

  await appendEvent(db, { type: "void", session: target, reason: values.reason });

  const concepts = [...new Set(affected.map((e) => e.concept))];
  if (values.json) {
    return out(
      { session: target, voided: affected.length, concepts, reason: values.reason },
      true,
    );
  }
  out(
    `Voided ${affected.length} observation(s) across ${concepts.length} concept(s).\n` +
      `Run "model --rebuild" and "review rebuild" to drop them from the model and\n` +
      `the schedule. Both are projections of the log, and voiding only marks it.`,
    false,
  );
};

commands.model = async ({ values }, session) => {
  const db = await session.db();

  if (values.rebuild) {
    const events = await readEvents(db);
    const graph = await loadGraph();
    const params = (await readModel(db)).params;
    const { model, skipped } = replayMastery(events, graph, params);

    await writeModel(db, model);
    const n = Object.keys(model.concepts).length;
    return out(
      `Rebuilt model from ${events.length} events across ${n} concepts.` +
        (skipped > 0 ? ` Skipped ${skipped} voided observation(s).` : ""),
      false,
    );
  }

  const model = await readModel(db);
  const graph = await loadGraph();
  const rows = [...graph.nodes.keys()]
    .map((id) => ({
      id,
      title: graph.nodes.get(id)?.title ?? id,
      pL: masteryOf(model, id) as number,
      ...model.concepts[id],
    }))
    .sort((a, b) => b.pL - a.pL);

  if (values.json) return out({ params: model.params, concepts: rows }, true);
  if (rows.length === 0) return out("Model is empty.", false);
  out(
    rows
      .map(
        (r) =>
          `${bar(r.pL)} ${pct(r.pL)} ${String(masteryLabel(r.pL)).padEnd(9)} ${r.id.padEnd(28)} ${
            r.observations ?? 0
          } obs`,
      )
      .join("\n"),
    false,
  );
};

commands.map = async ({ values }, session) => {
  const db = await session.db();
  const graph = await loadGraph();
  const model = await readModel(db);
  const front = frontierOf(graph, model);
  const doc = renderMapDocument(graph, model, front) as string;
  await ensureDirs();
  await fs.writeFile(mapFile(), doc, "utf8");
  if (values.json) return out({ path: rel(mapFile()), concepts: graph.nodes.size }, true);
  out(`Wrote ${rel(mapFile())} (${graph.nodes.size} concepts)`, false);
};

/**
 * Re-read the notes into the catalog, and report the same snapshot
 * `state/index.json` used to hold.
 *
 * The file is gone: the web hub queries the tables instead, so a session's
 * results show up on `/learn` immediately rather than at the next deploy. What
 * this command still has to do is the other half of what it always did — make
 * the catalog agree with the notes on disk, so a concept added during a session
 * exists as a row and can carry mastery.
 *
 * The `--json` shape is unchanged, because the `/learn` skill's Close phase
 * reads it.
 */
commands.index = async ({ values }, session) => {
  const db = await session.db();
  // The import reads `content_source` and writes revisions, both from 0010 on.
  // Refused by name on an older database rather than with a stack trace.
  await assertMigrated(db);

  let written = 0;
  let deleted = 0;
  try {
    const run = await runIndex(db, { only: ["concepts"], repoRoot: repoRoot() });
    written = run.totals.written;
    deleted = run.totals.deleted;
  } catch (error) {
    if (error instanceof IndexError) fail(error.message);
    throw error;
  }

  const graph = await loadGraph();
  const model = await readModel(db);
  const reviews = await readReviews(db);
  const front = frontierOf(graph, model);
  const index = buildIndex(graph, model, reviews, front);

  if (values.json) return out(index, true);
  out(
    `Indexed ${rel(kbDir())}/concepts into ${redactUrl(databaseUrl())}: ` +
      `${written} row(s) written${deleted > 0 ? `, ${deleted} removed` : ""}.`,
    false,
  );
};

commands.doctor = async ({ values }, session) => {
  const graph = await loadGraph();
  const problems: { severity: "error" | "warn"; kind: string; message: string }[] = [];

  // The database is checked first and hardest. Everything else here is about
  // the notes, and a knowledge base whose state store is unreachable or behind
  // on migrations is broken in a way no amount of correct frontmatter fixes.
  let model: Model = { params: { ...DEFAULT_PARAMS }, concepts: {} };
  let db: CatalogDatabase | null = null;
  try {
    db = await session.db();
  } catch (error) {
    problems.push({
      severity: "error",
      kind: "database-unreachable",
      message: (error as Error).message.split("\n").join(" "),
    });
  }

  if (db !== null) {
    const migrations = await migrationStatus(db);
    if (migrations.head === null) {
      problems.push({
        severity: "error",
        kind: "database-unmigrated",
        message:
          `${redactUrl(databaseUrl())} has no migrations applied. ` +
          `Run: npm run catalog -- migrate`,
      });
    } else if (migrations.pending.length > 0) {
      problems.push({
        severity: "error",
        kind: "database-behind",
        message:
          `${redactUrl(databaseUrl())} is at ${migrations.head}, ` +
          `${migrations.pending.length} migration(s) outstanding (${migrations.pending.join(", ")}). ` +
          `Run: npm run catalog -- migrate`,
      });
    } else {
      model = await readModel(db);
      const known = new Set(Object.keys(model.concepts));
      // The mirror image of the old "stale model entry" check. Mastery for a
      // deleted note is impossible now — the foreign key sees to that — so what
      // is left to catch is the opposite: a note on disk that no index run has
      // taken in, which therefore cannot carry evidence.
      for (const id of graph.nodes.keys()) {
        if (known.has(id)) continue;
        try {
          await assertKnownConcepts(db, [id]);
        } catch {
          problems.push({
            severity: "warn",
            kind: "unindexed-concept",
            message: `${id} is a note on disk but not a row in the catalog — run: npm run learn -- index`,
          });
        }
      }
    }
  }

  // The id is the filename, and Obsidian resolves wikilinks the same way, so
  // two notes sharing a basename would make both the link and the id ambiguous.
  for (const { id, kept, ignored } of await conceptCollisions()) {
    problems.push({
      severity: "error",
      kind: "duplicate-id",
      message: `"${id}" exists in two folders; using ${rel(kept)}, ignoring ${rel(ignored)}`,
    });
  }

  for (const node of graph.nodes.values()) {
    if (!node.domain) {
      problems.push({
        severity: "warn",
        kind: "unfiled",
        message: `${node.id} sits at the root of concepts/ with no domain folder`,
      });
    }
  }

  for (const { from, missing } of danglingEdges(graph) as { from: string; missing: string }[]) {
    problems.push({
      severity: "error",
      kind: "dangling-prerequisite",
      message: `${from} requires "${missing}", which does not exist`,
    });
  }

  for (const cycle of findCycles(graph) as string[][]) {
    problems.push({
      severity: "error",
      kind: "cycle",
      message: `dependency cycle: ${cycle.join(" → ")}`,
    });
  }

  for (const [id, node] of graph.nodes) {
    if (!node.title) {
      problems.push({ severity: "warn", kind: "missing-title", message: `${id} has no title` });
    }
    const orphan =
      node.requires.length === 0 && (graph.dependents.get(id) ?? []).length === 0;
    if (orphan && graph.nodes.size > 1) {
      problems.push({
        severity: "warn",
        kind: "orphan",
        message: `${id} is connected to nothing — is a prerequisite missing?`,
      });
    }
  }

  const errors = problems.filter((p) => p.severity === "error");
  if (values.json) {
    out({ ok: errors.length === 0, problems }, true);
    if (errors.length > 0) process.exitCode = 1;
    return;
  }

  if (problems.length === 0) {
    return out(`Knowledge base is healthy (${graph.nodes.size} concepts).`, false);
  }
  out(
    problems.map((p) => `${p.severity === "error" ? "ERROR" : " WARN"}  ${p.message}`).join("\n"),
    false,
  );
  if (errors.length > 0) process.exitCode = 1;
};

commands.help = async () => {
  out(
    `learn — local learning pipeline

  status                         where you are
  concept add --title T [--topic S] [--item I] [--domain D] [--requires a,b]
              [--assumes c] [--tags x,y]
                                 --topic is a topic slug: it files the new id
                                   under that topic in the catalog (rewriting
                                   its maps.concepts in content/topics.yaml)
                                   and indexes the note, so it can carry mastery
                                   straight away. Without it the note is a file
                                   and nothing else. --reason names why, for
                                   the revision; it has a default.
                                 --item is a course row id like cp4284-m1-t1: it
                                   lists the new id under that row's concepts:
                                   in content/courses/, so the note is on the
                                   course path. It implies --topic (the row's
                                   module names it).
  concept edit <id> [--domain D] [--requires …] [--assumes …] [--title …]
                                 --domain files the note under concepts/<D>/;
                                   the id stays the bare slug either way
  concept list|show <id>
                                 requires = cannot be understood without it:
                                   gates teaching, carries evidence
                                 assumes  = useful background: orders the plan,
                                   never blocks, never moves belief
  check add --concept C --question Q --answer A [--why W]
  check list [--concept C]       stored verification questions
  probe [--goal G] [--limit N]   what to ask next, by information gain
  observe --concept C --correct true|false [--source probe|teach|review]
                                 [--schedule false] to skip the review slot
                                 [--grade 0-5] [--session S]
                                 [--question Q] [--options "a|b|c|d"] [--chosen X]
                                 [--answer A] [--note "learner's own words"]
                                 [--explain "why the others are wrong"]
                                 With --session and --question it also writes the
                                 exchange into the session log as callouts.
  frontier [--goal G]            the edge of understanding
  plan --goal G [--mermaid]      ordered path from known to goal
  teach [--goal G]               the single next concept, with context
  review due|grade|forecast      spaced repetition
  review rebuild                 replay the log into the schedule
  session start|log|close|list   the session log
  void --session S --reason R    retract a session's evidence as unreliable\n  model [--rebuild]              mastery table; rebuild replays the event log
  map                            regenerate learn/map.md
  index                          re-read the notes into the catalog
  doctor                         validate the graph and the state store

Notes, checks, sessions and map.md are files under learn/. Mastery, the
schedule and the event log are tables; DATABASE_URL points at them and
defaults to postgres://localhost:5432/self_learn.

Add --json to any command for machine-readable output.`,
    false,
  );
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

const OPTIONS = {
  json: { type: "boolean", default: false },
  goal: { type: "string" },
  concept: { type: "string" },
  correct: { type: "string" },
  source: { type: "string" },
  grade: { type: "string" },
  opportunity: { type: "string" },
  schedule: { type: "string" },
  noPropagate: { type: "boolean", default: false },
  question: { type: "string" },
  answer: { type: "string" },
  why: { type: "string" },
  reason: { type: "string" },
  options: { type: "string" },
  chosen: { type: "string" },
  explain: { type: "string" },
  note: { type: "string" },
  session: { type: "string" },
  id: { type: "string" },
  title: { type: "string" },
  summary: { type: "string" },
  requires: { type: "string" },
  assumes: { type: "string" },
  domain: { type: "string" },
  tags: { type: "string" },
  sources: { type: "string" },
  body: { type: "string" },
  text: { type: "string" },
  topic: { type: "string" },
  item: { type: "string" },
  limit: { type: "string" },
  days: { type: "string" },
  mermaid: { type: "boolean", default: false },
  rebuild: { type: "boolean", default: false },
  force: { type: "boolean", default: false },
} as const;

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    process.stderr.write(`learn: ${(error as Error).message}\nRun "learn help" for usage.\n`);
    return 1;
  }

  const name = parsed.positionals[0] ?? "status";
  // `Object.hasOwn`, not a truthiness check on the lookup. `commands` is a
  // plain object, so `commands["constructor"]` is `Object` rather than
  // undefined, and the guard below would hand the parsed arguments to it.
  if (!Object.hasOwn(commands, name)) {
    process.stderr.write(`learn: unknown command "${name}". Run "learn help".\n`);
    return 1;
  }
  const command = commands[name] as Command;

  const session = new Session();
  try {
    await ensureDirs();
    await command(parsed as Parsed, session);
    return process.exitCode === 1 ? 1 : 0;
  } catch (error) {
    // The same code the catalog CLI uses for it, so a script can tell "run
    // migrate" from a failure without reading the sentence.
    if (error instanceof MigrationsOutstanding) {
      process.stderr.write(`learn: ${redactUrl(databaseUrl())} is behind this code. ${error.message}\n`);
      return EXIT_MIGRATIONS_OUTSTANDING;
    }
    // A CliError, a StateError or an IndexError is a sentence written for the
    // person reading it. Anything else is a bug, and its stack is the useful
    // part — which is what the old `main().catch` printed for everything.
    const expected =
      error instanceof CliError || error instanceof StateError || error instanceof IndexError;
    const message = expected
      ? (error as Error).message
      : ((error as Error)?.stack ?? String(error));
    process.stderr.write(`learn: ${message}\n`);
    return 1;
  } finally {
    await session.close();
  }
}

process.exitCode = await main(process.argv.slice(2));
