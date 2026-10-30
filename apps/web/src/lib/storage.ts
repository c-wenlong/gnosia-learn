import {
  clampKnowledgeList,
  clampSummary,
  KNOWLEDGE_LIMITS,
} from "@gnosia/schema/shared";
import {
  emptyLearnerState,
  type KnowledgeInput,
  type LearnerState,
  type ThemeMode,
  type UserResource,
} from "@/lib/types";

/**
 * Pure state transitions for the learner state.
 *
 * What this module used to be: the localStorage layer. `loadState`,
 * `saveState` and `migrateState` read and wrote `self-learn:v1`, and the
 * reducers below existed to keep that testable without a DOM.
 *
 * What it is now: only the reducers. Postgres holds the state, the provider
 * applies these optimistically and posts the change to `/api/learner/*`, and
 * the server applies the equivalent write. They earn their place because the
 * optimistic half of every mutation still has to happen somewhere, and a UI
 * that waited for a round trip before ticking a checkbox would feel broken.
 *
 * The clamps come from `@gnosia/schema/shared`, which is the same
 * definition the `recap` table's CHECK constraints are generated from. Two
 * copies of `summaryChars` would eventually disagree, and the way that shows
 * up is a save the learner watches succeed and then fail.
 */

export { KNOWLEDGE_LIMITS };

/** Kept as `defaultState` so existing call sites read the same. */
export const defaultState = emptyLearnerState;

export function setTheme(state: LearnerState, theme: ThemeMode): LearnerState {
  return { ...state, theme };
}

/**
 * Tick an item, or untick it. A value rather than a toggle, so applying the
 * same write twice (a write sent again after a refusal, over a snapshot that
 * may already have it) gives the same state.
 */
export function setTopicCompleted(state: LearnerState, topicId: string, done: boolean): LearnerState {
  const completed = { ...state.completed };
  if (done) completed[topicId] = true;
  else delete completed[topicId];
  return { ...state, completed };
}

export function setNote(
  state: LearnerState,
  topicId: string,
  note: string,
): LearnerState {
  const notes = { ...state.notes };
  if (note.trim() === "") {
    delete notes[topicId];
  } else {
    notes[topicId] = note;
  }
  return { ...state, notes };
}

export function addUserResource(
  state: LearnerState,
  moduleId: string,
  resource: Omit<UserResource, "id">,
): LearnerState {
  const list = [...(state.userResources[moduleId] ?? [])];
  list.push({
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: resource.title,
    url: resource.url,
  });
  return {
    ...state,
    userResources: { ...state.userResources, [moduleId]: list },
  };
}

export function removeUserResource(
  state: LearnerState,
  moduleId: string,
  resourceId: string,
): LearnerState {
  const list = (state.userResources[moduleId] ?? []).filter((r) => r.id !== resourceId);
  const userResources = { ...state.userResources };
  if (list.length === 0) {
    delete userResources[moduleId];
  } else {
    userResources[moduleId] = list;
  }
  return { ...state, userResources };
}

/**
 * Write (or replace) the durable recap for a topic.
 * An entirely empty input clears the record, mirroring setNote.
 */
export function recordKnowledge(
  state: LearnerState,
  topicId: string,
  input: KnowledgeInput,
  options?: { countSession?: boolean },
): LearnerState {
  const summary = clampSummary(input.summary);
  const keyPoints = clampKnowledgeList(input.keyPoints);
  const misconceptions = clampKnowledgeList(input.misconceptions);
  const openQuestions = clampKnowledgeList(input.openQuestions);
  const knowledge = { ...state.knowledge };

  if (
    !summary &&
    keyPoints.length === 0 &&
    misconceptions.length === 0 &&
    openQuestions.length === 0
  ) {
    delete knowledge[topicId];
    return { ...state, knowledge };
  }

  const previous = state.knowledge[topicId];
  const sessions = (previous?.sessions ?? 0) + (options?.countSession === false ? 0 : 1);

  knowledge[topicId] = {
    topicId,
    summary,
    keyPoints,
    misconceptions,
    openQuestions,
    source: input.source,
    updatedAt: new Date().toISOString(),
    sessions: Math.max(sessions, 1),
  };
  return { ...state, knowledge };
}

export function clearKnowledge(state: LearnerState, topicId: string): LearnerState {
  if (!state.knowledge[topicId]) return state;
  const knowledge = { ...state.knowledge };
  delete knowledge[topicId];
  return { ...state, knowledge };
}

/**
 * Clears checkboxes and scratch notes for a course.
 * Knowledge recaps are deliberately preserved — resetting progress means
 * "study this again", not "forget what I concluded".
 */
export function resetCourseProgress(
  state: LearnerState,
  topicIds: string[],
): LearnerState {
  const completed = { ...state.completed };
  const notes = { ...state.notes };
  for (const id of topicIds) {
    delete completed[id];
    delete notes[id];
  }
  return { ...state, completed, notes, epoch: state.epoch + 1 };
}

export function setLastVisited(
  state: LearnerState,
  courseSlug: string,
  moduleSlug?: string,
): LearnerState {
  return {
    ...state,
    lastVisited: { courseSlug, moduleSlug, at: new Date().toISOString() },
  };
}

/**
 * Set one course aside, or bring it back. The list keeps the order courses
 * were set aside in; bringing back a course that is already active, or
 * setting aside one already inactive, returns the state unchanged.
 */
export function setCourseActive(state: LearnerState, courseSlug: string, active: boolean): LearnerState {
  const inactive = state.inactiveCourses.includes(courseSlug);
  if (active !== inactive) return state;
  return {
    ...state,
    inactiveCourses: active
      ? state.inactiveCourses.filter((slug) => slug !== courseSlug)
      : [...state.inactiveCourses, courseSlug],
  };
}
