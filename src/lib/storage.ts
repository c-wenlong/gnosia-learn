import type { LearnerState, ThemeMode, UserResource } from "@/lib/types";

export const STORAGE_KEY = "self-learn:v1";

export const defaultState = (): LearnerState => ({
  version: 1,
  theme: "light",
  completed: {},
  notes: {},
  userResources: {},
  epoch: 0,
});

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadState(): LearnerState {
  if (!isBrowser()) return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<LearnerState>;
    return {
      ...defaultState(),
      ...parsed,
      version: 1,
      completed: parsed.completed ?? {},
      notes: parsed.notes ?? {},
      userResources: parsed.userResources ?? {},
      epoch: typeof parsed.epoch === "number" ? parsed.epoch : 0,
      theme: parsed.theme === "dark" ? "dark" : "light",
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state: LearnerState): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
