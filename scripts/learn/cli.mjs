#!/usr/bin/env node
/**
 * `learn` — the primitive surface of the learning pipeline.
 *
 * Every phase of the loop is a command an agent (or a human) can call, and
 * every call that carries evidence appends to an append-only trajectory log.
 * Nothing about the pipeline lives only in a conversation: the model, the
 * graph and the schedule are all files on disk you can read and diff.
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
 */

import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import process from "node:process";

import { CONCEPTS_DIR, KB, MAP_FILE, STATE_DIR, rel } from "./lib/paths.mjs";
import {
  DEFAULT_PARAMS,
  MASTERY_THRESHOLD,
  expectedInfoGain,
  masteryLabel,
  propagate,
  update as bktUpdate,
} from "./lib/bkt.mjs";
import {
  buildGraph,
  danglingEdges,
  findCycles,
  frontier,
  masteryOf,
  planPath,
  prerequisiteDistances,
  summarize,
  topoSort,
} from "./lib/graph.mjs";
import {
  dueCards,
  forecast,
  gradeFromOutcome,
  newCard,
  review as reviewCard,
} from "./lib/schedule.mjs";
import { buildIndex, renderMapDocument, renderMermaid } from "./lib/render.mjs";
import {
  appendCheck,
  appendSessionLink,
  parseChecks,
  slugify,
} from "./lib/markdown.mjs";
import { renderQuestion, renderResult } from "./lib/session-log.mjs";
import {
  appendEvent,
  appendSession,
  emptyModel,
  ensureDirs,
  conceptCollisions,
  listConcepts,
  listDomains,
  listSessions,
  readConcept,
  readEvents,
  readModel,
  readReviews,
  sessionPath,
  writeConcept,
  writeModel,
  writeReviews,
} from "./lib/store.mjs";

const INDEX_FILE = `${STATE_DIR}/index.json`;

// ------------------------------------------------------------------ helpers

function fail(message) {
  process.stderr.write(`learn: ${message}\n`);
  process.exit(1);
}

function out(value, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else {
    process.stdout.write(`${value}\n`);
  }
}

function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "y", "correct"].includes(String(value).toLowerCase());
}

