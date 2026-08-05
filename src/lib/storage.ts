import {
  CURRENT_STATE_VERSION,
  type KnowledgeInput,
  type LearnerState,
  type ThemeMode,
  type TopicKnowledge,
  type UserResource,
} from "@/lib/types";

export const STORAGE_KEY = "self-learn:v1";

/** Bounds so one runaway session can't fill the localStorage quota. */
export const KNOWLEDGE_LIMITS = {
  summaryChars: 1200,
  listItems: 8,
  itemChars: 300,
} as const;

export const defaultState = (): LearnerState => ({
  version: CURRENT_STATE_VERSION,
  theme: "light",
  completed: {},
  notes: {},
  userResources: {},
  knowledge: {},
  epoch: 0,
});

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function clampList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, KNOWLEDGE_LIMITS.itemChars))
    .filter(Boolean)
    .slice(0, KNOWLEDGE_LIMITS.listItems);
}

function normalizeKnowledge(raw: unknown): Record<string, TopicKnowledge> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, TopicKnowledge> = {};
  for (const [topicId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Partial<TopicKnowledge>;
    const summary =
      typeof entry.summary === "string"
        ? entry.summary.trim().slice(0, KNOWLEDGE_LIMITS.summaryChars)
        : "";
    const keyPoints = clampList(entry.keyPoints);
    const misconceptions = clampList(entry.misconceptions);
    const openQuestions = clampList(entry.openQuestions);
    if (
      !summary &&
      keyPoints.length === 0 &&
      misconceptions.length === 0 &&
      openQuestions.length === 0
    ) {
      continue;
    }
    out[topicId] = {
      topicId,
      summary,
      keyPoints,
      misconceptions,
      openQuestions,
      source: entry.source === "manual" ? "manual" : "agent",
      updatedAt:
        typeof entry.updatedAt === "string"
          ? entry.updatedAt
          : new Date(0).toISOString(),
      sessions:
        typeof entry.sessions === "number" && entry.sessions > 0
          ? Math.floor(entry.sessions)
          : 1,
    };
  }
  return out;
}

/**
 * Bring any previously persisted shape up to the current version.
 * v1 → v2 is purely additive (knowledge), so old progress carries over.
 */
export function migrateState(parsed: Partial<LearnerState>): LearnerState {
  return {
    ...defaultState(),
    ...parsed,
    version: CURRENT_STATE_VERSION,
    completed: parsed.completed ?? {},
    notes: parsed.notes ?? {},
    userResources: parsed.userResources ?? {},
    knowledge: normalizeKnowledge(parsed.knowledge),
    epoch: typeof parsed.epoch === "number" ? parsed.epoch : 0,
    theme: parsed.theme === "dark" ? "dark" : "light",
  };
}

export function loadState(): LearnerState {
  if (!isBrowser()) return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrateState(JSON.parse(raw) as Partial<LearnerState>);
  } catch {
    return defaultState();
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Persist state. Knowledge records grow the payload, so a full quota is a
 * real failure mode the UI has to surface rather than silently swallow.
 */
export function saveState(state: LearnerState): SaveResult {
  if (!isBrowser()) return { ok: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      error: quota
        ? "Browser storage is full — export your recaps, then clear old ones to keep saving."
        : err instanceof Error
          ? err.message
          : "Could not write to browser storage.",
    };
  }
}

export function setTheme(state: LearnerState, theme: ThemeMode): LearnerState {
  return { ...state, theme };
}

export function toggleTopic(
  state: LearnerState,
  topicId: string,
): LearnerState {
  const completed = { ...state.completed };
  if (completed[topicId]) {
    delete completed[topicId];
  } else {
    completed[topicId] = true;
  }
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
  const list = (state.userResources[moduleId] ?? []).filter(
    (r) => r.id !== resourceId,
  );
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
  const summary = input.summary.trim().slice(0, KNOWLEDGE_LIMITS.summaryChars);
  const keyPoints = clampList(input.keyPoints);
  const misconceptions = clampList(input.misconceptions);
  const openQuestions = clampList(input.openQuestions);
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
  const sessions =
    (previous?.sessions ?? 0) + (options?.countSession === false ? 0 : 1);

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

export function clearKnowledge(
  state: LearnerState,
  topicId: string,
): LearnerState {
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
    lastVisited: {
      courseSlug,
      moduleSlug,
      at: new Date().toISOString(),
    },
  };
}
