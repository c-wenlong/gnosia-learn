/**
 * Whether the concept tutor can offer the studio's tags (D67 of
 * docs/STUDIO-TUTOR-HANDOFF.md), decided in the browser from one
 * `GET /studio/api/health`.
 *
 * On the concept page's first load, so it imports nothing: the studio's own
 * readers (`studio-drafts.ts`, `studio-cards.ts`) come with the composer's
 * chunk, which is only fetched once this says yes. What each entry of the
 * menu says when it cannot be used is `tutor-handoff.ts`'s, in that chunk.
 */

/**
 * How often window focus may read health again: the rate the studio's own
 * panel uses (`CAP_READ_MS` in `DraftPanel`), since the runner caches its
 * slowest checks for as long.
 */
export const HEALTH_READ_MS = 30_000;

/**
 * Whether a health answer lets a tag do something: the runner can run its
 * planner (`ok`, which is false without the `claude` CLI), and a diagram or a
 * video can be made. Anything that is not an answer (the runner down, the
 * proxy refusing, a runner serving another owner) is no.
 *
 * A spent daily cap is still yes: the menu shows, with both entries disabled
 * and the reason, since the cap frees itself within the day.
 */
export function studioCanTag(health: unknown): boolean {
  if (typeof health !== "object" || health === null) return false;
  const raw = health as { ok?: unknown; diagramAgent?: unknown; video?: unknown };
  if (raw.ok !== true) return false;
  const diagram = !(typeof raw.diagramAgent === "object" && raw.diagramAgent !== null && (raw.diagramAgent as { ok?: unknown }).ok === false);
  const video = typeof raw.video === "object" && raw.video !== null && (raw.video as { ok?: unknown }).ok === true;
  return diagram || video;
}

/**
 * One health read through the studio's proxy, or null when it did not
 * answer with one. The proxy adds the signed-in owner, and the runner
 * refuses a request for anyone but its own (H11), which lands here as null.
 */
export async function readHealth(): Promise<unknown> {
  try {
    const response = await fetch("/studio/api/health", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** Run `task` once the browser is idle, or soon where it cannot say. Returns a cancel. */
export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: 4_000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(task, 200);
  return () => window.clearTimeout(handle);
}