function list(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function pct(x) {
  return `${String(Math.round(x * 100)).padStart(3)}%`;
}

function bar(x, width = 16) {
  const filled = Math.round(x * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

async function loadGraph() {
  const concepts = await listConcepts();
  return buildGraph(concepts);
}

/** Ensure the model has an entry for a concept. */
function ensureEntry(model, id) {
  if (!model.concepts[id]) {
    model.concepts[id] = {
      pL: model.params?.pL0 ?? DEFAULT_PARAMS.pL0,
      observations: 0,
      correct: 0,
      lastSeen: null,
    };
  }
  return model.concepts[id];
}

/**
 * Spread a correct answer to the concept's prerequisites.
 *
 * Only correct answers propagate. A wrong answer is weak evidence about
 * prerequisites, since the learner may have failed for reasons specific to
 * the concept asked, so inferring downward from failure would punish
 * foundations that are probably fine.
 *
 * `observations` is deliberately not incremented: it counts questions the
 * learner was actually asked, and propagation asks nothing.
 */
function propagateCorrect(model, graph, id) {
  const touched = [];
  if (!graph.nodes.has(id)) return touched;

  for (const [prereq, hops] of prerequisiteDistances(graph, id)) {
    const entry = ensureEntry(model, prereq);
    const before = entry.pL;
    const after = propagate(before, true, hops, { params: model.params });
    if (after - before < 1e-9) continue;
    entry.pL = after;
    touched.push({ concept: prereq, hops, pLBefore: before, pLAfter: after });
  }
  return touched;
}

// ----------------------------------------------------------------- commands

const commands = {};

commands.init = async () => {
  await ensureDirs();
  const model = await readModel();
  await writeModel(model);
  const reviews = await readReviews();
  await writeReviews(reviews);

  const gitkeep = `${CONCEPTS_DIR}/.gitkeep`;
  await fs.writeFile(gitkeep, "", "utf8").catch(() => {});

  out(
    [
      `Initialised knowledge base at ${rel(KB)}/`,
      `  concepts/   atomic concept notes`,
      `  sessions/   per-session logs`,
      `  state/      model.json · reviews.json · events.jsonl`,
      `  assets/     generated diagrams`,
      ``,
      `Next: npm run learn -- concept add --title "…" --requires …`,
    ].join("\n"),
    false,
  );
};

commands.status = async ({ values }) => {
  const graph = await loadGraph();
  const model = await readModel();
  const reviews = await readReviews();
  const stats = summarize(graph, model);
  const due = dueCards(reviews);
  const front = frontier(graph, model);
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
    `Knowledge base: ${rel(KB)}`,
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
    lines.push("No concepts yet. Add one with: npm run learn -- concept add --title \"…\"");
  }

  out(lines.join("\n"), false);
};

commands.concept = async ({ values, positionals }) => {
  const sub = positionals[1];

  if (sub === "add") {
    if (!values.title) fail("concept add requires --title");
    const id = values.id ? slugify(values.id) : slugify(values.title);
    if (!id) fail("could not derive an id from --title; pass --id");

    const existing = await readConcept(id);
    if (existing && !values.force) {
      fail(`concept "${id}" already exists (pass --force to overwrite)`);
    }

    const concept = {
      id,
      title: values.title,
      summary: values.summary ?? "",
      requires: list(values.requires),
      assumes: list(values.assumes),
      tags: list(values.tags),
      sources: list(values.sources),
      topics: list(values.topics),
      created: existing?.created ?? new Date().toISOString(),
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
      sections.push(
        `## Prerequisites\n\n${concept.requires.map((r) => `- [[${r}]]`).join("\n")}`,
      );
    }
    const body = values.body ?? existing?.body ?? `${sections.join("\n\n")}\n`;

    const file = await writeConcept(
      { ...concept, body },
      { domain: values.domain ?? null },
    );
    await ensureDirs();
    out(`Wrote ${rel(file)}`, false);
    return;
  }

  if (sub === "edit") {
    const id = positionals[2] ?? values.id;
    if (!id) fail("concept edit requires an id");
    const concept = await readConcept(id);
    if (!concept) fail(`no such concept: ${id}`);

    // Only touch what was passed. An explicit empty string clears a list,
    // which is how you drop a prerequisite without hand-editing frontmatter.
    const patch = {};
    for (const field of ["title", "summary"]) {
      if (values[field] !== undefined) patch[field] = values[field];
    }
    for (const field of ["requires", "assumes", "tags", "topics", "sources"]) {
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
    const graph = await loadGraph();
    const model = await readModel();
    const rows = [...graph.nodes.values()].map((node) => ({
      id: node.id,
      title: node.title ?? node.id,
      pL: masteryOf(model, node.id),
      requires: node.requires,
      assumes: node.assumes,
      tags: node.tags,
      domain: node.domain ?? null,
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id));

    if (values.json) return out(rows, true);
    if (rows.length === 0) return out("No concepts yet.", false);

    const line = (r) =>
      `  ${bar(r.pL)} ${pct(r.pL)}  ${r.id.padEnd(30)} ${r.title}${
        r.requires.length ? `  ← ${r.requires.join(", ")}` : ""
      }${r.assumes.length ? `  (assumes ${r.assumes.join(", ")})` : ""}`;

    const grouped = new Map();
    for (const r of rows) {
      const key = r.domain ?? "(unfiled)";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }

    const blocks = [...grouped]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([domain, items]) =>
        [`${domain}/  (${items.length})`, ...items.map(line)].join("\n"),
      );
    out(blocks.join("\n\n"), false);
    return;
  }

  if (sub === "show") {
    const id = positionals[2] ?? values.id;
    if (!id) fail("concept show requires an id");
    const concept = await readConcept(id);
    if (!concept) fail(`no such concept: ${id}`);
    const model = await readModel();
    if (values.json) {
      return out({ ...concept, pL: masteryOf(model, id) }, true);
    }
    out(
      `${concept.title} (${id})\nmastery ${pct(masteryOf(model, id))}\n\n${concept.body.trim()}`,
      false,
    );
    return;
  }

  fail("usage: concept add|edit|list|show");
};

commands.check = async ({ values, positionals }) => {
  const sub = positionals[1];

  if (sub === "add") {
    const id = values.concept;
    if (!id) fail("check add requires --concept");
    if (!values.question) fail("check add requires --question");
    const concept = await readConcept(id);
    if (!concept) fail(`no such concept: ${id}`);

    const body = appendCheck(concept.body, {
      question: values.question,
      answer: values.answer ?? "",
      why: values.why ?? "",
      source: values.sources ?? "",
    });
    // writeConcept strips body/path/id itself, so pass the note straight back.
    await writeConcept({ ...concept, body });

    const checks = parseChecks(body);
    if (values.json) return out({ concept: id, checks: checks.length }, true);
    return out(`Added check ${checks.length} to ${id}`, false);
  }

  if (sub === "list") {
    const ids = values.concept
      ? [values.concept]
      : (await listConcepts()).map((c) => c.id);
    const rows = [];
    for (const id of ids) {
      const concept = await readConcept(id);
      if (!concept) continue;
      for (const check of parseChecks(concept.body)) {
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
commands.probe = async ({ values }) => {
  const graph = await loadGraph();
  const model = await readModel();
  const limit = Number(values.limit ?? 8);

  let scope = [...graph.nodes.keys()];
  if (values.goal) {
    if (!graph.nodes.has(values.goal)) fail(`unknown concept: ${values.goal}`);
    const { steps } = planPath(graph, model, values.goal);
    scope = steps.map((s) => s.id);
    // planPath drops mastered prerequisites; probing should still consider
    // them, since a stale belief is exactly what a probe exists to correct.
    const { order } = topoSort(graph, [
      values.goal,
      ...graph.nodes.get(values.goal).requires,
    ]);
    scope = [...new Set([...scope, ...order])];
  }

  const ranked = scope
    .filter((id) => graph.nodes.has(id))
    .map((id) => {
      const pL = masteryOf(model, id);
      const entry = model.concepts?.[id];
      return {
        id,
        title: graph.nodes.get(id).title ?? id,
        pL,
        mastery: masteryLabel(pL),
        observations: entry?.observations ?? 0,
        infoGain: expectedInfoGain(pL, model.params),
        depth: graph.nodes.get(id).requires.length,
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
commands.observe = async ({ values }) => {
  const id = values.concept;
  if (!id) fail("observe requires --concept");
  if (values.correct === undefined) fail("observe requires --correct true|false");

  const graph = await loadGraph();
  if (!graph.nodes.has(id) && !values.force) {
    fail(`unknown concept: ${id} (add it first, or pass --force)`);
  }

  const correct = bool(values.correct);
  const source = values.source ?? "probe";
  // A probe measures; it does not teach. Only teaching and review get the
  // BKT transit step, otherwise probing alone would inflate mastery.
  const opportunity = bool(values.opportunity, source !== "probe");

  const model = await readModel();
  const entry = ensureEntry(model, id);
  const before = entry.pL;
  const after = bktUpdate(before, correct, {
    params: model.params,
    opportunity,
  });

  entry.pL = after;
  entry.observations += 1;
  if (correct) entry.correct += 1;
  entry.lastSeen = new Date().toISOString();

  const propagated =
    correct && !bool(values.noPropagate) ? propagateCorrect(model, graph, id) : [];

  await writeModel(model);

  // Whether an answer teaches and whether it should come back for review are
  // different questions, and tying both to `source` conflated them: a probe
  // correctly skips the learning step, but that also meant a concept you
  // already knew was never scheduled and would silently rot. Every answered
  // question now earns a review slot, whatever the source.
  const reviews = await readReviews();
  const grade =
    values.grade !== undefined
      ? Number(values.grade)
      : gradeFromOutcome(correct, after);
  const scheduled = !bool(values.schedule, true) ? null : reviewCard(
    reviews.cards[id] ?? newCard(id),
    grade,
  );
  if (scheduled) {
    reviews.cards[id] = scheduled;
    await writeReviews(reviews);
  }

  await appendEvent({
    type: "observation",
    concept: id,
    correct,
    propagated: propagated.map((x) => ({ concept: x.concept, hops: x.hops })),
    source,
    opportunity,
    grade,
    pLBefore: before,
    pLAfter: after,
    question: values.question ?? null,
    answer: values.answer ?? null,
    session: values.session ?? null,
  });

  // Recording evidence and writing the log are one act. Keeping them separate
  // is how the first real session ended up with five observations and an empty
  // log: the model updated, and the learner had nothing to read.
  let logged = false;
  if (values.session && values.question) {
    const options = values.options ? String(values.options).split("|") : [];
    const blocks = [
      renderQuestion(values.question, options.map((o) => o.trim()).filter(Boolean)),
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
    due: scheduled?.due ?? reviews.cards[id]?.due ?? null,
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

commands.frontier = async ({ values }) => {
  const graph = await loadGraph();
  const model = await readModel();
  const front = frontier(graph, model, { goal: values.goal ?? null });

  if (values.json) return out(front, true);
  if (front.length === 0) return out("Frontier is empty.", false);
  out(
    front
      .map((f) => `${bar(f.pL)} ${pct(f.pL)}  ${f.id.padEnd(28)} ${f.title}`)
      .join("\n"),
    false,
  );
};

commands.plan = async ({ values }) => {
  if (!values.goal) fail("plan requires --goal");
  const graph = await loadGraph();
  const model = await readModel();

  let plan;
  try {
    plan = planPath(graph, model, values.goal);
  } catch (err) {
    fail(err.message);
  }

  if (values.json) return out(plan, true);

  const scope = new Set([values.goal, ...plan.steps.map((s) => s.id)]);
  const lines = [
    `Path to ${values.goal} — ${plan.steps.length} step${plan.steps.length === 1 ? "" : "s"}` +
      (plan.skipped ? ` (${plan.skipped} already mastered, skipped)` : ""),
    ``,
    ...plan.steps.map(
      (s, i) =>
        `${String(i + 1).padStart(2)}. ${pct(s.pL)} ${masteryLabel(s.pL).padEnd(9)} ${s.id}  ${s.title}`,
    ),
  ];

  if (plan.incomplete) {
    lines.push("", "WARNING: a dependency cycle blocks part of this path (run: doctor).");
  }
  if (values.mermaid) {
    lines.push("", renderMermaid(graph, model, { scope }));
  }
  out(lines.join("\n"), false);
};

/** The single next concept to teach, with everything the tutor needs. */
commands.teach = async ({ values }) => {
  const graph = await loadGraph();
  const model = await readModel();
  const front = frontier(graph, model, { goal: values.goal ?? null });

  if (front.length === 0) {
    const payload = { next: null, reason: "frontier-empty" };
    return values.json ? out(payload, true) : out("Nothing to teach.", false);
  }

  const next = front[0];
  const node = graph.nodes.get(next.id);
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

commands.review = async ({ values, positionals }) => {
  const sub = positionals[1] ?? "due";
  const reviews = await readReviews();
  const graph = await loadGraph();

  if (sub === "due") {
    const due = dueCards(reviews, { limit: Number(values.limit ?? 20) });
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
        checks: concept ? parseChecks(concept.body) : [],
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
    if (!id) fail("review grade requires --concept");
    if (values.grade === undefined) fail("review grade requires --grade 0-5");
    const grade = Number(values.grade);
    if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
      fail("--grade must be between 0 and 5");
    }

    const card = reviewCard(reviews.cards[id] ?? newCard(id), grade);
    reviews.cards[id] = card;
    await writeReviews(reviews);

    const model = await readModel();
    const entry = ensureEntry(model, id);
    const before = entry.pL;
    entry.pL = bktUpdate(before, grade >= 3, { params: model.params });
    entry.observations += 1;
    if (grade >= 3) entry.correct += 1;
    entry.lastSeen = new Date().toISOString();
    await writeModel(model);

    await appendEvent({
      type: "review",
      concept: id,
      grade,
      pLBefore: before,
      pLAfter: entry.pL,
    });

    const result = {
      concept: id,
      grade,
      due: card.due,
      intervalDays: card.intervalDays,
      ease: Number(card.ease.toFixed(2)),
      lapses: card.lapses,
      leech: card.leech,
      pL: entry.pL,
    };
    if (values.json) return out(result, true);
    return out(
      `${id}  grade ${grade}  next in ${card.intervalDays}d (${card.due.slice(0, 10)})  ease ${result.ease}` +
        (card.leech ? "  [leech — reformulate this one]" : ""),
      false,
    );
  }

  if (sub === "forecast") {
    const f = forecast(reviews, { days: Number(values.days ?? 14) });
    if (values.json) return out(f, true);
    return out(
      [
        `${f.overdue} overdue`,
        ...f.buckets.map((count, i) => `+${String(i).padStart(2)}d  ${"▇".repeat(count)}${count ? ` ${count}` : ""}`),
      ].join("\n"),
      false,
    );
  }

  fail("usage: review due|grade|forecast");
};

commands.session = async ({ values, positionals }) => {
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
    if (!existing) await fs.writeFile(sessionPath(id), header, "utf8");
    await appendEvent({ type: "session-start", session: id, goal: values.goal ?? null });

    if (values.json) return out({ id, path: rel(sessionPath(id)) }, true);
    return out(`Session ${id}\n  ${rel(sessionPath(id))}`, false);
  }

  if (sub === "log") {
    const id = values.id;
    if (!id) fail("session log requires --id");
    const text = values.text ?? "";
    if (!text.trim()) fail("session log requires --text");
    const file = await appendSession(id, text);
    if (values.json) return out({ path: rel(file) }, true);
    return out(`Appended to ${rel(file)}`, false);
  }

  if (sub === "close") {
    const id = values.id;
    if (!id) fail("session close requires --id");
    const graph = await loadGraph();
    const model = await readModel();
    const events = await readEvents();
    const mine = events.filter((e) => e.session === id && e.type === "observation");
    const touched = [...new Set(mine.map((e) => e.concept))];

    const summaryLines = [
      `## Close`,
      ``,
      `- Questions answered: ${mine.length} (${mine.filter((e) => e.correct).length} correct)`,
      `- Concepts touched: ${touched.length}`,
      ...touched.map((c) => {
        const pL = masteryOf(model, c);
        return `  - [[${c}]] → ${pct(pL)} ${masteryLabel(pL)}`;
      }),
      ``,
      `Closed ${new Date().toISOString()}`,
    ];

    await appendSession(id, summaryLines.join("\n"));

    // Link back from every concept the session touched, so the graph is
    // navigable in both directions and a concept carries its own history.
    const reviews = await readReviews();
    const linked = [];
    const unchecked = [];
    for (const conceptId of touched) {
      const concept = await readConcept(conceptId);
      if (!concept) continue;

      const answered = mine.filter((e) => e.concept === conceptId);
      const right = answered.filter((e) => e.correct).length;
      const detail = `${right}/${answered.length} correct, ${pct(masteryOf(model, conceptId)).trim()}`;
      const body = appendSessionLink(concept.body, id, detail);
      if (body !== concept.body) {
        await writeConcept({ ...concept, body });
        linked.push(conceptId);
      }

      // A scheduled concept with no stored check gives /review nothing to ask.
      if (reviews.cards[conceptId] && parseChecks(concept.body).length === 0) {
        unchecked.push(conceptId);
      }
    }

    await appendEvent({ type: "session-close", session: id, concepts: touched });

    const front = frontier(graph, model);
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
 * the model, but deleting lines from an append-only log destroys the record
 * of what happened. So voiding appends a marker instead, and `model --rebuild`
 * skips the voided observations while the history stays readable.
 */
commands.void = async ({ values }) => {
  const session = values.session ?? values.id;
  if (!session) fail("void requires --session");
  if (!values.reason) fail("void requires --reason (why this evidence is unreliable)");

  const events = await readEvents();
  const affected = events.filter(
    (e) => e.session === session && (e.type === "observation" || e.type === "review"),
  );
  if (affected.length === 0) {
    fail(`no observations found for session "${session}"`);
  }

  await appendEvent({ type: "void", session, reason: values.reason });

  const concepts = [...new Set(affected.map((e) => e.concept))];
  if (values.json) {
    return out({ session, voided: affected.length, concepts, reason: values.reason }, true);
  }
  out(
    `Voided ${affected.length} observation(s) across ${concepts.length} concept(s).\n` +
      `Run "model --rebuild" to drop them from the model.`,
    false,
  );
};

commands.model = async ({ values }) => {
  if (values.rebuild) {
    const events = await readEvents();
    const graph = await loadGraph();
    const model = emptyModel();
    model.params = { ...DEFAULT_PARAMS };

    const voided = new Set(
      events.filter((e) => e.type === "void" && e.session).map((e) => e.session),
    );

    let skipped = 0;
    for (const event of events) {
      if (event.type !== "observation" && event.type !== "review") continue;
      if (event.session && voided.has(event.session)) {
        skipped += 1;
        continue;
      }
      const id = event.concept;
      if (!id) continue;
      const entry = ensureEntry(model, id);
      const correct =
        event.type === "review" ? Number(event.grade) >= 3 : Boolean(event.correct);
      entry.pL = bktUpdate(entry.pL, correct, {
        params: model.params,
        opportunity: event.opportunity ?? true,
      });
      entry.observations += 1;
      if (correct) entry.correct += 1;
      entry.lastSeen = event.at ?? null;

      // Recomputed from the current graph rather than replayed from the
      // event, so editing a prerequisite and rebuilding re-derives history
      // under the corrected structure.
      if (correct) propagateCorrect(model, graph, id);
    }

    await writeModel(model);
    const n = Object.keys(model.concepts).length;
    return out(
      `Rebuilt model from ${events.length} events across ${n} concepts.` +
        (skipped > 0 ? ` Skipped ${skipped} voided observation(s).` : ""),
      false,
    );
  }

  const model = await readModel();
  const graph = await loadGraph();
  const rows = [...graph.nodes.keys()]
    .map((id) => ({
      id,
      title: graph.nodes.get(id).title ?? id,
      pL: masteryOf(model, id),
      ...model.concepts[id],
    }))
    .sort((a, b) => b.pL - a.pL);

  if (values.json) return out({ params: model.params, concepts: rows }, true);
  if (rows.length === 0) return out("Model is empty.", false);
  out(
    rows
      .map(
        (r) =>
          `${bar(r.pL)} ${pct(r.pL)} ${masteryLabel(r.pL).padEnd(9)} ${r.id.padEnd(28)} ${
            r.observations ?? 0
          } obs`,
      )
      .join("\n"),
    false,
  );
};

commands.map = async ({ values }) => {
  const graph = await loadGraph();
  const model = await readModel();
  const front = frontier(graph, model);
  const doc = renderMapDocument(graph, model, front);
  await ensureDirs();
  await fs.writeFile(MAP_FILE, doc, "utf8");
  if (values.json) return out({ path: rel(MAP_FILE), concepts: graph.nodes.size }, true);
  out(`Wrote ${rel(MAP_FILE)} (${graph.nodes.size} concepts)`, false);
};

commands.index = async ({ values }) => {
  const graph = await loadGraph();
  const model = await readModel();
  const reviews = await readReviews();
  const front = frontier(graph, model);
  const index = buildIndex(graph, model, reviews, front);
  await ensureDirs();
  await fs.writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  if (values.json) return out(index, true);
  out(`Wrote ${rel(INDEX_FILE)} (${index.concepts.length} concepts)`, false);
};

commands.doctor = async ({ values }) => {
  const graph = await loadGraph();
  const model = await readModel();
  const problems = [];

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

  for (const { from, missing } of danglingEdges(graph)) {
    problems.push({
      severity: "error",
      kind: "dangling-prerequisite",
      message: `${from} requires "${missing}", which does not exist`,
    });
  }

  for (const cycle of findCycles(graph)) {
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

  for (const id of Object.keys(model.concepts ?? {})) {
    if (!graph.nodes.has(id)) {
      problems.push({
        severity: "warn",
        kind: "stale-model-entry",
        message: `model has mastery for "${id}" but the concept file is gone`,
      });
    }
  }

  const errors = problems.filter((p) => p.severity === "error");
  if (values.json) return out({ ok: errors.length === 0, problems }, true);

  if (problems.length === 0) {
    return out(`Knowledge base is healthy (${graph.nodes.size} concepts).`, false);
  }
  out(
    problems.map((p) => `${p.severity === "error" ? "ERROR" : " WARN"}  ${p.message}`).join("\n"),
    false,
  );
  if (errors.length > 0) process.exit(1);
};

commands.help = async () => {
  out(
    `learn — local learning pipeline

  status                         where you are
  concept add --title T [--domain D] [--requires a,b] [--assumes c] [--tags x,y]
  concept edit <id> [--domain D] [--requires …] [--assumes …] [--title …]
                                 --domain files the note under concepts/<D>/;
                                   the id stays the bare slug either way
  concept list|show <id>
                                 requires = cannot be understood without it:
                                   gates teaching, carries evidence
                                 assumes  = useful background: orders the plan,
                                   never blocks, never moves belief
  check add --concept C --question Q --answer A [--why W]
                                 (concept add also takes --topics <topic-id,…>
                                  to link a concept to course topics)
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
  session start|log|close|list   the session log
  void --session S --reason R    retract a session's evidence as unreliable\n  model [--rebuild]              mastery table; rebuild replays the event log
  map                            regenerate learn/map.md
  index                          regenerate learn/state/index.json for the web hub
  doctor                         validate the graph

Add --json to any command for machine-readable output.`,
    false,
  );
};

// --------------------------------------------------------------------- main

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
  topics: { type: "string" },
  body: { type: "string" },
  text: { type: "string" },
  topic: { type: "string" },
  limit: { type: "string" },
  days: { type: "string" },
  mermaid: { type: "boolean", default: false },
  rebuild: { type: "boolean", default: false },
  force: { type: "boolean", default: false },
};

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    fail(`${err.message}\nRun "learn help" for usage.`);
  }

  const name = parsed.positionals[0] ?? "status";
  const command = commands[name];
  if (!command) fail(`unknown command "${name}". Run "learn help".`);

  await ensureDirs();
  await command(parsed);
}

main().catch((err) => {
  fail(err?.stack ?? String(err));
});
