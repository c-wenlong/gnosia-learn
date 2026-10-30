import "server-only";

import { readConceptObservations } from "@gnosia/catalog/state";
import { connection } from "next/server";

import { readConceptNote } from "@/lib/concept-note";
import { observationsOf } from "@gnosia/tutor/concept-workspace-core";
import { moduleConcepts } from "@/lib/module-path";
import { catalogDatabase, readKb } from "@/lib/learner-store";
import { currentOwner } from "@/lib/owner";
import { readWrittenOptions } from "@gnosia/tutor/server/check-options";
import {
  checkQuestion,
  distractorPool,
  NO_CONCEPTS_TO_CHECK,
  NOTHING_TO_ASK_MODULE,
  type SessionQuestion,
} from "@gnosia/tutor/session-core";
import { readSummaries, tutorModelConfigured } from "@/lib/session-page";
import type { Module } from "@gnosia/tutor/types";
import { checksByLastAsked, weekCheckOrder, type WeekCheckConcept, type WeekCheckPlan } from "@/lib/week-check";

/**
 * What the week check page reads, on the server, once (phase 4 of
 * docs/proposals/module-learning-path.md): the module's concepts the owner's
 * knowledge base holds, in path order (lesson by lesson, each in its
 * lesson's order, a concept two lessons name once), each with its p(L), its
 * note's checks as questions ordered least recently asked first from the
 * owner's observation events, then put in the check's order
 * (`weekCheckOrder`); and whether a tutor model can write the questions a
 * note runs out of.
 *
 * Wrong options come as they do in a concept session (`checkQuestion`): the
 * ones the tutor wrote for the check when they are stored, else the note's
 * other checks' answers and the other concepts' summaries, and then, with a
 * tutor model configured, the page asks the tutor for the check's options
 * before showing it. A check that cannot get two is not a question. The
 * variant is `week`, so a check asked here and in Quiz me is not laid out
 * the same.
 *
 * A note that cannot be read leaves its concept to the tutor; a knowledge
 * base or event log that cannot be read is the page's "cannot start".
 */

export type WeekCheckRead =
  | { state: "ok"; plan: WeekCheckPlan; reason: string | null }
  | { state: "unreachable" };

export async function loadWeekCheck(module: Pick<Module, "topics">): Promise<WeekCheckRead> {
  await connection();
  const owner = await currentOwner();
  const { kb, reachable } = await readKb(owner);
  if (!reachable) return { state: "unreachable" };

  const byId = new Map(kb.concepts.map((c) => [c.id, c]));
  const concepts = moduleConcepts(module).flatMap((slug) => {
    const c = byId.get(slug);
    return c === undefined ? [] : [c];
  });

  let events;
  try {
    // Only these concepts' observations and the voids: the whole log only grows.
    events = await readConceptObservations(
      await catalogDatabase(),
      owner,
      concepts.map((c) => c.id),
    );
  } catch (error) {
    console.warn(`week check: the event log is unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return { state: "unreachable" };
  }
  const [notes, summaries, modelAvailable] = await Promise.all([
    Promise.all(concepts.map((c) => readConceptNote(c.id))),
    concepts.length === 0 ? Promise.resolve([]) : readSummaries(),
    tutorModelConfigured(),
  ]);

  const checksOf = (i: number) => {
    const note = notes[i];
    return note?.ok ? note.checks : [];
  };
  const written = await readWrittenOptions(
    catalogDatabase(),
    owner,
    concepts.map((c, i) => ({ slug: c.id, checks: checksOf(i) })),
  );

  // Who needs each concept, built once rather than by a scan of the knowledge base per concept.
  const dependants = new Map<string, { slug: string }[]>();
  for (const d of kb.concepts) {
    for (const needed of new Set([...d.requires, ...d.assumes])) {
      const list = dependants.get(needed);
      if (list === undefined) dependants.set(needed, [{ slug: d.id }]);
      else list.push({ slug: d.id });
    }
  }

  const asked: WeekCheckConcept[] = concepts.map((c, i) => {
    const checks = checksOf(i);
    const pool = distractorPool(
      {
        slug: c.id,
        domain: c.domain,
        requires: c.requires.map((slug) => ({ slug })),
        assumes: c.assumes.map((slug) => ({ slug })),
        dependants: dependants.get(c.id) ?? [],
        backlinks: [],
      },
      summaries,
    );
    const answers = checks.map((check) => check.answer.trim()).filter((a) => a !== "");
    const questions = checksByLastAsked(checks, observationsOf(events, c.id))
      .map((check) =>
        checkQuestion({
          slug: c.id,
          check,
          variant: "week",
          otherAnswers: answers.filter((a) => a !== check.answer.trim()),
          pool,
          written: written.get(c.id)?.[check.id],
          canWrite: modelAvailable,
          summary: c.summary,
        }),
      )
      .filter((q): q is SessionQuestion => q !== null);
    return { slug: c.id, title: c.title, pL: c.pL, questions };
  });

  const plan: WeekCheckPlan = { concepts: weekCheckOrder(asked), modelAvailable };
  const reason =
    asked.length === 0
      ? NO_CONCEPTS_TO_CHECK
      : !modelAvailable && asked.every((c) => c.questions.length === 0)
        ? NOTHING_TO_ASK_MODULE
        : null;
  return { state: "ok", plan, reason };
}
