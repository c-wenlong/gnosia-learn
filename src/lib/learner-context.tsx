"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { LearnerState, ThemeMode, UserResource } from "@/lib/types";
import {
  addUserResource,
  defaultState,
  loadState,
  removeUserResource,
  resetCourseProgress,
  saveState,
  setLastVisited,
  setNote,
  setTheme,
  toggleTopic,
} from "@/lib/storage";

interface LearnerContextValue {
  state: LearnerState;
  ready: boolean;
  setThemeMode: (theme: ThemeMode) => void;
  toggleTopicCompletion: (topicId: string) => void;
  updateNote: (topicId: string, note: string) => void;
  addResource: (
    moduleId: string,
    resource: Omit<UserResource, "id">,
  ) => void;
  removeResource: (moduleId: string, resourceId: string) => void;
  resetCourse: (topicIds: string[]) => void;
  markVisited: (courseSlug: string, moduleSlug?: string) => void;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

const serverSnapshot = defaultState();
let clientSnapshot: LearnerState | null = null;
const listeners = new Set<() => void>();

function getClientSnapshot(): LearnerState {
  if (clientSnapshot === null) {
    clientSnapshot = loadState();
  }
  return clientSnapshot;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function commit(updater: (prev: LearnerState) => LearnerState) {
  const prev = getClientSnapshot();
  const next = updater(prev);
  clientSnapshot = next;
  saveState(next);
  emit();
}

function emptySubscribe() {
  return () => {};
}

export function LearnerProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    () => serverSnapshot,
  );

  const ready = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const setThemeMode = useCallback((theme: ThemeMode) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    commit((prev) => setTheme(prev, theme));
  }, []);

  const toggleTopicCompletion = useCallback((topicId: string) => {
    commit((prev) => toggleTopic(prev, topicId));
  }, []);

  const updateNote = useCallback((topicId: string, note: string) => {
    commit((prev) => setNote(prev, topicId, note));
  }, []);

  const addResource = useCallback(
    (moduleId: string, resource: Omit<UserResource, "id">) => {
      commit((prev) => addUserResource(prev, moduleId, resource));
    },
    [],
  );

  const removeResource = useCallback(
    (moduleId: string, resourceId: string) => {
      commit((prev) => removeUserResource(prev, moduleId, resourceId));
    },
    [],
  );

  const resetCourse = useCallback((topicIds: string[]) => {
    commit((prev) => resetCourseProgress(prev, topicIds));
  }, []);

  const markVisited = useCallback(
    (courseSlug: string, moduleSlug?: string) => {
      commit((prev) => setLastVisited(prev, courseSlug, moduleSlug));
    },
    [],
  );

  const value = useMemo(
    () => ({
      state,
      ready,
      setThemeMode,
      toggleTopicCompletion,
      updateNote,
      addResource,
      removeResource,
      resetCourse,
      markVisited,
    }),
    [
      state,
      ready,
      setThemeMode,
      toggleTopicCompletion,
      updateNote,
      addResource,
      removeResource,
      resetCourse,
      markVisited,
    ],
  );

  return (
    <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>
  );
}

export function useLearner(): LearnerContextValue {
  const ctx = useContext(LearnerContext);
  if (!ctx) {
    throw new Error("useLearner must be used within LearnerProvider");
  }
  return ctx;
}
