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
import { cleanDisplayName, LEGACY_STORAGE_KEY, type AvatarId } from "@gnosia/schema/shared";

import type {
  KnowledgeInput,
  LearnerState,
  ThemeMode,
  UserResource,
} from "@gnosia/tutor/types";
import {
  addUserResource,
  clearKnowledge,
  recordKnowledge,
  removeUserResource,
  resetCourseProgress,
  setCourseActive,
  setLastVisited,
  setNote,
  setTheme,
  setTopicCompleted,
} from "@/lib/storage";
import { randomToken } from "@/lib/random-token";
import { ownValue } from "@gnosia/tutor/own-key";
import { announceVisitStored } from "@/lib/recent-client";
import { withDeadline } from "@/lib/send-json";
import { applyThemeToDocument, followTheme, writeThemeCookie } from "@/lib/theme-cookie";
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
 * It stays past the next snapshot too. A note, a tick, a recap or the theme
 * refused for a reason that can pass (the database down or busy, the network
 * gone, no answer in time) is kept, shown over every snapshot adopted after
 * it, and sent again once a snapshot comes back from a reachable database or
 * the browser is back online (`unsaved`, `retryUnsaved`). A snapshot from an
 * unreachable database is not adopted at all: it is empty, and carries
 * nothing but the outage the banner already names. A refusal that will not
 * pass (a 400: the write itself is wrong) is not kept, and the next snapshot
 * shows what the database holds.
 *
 * Writes go with `keepalive` while they are small, so one still in flight
 * when the tab closes is delivered rather than cancelled. One the page could
 * not send in order before it went (queued behind another on its key, or
 * kept after a refusal) is saved on `pagehide` and sent by the next load
 * (`OUTBOX_KEY`).
 *
 * **`reachable` is not the same as "no data".** A learner with an empty
 * database and a learner whose database is unreachable both see zeros, and the
 * difference matters enough that the flag travels with the state rather than
 * being inferred from it.
 */

