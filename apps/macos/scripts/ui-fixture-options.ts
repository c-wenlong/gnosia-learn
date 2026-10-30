// The tutor's wrong options for one review card of the UI snapshot fixture,
// stored the way a session stores them, so the Review screen draws a card
// asked with the tutor's options beside one asked with the notes'.
//
// usage: CATALOG_DB=<fixture catalog> node --import tsx apps/macos/scripts/ui-fixture-options.ts <concept>
//
// ui-snapshots.mjs runs it on its throwaway catalog only, before the mirror
// is taken: the row goes through writeCheckDistractor and is keyed by
// checkHash, as the sidecar's check-options turn keys it, so the snapshot
// script and the app read it exactly as they read a real one.

import { writeCheckDistractor } from "@gnosia/catalog/state";
import { parseChecks } from "@gnosia/tutor/concept-note-core";
import { checkHash } from "@gnosia/tutor/server/check-options";

import { connect } from "../../../services/catalog/src/db";

/** Options written for the seed's notes, one set per concept the fixture can make due. */
const OPTIONS: Record<string, string[]> = {
  "react-loop": [
    "A cache of earlier tool results, so the agent never calls the same tool twice in one run.",
    "A planner that writes the whole sequence of actions up front, before any tool is called.",
    "A second model that checks each tool's output before it is appended to the context.",
  ],
  "tool-calling": [
    "The model runs the function itself in its own sandbox and returns only the final answer.",
    "A network request to the tool's API; the provider sends the response to the user directly.",
    "A plain-language request the harness rewrites as code, whose result stays outside the context.",
  ],
};

const slug = process.argv[2] ?? "";
const options = OPTIONS[slug];
if (options === undefined) {
  console.error(`ui-fixture-options: no options written for ${JSON.stringify(slug)}; add them to OPTIONS.`);
  process.exit(2);
}

const { db, sqlite, close } = connect();
try {
  const row = sqlite.prepare("SELECT body FROM concept WHERE slug = ?").get(slug) as { body: string | null } | undefined;
  // The card asks the note's first check with a question, as toReviewItem does.
  const check = parseChecks(row?.body ?? "").find((c) => c.question.trim() !== "");
  if (check === undefined) {
    console.error(`ui-fixture-options: ${slug} has no check to store options for.`);
    process.exit(1);
  }
  await writeCheckDistractor(db, "local", {
    conceptSlug: slug,
    checkId: check.id,
    checkHash: checkHash(check),
    options,
    model: "fixture",
    provider: null,
  });
  console.log(`ui-fixture-options: stored the tutor's options for ${slug}#${check.id}`);
} finally {
  await close();
}
