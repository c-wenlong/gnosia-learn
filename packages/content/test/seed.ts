import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `seed/` at the repository root: real content in the export layout, cut
 * with `catalog export --subset` (seed/README.md). The suites read it rather
 * than `content/` and `learn/`, which phase 3 of docs/CONTENT-MIGRATION.md
 * removes. Read only; `vitest.setup.ts` fails a test file that changes it.
 */
export const SEED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "seed");
