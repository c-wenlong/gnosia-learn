"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { LEGACY_STORAGE_KEY } from "@self-learn/schema/shared";

import type {
  KnowledgeInput,
  LearnerState,
  ThemeMode,
  UserResource,
} from "@/lib/types";
import {
  addUserResource,
  clearKnowledge,
  recordKnowledge,
  removeUserResource,
  resetCourseProgress,
  setLastVisited,
  setNote,
  setTheme,
  toggleTopic,
} from "@/lib/storage";
import { applyThemeToDocument, writeThemeCookie } from "@/lib/theme-cookie";
import { createWriteQueue } from "@/lib/write-queue";

/**
 * The learner state, as components see it.
 *
 * The shape of this context is unchanged from when the state lived in
 * localStorage: `state` plus named actions. What changed is underneath. A
 * server component reads the snapshot from Postgres and passes it in as
 * `initialState`, each action applies the same pure reducer it always did and
 * then posts the change to `/api/learner/*`, and the server is the authority
 * on what was actually stored.
 *
 * **Optimistic, and honest about failure.** The reducer runs first so a
 * checkbox ticks immediately; if the write fails, the optimistic value stays
 * and `saveError` is set. Reverting was the alternative and is worse for the
 * case that matters: a learner who has just typed three paragraphs into a note
 * should not watch them vanish because the database is down. The banner says
 * it is not saved; the text is still there to copy.
 *
 * **`reachable` is not the same as "no data".** A learner with an empty
 * database and a learner whose database is unreachable both see zeros, and the
 * difference matters enough that the flag travels with the state rather than
 * being inferred from it.
 */

interface LearnerContextValue {
  state: LearnerState;
  /**
   * Always true now. It meant "localStorage has hydrated" and gated the first
   * paint; the server renders the real state, so there is nothing to wait for.
   * Kept because several components read it and a constant is cheaper than
   * touching all of them to delete a branch that is now always taken.
   */
  ready: boolean;
  /** False when the server could not reach the database while rendering. */
  reachable: boolean;
  /** Non-null when the last write did not reach the database. */
  saveError: string | null;
  /** Clears the error banner. The optimistic value is left alone. */
  dismissSaveError: () => void;
  setThemeMode: (theme: ThemeMode) => void;
  toggleTopicCompletion: (topicId: string) => void;
  updateNote: (topicId: string, note: string) => void;
  addResource: (moduleId: string, resource: Omit<UserResource, "id">) => void;
  removeResource: (moduleId: string, resourceId: string) => void;
  saveKnowledge: (
    topicId: string,
    input: KnowledgeInput,
    options?: { countSession?: boolean },
  ) => void;
  forgetKnowledge: (topicId: string) => void;
  /** Resolves true once the reset is stored, false if it was refused. */
  resetCourse: (topicIds: string[]) => Promise<boolean>;
  markVisited: (courseSlug: string, moduleSlug?: string) => void;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

interface ApiResponse {
  ok?: boolean;
  error?: string;
  code?: string;
  result?: unknown;
}

const UNREACHABLE = "Not saved: the database is unreachable.";

async function post(path: string, body: unknown): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/learner/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // `fetch` rejects when the request never reached a server at all — offline,
    // DNS, a dropped connection. That is the same thing to a learner as a 503,
    // and it must be an answer rather than a rejection: the write queue behind
    // this chains on the returned promise.
    return {
      ok: false,
      error: `${UNREACHABLE} (${error instanceof Error ? error.message : "no response"})`,
      code: "STORE_UNAVAILABLE",
    };
  }
  // A 500 from a route that threw before its handler ran has no JSON body, and
  // `response.json()` would then reject with a parse error the learner cannot
  // read. The status is the fallback.
  const payload = (await response.json().catch(() => ({}))) as ApiResponse;
  if (response.ok && payload.ok !== false) return payload;
  return {
    ok: false,
    error: payload.error ?? `${UNREACHABLE} (HTTP ${response.status})`,
    code: payload.code,
  };
}

