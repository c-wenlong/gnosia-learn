"use server";

import { readPreference, writePreference } from "@self-learn/catalog/state";
import { redirect } from "next/navigation";

import { withLearnerStore } from "@/lib/learner-store";
import { currentOwner } from "@/lib/owner";
import { requireStudio, studioApi, type StudioResult } from "@/lib/studio";
import { AGENT_KEYS, checkedAgent, storedAgent } from "@/lib/studio-agent-settings";
import { withOutcome } from "@/lib/studio-view";

/**
 * The verbs, as server actions.
 *
 * Each one is a `POST` to the runner and then a redirect carrying what
 * happened: layering rule 1 says the UI never spawns a process and never
 * writes a file, so Export SVG here is a form whose action asks the runner to
 * run `canvas export`, and the page redraws from the directory afterwards.
 *
 * Server actions rather than browser `fetch` calls, for the same reason the
 * proxy checks the origin before stripping it. The runner's `guard` refuses a
 * request carrying a cross-origin `Origin`, and a browser sends one on every
 * POST. A server action arrives at Next as a POST from the page and leaves Next
 * as a call from a Node process, which is what the guard is looking for.
 *
 * **`requireStudio()` is written out in every exported function**, not hoisted
 * into the shared helper below. A server action compiles to a callable POST
 * endpoint with a stable id, so an ungated one is a way into the runner on a
 * deployment that has no studio — and a gate reached only through a helper is a
 * gate the next action added to this file can silently miss. Spelled out per
 * endpoint, it is something `studio-gate.test.ts` can check per endpoint.
 */

export interface VerbOutcome {
  ok: boolean;
  headline: string;
  detail: string | null;
}

async function verb(name: string, diagram: string, path: string): Promise<never> {
  const result = await studioApi<{ ok: boolean; note?: string; detail?: string[] | null }>(
    `/api/diagrams/${encodeURIComponent(diagram)}/${name}`,
    { method: "POST", body: "{}", timeoutMs: 200_000 },
  );

  const outcome: VerbOutcome = result.ok
    ? {
        ok: result.data.ok,
        headline: result.data.note ?? `${name} finished`,
        detail: (result.data.detail ?? []).join(" · ") || null,
      }
    : { ok: false, headline: result.headline, detail: result.detail };

  // Redirected rather than returned, so the answer survives the render the
  // form triggers. Without this the page simply redrew and a 409 or a 502 —
  // "there is no SVG to verify", "the snippet threw" — looked exactly like a
  // button that did nothing. Caught in review on the phase 2 PR.
  redirect(withOutcome(path, name, outcome));
}

export async function exportSvg(formData: FormData): Promise<void> {
  requireStudio();
  await verb("export", String(formData.get("name") ?? ""), String(formData.get("path") ?? "/studio"));
}

export async function verifySvg(formData: FormData): Promise<void> {
  requireStudio();
  await verb("verify", String(formData.get("name") ?? ""), String(formData.get("path") ?? "/studio"));
}

export async function inspectDiagram(formData: FormData): Promise<void> {
  requireStudio();
  await verb("inspect", String(formData.get("name") ?? ""), String(formData.get("path") ?? "/studio"));
}

/**
 * Store what the canvas holds: `catalog diagram commit`, through the runner.
 *
 * The canvas edits a checkout of the diagram (Track D of
 * docs/CONTENT-MIGRATION.md), and nothing it saves reaches the database until
 * this. The reason is required, because it is what the commit message used to
 * say; a commit refused because the diagram moved since the checkout leaves
 * the drawing on the canvas and says so.
 */
export async function commitDiagram(formData: FormData): Promise<void> {
  requireStudio();
  const diagram = String(formData.get("name") ?? "");
  const path = String(formData.get("path") ?? "/studio");
  const reason = String(formData.get("reason") ?? "").trim();
  const result = await studioApi<{ ok: boolean; note?: string }>(
    `/api/diagrams/${encodeURIComponent(diagram)}/commit`,
    { method: "POST", body: JSON.stringify({ reason }), timeoutMs: 120_000 },
  );
  redirect(
    withOutcome(path, "commit", {
      ok: result.ok && result.data.ok,
      headline: result.ok ? (result.data.note ?? "committed") : result.headline,
      detail: result.ok ? null : result.detail,
    }),
  );
}

/**
 * Close a mirror and let the next render start a fresh one.
 *
 * U10's one addition to what the mirror says about itself: when the runner's
 * own server-side poll of that port fails, the studio offers Restart canvas.
 * Everything else on that list — starting, unreachable, failed to save,
 * reloaded over unsaved edits — the mirror says in its own overlay, and the
 * studio does not restate it.
 */
