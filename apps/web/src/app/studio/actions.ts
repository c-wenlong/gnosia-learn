"use server";

import { redirect } from "next/navigation";

import { requireStudio, studioApi } from "@/lib/studio";
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