export function LearnerProvider({
  initialState,
  reachable,
  children,
}: {
  initialState: LearnerState;
  reachable: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<LearnerState>(initialState);
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  /**
   * The state as of right now, readable synchronously from an event handler.
   *
   * An action has to both show the new value and describe it to the server,
   * and reading it out of a `setState` updater does not work: the updater runs
   * during React's render phase rather than at the call site, and runs twice
   * under StrictMode. The ref is synced in an effect (never written during
   * render) and again by `commit` itself, so two actions in the same tick
   * compose instead of the second clobbering the first.
   */
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);

  // The server is the authority. When a navigation or a `router.refresh()`
  // brings back a newer snapshot, adopt it — otherwise a reset in one tab, or
  // a `learn observe` at the terminal, would be invisible until a full reload.
  const seen = useRef(initialState);
  useEffect(() => {
    if (seen.current === initialState) return;
    seen.current = initialState;
    setState(initialState);
  }, [initialState]);

  /**
   * Writes are ordered per target: see `createWriteQueue`. Without it two
   * edits to the same note can reach the server in the wrong order, and only
   * the last one to arrive is what Postgres keeps.
   */
  const queue = useRef(createWriteQueue<ApiResponse>());

  /**
   * Apply the reducer, then write. `send` receives the reducer's output, so
   * what the UI shows and what the request describes cannot disagree.
   *
   * `key` names the thing being changed, not the route: two edits to the same
   * note share a key and are ordered, while a tick on one item and a note on
   * another do not and are not. Several keys make the write a barrier over all
   * of them, which is how a reset waits for the writes it is about to delete.
   *
   * Resolves once the write has settled, true when it was stored. Most
   * callers ignore it and let the banner speak; one that has to say
   * "done" in words (Settings' reset) waits for it.
   */
  const commit = useCallback(
    (
      key: string | readonly string[],
      reduce: (previous: LearnerState) => LearnerState,
      send: (next: LearnerState) => Promise<ApiResponse>,
    ): Promise<boolean> => {
      const next = reduce(current.current);
      current.current = next;
      setState(next);
      return new Promise<boolean>((resolve) => {
        queue.current.run(
          key,
          () => send(next),
          (response) => {
            setSaveError(response.ok === false ? (response.error ?? UNREACHABLE) : null);
            resolve(response.ok !== false);
          },
        );
      });
    },
    [],
  );

  // The root layout can only read the theme cookie, so a browser without one
  // is served light even when the preference row says dark. The provider is
  // seeded from the row, so it is the thing that knows; it corrects the class
  // on the first render and writes the cookie the next reload will read.
  // One frame late in a new browser, and never a query on a public page.
  useEffect(() => {
    applyThemeToDocument(state.theme);
    writeThemeCookie(state.theme);
    if (state.theme !== "system" || typeof window.matchMedia !== "function") return;
    // Under `system` the device can change its mind while the page is open.
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyThemeToDocument("system");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [state.theme]);

  const setThemeMode = useCallback(
    (theme: ThemeMode) => {
      applyThemeToDocument(theme);
      // The cookie first, and not conditional on the write succeeding: it is
      // what stops the next reload flashing the wrong theme, and it costs
      // nothing to be right about that even when the database is down.
      writeThemeCookie(theme);
      commit(
        "preference:theme",
        (previous) => setTheme(previous, theme),
        () => post("preference", { key: "theme", value: theme }),
      );
    },
    [commit],
  );

  const toggleTopicCompletion = useCallback(
    (topicId: string) => {
      commit(
        `progress:${topicId}`,
        (previous) => toggleTopic(previous, topicId),
        (next) =>
          post("progress", {
            curriculumItemId: topicId,
            completed: next.completed[topicId] === true,
          }),
      );
    },
    [commit],
  );

  const updateNote = useCallback(
    (topicId: string, note: string) => {
      commit(
        `note:${topicId}`,
        (previous) => setNote(previous, topicId, note),
        () => post("note", { curriculumItemId: topicId, note }),
      );
    },
    [commit],
  );

  const addResource = useCallback(
    (moduleId: string, resource: Omit<UserResource, "id">) => {
      commit(
        "preference:userResources",
        (previous) => addUserResource(previous, moduleId, resource),
        (next) => post("preference", { key: "userResources", value: next.userResources }),
      );
    },
    [commit],
  );

  const removeResource = useCallback(
    (moduleId: string, resourceId: string) => {
      commit(
        "preference:userResources",
        (previous) => removeUserResource(previous, moduleId, resourceId),
        (next) => post("preference", { key: "userResources", value: next.userResources }),
      );
    },
    [commit],
  );

  const saveKnowledge = useCallback(
    (topicId: string, input: KnowledgeInput, options?: { countSession?: boolean }) => {
      commit(
        `recap:${topicId}`,
        (previous) => recordKnowledge(previous, topicId, input, options),
        () =>
          post("recap", {
            curriculumItemId: topicId,
            ...input,
            countSession: options?.countSession !== false,
          }),
      );
    },
    [commit],
  );

  const forgetKnowledge = useCallback(
    (topicId: string) => {
      commit(
        `recap:${topicId}`,
        (previous) => clearKnowledge(previous, topicId),
        () =>
          // An empty recap is how the store spells "delete this one", the same
          // rule the reducer follows.
          post("recap", {
            curriculumItemId: topicId,
            summary: "",
            keyPoints: [],
            misconceptions: [],
            openQuestions: [],
            source: "manual",
          }),
      );
    },
    [commit],
  );

  const resetCourse = useCallback(
    (topicIds: string[]) =>
      commit(
        // A barrier over every row the reset deletes. Without it a note still
        // in flight for one of these topics could land after the delete and
        // recreate the row, while the page went on showing it as cleared.
        topicIds.flatMap((id) => [`progress:${id}`, `note:${id}`]),
        (previous) => resetCourseProgress(previous, topicIds),
        () => post("reset", { curriculumItemIds: topicIds }),
      ),
    [commit],
  );

  const markVisited = useCallback(
    (courseSlug: string, moduleSlug?: string) => {
      commit(
        "preference:lastVisited",
        (previous) => setLastVisited(previous, courseSlug, moduleSlug),
        (next) => post("preference", { key: "lastVisited", value: next.lastVisited }),
      );
    },
    [commit],
  );

  useLegacyImport(router.refresh);

  const value = useMemo(
    () => ({
      state,
      ready: true,
      reachable,
      saveError,
      dismissSaveError: () => setSaveError(null),
      setThemeMode,
      toggleTopicCompletion,
      updateNote,
      addResource,
      removeResource,
      saveKnowledge,
      forgetKnowledge,
      resetCourse,
      markVisited,
    }),
    [
      state,
      reachable,
      saveError,
      setThemeMode,
      toggleTopicCompletion,
      updateNote,
      addResource,
      removeResource,
      saveKnowledge,
      forgetKnowledge,
      resetCourse,
      markVisited,
    ],
  );

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

/**
 * Carry one browser's old localStorage document into the database, once.
 *
 * Every browser that used the app before bundle 5 is holding ticks, notes and
 * recaps that no database has. This posts them on first mount and removes the
 * key when the server confirms. The key is only removed on success, so a
 * failed attempt is retried on the next load rather than losing the document.
 *
 * `refresh` afterwards, because the imported rows are in the snapshot the
 * server rendered *before* they existed.
 */
function useLegacyImport(refresh: () => void): void {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      // A browser with site data blocked. Nothing to import, nothing to say.
      return;
    }
    if (raw === null) return;

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Unparseable, and it will still be unparseable next time. Drop it
      // rather than retrying a parse failure on every page load forever.
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* nothing more to do */
      }
      return;
    }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;

    void post("import", payload).then((response) => {
      if (response.ok === false) return;
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* the import landed; the leftover key is harmless and retries as a no-op */
      }
      refresh();
    });
  }, [refresh]);
}

export function useLearner(): LearnerContextValue {
  const ctx = useContext(LearnerContext);
  if (!ctx) {
    throw new Error("useLearner must be used within LearnerProvider");
  }
  return ctx;
}
