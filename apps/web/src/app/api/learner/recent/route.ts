import { NextResponse } from "next/server";
import { PREFERENCE_KEYS } from "@self-learn/schema/shared";
import { readPreference, withLearnerLock, writePreference } from "@self-learn/catalog/state";

import { enforceRateLimit } from "@/lib/agent/guard";
import { BadRequest, handler, LEARNER_RATE_LIMIT, requestOwner } from "@/lib/learner-api";
import { readRecent } from "@/lib/recent";
import {
  asNames,
  asPinned,
  cleanTitle,
  isAppPath,
  isRecentKey,
  MAX_RECENT_PAGES,
  RECENT_KINDS,
  withName,
  withoutPin,
  withPin,
  type RecentKind,
} from "@/lib/recent-core";

/**
 * The sidebar's Recent (L7 of docs/proposals/library-by-type-and-day.md).
 *
 * `GET` answers with `RecentModel`: `pages` pages of rows (50 a page), the
 * pins, the names, and the courses the owner opened. `drafts=0` leaves the
 * studio's conversations out, for a sidebar that reads them from the runner;
 * `q` searches every row's title instead of paging. A read, so it degrades
 * the way `GET /api/learner/home` does: an unreachable database is a 200
 * with `reachable: false`. No same-origin check, for the reason that route
 * gives; the rate limit bounds a loop.
 *
 * `POST` changes the two preferences the sidebar's row menu writes, under the
 * learner's row lock so two quick presses cannot drop each other's change:
 *
 * - `{ action: "pin", row: { key, kind, title, href } }` puts a copy of the
 *   row at the top of `pinned`;
 * - `{ action: "unpin", key }` takes it off;
 * - `{ action: "rename", key, name }` names a conversation (`draft:` keys
 *   only), and an empty name takes the name off.
 */

export async function GET(req: Request): Promise<NextResponse> {
  const limited = enforceRateLimit(req, "learner:recent-read", LEARNER_RATE_LIMIT);
  if (limited !== null) return limited;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;
  const params = new URL(req.url).searchParams;
  const pages = Number.parseInt(params.get("pages") ?? "1", 10);
  const q = (params.get("q") ?? "").slice(0, 200);
  const recent = await readRecent({
    pages: Number.isFinite(pages) ? Math.min(Math.max(pages, 1), MAX_RECENT_PAGES) : 1,
    withoutDrafts: params.get("drafts") === "0",
    q,
  });
  return NextResponse.json({ ok: true, recent }, { headers: { "Cache-Control": "no-store" } });
}

type Change =
  | { action: "pin"; row: { key: string; kind: RecentKind; title: string; href: string } }
  | { action: "unpin"; key: string }
  | { action: "rename"; key: string; name: string | null };

export const POST = handler<Change>(
  "recent",
  (body) => {
    switch (body.action) {
      case "pin": {
        const row = body.row;
        if (row === null || typeof row !== "object" || Array.isArray(row)) throw new BadRequest('"row" must be an object.');
        const { key, kind, title, href } = row as Record<string, unknown>;
        if (typeof kind !== "string" || !(RECENT_KINDS as readonly string[]).includes(kind)) {
          throw new BadRequest(`"row.kind" must be one of ${RECENT_KINDS.join(", ")}.`);
        }
        if (!isRecentKey(key, kind as RecentKind)) throw new BadRequest('"row.key" must be a row key of its kind.');
        const clean = cleanTitle(title);
        if (clean === null) throw new BadRequest('"row.title" must be a non-empty string.');
        if (!isAppPath(href)) throw new BadRequest('"row.href" must be a path in this app.');
        return { action: "pin", row: { key, kind: kind as RecentKind, title: clean, href } };
      }
      case "unpin": {
        if (!isRecentKey(body.key)) throw new BadRequest('"key" must be a row key.');
        return { action: "unpin", key: body.key };
      }
      case "rename": {
        // Only a conversation: a module, a video or a concept is named by the
        // catalog, and a second name for it would disagree with every other page.
        if (!isRecentKey(body.key, "draft")) throw new BadRequest('"key" must name a conversation.');
        if (typeof body.name !== "string") throw new BadRequest('"name" must be a string.');
        return { action: "rename", key: body.key, name: cleanTitle(body.name) };
      }
      default:
        throw new BadRequest('"action" must be one of pin, unpin, rename.');
    }
  },
  async (db, change, owner) =>
    withLearnerLock(db, owner, async (tx) => {
      if (change.action === "rename") {
        const names = asNames(await readPreference(tx, PREFERENCE_KEYS.recentNames, owner));
        await writePreference(tx, PREFERENCE_KEYS.recentNames, withName(names, change.key, change.name), owner);
        return { key: change.key, name: change.name };
      }
      const pinned = asPinned(await readPreference(tx, PREFERENCE_KEYS.pinned, owner));
      const next =
        change.action === "pin"
          ? withPin(pinned, { ...change.row, at: new Date().toISOString() })
          : withoutPin(pinned, change.key);
      await writePreference(tx, PREFERENCE_KEYS.pinned, next, owner);
      return { pinned: next };
    }),
);
