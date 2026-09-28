import {
  SESSION_KINDS,
  SESSION_STATES,
  type SessionKind,
  type SessionState,
} from "@self-learn/schema";

import { CLI_OWNER } from "../content/scope";
import { withDatabase } from "../db";
import { endSession, ensureSession, readSession } from "../state/sessions";

/**
 * `catalog session start|end`: the `session` row, for a caller that is not the
 * tutoring loop.
 *
 * `learn session start` already writes one, but it writes a `tutor` session and
 * a markdown log beside it, because that is what a tutoring session is. A
 * studio runner has neither: it needs a `studio` row to hang `job.session_id`
 * off and a place to keep the headless session id that Resume will need.
 *
 * Both verbs are thin. The rules live in `state/sessions.ts` — create on first
 * reference, and a conditional update for the move to a terminal state — and
 * this is the CLI in front of them, so a runner in another process can use the
 * same rules without opening a pool of its own.
 */

export class SessionCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionCommandError";
  }
}

export interface SessionStartOptions {
  id: string;
  kind?: string;
  title?: string;
  goal?: string;
  agentSessionId?: string;
  /** Whose session. Default: the CLI's owner; the studio passes the owner it serves. */
  owner?: string;
}

export interface SessionStartResult {
  ok: true;
  command: "session start";
  id: string;
  kind: string;
  state: string;
  /** False when the session already existed: `ensureSession` never rewrites one. */
  created: boolean;
}

export async function runSessionStart(
  options: SessionStartOptions,
): Promise<SessionStartResult> {
  const kind = (options.kind ?? "studio").trim();
  if (!(SESSION_KINDS as readonly string[]).includes(kind)) {
    throw new SessionCommandError(
      `unknown session kind "${kind}". Known: ${SESSION_KINDS.join(", ")}.`,
    );
  }
  const id = options.id.trim();
  if (id === "") throw new SessionCommandError("session start needs --id");

  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(async ({ db }) => {
    const before = await readSession(db, id, owner);
    await ensureSession(
      db,
      {
        id,
        kind: kind as SessionKind,
        title: options.title ?? null,
        goal: options.goal ?? null,
        agentSessionId: options.agentSessionId ?? null,
      },
      owner,
    );
    const after = await readSession(db, id, owner);
    return {
      ok: true as const,
      command: "session start" as const,
      id,
      kind: after?.kind ?? kind,
      state: after?.state ?? "running",
      created: before === undefined,
    };
  });
}

export interface SessionEndOptions {
  id: string;
  state: string;
  errorKind?: string;
  error?: string;
  /** Whose session. Default: the CLI's owner. */
  owner?: string;
}

export interface SessionEndResult {
  ok: true;
  command: "session end";
  id: string;
  from: string | null;
  to: string;
  /** False when the session was already terminal, which is not an error. */
  moved: boolean;
}

export async function runSessionEnd(options: SessionEndOptions): Promise<SessionEndResult> {
  const state = options.state.trim();
  if (!(SESSION_STATES as readonly string[]).includes(state)) {
    throw new SessionCommandError(
      `unknown session state "${state}". Known: ${SESSION_STATES.join(", ")}.`,
    );
  }
  if (state === "running") {
    throw new SessionCommandError(
      `"running" is where a session starts, not somewhere it is moved to. End it as closed, ` +
        `failed, cancelled or interrupted.`,
    );
  }

  return withDatabase(async ({ db }) => {
    const result = await endSession(
      db,
      options.id.trim(),
      state as SessionState,
      { errorKind: options.errorKind ?? null, error: options.error ?? null },
      options.owner ?? CLI_OWNER,
    );
    return {
      ok: true as const,
      command: "session end" as const,
      id: options.id.trim(),
      from: result.from,
      to: state,
      moved: result.moved,
    };
  });
}

export function formatSession(result: SessionStartResult | SessionEndResult): string {
  if (result.command === "session start") {
    return result.created
      ? `opened ${result.id} (${result.kind}, ${result.state})`
      : `${result.id} was already open (${result.kind}, ${result.state})`;
  }
  return result.moved
    ? `${result.id}: ${result.from ?? "(unknown)"} → ${result.to}`
    : `${result.id} is already ${result.from ?? "terminal"}, so nothing moved`;
}
