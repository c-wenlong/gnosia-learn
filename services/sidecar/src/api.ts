import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { TutorDeps } from "@self-learn/tutor/server/deps";
import {
  chatTurn,
  judgeTurn,
  modelListTurn,
  providerKeyTestTurn,
  sessionQuestionTurn,
  summarizeTurn,
  tutorModelTestTurn,
  type TurnReply,
} from "@self-learn/tutor/server/turns";

import { guard } from "./guard";

/**
 * The HTTP surface: JSON in, JSON out, on `127.0.0.1` and an ephemeral port.
 *
 * Every endpoint is a thin transport over one `*Turn` function from
 * `@self-learn/tutor/server` — the same functions `apps/web`'s routes call,
 * so the native app gets the web contract verbatim: same bodies, same
 * `{ error, code }` refusals, same provider-fallback fields. There is no SSE:
 * the tutor endpoints never streamed, they answer one JSON object per turn.
 *
 * The mapping keeps the web paths so the contract documents itself:
 *
 *   POST /api/agent/chat                    → chatTurn
 *   POST /api/agent/judge                   → judgeTurn
 *   POST /api/agent/session                 → sessionQuestionTurn
 *   POST /api/agent/summarize               → summarizeTurn
 *   POST /api/learner/provider-key/test     → providerKeyTestTurn
 *   POST /api/learner/tutor-model/test      → tutorModelTestTurn
 *   POST /api/learner/tutor-model/models    → modelListTurn
 *   GET  /api/health                        → { ok, service, owner }
 */

/** The largest body a turn accepts: the chat guard's 24k of text, padded for the envelope. */
const MAX_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

type Turn = (deps: TutorDeps, body: unknown) => Promise<TurnReply>;

/** The routes, in one table so the surface is one list a reader can audit. */
const TURNS: Record<string, Turn> = {
  "/api/agent/chat": chatTurn as Turn,
  "/api/agent/judge": judgeTurn,
  "/api/agent/session": sessionQuestionTurn,
  "/api/agent/summarize": summarizeTurn as Turn,
  "/api/learner/provider-key/test": providerKeyTestTurn,
  "/api/learner/tutor-model/test": tutorModelTestTurn,
  "/api/learner/tutor-model/models": modelListTurn,
};

/** Read the body, refusing over the cap. The first byte past it is the refusal. */
async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

class BodyTooLarge extends Error {}

function write(response: ServerResponse, { status, body, headers }: TurnReply): void {
  response.writeHead(status, { ...JSON_HEADERS, ...headers });
  response.end(JSON.stringify(body));
}

/** What the service answers about itself. */
function health(deps: TutorDeps): TurnReply {
  return {
    status: 200,
    body: { ok: true, service: "gnosia-sidecar", owner: deps.owner },
    headers: { "Cache-Control": "no-store" },
  };
}

/**
 * `deps` is a factory result — the process calls `tutorDeps()` once and hands
 * the result in; the tests hand a stub. It arrives resolved, not inside the
 * request path, so a dead Postgres is a per-request degradation the turn
 * functions already know how to answer, never a failed listen.
 */
export function createApi(deps: TutorDeps): Server {
  return createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      // The last-resort answer: a turn that throws is a bug, but the socket
      // still owes the caller a JSON refusal rather than a hang.
      console.error("sidecar: unhandled error", error);
      write(response, { status: 500, body: { error: "Internal error", code: "INTERNAL" } });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const refused = guard(request);
    if (refused !== null) {
      write(response, { status: 403, body: { error: refused, code: "ORIGIN_MISMATCH" } });
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && path === "/api/health") {
      write(response, health(deps));
      return;
    }

    if (request.method !== "POST") {
      write(response, { status: 405, body: { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" } });
      return;
    }

    const turn = TURNS[path];
    if (turn === undefined) {
      write(response, { status: 404, body: { error: "No such endpoint", code: "NOT_FOUND" } });
      return;
    }

    let body: unknown;
    try {
      body = await readBody(request);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        write(response, { status: 413, body: { error: "Request body too large", code: "PAYLOAD_TOO_LARGE" } });
      } else {
        write(response, { status: 400, body: { error: "Invalid JSON body", code: "BAD_REQUEST" } });
      }
      return;
    }

    write(response, await turn(deps, body));
  }
}