interface LearnerContextValue {
  state: LearnerState;
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
  /** Bring a course back to the Courses page's grid, or fold it under "Inactive courses". */
  setCourseActive: (courseSlug: string, active: boolean) => void;
  /** Set the name the sidebar shows, or clear it with "". Resolves true once stored. */
  setDisplayName: (name: string) => Promise<boolean>;
  /** Set the pixel sprite the sidebar shows. Resolves true once stored. */
  setAvatar: (avatar: AvatarId) => Promise<boolean>;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

interface ApiResponse {
  ok?: boolean;
  error?: string;
  code?: string;
  result?: unknown;
  /** A refusal's HTTP status; absent when no answer came at all. */
  status?: number;
}

const UNREACHABLE = "Not saved: the database is unreachable.";

/** How many times a snapshot that disagrees with a stored write is read again. */
const MAX_REREADS = 2;

/**
 * How long a write waits for its answer. One that never answers would hold
 * its key's queue, and every snapshot behind it, until a reload; past this it
 * is a refusal like any other, kept and sent again (`unsaved`).
 */
export const POST_TIMEOUT_MS = 15_000;

/**
 * `keepalive` bounds. A browser refuses a keepalive request outright once
 * the keepalive bodies it has in flight pass 64 KiB, so these writes take at
 * most 48 KB of it, leaving room for the playback beacons, and a body larger
 * than 32 KB (a long note, a reset's batch of ids) goes as a plain request.
 */
const KEEPALIVE_TOTAL = 48_000;
const KEEPALIVE_ONE = 32_000;
let keepaliveInFlight = 0;

/**
 * At most this many ids in one reset request: the route takes 1000, and a
 * body of 400 of the longest ids it accepts stays under its 64 KB limit.
 */
export const RESET_BATCH = 400;

/** How a kept write draws its value again: from the state it made, a reducer that sets that value. */
type Replay = (next: LearnerState) => (previous: LearnerState) => LearnerState;

/**
 * A kept write as data, so it can outlive the page: what `pagehide` saves to
 * the outbox (`OUTBOX_KEY`) and the next load sends again.
 */
type Outbound =
  | { kind: "note"; topicId: string; note: string }
  | { kind: "progress"; topicId: string; done: boolean }
  | { kind: "recap"; topicId: string; input: KnowledgeInput; countSession: boolean; requestId?: string }
  | { kind: "theme"; theme: ThemeMode };

/** The write queue's key for a kept write, as the action that made it commits it. */
function outboundKey(write: Outbound): string {
  if (write.kind === "theme") return "preference:theme";
  return `${write.kind}:${write.topicId}`;
}

/** A write worth keeping: how to draw it again, and the same write as data. */
interface Keep {
  replay: Replay;
  outbound: Outbound;
  /**
   * From the stored write's `result`, the reducer that draws what the server
   * stored over the optimistic value, or null to keep that value. A recap
   * sent again may already have been stored once, so the session it counted
   * on the page is the server's to say.
   */
  adopt?: (result: unknown) => ((previous: LearnerState) => LearnerState) | null;
}

/** A refused write kept to be drawn and sent again: see `unsaved`. */
interface Kept extends Keep {
  reduce: (previous: LearnerState) => LearnerState;
  send: (next: LearnerState) => Promise<ApiResponse>;
  confirm: Confirm;
}

/**
 * Where `pagehide` leaves the writes the page could not send in order: those
 * queued behind a write still in flight on their key, and those kept after a
 * refusal. The next load sends them again, once, if they are under a day old.
 * Starting a queued write out of turn instead could let the older write in
 * flight land after it and overwrite it.
 *
 * Each page has its own box, `OUTBOX_KEY:<id>`, and writes or removes only
 * that one, since every tab shares `localStorage`: with one box for all, a
 * tab leaving with nothing pending, or one coming back from the back-forward
 * cache, removed a box another tab had just closed on. A page takes every
 * box when it loads, the old shared `OUTBOX_KEY` included, under a lock
 * (`takeOutboxesLocked`).
 */
export const OUTBOX_KEY = "gnosia:learner-outbox";
const OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A page's own box: a fresh id per page, so a duplicated tab does not share one. */
function pageOutboxKey(): string {
  return `${OUTBOX_KEY}:${randomToken()}`;
}

function writeOutbox(key: string, writes: readonly Outbound[]): void {
  try {
    if (writes.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), writes }));
  } catch {
    /* site data blocked or full: nothing more this page can do */
  }
}

/** One box's writes and when it was saved; null when it is unreadable or stale. */
function readOutbox(raw: string): { at: number; writes: Outbound[] } | null {
  try {
    const box = JSON.parse(raw) as { at?: unknown; writes?: unknown };
    if (typeof box.at !== "number" || Date.now() - box.at > OUTBOX_MAX_AGE_MS || !Array.isArray(box.writes)) return null;
    const writes = box.writes.filter(
      (w): w is Outbound =>
        w !== null && typeof w === "object" && ["note", "progress", "recap", "theme"].includes((w as { kind?: unknown }).kind as string),
    );
    return { at: box.at, writes };
  } catch {
    return null;
  }
}

/**
 * Every box's writes, oldest box first so a newer write on a key is sent
 * after an older one, each box removed as it is read; a stale or unreadable
 * box is removed and sends nothing.
 */
function takeOutboxes(): Outbound[] {
  const boxes: { at: number; writes: Outbound[] }[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null && (key === OUTBOX_KEY || key.startsWith(`${OUTBOX_KEY}:`))) keys.push(key);
    }
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      window.localStorage.removeItem(key);
      const box = raw === null ? null : readOutbox(raw);
      if (box !== null) boxes.push(box);
    }
  } catch {
    /* site data blocked: whatever was read so far is sent */
  }
  return boxes.sort((a, b) => a.at - b.at).flatMap((box) => box.writes);
}

