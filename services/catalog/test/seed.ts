import path from "node:path";

import { REPO_ROOT } from "../src/env";

/**
 * The tree the suites read real content from: `seed/`, a slice of the
 * owner's content cut with `catalog export --subset` (seed/README.md). Not
 * `content/` and `learn/`, which phase 3 of docs/CONTENT-MIGRATION.md
 * removes (edge case 11). Read only: `vitest.setup.ts` fails a test file that
 * changes a byte under it, so a suite that writes copies it first.
 */
export const SEED = path.join(REPO_ROOT, "seed");
