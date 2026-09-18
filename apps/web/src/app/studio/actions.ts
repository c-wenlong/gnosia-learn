"use server";

import { revalidatePath } from "next/cache";

import { requireStudio, studioApi } from "@/lib/studio";

/**
 * The verbs, as server actions.
 *
 * Each one is a `POST` to the runner and then a revalidate, which is the whole
 * of it: layering rule 1 says the UI never spawns a process and never writes a
 * file, so Export SVG here is a form whose action asks the runner to run
 * `canvas export`, and the page redraws from the directory afterwards.
 *
 * Server actions rather than browser `fetch` calls, for the same reason the
 * proxy strips two headers. The runner's `guard` refuses a request carrying a
 * cross-origin `Origin`, and a browser sends one on every POST. A server action
 * arrives at Next as a POST from the page and leaves Next as a call from a Node
 * process, which is what the guard is looking for.
 *
 * `requireStudio()` first in every one of them. A server action is a callable
 * POST endpoint with a stable id, so an ungated action would be a way into the
 * runner on a deployment that has no studio — which is the hole D11's gate
 * exists to close. The gate test walks this file for the same reason it walks
 * the routes.
 */

export interface VerbOutcome {
  ok: boolean;
  headline: string;
  detail: string | null;
}

async function verb(name: string, diagram: string, path: string): Promise<VerbOutcome> {
  requireStudio();
  const result = await studioApi<{ ok: boolean; note?: string; detail?: string[] | null }>(
    `/api/diagrams/${encodeURIComponent(diagram)}/${name}`,
    { method: "POST", body: "{}", timeoutMs: 200_000 },
  );
  revalidatePath(path);
  if (!result.ok) {
    return { ok: false, headline: result.headline, detail: result.detail };
  }
  return {
    ok: result.data.ok,
    headline: result.data.note ?? `${name} finished`,
    detail: (result.data.detail ?? []).join("\n") || null,
  };
}

export async function exportSvg(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "");
  await verb("export", name, String(formData.get("path") ?? "/studio"));
}

export async function verifySvg(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "");
  await verb("verify", name, String(formData.get("path") ?? "/studio"));
}

export async function inspectDiagram(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "");
  await verb("inspect", name, String(formData.get("path") ?? "/studio"));
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
  await studioApi(`/api/mirrors?file=${encodeURIComponent(file)}`, { method: "DELETE" });
  revalidatePath(String(formData.get("path") ?? "/studio"));
}