/**
 * `takeOutboxes` under a lock every page of the site shares (the Web Locks
 * API), so two pages loading at once cannot split the boxes between them and
 * each send its share through its own queue, where an older note could land
 * after a newer one: one page takes every box and sends them in order, and
 * the other finds none. A browser without the API takes them unlocked.
 */
function takeOutboxesLocked(): Promise<Outbound[]> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks === undefined || typeof locks.request !== "function") return Promise.resolve(takeOutboxes());
  return locks.request(OUTBOX_KEY, () => takeOutboxes()).catch(() => takeOutboxes());
}

/** `state` with one item's recap set to `recap`, or removed when there is none. */
function withRecap(state: LearnerState, topicId: string, recap: LearnerState["knowledge"][string] | undefined): LearnerState {
  const knowledge = { ...state.knowledge };
  if (recap === undefined) delete knowledge[topicId];
  else knowledge[topicId] = recap;
  return { ...state, knowledge };
}

/** A refusal that can pass: worth keeping and sending again. */
function retryable(response: ApiResponse): boolean {
  if (response.ok !== false) return false;
  const status = response.status;
  return status === undefined || status >= 500 || status === 408 || status === 429 || response.code === "STORE_UNAVAILABLE";
}

async function post(path: string, body: unknown): Promise<ApiResponse> {
  const json = JSON.stringify(body);
  const size = new TextEncoder().encode(json).length;
  const keepalive = size <= KEEPALIVE_ONE && keepaliveInFlight + size <= KEEPALIVE_TOTAL;
  if (keepalive) keepaliveInFlight += size;
  const deadline = withDeadline(POST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`/api/learner/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive,
        signal: deadline.signal,
      });
    } catch (error) {
      // `fetch` rejects when the request never reached a server at all —
      // offline, DNS, a dropped connection — or got no answer in time. That
      // is the same thing to a learner as a 503, and it must be an answer
      // rather than a rejection: the write queue behind this chains on the
      // returned promise.
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
      status: response.status,
    };
  } finally {
    deadline.done();
    if (keepalive) keepaliveInFlight -= size;
  }
}

/**
 * How a write is confirmed: called once the write is stored, with the state
 * the write made, it returns whether a snapshot shows that write.
 */
type Confirm = (next: LearnerState) => (snapshot: LearnerState) => boolean;

/**
 * The usual confirmation: `pick` reads the part of the state the write
 * decides, as the database stores it (no client-made ids or times), and a
 * snapshot shows the write when its part is the same.
 */
function same(pick: (state: LearnerState) => unknown): Confirm {
  return (next) => {
    const value = pick(next);
    return (snapshot) => sameValue(pick(snapshot), value);
  };
}

/**
 * A recap as the database holds it: the server sets `updatedAt` and counts
 * `sessions` itself, so neither can be compared with the optimistic copy.
 */
function recapOf(state: LearnerState, topicId: string): unknown {
  const recap = state.knowledge[topicId];
  if (!recap) return null;
  const { summary, keyPoints, misconceptions, openQuestions, source } = recap;
  return { summary, keyPoints, misconceptions, openQuestions, source };
}

/**
 * Deep equality over JSON-shaped values, blind to key order and to a key
 * that is present but undefined: a snapshot comes from the server's
 * serialiser, the optimistic state from a reducer, and both spell the same
 * row differently in those two ways.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = (record: Record<string, unknown>) =>
    Object.keys(record).filter((k) => record[k] !== undefined);
  const leftKeys = keys(left);
  if (leftKeys.length !== keys(right).length) return false;
  return leftKeys.every((k) => sameValue(left[k], right[k]));
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

  /**
   * Writes are ordered per target: see `createWriteQueue`. Without it two
   * edits to the same note can reach the server in the wrong order, and only
   * the last one to arrive is what Postgres keeps.
   */
  const queue = useRef(createWriteQueue<ApiResponse>());

  /**
   * Each stored write, by write key, as a check of whether a snapshot shows
   * it (see `Confirm` and `receive`).
   */
  const stored = useRef(new Map<string, (snapshot: LearnerState) => boolean>());
  /** A snapshot that arrived while writes were in flight, waiting for them. */
  const held = useRef<LearnerState | null>(null);
  /** Snapshots read again since the last write was stored. */
  const rereads = useRef(0);
  /**
   * The least epoch the database holds: the last adopted snapshot's, plus one
   * for each reset stored since. Never the optimistic epoch, which a refused
   * reset raised and the database never did.
   */
  const epochFloor = useRef(initialState.epoch);
  /**
   * Each refused write that can still be stored, by its one key: how to show
   * it again over a snapshot (`reduce`, a fixed value, the same however often
   * it runs, since it may land on a snapshot that already has it), and how to
   * send it again. Kept only for a note, a tick, a recap and the theme, and
   * only when the refused write was the newest on its key; a reset never is,
   * since a learner told "Not reset" should not see it happen later on its
   * own. Any newer write on a key, a reset's included, drops what was kept
   * there the moment it is made: it is the newer intent, and a kept older
   * value sent after it would overwrite it. Two tabs can still race: a kept
   * note sent again replaces one another tab stored since, as two tabs'
   * writes always have (`createWriteQueue`).
   */
  const unsaved = useRef(new Map<string, Kept>());
  /**
   * Every key this page has written, so the outbox replay, which waits for
   * a lock (`takeOutboxesLocked`), skips a saved write on a key the learner
   * changed in the meantime: the saved value is the older one.
   */
  const changed = useRef(new Set<string>());
  /**
   * Writes queued behind another on their key that have not started, with
   * the write as data when it is one worth keeping. On `pagehide` those go
   * to the outbox (`OUTBOX_KEY`) rather than out of turn: the page may never
   * live to see the write ahead of them answer.
   */
  const waiting = useRef(new Map<() => void, { key: string; outbound: Outbound } | null>());
  /** `retryUnsaved`, for `commit`, which is defined before it. */
  const retryKept = useRef<(skip: readonly string[]) => void>(() => undefined);

  /**
   * The server is the authority. When a navigation or a `router.refresh()`
   * brings back a newer snapshot, adopt it: otherwise a reset in one tab, or a
   * `learn observe` at the terminal, would be invisible until a full reload.
   *
   * Except a snapshot that may predate a write. One read before a write
   * landed carries the old row, and adopting it would put that row over the
   * optimistic value with nothing to restore it once the write is stored. It
   * happens two ways: the snapshot arrives while the write is in flight, or it
   * was read while the write was in flight and arrives just after it settled.
   *
   * So a snapshot that arrives while writes are in flight is held until they
   * settle. A snapshot with nothing in flight is checked against `stored`:
   * when it shows every stored write it is adopted, and those writes are
   * confirmed and forgotten. When it does not, it is stale or another tab
   * wrote since, and which is newer is the database's to say, so it is read
   * again. The writes stay recorded, since more than one stale snapshot can
   * be on its way (a navigation and a refresh both started during the write).
   * After `MAX_REREADS` that still disagree, the database's answer is adopted
   * as it is: another tab or the terminal wrote since. Asking only
   * when a snapshot disagrees keeps it to one server render per navigation
   * in the usual case, where the last write (often `lastVisited`) landed long
   * before the next click.
   *
   * A refused write leaves nothing in `stored`: the database never had it, so
   * a snapshot showing the old row is the truth, and the banner says so. A
   * refused write that is kept (`unsaved`) is drawn over the adopted
   * snapshot, so its text stays on screen until it is sent again.
   *
   * Resolves true when the snapshot was adopted.
   */
  const receive = useCallback(
    (snapshot: LearnerState): boolean => {
      if (queue.current.pending > 0) {
        held.current = snapshot;
        return false;
      }
      held.current = null;
      // Below the floor, the snapshot predates a stored reset, whose own
      // check a write stored after it on the same keys replaced.
      const shown =
        snapshot.epoch >= epochFloor.current && [...stored.current.values()].every((shows) => shows(snapshot));
      if (!shown && rereads.current < MAX_REREADS) {
        rereads.current += 1;
        router.refresh();
        return false;
      }
      stored.current.clear();
      rereads.current = 0;
      epochFloor.current = snapshot.epoch;
      let next = snapshot;
      for (const { reduce } of unsaved.current.values()) next = reduce(next);
      current.current = next;
      setState(next);
      return true;
    },
    [router],
  );

  /**
   * Apply the reducer, then write. `send` receives the reducer's output, so
   * what the UI shows and what the request describes cannot disagree.
   *
   * `key` names the thing being changed, not the route: two edits to the same
   * note share a key and are ordered, while a tick on one item and a note on
   * another do not and are not. Several keys make the write a barrier over all
   * of them, which is how a reset waits for the writes it is about to delete.
   *
   * `confirm` builds, once the write is stored, the check of whether a
   * snapshot shows it: see `receive`. Most writes use `same`.
   *
   * Resolves once the write has settled, true when it was stored. Most
   * callers ignore it and let the banner speak; one that has to say
   * "done" in words (Settings' reset) waits for it.
   *
   * A write that a newer one on the same key superseded resolves too, with
   * its own outcome: a stored reset was stored even when a note queued
   * behind it is refused. Only the newest write sets `saveError` and hands
   * over a held snapshot, as before. A superseded write that was stored
   * records its confirmation too, which a newer write on any of its keys
   * replaces once that one is stored: when the newer one is refused, the
   * database still holds the older, and a snapshot from before it must not
   * be adopted.
   *
   * `keep` marks a write worth keeping when it is refused for a reason that
   * can pass (`unsaved`), or left queued when the page goes (the outbox): its
   * `replay`, given the state the write made, returns the reducer that draws
   * that value again, a fixed value however often it runs, and `outbound` is
   * the write as data. One key only.
   */
  const commit = useCallback(
    (
      key: string | readonly string[],
      reduce: (previous: LearnerState) => LearnerState,
      send: (next: LearnerState) => Promise<ApiResponse>,
      confirm: Confirm,
      keep?: Keep,
    ): Promise<boolean> => {
      const next = reduce(current.current);
      current.current = next;
      setState(next);
      const keys = typeof key === "string" ? [key] : key;
      for (const k of keys) {
        unsaved.current.delete(k);
        changed.current.add(k);
      }
      const record = (response: ApiResponse, newest: boolean) => {
        if (response.ok === false) {
          // Only the newest write on its key is kept: a newer one is on its
          // way, and is the value to keep if anything is.
          if (newest && keep !== undefined && typeof key === "string" && retryable(response)) {
            unsaved.current.set(key, { ...keep, reduce: keep.replay(next), send, confirm });
          }
          return;
        }
        // A write recorded on any of these keys is older, since the queue
        // runs a key's writes in order, and a snapshot that shows this one
        // was read after it too. Kept, a reset's check (the note gone) would
        // contradict a note stored after it, and no snapshot could pass both.
        for (const recorded of stored.current.keys()) {
          if (recorded.split("\n").some((k) => keys.includes(k))) stored.current.delete(recorded);
        }
        stored.current.set(keys.join("\n"), confirm(next));
        // A new write gets its own re-reads, whatever earlier ones used.
        rereads.current = 0;
        // Only the newest write on its key: an older one's value is not on screen.
        const settle = newest ? keep?.adopt?.(response.result) : null;
        if (settle) {
          current.current = settle(current.current);
          setState(current.current);
        }
      };
      const start = () => {
        waiting.current.delete(start);
        return send(next);
      };
      waiting.current.set(start, keep !== undefined && typeof key === "string" ? { key, outbound: keep.outbound } : null);
      return new Promise<boolean>((resolve) => {
        queue.current.run(
          key,
          start,
          (response) => {
            setSaveError(response.ok === false ? (response.error ?? UNREACHABLE) : null);
            record(response, true);
            // A held snapshot adopted here came from a database that answered,
            // so it is a moment to send kept writes again, as a fresh one is:
            // all but this write's own, which was refused just now.
            if (queue.current.pending === 0 && held.current !== null && receive(held.current)) {
              retryKept.current(response.ok === false ? keys : []);
            }
            resolve(response.ok !== false);
          },
          (response) => {
            record(response, false);
            resolve(response.ok !== false);
          },
        );
      });
    },
    [receive],
  );

  /**
   * Send kept writes again (see `unsaved`), all but those on `skip`. Each
   * that is refused again is kept again.
   */
  const retryUnsaved = useCallback(
    (skip: readonly string[] = []) => {
      for (const [key, { reduce, send, confirm, replay, outbound, adopt }] of [...unsaved.current]) {
        if (skip.includes(key)) continue;
        void commit(key, reduce, send, confirm, { replay, outbound, adopt });
      }
    },
    [commit],
  );
  useEffect(() => {
    retryKept.current = retryUnsaved;
  }, [retryUnsaved]);

  // A snapshot from a database that did not answer is not adopted: it is
  // empty, and would wipe every tick and note on screen. One that did answer
  // is, and is the moment to send again what was refused while it was down.
  const seen = useRef(initialState);
  useEffect(() => {
    if (seen.current === initialState) return;
    seen.current = initialState;
    if (!reachable) return;
    if (receive(initialState)) retryUnsaved();
  }, [initialState, reachable, receive, retryUnsaved]);

  useEffect(() => {
    const online = () => retryUnsaved();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [retryUnsaved]);

  // Registered by the provider's own effect, which runs after its
  // children's, so a field that flushes its draft on `pagehide` (`TopicRow`)
  // has queued that write by the time this reads the queue. A write whose key
  // was idle has already started, with `keepalive`; what is left is saved,
  // the newest write per key, kept refusals first so a queued write on the
  // same key wins. A page restored from the back-forward cache carries on
  // with its queue in memory, so the copy goes. Either way only this page's
  // own box is written or removed (`OUTBOX_KEY`).
  useEffect(() => {
    const box = pageOutboxKey();
    const leave = () => {
      const byKey = new Map<string, Outbound>();
      for (const [key, { outbound }] of unsaved.current) byKey.set(key, outbound);
      for (const left of waiting.current.values()) if (left !== null) byKey.set(left.key, left.outbound);
      writeOutbox(box, [...byKey.values()]);
    };
    const back = (event: PageTransitionEvent) => {
      if (event.persisted) writeOutbox(box, []);
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", back);
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", back);
    };
  }, []);

  // The root layout can only read the theme cookie, so a browser without one
  // is served light even when the preference row says dark. The provider is
  // seeded from the row, so it is the thing that knows; it corrects the class
  // on the first render and writes the cookie the next reload will read.
  // One frame late in a new browser, and never a query on a public page.
  useEffect(() => {
    writeThemeCookie(state.theme);
    // Under `system` the device can change its mind while the page is open;
    // `followTheme` applies the mode and returns the listener's cleanup.
    return followTheme(state.theme);
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
        same((state) => state.theme),
        { replay: () => (previous) => setTheme(previous, theme), outbound: { kind: "theme", theme } },
      );
    },
    [commit],
  );

  const setDisplayName = useCallback(
    (name: string) => {
      const cleaned = cleanDisplayName(name);
      return commit(
        "name",
        (previous) => {
          const next = { ...previous };
          if (cleaned === null) delete next.displayName;
          else next.displayName = cleaned;
          return next;
        },
        () => post("name", { name: cleaned }),
        same((state) => state.displayName ?? null),
      );
    },
    [commit],
  );

  const setAvatar = useCallback(
    (avatar: AvatarId) =>
      commit(
        "avatar",
        (previous) => ({ ...previous, avatar }),
        () => post("avatar", { avatar }),
        same((state) => state.avatar ?? null),
      ),
    [commit],
  );

  const setCompleted = useCallback(
    (topicId: string, done: boolean) => {
      commit(
        `progress:${topicId}`,
        (previous) => setTopicCompleted(previous, topicId, done),
        () => post("progress", { curriculumItemId: topicId, completed: done }),
        same((state) => state.completed[topicId] === true),
        { replay: () => (previous) => setTopicCompleted(previous, topicId, done), outbound: { kind: "progress", topicId, done } },
      );
    },
    [commit],
  );

  // The value, decided here, rather than a toggle: a kept write drawn again
  // over a snapshot must not flip a tick the snapshot already has.
  const toggleTopicCompletion = useCallback(
    (topicId: string) => setCompleted(topicId, current.current.completed[topicId] !== true),
    [setCompleted],
  );

  const updateNote = useCallback(
    (topicId: string, note: string) => {
      commit(
        `note:${topicId}`,
        (previous) => setNote(previous, topicId, note),
        () => post("note", { curriculumItemId: topicId, note }),
        same((state) => ownValue(state.notes, topicId) ?? null),
        { replay: () => (previous) => setNote(previous, topicId, note), outbound: { kind: "note", topicId, note } },
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
        same((state) => state.userResources),
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
        same((state) => state.userResources),
      );
    },
    [commit],
  );

  /**
   * One recap, under the request id that names it. A kept write is sent again
   * by the same `send`, and one left in the outbox carries its id, so every
   * copy of one save goes under one id, and the route counts the session once
   * even when the answer to a stored copy was lost.
   */
  const sendRecap = useCallback(
    (topicId: string, input: KnowledgeInput, countSession: boolean, requestId: string) => {
      commit(
        `recap:${topicId}`,
        (previous) => recordKnowledge(previous, topicId, input, { countSession }),
        () => post("recap", { curriculumItemId: topicId, ...input, countSession, requestId }),
        same((state) => recapOf(state, topicId)),
        // The recap as the write made it, not the reducer again: it counts a
        // session each time it runs, and a kept recap is drawn over every
        // snapshot until it is stored.
        // The recap as stored, once it is: a copy of a save the server had
        // already stored counts no session there, while the reducer above
        // counted one on whatever the page last read.
        {
          replay: (next) => (previous) => withRecap(previous, topicId, ownValue(next.knowledge, topicId)),
          outbound: { kind: "recap", topicId, input, countSession, requestId },
          adopt: (result) => {
            const recap = (result as { recap?: LearnerState["knowledge"][string] | null } | undefined)?.recap;
            return recap ? (previous) => withRecap(previous, topicId, recap) : null;
          },
        },
      );
    },
    [commit],
  );

  const saveKnowledge = useCallback(
    (topicId: string, input: KnowledgeInput, options?: { countSession?: boolean }) =>
      sendRecap(topicId, input, options?.countSession !== false, randomToken()),
    [sendRecap],
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
        same((state) => recapOf(state, topicId)),
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
        // The server moves the epoch up by one in the same statement as each
        // stored reset, so the floor moves here, for every reset: the queue
        // reports only the newest write on a key, and an overlapping reset of
        // the same course still moved the database's epoch.
        //
        // In batches of `RESET_BATCH`, one after another: one request for
        // every item of every course was refused outright once the catalog
        // passed the route's 1000 ids. A batch refused leaves the ones before
        // it stored (each moved the epoch, so each moved the floor), and the
        // reset says it was not stored; the next snapshot shows what was.
        async () => {
          let i = 0;
          do {
            const response = await post("reset", { curriculumItemIds: topicIds.slice(i, i + RESET_BATCH) });
            if (response.ok === false) return response;
            epochFloor.current += 1;
            i += RESET_BATCH;
          } while (i < topicIds.length);
          return { ok: true };
        },
        () => {
          // A snapshot that shows this reset has at least the floor as it
          // stands now (more if another tab reset). A reset with nothing to
          // clear differs from the snapshot before it only here.
          const least = epochFloor.current;
          return (snapshot) =>
            snapshot.epoch >= least &&
            topicIds.every((id) => snapshot.completed[id] !== true && snapshot.notes[id] === undefined);
        },
      ),
    [commit],
  );

  const markVisited = useCallback(
    (courseSlug: string, moduleSlug?: string) => {
      void commit(
        "preference:lastVisited",
        (previous) => setLastVisited(previous, courseSlug, moduleSlug),
        (next) => post("preference", { key: "lastVisited", value: next.lastVisited }),
        // Not `at`: the server keeps the time, but a check that compared it
        // would also have to agree on its precision.
        same((state) => [state.lastVisited?.courseSlug ?? null, state.lastVisited?.moduleSlug ?? null]),
      ).then((stored) => {
        // The sidebar's Recent reads again once the visit is stored, rather
        // than guessing how long the write takes.
        if (stored) announceVisitStored();
      });
    },
    [commit],
  );

  const setActive = useCallback(
    (courseSlug: string, active: boolean) => {
      commit(
        "preference:inactiveCourses",
        (previous) => setCourseActive(previous, courseSlug, active),
        // The whole list, from the state the reducer just made. Writes on one
        // key run in order, so the last of two quick toggles carries both.
        (next) => post("preference", { key: "inactiveCourses", value: next.inactiveCourses }),
        same((state) => state.inactiveCourses),
      );
    },
    [commit],
  );

  useLegacyImport(router.refresh, setSaveError);

  // What the pages before left in their outboxes, sent again once, as each was made.
  const resent = useRef(false);
  useEffect(() => {
    if (resent.current) return;
    resent.current = true;
    void takeOutboxesLocked().then((writes) => {
      // Keys written on this page while the lock was awaited hold a newer value.
      const newer = new Set(changed.current);
      for (const write of writes) {
        if (newer.has(outboundKey(write))) continue;
        if (write.kind === "note") updateNote(write.topicId, write.note);
        else if (write.kind === "progress") setCompleted(write.topicId, write.done);
        // An outbox from before request ids carries none, so it gets one here.
        else if (write.kind === "recap") sendRecap(write.topicId, write.input, write.countSession, typeof write.requestId === "string" ? write.requestId : randomToken());
        else setThemeMode(write.theme);
      }
    });
  }, [updateNote, setCompleted, sendRecap, setThemeMode]);

  const value = useMemo(
    () => ({
      state,
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
      setCourseActive: setActive,
      setDisplayName,
      setAvatar,
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
      setActive,
      setDisplayName,
      setAvatar,
    ],
  );

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

/** A small marker that the legacy document was refused, so it is not posted on every load. */
const LEGACY_REFUSED_KEY = `${LEGACY_STORAGE_KEY}:refused`;

/**
 * Carry one browser's old localStorage document into the database, once.
 *
 * Every browser that used the app before bundle 5 is holding ticks, notes and
 * recaps that no database has. This posts them on first mount and removes the
 * key when the server confirms. A database that could not be reached keeps the
 * key, so the attempt is retried on the next load rather than losing the
 * document. A document the server refuses (a 400) would be refused again on
 * every load, so `LEGACY_REFUSED_KEY` is set beside it and the document is
 * not posted again; it stays where it was, in this browser, and `report` says
 * so once. A marker rather than a moved copy: a second copy of a document
 * that already fills most of the storage allowance could not be written.
 *
 * `refresh` afterwards, because the imported rows are in the snapshot the
 * server rendered *before* they existed.
 */
function useLegacyImport(refresh: () => void, report: (message: string) => void): void {
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
    try {
      if (window.localStorage.getItem(LEGACY_REFUSED_KEY) !== null) return;
    } catch {
      return;
    }

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
      if (response.ok === false) {
        if (response.code !== "BAD_REQUEST") return;
        try {
          window.localStorage.setItem(LEGACY_REFUSED_KEY, new Date().toISOString());
        } catch {
          /* no room even for the marker: it is posted, and refused, next time */
        }
        report(`Your study record saved in this browser could not be imported (${response.error ?? "refused"}). It is kept in this browser.`);
        return;
      }
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
