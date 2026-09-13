/**
 * Server-only loader for the knowledge base.
 *
 * Never import this from a `"use client"` module: it reaches the database.
 * The web hub is a *view* of the knowledge base; the `learn` CLI is what
 * writes it.
 *
 * What changed in bundle 5: this read `learn/state/index.json` with
 * `readFileSync` at build time, so a study session did not show up on `/learn`
 * until the next deploy. It is a query now, and `/learn` is dynamic. The
 * degradation is the same in shape as before — a database that cannot be
 * reached yields an empty knowledge base rather than a failed render, exactly
 * as a missing snapshot file used to — but the page now also says which of the
 * two it is, because "you have no concepts" and "I could not ask" look
 * identical and are not.
 */
export { loadKnowledgeBase, type KnowledgeBaseSnapshot } from "@/lib/learner-store";
export { dueConcepts } from "@self-learn/catalog/state";
