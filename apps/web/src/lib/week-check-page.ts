import "server-only";

import { readEvents } from "@self-learn/catalog/state";
import { connection } from "next/server";

import { readConceptNote } from "@/lib/concept-note";
import { observationsOf } from "@/lib/concept-workspace-core";
import { catalogDatabase, readKb } from "@/lib/learner-store";
import { currentOwner } from "@/lib/owner";
import {
  distractorPool,
  NO_CONCEPTS_TO_CHECK,
  NOTHING_TO_ASK_MODULE,
  noteQuestion,
  wrongOptionsFor,
  type SessionQuestion,
} from "@/lib/session-core";
import { readSummaries, tutorModelConfigured } from "@/lib/session-page";
import type { Module } from "@/lib/types";
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
 * Wrong options come as they do in a concept session (`distractorPool`,
 * `wrongOptionsFor`), from the note's other checks and the other concepts'
 * summaries, and a check that cannot get two is not a question. The variant
 * is `week`, so a check asked here and in Quiz me is not laid out the same.
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
  const taught: string[] = [];
  for (const item of module.topics) for (const slug of item.concepts) if (!taught.includes(slug)) taught.push(slug);
  const concepts = taught.flatMap((slug) => {
    const c = byId.get(slug);
    return c === undefined ? [] : [c];
  });

  let events;
  try {
    events = await readEvents(await catalogDatabase(), owner);
  } catch (error) {
    console.warn(`week check: the event log is unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return { state: "unreachable" };
  }
  const [notes, summaries, modelAvailable] = await Promise.all([
    Promise.all(concepts.map((c) => readConceptNote(c.id))),
    concepts.length === 0 ? Promise.resolve([]) : readSummaries(),
    tutorModelConfigured(),
  ]);

  const asked: WeekCheckConcept[] = concepts.map((c, i) => {
    const note = notes[i];
    const checks = note?.ok ? note.checks : [];
    const pool = distractorPool(
      {
        slug: c.id,
        domain: c.domain,
        requires: c.requires.map((slug) => ({ slug })),
        assumes: c.assumes.map((slug) => ({ slug })),
        dependants: kb.concepts.filter((d) => d.requires.includes(c.id) || d.assumes.includes(c.id)).map((d) => ({ slug: d.id })),
        backlinks: [],
      },
      summaries,
    );
    const answers = checks.map((check) => check.answer.trim()).filter((a) => a !== "");
    const questions = checksByLastAsked(checks, observationsOf(events, c.id))
      .map((check) =>
        noteQuestion(
          c.id,
          check,
          wrongOptionsFor(
            check,
            answers.filter((a) => a !== check.answer.trim()),
            pool,
          ),
          "week",
          c.summary,
        ),
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
