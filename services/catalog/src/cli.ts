import { parseArgs } from "node:util";

import { formatMigrate, runMigrate } from "./commands/migrate";
import { formatStatus, runStatus } from "./commands/status";
import { databaseUrl, redactUrl } from "./env";

/**
 * The catalog CLI. Run it from the repo root:
 *
 *   npm run catalog -- status --json
 *   npm run catalog -- migrate
 *
 * Every command takes `--json`. Agents read the JSON; people read the tables.
 * Bundle 3's second half adds `ls`, `show`, `path` and `index` beside these.
 */

const USAGE = `catalog — the derived index over the content trees

Usage: npm run catalog -- <command> [options]

Commands:
  migrate    Apply every outstanding migration. Idempotent.
  status     Row counts per table and the applied migration head.

Options:
  --json     Machine-readable output. Supported by every command.
  -h, --help Show this text.

Environment:
  DATABASE_URL  Defaults to postgres://localhost:5432/self_learn.
                See services/catalog/.env.example.
`;

type Command = "migrate" | "status";

const COMMANDS: readonly Command[] = ["migrate", "status"];

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && (COMMANDS as readonly string[]).includes(value);
}

/** Exit codes: 0 ok, 1 the command failed, 2 the invocation was wrong. */
export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: "boolean", default: false },
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

  try {
    if (command === "migrate") {
      const result = await runMigrate();
      process.stdout.write(
        values.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatMigrate(result)}\n`,
      );
      return 0;
    }
    const result = await runStatus();
    process.stdout.write(
      values.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatStatus(result)}\n`,
    );
    return 0;
  } catch (error) {
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
