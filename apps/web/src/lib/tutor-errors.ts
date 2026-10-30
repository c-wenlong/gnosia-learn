/**
 * The sentence a tutor surface shows when a tutor route refuses or fails:
 * the concept tutor, the topic tutor, the open tutor, Ask, and the session
 * page's question writer. One mapping, so a code named on one surface is
 * named on all of them.
 */
export function tutorProblem(status: number, reply: { code?: string; error?: string } | null | undefined): string {
  const { code, error } = reply ?? {};
  // The server's own words say which case it is (docs/TUTOR-MODELS.md, T4):
  // no key anywhere, or a model list whose providers have none.
  if (code === "MISSING_API_KEY") return error ?? "The tutor has no model provider key yet. Add one in Settings, under Providers.";
  if (code === "CONCEPT_UNAVAILABLE") return "The knowledge base is unreachable, so the tutor has no note to read.";
  if (code === "UNSTRUCTURED_REPLY") return "The tutor answered, but not with a question it could be graded on.";
  if (status === 429 || code === "RATE_LIMITED") return "That was a lot of questions in a minute. Wait a moment and try again.";
  return error ?? `The tutor did not answer (HTTP ${status}).`;
}
