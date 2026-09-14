import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

import { formatAssertOutput, runAssertOutput } from "./commands/assert-output";
import { DEFAULT_STATE_DIR, formatBackfill, runBackfill } from "./commands/backfill";
import { formatIndex, runIndexCommand } from "./commands/index-command";
import {
  formatJob,
  readBrief,
  runAccept,
  runClaim,
  runDiscard,
  runEnqueue,
  runFinish,
  runList,
  runShow as runJobShow,
  type JobResult,
} from "./commands/job";
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
  job <verb>               The generation jobs behind the diagram studio:
                           enqueue --brief FILE, claim, finish --state S,
                           accept, discard, ls, show ID.
  assert-output            Index one file the way the owning source would, and
                           record which job produced it. Needs --job and --path.

Options:
  --json                   Machine-readable output. Supported by every command.
  --only a,b               index: run only these sources. Known sources are
                           topics, courses, concepts, manimkc, diagrams,
                           sessions, mirrors; they always run in dependency
                           order, and selecting one selects everything
                           downstream of it.
  --manimkc-root PATH      index: the manimkc checkout to read, for both the
                           manimkc source and the mirror ledger beside it.
                           Relative to the working directory. Default:
                           $MANIMKC_ROOT, else <repo>/tools/manimkc.
  --from PATH              backfill: the directory holding events.jsonl,
                           model.json and reviews.json.
                           Default: <repo>/${DEFAULT_STATE_DIR}.
  --kind a,b               ls: count only these asset kinds. job ls/claim: the
                           job kind, e.g. diagram.
  --job ID                 assert-output, job: which job.
  --path P                 assert-output, job accept: a repo-relative file the
                           job landed. Repeatable on accept.
  --brief FILE             job enqueue: the brief JSON. Needs "topic", "target"
                           and "idempotencyKey"; "brief" is the generator's own
                           and is stored as jsonb.
  --state S                job finish: the state to move to, one of
                           awaiting_review, failed, cancelled, interrupted.
                           job ls: filter by state.
  --phase P                job finish: the progress label to leave on the row.
  --candidate P            job finish: where the candidate was written.
  --runner NAME            job claim: which runner is taking it.
  --session ID             job claim: the session it runs under.
  --exit-code N            job finish: the generator's exit code.
  --turns N                job finish: agent turns used.
  --cost N                 job finish: US dollars spent.
  --gate FILE              job finish: the gate's findings, as JSON.
  --error-kind K           job finish: a short machine-readable reason.
  --error M                job finish: the message a person reads.
  --limit N                job ls: rows to return. Default 20, max 100.
  -h, --help               Show this text.

Environment:
  DATABASE_URL   Defaults to postgres://localhost:5432/self_learn.
  MANIMKC_ROOT   The manimkc checkout. Defaults to <repo>/tools/manimkc.
                 Same variable and same meaning as manimkc's own CLI.
  TLDRAWKC_ROOT  The tldrawkc checkout, whose dist/ build reads the .tldr
                 files. Defaults to <repo>/tools/tldrawkc.
  LEARN_ROOT     The knowledge base's repo root, for tests. Defaults to
                 this repo.

  All four are documented in services/catalog/.env.example, all four take a
  default that needs no configuration, and the shell always wins over
  services/catalog/.env.
`;

type Command =
  | "migrate"
  | "status"
  | "index"
  | "backfill"
  | "ls"
  | "show"
  | "path"
  | "search"
  | "job"
  | "assert-output";

const COMMANDS: readonly Command[] = [
  "migrate",
  "status",
  "index",
  "backfill",
  "ls",
  "show",
  "path",
  "search",
  "job",
  "assert-output",
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
        job: { type: "string" },
        path: { type: "string", multiple: true },
        brief: { type: "string" },
        state: { type: "string" },
        phase: { type: "string" },
        candidate: { type: "string" },
        runner: { type: "string" },
        session: { type: "string" },
        "exit-code": { type: "string" },
        turns: { type: "string" },
        cost: { type: "string" },
        gate: { type: "string" },
        "error-kind": { type: "string" },
        error: { type: "string" },
        limit: { type: "string" },
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
      case "assert-output": {
        const jobId = values.job;
        const target = values.path?.[0];
        if (jobId === undefined) throw new Usage("assert-output needs --job");
        if (target === undefined) throw new Usage("assert-output needs --path");
        if ((values.path?.length ?? 0) > 1) {
          throw new Usage("assert-output takes one --path. Run it once per file.");
        }
        const result = await runAssertOutput({ jobId, path: target });
        emit(result, formatAssertOutput(result));
        break;
      }
      case "job": {
        const result = await job(positionals, values);
        emit(result, formatJob(result));
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


/** A numeric option, or undefined. Refuses anything that is not a number. */
function number(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Usage(`${flag} takes a number, not "${value}"`);
  return parsed;
}

/** A JSON file passed as a flag, e.g. `--gate findings.json`. */
async function jsonFile(
  file: string | undefined,
  flag: string,
): Promise<Record<string, unknown> | undefined> {
  if (file === undefined) return undefined;
  const raw = await readFile(file, "utf8").catch((error: Error) => {
    throw new Usage(`${flag}: could not read ${file}: ${error.message}`);
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Usage(`${flag}: ${file} is not JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Usage(`${flag}: ${file} must hold a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

type Values = {
  job?: string;
  path?: string[];
  brief?: string;
  state?: string;
  phase?: string;
  candidate?: string;
  runner?: string;
  session?: string;
  kind?: string;
  limit?: string;
  "exit-code"?: string;
  turns?: string;
  cost?: string;
  gate?: string;
  "error-kind"?: string;
  error?: string;
};

/** `catalog job <verb>`. Split out because it is seven verbs, not one. */
async function job(positionals: string[], values: Values): Promise<JobResult> {
  const verb = positionals[1];
  const needsJob = (): string => {
    if (values.job !== undefined) return values.job;
    const positional = positionals[2];
    if (positional !== undefined) return positional;
    throw new Usage(`job ${verb} needs --job <id>`);
  };

  switch (verb) {
    case "enqueue": {
      if (values.brief === undefined) throw new Usage("job enqueue needs --brief <file.json>");
      return runEnqueue({ brief: await readBrief(values.brief) });
    }
    case "claim":
      return runClaim({
        jobId: values.job,
        kind: values.kind,
        runner: values.runner,
        sessionId: values.session,
      });
    case "finish": {
      if (values.state === undefined) throw new Usage("job finish needs --state <state>");
      return runFinish({
        jobId: needsJob(),
        state: values.state,
        phase: values.phase,
        candidatePath: values.candidate,
        exitCode: number(values["exit-code"], "--exit-code"),
        turns: number(values.turns, "--turns"),
        costUsd: number(values.cost, "--cost"),
        gate: await jsonFile(values.gate, "--gate"),
        errorKind: values["error-kind"],
        error: values.error,
      });
    }
    case "accept":
      return runAccept({ jobId: needsJob(), paths: values.path });
    case "discard":
      return runDiscard({ jobId: needsJob() });
    case "ls":
      return runList({
        state: values.state,
        kind: values.kind,
        limit: number(values.limit, "--limit"),
      });
    case "show":
      return runJobShow(needsJob());
    default:
      throw new Usage(
        "usage: job enqueue|claim|finish|accept|discard|ls|show",
      );
  }
}

process.exitCode = await main(process.argv.slice(2));