export async function restartMirror(formData: FormData): Promise<void> {
  requireStudio();
  const file = String(formData.get("file") ?? "");
  const path = String(formData.get("path") ?? "/studio");
  const result = await studioApi<{ stopped: boolean; note?: string }>(
    `/api/mirrors?file=${encodeURIComponent(file)}`,
    { method: "DELETE" },
  );
  redirect(
    withOutcome(path, "restart", {
      ok: result.ok,
      headline: result.ok ? "The canvas was closed; a fresh one starts on this render." : result.headline,
      detail: result.ok ? null : result.detail,
    }),
  );
}

/** What a settings save came back with: `error` is the sentence the panel shows. */
export interface AgentSaved {
  ok: boolean;
  error: string | null;
}

/**
 * How long a save waits on the runner before writing the row itself. The
 * runner's own write is a `catalog preference set` subprocess (1 to 2 s when
 * the machine is loaded), so this is generous; what it must not do is leave the
 * panel waiting on a runner that never answers.
 */
const RUNNER_SAVE_MS = 20_000;

/**
 * The settings panel's save: one row's model and effort (D53 of
 * docs/STUDIO-VIDEOS.md), as the `studioVideoAgent` or `studioDiagramAgent`
 * preference of the signed-in owner. The runner reads it at job start
 * through `catalog preference get`, so a job queued now gets it.
 *
 * Returned rather than redirected: the panel stays open on the menu the
 * person just changed, and says "Saved" or why not beside it. A value the
 * shared reader would not keep as sent (a model that is not a CLI name, an
 * effort outside the list) is refused, never stored as something else.
 *
 * **The runner writes it when it can.** `PUT /api/settings/agent` stores the
 * same row and drops the runner's cached copy of it, so `/api/health` shows
 * the new model at once instead of up to 15 s later. The two answers to a
 * runner that says no are told apart:
 *
 * - The runner certainly never got the request (connection refused, the
 *   name did not resolve), or it answered with a server error, or with a 404
 *   or 405 because it is an older process that has no such route: the row is
 *   written directly, as before the runner took it over, so a save still works
 *   with the runner down. Both writes are the same row and the same value, so
 *   a runner that stored it and then failed to say so costs nothing.
 * - The runner did not answer in time, or the connection broke mid-request:
 *   it may have the request and write it later, after a newer pick, so the
 *   direct write is not made and the save is reported as not made. The panel
 *   puts the menus back to the stored row and the person tries again.
 * - The runner answered with any other 4xx: it looked at the value and refused
 *   it. That is the answer, shown as the refusal; writing the row behind its
 *   back would store what the runner said it would not run with.
 *
 * The checks that come first (the kind, and the model being one the menu
 * offers or the one already stored) do not change, and still read the stored
 * row, so with the catalog down a save says so before it tries either writer.
 */
export async function saveStudioAgent(formData: FormData): Promise<AgentSaved> {
  requireStudio();
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "video" && kind !== "diagram") return { ok: false, error: "That is not a studio agent." };
  const owner = await currentOwner();
  const sent = { model: String(formData.get("model") ?? ""), effort: String(formData.get("effort") ?? "") };
  try {
    // A model the menu offers, `default`, or the one already stored: a
    // typo stored here would fail every job of this kind at spawn.
    const value = await withLearnerStore(async (db) =>
      checkedAgent(sent, storedAgent(kind, await readPreference(db, AGENT_KEYS[kind], owner))),
    );
    if (value === null) return { ok: false, error: "That model or effort is not one the agent can run with." };

    const viaRunner = await studioApi<unknown>("/api/settings/agent", {
      method: "PUT",
      body: JSON.stringify({ kind, model: value.model, effort: value.effort }),
      timeoutMs: RUNNER_SAVE_MS,
    });
    if (viaRunner.ok) return { ok: true, error: null };
    if (runnerRefused(viaRunner)) return { ok: false, error: `Not saved: ${viaRunner.headline}` };
    // No answer, and no proof the request was not delivered: it may still land.
    if (viaRunner.reason === "down" && viaRunner.undelivered !== true) {
      return { ok: false, error: "Not saved: the studio did not answer in time. Try again." };
    }

    console.warn(`studio settings: the runner did not store it (${viaRunner.headline}), writing the row directly`);
    await withLearnerStore((db) => writePreference(db, AGENT_KEYS[kind], value, owner));
    return { ok: true, error: null };
  } catch (error) {
    console.warn(`studio settings: save failed — ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, error: "Not saved: the catalog did not answer." };
  }
}

/**
 * Whether a failed runner call is the runner looking at the value and saying
 * no: a 4xx, other than the 404 and 405 an older runner gives a route it does
 * not have. Nothing listening and a 5xx are the runner being unable, which is
 * what the direct write is for; a timeout is neither, and is handled apart.
 */
function runnerRefused(result: Extract<StudioResult<unknown>, { ok: false }>): boolean {
  if (result.reason !== "refused" || result.status === null) return false;
  if (result.status === 404 || result.status === 405) return false;
  return result.status >= 400 && result.status < 500;
}
