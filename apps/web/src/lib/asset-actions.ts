import { ASSET_NAME_MAX, cleanAssetName } from "@gnosia/schema/shared";

import { sendJson } from "@/lib/send-json";

/**
 * The three writes a reader makes on a library asset, from the browser: star
 * it, mark it read, rename it. The row menu (`RowMenu`) and the asset page
 * (`FavoriteButton`, `MarkWatched`, `AssetTitle`) each wrote these requests
 * and read their answers themselves, and the copies had drifted (S6-11 of the
 * library audit). Each answers `ok` with what the route stored, or the
 * sentence to show beside the control. Client-safe: no server import.
 */
export type ActionResult<T = null> = { ok: true; value: T } | { ok: false; message: string };

const UNREACHABLE = "Not saved: the server could not be reached.";

type RouteReply<T> = { ok?: boolean; error?: string; result?: T };

async function post<T>(path: string, body: unknown): Promise<ActionResult<RouteReply<T>>> {
  const reply = await sendJson<RouteReply<T>>("POST", path, body);
  if (reply === null) return { ok: false, message: UNREACHABLE };
  if (!reply.ok || reply.data.ok === false) {
    return { ok: false, message: reply.data.error ?? `Not saved (HTTP ${reply.status}).` };
  }
  return { ok: true, value: reply.data };
}

/** Star or unstar an asset (`/api/learner/favorite`). */
export async function setFavorite(assetId: string, favorite: boolean): Promise<ActionResult> {
  const answer = await post("/api/learner/favorite", { assetId, favorite });
  return answer.ok ? { ok: true, value: null } : answer;
}

/** Append a `watched` event: "Mark read", or "Mark watched" from a video's row menu (`/api/learner/watched`). */
export async function markWatched(assetId: string): Promise<ActionResult> {
  const answer = await post("/api/learner/watched", { assetId });
  return answer.ok ? { ok: true, value: null } : answer;
}

/** What the rename route stores: the name given (null for none), and the source's own title as of now. */
export interface AssetNaming {
  title: string | null;
  name: string | null;
}

/**
 * A typed name as the rename route will take it: cleaned by `cleanAssetName`
 * (null is "no name of its own", the source's title back), and refused past
 * `ASSET_NAME_MAX` characters before anything is sent.
 */
export function checkAssetName(draft: string | null): ActionResult<string | null> {
  const cleaned = cleanAssetName(draft);
  if (cleaned !== null && cleaned.length > ASSET_NAME_MAX) {
    return { ok: false, message: `At most ${ASSET_NAME_MAX} characters.` };
  }
  return { ok: true, value: cleaned };
}

/** Give an asset a name of its own, or `null` for its source's title (`/api/learner/asset-name`). */
export async function renameAsset(assetId: string, name: string | null): Promise<ActionResult<AssetNaming>> {
  const answer = await post<AssetNaming>("/api/learner/asset-name", { assetId, name });
  if (!answer.ok) return answer;
  const result = answer.value.result;
  if (result === undefined) return { ok: false, message: "Not saved: the server sent no result." };
  return { ok: true, value: { title: result.title ?? null, name: result.name ?? null } };
}
