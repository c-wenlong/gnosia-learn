import { parseArgs } from "node:util";
import path from "node:path";

import { DEFAULT_STATE_DIR, formatBackfill, runBackfill } from "./commands/backfill";
import { formatIndex, runIndexCommand } from "./commands/index-command";
import { formatLs, parseKinds, runLs } from "./commands/ls";
import { formatMigrate, runMigrate } from "./commands/migrate";
import { formatPath, runPath } from "./commands/path";
import { formatSearch, runSearch } from "./commands/search";
import { formatShow, runShow } from "./commands/show";
import { formatStatus, runStatus } from "./commands/status";
import { databaseUrl, redactUrl } from "./env";
import { parseSources } from "./index/run";

/**
 * The catalog CLI. Run it from the repo root:
 *
 *   npm run catalog -- status --json
 *   npm run catalog -- index
 *   npm run catalog -- show tomasulo-algorithm --json
 *
 * Every command takes `--json`. Agents read the JSON; people read the tables.
 * Every command is also bounded: `ls` returns counts, `show` returns one entity,
 * `search` returns twenty rows. Nothing here ever returns a whole tree, because
 * the layer above this is an agent's context window.
 */

const USAGE = `catalog — the derived index over the content trees

Usage: npm run catalog -- <command> [options]

Commands:
  migrate                  Apply every outstanding migration. Idempotent.
  status                   Row counts, the migration head, when each source
                           was last indexed, and mirror coverage per
                           destination.
  index                    Read the content trees and rewrite the derived rows.
  backfill                 One-off: move learn/state/*.json into the state
                           tables, then assert the rebuilt mastery equals
                           model.json and the cards equal reviews.json.
                           Idempotent; exits non-zero on any mismatch.
  ls [domain|collection]   Domains and courses, one domain's topics, or one
                           collection's tree. Titles and counts only.
  show <slug-or-id>        One topic, concept, collection, curriculum item or
                           asset, with everything that points at it. Paths, not
                           bodies.
  path <from> <to>         The prerequisite chain between two concepts, in
                           learning order.
  search <term>            Topic titles and aliases, concept titles, asset
                           titles. Top 20.

Options:
  --json                   Machine-readable output. Supported by every command.
  --only a,b               index: run only these sources. Known sources are
                           topics, courses, concepts, manimkc, diagrams,
                           sessions, mirrors; they always run in dependency
                           order, and selecting one selects everything
                           downstream of it.
  --manimkc-root PATH      index: the manimkc checkout to read, for both the
                           manimkc source and the mirror ledger beside it.
                           Default: <repo>/tools/manimkc.
  --from PATH              backfill: the directory holding events.jsonl,
                           model.json and reviews.json.
                           Default: <repo>/${DEFAULT_STATE_DIR}.
  --kind a,b               ls: count only these asset kinds.
  -h, --help               Show this text.

Environment:
  DATABASE_URL  Defaults to postgres://localhost:5432/self_learn.
                See services/catalog/.env.example.
`;

type Command =
  | "migrate"
  | "status"
  | "index"
  | "backfill"
  | "ls"
  | "show"
  | "path"
  | "search";

const COMMANDS: readonly Command[] = [
  "migrate",
  "status",
  "index",
  "backfill",
  "ls",
  "show",
  "path",
  "search",
];

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && (COMMANDS as readonly string[]).includes(value);
}

/** A command that needs arguments and did not get them. Exit code 2, not 1. */
class Usage extends Error {}

/** Exit codes: 0 ok, 1 the command failed, 2 the invocation was wrong. */
export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: "boolean", default: false },
        only: { type: "string" },
        "manimkc-root": { type: "string" },
        from: { type: "string" },
        kind: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }

  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values.help || command === undefined) {
    process.stdout.write(USAGE);
    return command === undefined && !values.help ? 2 : 0;
  }
  if (!isCommand(command)) {
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    return 2;
  }

  const emit = (result: unknown, human: string) => {
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${human}\n`);
  };

  try {
    switch (command) {
      case "migrate": {
        const result = await runMigrate();
        emit(result, formatMigrate(result));
        break;
      }
      case "status": {
        const result = await runStatus();
        emit(result, formatStatus(result));
        break;
      }
      case "index": {
        const root = values["manimkc-root"];
        const result = await runIndexCommand({
          only: values.only === undefined ? undefined : parseSources(values.only),
          manimkcRoot: root === undefined ? undefined : path.resolve(root),
        });
        emit(result, formatIndex(result));
        break;
      }
      case "backfill": {
        const result = await runBackfill({ from: values.from });
        emit(result, formatBackfill(result));
        // A mismatch is the whole point of the command, so it is an exit code
        // and not just a paragraph: a script that pipes this into `--json`
        // must not read "it printed something" as "it worked".
        if (!result.ok) return 1;
        break;
      }
      case "ls": {
        const result = await runLs(positionals[1], {
          kinds: values.kind === undefined ? undefined : parseKinds(values.kind),
        });
        emit(result, formatLs(result));
        break;
      }
      case "show": {
        const target = positionals[1];
        if (target === undefined) throw new Usage("show needs a slug or an id");
        const result = await runShow(target);
        emit(result, formatShow(result));
        break;
      }
      case "path": {
        const from = positionals[1];
        const to = positionals[2];
        if (from === undefined || to === undefined) {
          throw new Usage("path needs two concept slugs");
        }
        const result = await runPath(from, to);
        emit(result, formatPath(result));
        // "no path" is an answer, not a failure. Exit 0 so a script can tell
        // the difference between "they are unconnected" and "the query broke".
        break;
      }
      case "search": {
        const term = positionals.slice(1).join(" ");
        if (term.trim() === "") throw new Usage("search needs a term");
        const result = await runSearch(term);
        emit(result, formatSearch(result));
        break;
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof Usage) {
      process.stderr.write(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (values.json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, command, database: redactUrl(databaseUrl()), error: message }, null, 2)}\n`,
      );
    } else {
      process.stderr.write(
        `catalog ${command} failed against ${redactUrl(databaseUrl())}\n  ${message}\n`,
      );
    }
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
