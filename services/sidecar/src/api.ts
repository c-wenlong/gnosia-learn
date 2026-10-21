import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { TutorDeps } from "@self-learn/tutor/server/deps";
import {
  assetNameTurn,
  favoriteTurn,
  nameTurn,
  noteTurn,
  observeTurn,
  playbackTurn,
  progressTurn,
  sessionCloseTurn,
  watchedTurn,
} from "@self-learn/tutor/server/learner-writes";
import {
  chatTurn,
  customProviderAddTurn,
  customProviderChangeTurn,
  judgeTurn,
  modelListTurn,
  providerKeyRemoveTurn,
  providerKeySaveTurn,
  providerKeyStatusTurn,
  providerKeyTestTurn,
  sessionQuestionTurn,
  summarizeTurn,
  tutorModelAddTurn,
  tutorModelChainTurn,
  tutorModelMoveTurn,
  tutorModelRemoveTurn,
  tutorModelSetTurn,
  tutorModelTestTurn,
  tutorProviderMoveTurn,
  tutorProviderRemoveTurn,
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
 *   POST   /api/agent/chat                     → chatTurn
 *   POST   /api/agent/judge                    → judgeTurn
 *   POST   /api/agent/session                  → sessionQuestionTurn
 *   POST   /api/agent/summarize                → summarizeTurn
 *   POST   /api/learner/favorite               → favoriteTurn
 *   POST   /api/learner/watched                → watchedTurn
 *   POST   /api/learner/playback               → playbackTurn
 *   POST   /api/learner/progress               → progressTurn
 *   POST   /api/learner/asset-name             → assetNameTurn
 *   POST   /api/learner/note                   → noteTurn
 *   POST   /api/learner/name                   → nameTurn
 *   POST   /api/learner/observe                → observeTurn
 *   POST   /api/learner/session/close          → sessionCloseTurn
 *   GET    /api/learner/provider-key           → providerKeyStatusTurn (the card's rows; the web reads them server-side)
 *   POST   /api/learner/provider-key           → providerKeySaveTurn
 *   DELETE /api/learner/provider-key           → providerKeyRemoveTurn
 *   POST   /api/learner/provider-key/test      → providerKeyTestTurn
 *   POST   /api/learner/custom-provider        → customProviderAddTurn
 *   PATCH  /api/learner/custom-provider        → customProviderChangeTurn
 *   GET    /api/learner/tutor-model            → tutorModelChainTurn (the chain; the web reads it server-side)
 *   POST   /api/learner/tutor-model            → tutorModelAddTurn
 *   PUT    /api/learner/tutor-model            → tutorModelSetTurn
 *   PATCH  /api/learner/tutor-model            → tutorModelMoveTurn
 *   DELETE /api/learner/tutor-model            → tutorModelRemoveTurn
 *   PATCH  /api/learner/tutor-model/provider   → tutorProviderMoveTurn
 *   DELETE /api/learner/tutor-model/provider   → tutorProviderRemoveTurn
 *   POST   /api/learner/tutor-model/test       → tutorModelTestTurn
 *   POST   /api/learner/tutor-model/models     → modelListTurn
 *   GET    /api/health                         → { ok, service, owner }
 */

/** The largest body a turn accepts: the chat guard's 24k of text, padded for the envelope. */
const MAX_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

type Turn = (deps: TutorDeps, body: unknown) => Promise<TurnReply>;

/** The routes, in one table so the surface is one list a reader can audit: path, then method. */
const TURNS: Record<string, Record<string, Turn>> = {
  "/api/agent/chat": { POST: chatTurn as Turn },
  "/api/agent/judge": { POST: judgeTurn },
  "/api/agent/session": { POST: sessionQuestionTurn },
  "/api/agent/summarize": { POST: summarizeTurn as Turn },
  "/api/learner/favorite": { POST: favoriteTurn },
  "/api/learner/watched": { POST: watchedTurn },
  "/api/learner/playback": { POST: playbackTurn },
  "/api/learner/progress": { POST: progressTurn },
  "/api/learner/asset-name": { POST: assetNameTurn },
  "/api/learner/note": { POST: noteTurn },
  "/api/learner/name": { POST: nameTurn },
  "/api/learner/observe": { POST: observeTurn },
  "/api/learner/session/close": { POST: sessionCloseTurn },
  "/api/learner/provider-key": {
    GET: providerKeyStatusTurn as Turn,
    POST: providerKeySaveTurn,
    DELETE: providerKeyRemoveTurn,
  },
  "/api/learner/provider-key/test": { POST: providerKeyTestTurn },
  "/api/learner/custom-provider": {
    POST: customProviderAddTurn,
    PATCH: customProviderChangeTurn,
  },
  "/api/learner/tutor-model": {
    GET: tutorModelChainTurn as Turn,
    POST: tutorModelAddTurn,
    PUT: tutorModelSetTurn,
    PATCH: tutorModelMoveTurn,
    DELETE: tutorModelRemoveTurn,
  },
  "/api/learner/tutor-model/provider": {
    PATCH: tutorProviderMoveTurn,
    DELETE: tutorProviderRemoveTurn,
  },
  "/api/learner/tutor-model/test": { POST: tutorModelTestTurn },
  "/api/learner/tutor-model/models": { POST: modelListTurn },
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

    const methods = TURNS[path];
    if (methods === undefined) {
      write(response, { status: 404, body: { error: "No such endpoint", code: "NOT_FOUND" } });
      return;
    }
    const method = request.method ?? "GET";
    const turn = methods[method];
    if (turn === undefined) {
      write(response, { status: 405, body: { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" } });
      return;
    }

    // A GET carries no body; its turn takes the deps alone.
    let body: unknown = null;
    if (method !== "GET" && method !== "HEAD") {
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
    }

    write(response, await turn(deps, body));
  }
}
