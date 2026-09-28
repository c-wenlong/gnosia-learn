import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

import { formatAssetUpload, runAssetUpload } from "./commands/asset-upload";
import { formatBlobAudit, runBlobAudit } from "./commands/blob-audit";
import { UPLOAD_SOURCES, type UploadSource } from "./content/asset-upload";
import { DEFAULT_STATE_DIR, formatBackfill, runBackfill } from "./commands/backfill";
import {
  formatCourseExport,
  formatCourseImport,
  formatItem,
  ITEM_VERBS,
  type ItemVerb,
  runCourseExport,
  runCourseImport,
  runItem,
} from "./commands/course";
import { runDiagramCommand } from "./commands/diagram";
import { formatExport, runExport } from "./commands/export";
import type { ExportSubset } from "./content/subset";
import { formatFlip, runFlip } from "./commands/flip";
import { formatIndex, runImportCommand } from "./commands/index-command";
import { formatParity, runParity } from "./commands/parity";
import { EXPORT_TYPES, type ExportType } from "./content/layout";
import { CONTENT_TYPES, type ContentType } from "@self-learn/schema";
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
import { formatDoctor, runDoctor } from "./commands/doctor";
import { formatMigrate, runMigrate } from "./commands/migrate";
import { formatPath, runPath } from "./commands/path";
import { formatRenumber, runRenumber } from "./commands/renumber";
import { RENUMBER_LISTS, type RenumberList } from "./content/renumber";
import {
  formatDiff,
  formatHistory,
  parseEntityType,
  parseRevisionId,
  RevisionUsage,
  runDiff,
  runHistory,
} from "./commands/revisions";
import { formatSearch, runSearch } from "./commands/search";
import {
  formatSession,
  runSessionEnd,
  runSessionStart,
  type SessionEndResult,
  type SessionStartResult,
} from "./commands/session";
import { formatShow, runShow } from "./commands/show";
import { formatTag, formatTopic, runTag, runTopic, TopicUsage } from "./commands/topic";
import { formatStatus, runStatus } from "./commands/status";
import {
  classifyConnectionFailure,
  describeConnectionFailure,
  EXIT_UNREACHABLE,
  failureText,
} from "./connection-failure";
import { withDatabase } from "./db";
import { databaseUrl, REPO_ROOT, redactUrl } from "./env";
import { assertMigrated, EXIT_MIGRATIONS_OUTSTANDING, MigrationsOutstanding } from "./migrations";
import { parseSources } from "./index/run";

/**
 * The catalog CLI. Run it from the repo root:
 *
 *   npm run catalog -- status --json
 *   npm run catalog -- import
 *   npm run catalog -- show tomasulo-algorithm --json
 *
 * Every command takes `--json`. Agents read the JSON; people read the tables.
 * Every command is also bounded: `ls` returns counts, `show` returns one entity,
 * `search` returns twenty rows. Nothing here ever returns a whole tree, because
 * the layer above this is an agent's context window.
 */

const USAGE = `catalog — the content database: import, export, write, and index

Usage: npm run catalog -- <command> [options]

Commands:
  migrate                  Apply every outstanding migration. Idempotent.
                           A contract migration the data is not ready for
                           (0013 before \`asset upload\`) is held with
                           everything after it, and the reason printed;
                           every other command runs on such a database.
  status                   Row counts, the migration head, when each source
                           was last indexed, and mirror coverage per
                           destination.
  import [<dir>]           Read a directory in the export layout (an export,
                           seed/) into the database, every changed entity as
                           an import revision. A type the database owns is
                           skipped when its files are its own last export or
                           the directory holds none, and refused when they
                           were edited. <dir> defaults to the repository,
                           which has held no content since the cut-over: on a
                           database that owns every type, a bare \`import\`
                           refreshes manimkc and the mirror ledger.
  index                    The old name of \`import\` with no directory. Still
                           works, and says the new name once on stderr.
  export --out <dir>       Write the database back out as content/ and learn/
                           files: topics.yaml, tags.yaml, courses/<code>.yaml
                           from rows; concept notes and session logs from
                           rows; diagrams from rows and the blob store.
                           Records each type's export hash on content_source.
                           --subset writes a small tree that imports on its
                           own instead (how seed/ is made): the --topic
                           slugs named, --course's modules filed under them,
                           the notes filed under them, one --session log and
                           one --diagram. Records nothing.
  parity <dir>             Compare the database with <dir> entity by entity:
                           counts per type, sha256 per entity over a canonical
                           form. Lists every mismatch by id; exits 1 on any.
  flip <type>              Make the database the owner of one content type:
                           write its content_source row and arm its write
                           guards. Refused until the type's database reader
                           is built, and unless parity is clean against the
                           files the type was last imported from. --strict
                           also arms its completeness rules, refused while
                           doctor lists a violator; --waive <rule> --reason
                           <why> leaves one disarmed, on the record.
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
  diagram <verb>           Diagrams in the database: put, checkout, commit,
                           list, show. \`catalog diagram --help\` has the
                           flags.
  session <verb>           The session row a job hangs off: start --id ID
                           [--kind studio] [--title T] [--goal G]
                           [--agent-session UUID], and end --id ID --state S.
  history <type> <id>      Every revision of one content entity, oldest first:
                           who wrote it, why, and with what op. Types: topic,
                           tag, collection, curriculum_item, concept, diagram,
                           asset.
  diff <rev> [<rev>]       What one revision changed from the one before it, or
                           the difference between two revisions: fields, link
                           rows, and a line diff for markdown.
  doctor                   The completeness rules the database can enforce:
                           which are armed, and every row that breaks one.
                           Also the write guards and whether this database is
                           the primary.
  asset upload             Copy rendered files into the blob store and point
                           their asset rows at them: --source manimkc reads
                           manimkc topics --json, uploads every indexed video
                           and sidecar whose bytes match its row, cuts a
                           poster per video with ffmpeg, and sets blob_key.
                           Resumable: a present blob is skipped.
  blob audit               Compare the blob store with blob_object: objects
                           with no row, present rows whose bytes are gone or
                           wrong, stale pending rows, unreferenced objects,
                           posters whose video is gone. Exits 1 while any
                           disagreement stands or an asset points at a
                           pending blob. --fix deletes day-old
                           orphans, marks broken rows pending, deletes
                           day-old pending rows nothing points at, and
                           sweeps day-old .tmp/*.part files. The store is
                           $SELF_LEARN_HOME/blobs (else ~/.self-learn/blobs)
                           for both commands, as for the web app.
  topic <verb>             The topic vocabulary, written through the catalog
                           with a --reason (content/topics.yaml is rewritten
                           from the rows only while a type is still on files):
                             add --slug S --title T --domain D [--summary X]
                               [--alias A]... [--relate kind:slug]...
                               [--dry-run]: --dry-run validates and lists
                               near matches (pg_trgm) without writing
                             edit <slug> [--title] [--summary] [--domain]
                               [--alias A]... [--add-alias A]...
                               [--drop-alias A]...
                             rename --from OLD --to NEW
                               [--restamp-diagrams-later]
                             relate <slug> <kind> <other> [--remove], kind
                               one of broader, related, precedes
                             map <slug> --manimkc PATH... [--remove]: the
                               manimkc topic folders (maps.manimkc) whose
                               videos file under the topic
                             archive <slug>, restore <slug>
                             ls [--domain D]
  tag <verb>               The cross-course themes, the same way:
                             add --id ID --label L --description D
                             edit <id> [--label] [--description]
  course import <file>     Write one course file into the database through the
                           write seam, one revision per entity it changes.
                           Needs --reason. Modules and items the file stops
                           listing are archived, never deleted, so learner
                           rows on them stay. While a type is still on
                           files, rewrites the course file (and topics.yaml
                           when a module's topic moved) in the tree courses
                           were imported from. --dry-run says
                           what would change and commits nothing. A file
                           course export stamped is refused once the course
                           has moved past its stamp, unless --force-base.
  course export <id>       One course as the database would export it: the
                           file to edit and import back. Prints it, or
                           writes it to --out FILE, with a first line naming
                           the revision it was read at (left off when --out
                           is the course's own file in the tree).
  item <verb> <id>         One curriculum item, with --reason: archive (off
                           the course path, learner rows kept), restore (back
                           on it, or back from a purge), purge (delete an
                           archived item; refused while progress or recap
                           rows name it, unless --with-learner-data, which
                           copies them into the revision first).
  renumber <list>          Spread a list's positions back out to 1000, 2000,
                           ... in its current order, one revision per row
                           moved. Needs --reason. Lists: topics, tags,
                           concepts --topic SLUG, modules --topic SLUG (the
                           topic's maps.courses), items --module ID. An
                           import asks for it when a list has no gap left.

Options:
  --json                   Machine-readable output. Supported by every command.
  --only a,b               import, index: run only these sources. Known
                           sources are topics, tags, courses, concepts,
                           manimkc, diagrams, sessions, mirrors; they always
                           run in dependency order, and selecting one selects
                           everything downstream of it and everything it
                           reads. export, parity: only these types, of
                           topics, tags, courses, concepts, sessions, diagrams.
  --out DIR                export: where to write. Created if missing.
                           course export: the file to write.
  --source NAME            asset upload: what to upload. Only manimkc.
  --dry-run                asset upload: hash and report, write nothing.
                           topic add: validate, place and list near
                           matches, write nothing. course import: plan the
                           write, commit nothing.
  --fix                    blob audit: act on what it finds (see above),
                           and only on a store whose .owner names this
                           database; the first --fix claims an unclaimed one.
  --strict                 flip: also arm the type's completeness rules.
  --waive RULE             flip: leave this rule disarmed. Repeatable, each
                           with its own --reason, in the same order.
  --reason TEXT            flip: why a --waive is acceptable. renumber: why
                           the list is being renumbered. asset upload: the
                           reason on each asset revision it writes. topic,
                           tag: the revision's reason, required on every write.
                           course import, item: why, kept on every revision.
  --author ID              topic, tag: who the revision names. Default:
                           the local learner.
  --force-base             course import: import a file whose base-revision
                           stamp the course has moved past, undoing the move.
  --with-learner-data      item purge: delete the item's progress and recap
                           rows too, after copying them into the revision.
  --topic SLUG             renumber concepts, modules: which topic's list.
  --module ID              renumber items: which module.
  --manimkc-root PATH      import, asset upload: the manimkc checkout to read,
                           for both the manimkc source and the mirror ledger
                           beside it. Relative to the working directory.
                           Default: $MANIMKC_ROOT, else <repo>/tools/manimkc.
  --from PATH              backfill: the directory holding events.jsonl,
                           model.json and reviews.json.
                           Default: <repo>/${DEFAULT_STATE_DIR}.
  --kind a,b               ls: count only these asset kinds. job ls/claim: the
                           job kind, e.g. diagram.
  --job ID                 job: which job.
  --path P                 Retired. job accept records what \`catalog diagram
                           put --job\` landed, and refuses --path.
  --brief FILE             job enqueue: the brief JSON. Needs "topic", "target"
                           and "idempotencyKey"; "brief" is the generator's own
                           and is stored as jsonb.
  --state S                job finish: the state to move to, one of
                           awaiting_review, failed, cancelled, interrupted.
                           job ls: filter by state.
  --phase P                job finish: the progress label to leave on the row.
  --candidate P            job finish: the candidate, jobs/<id>/candidate/<name> under STUDIO_HOME.
  --runner NAME            job claim: which runner is taking it.
  --session ID             job claim: the session it runs under.
  --exit-code N            job finish: the generator's exit code.
  --turns N                job finish: agent turns used.
  --cost N                 job finish: US dollars spent.
  --cost-source S          job finish: result | stream. Whether --cost is the
                           agent's own figure or the runner's estimate.
  --gate FILE              job finish: the gate's findings, as JSON.
  --error-kind K           job finish: a short machine-readable reason.
  --error M                job finish: the message a person reads.
  --limit N                job ls: rows to return. Default 20, max 100.
  --id ID                  session: which session.
  --title T                session start: what it is about.
  --goal G                 session start: what it set out to do.
  --agent-session UUID     session start: the headless session id, for Resume.
  -h, --help               Show this text.

Exit codes:
  0  The command worked.
  1  The command failed. A database that answered and refused (bad
     credentials, no such database, too many clients) is this code too,
     with a line on stderr naming the cause.
  2  The invocation was wrong.
  3  The database is unreachable: nothing is listening, or the host name
     does not resolve. stderr names which.
  4  The database is behind this code: import, index, export, parity,
     flip, ls, show, history, diff, renumber, asset upload and blob
     audit read tables or columns a migration it has not had adds. stderr
     says how many are outstanding and to run migrate.

Environment:
  DATABASE_URL   Defaults to postgres://localhost:5432/self_learn.
  MANIMKC_ROOT   The manimkc checkout. Defaults to <repo>/tools/manimkc.
                 Same variable and same meaning as manimkc's own CLI.
  TLDRAWKC_ROOT  The tldrawkc checkout, whose dist/ build reads the .tldr
                 files. Defaults to <repo>/tools/tldrawkc.
  LEARN_ROOT     The knowledge base's repo root, for tests. Defaults to
                 this repo.
  CATALOG_COPY_OK
                 1 lets this process write to a database marked copy. For
                 tests and scripts/e2e.mjs only; migrate sets it itself.

  All five are documented in services/catalog/.env.example, all five take a
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
  | "session"
  | "history"
  | "diff"
  | "doctor"
  | "import"
  | "export"
  | "parity"
  | "flip"
  | "renumber"
  | "asset"
  | "blob"
  | "topic"
  | "tag"
  | "course"
  | "item";

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
  "session",
  "history",
  "diff",
  "doctor",
  "import",
  "export",
  "parity",
  "flip",
  "renumber",
  "asset",
  "blob",
  "topic",
  "tag",
  "course",
  "item",
];

/**
 * For the commands that read tables or columns added after 0009
 * (`content_source`, `archived_at`, the revision table): `index`, `import`,
 * `export`, `parity`, `flip`, `ls`, `show`, `history`, `diff` and `renumber`. On a database behind the
 * journal they refuse by name, with exit 4, instead of failing on drizzle's
 * `Failed query: ...` for a relation the person never heard of. Each calls it
 * after checking its own arguments, so a wrong invocation is still exit 2
 * whatever state the database is in. `status`, `doctor` and `migrate` never
 * call it: saying what is outstanding is their job.
 */
async function schemaCurrent(): Promise<void> {
  await withDatabase(({ db }) => assertMigrated(db));
}

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && (COMMANDS as readonly string[]).includes(value);
}

/** A command that needs arguments and did not get them. Exit code 2, not 1. */
class Usage extends Error {}

/**
 * Exit codes: 0 ok, 1 the command failed, 2 the invocation was wrong, 3 the
 * database is unreachable, 4 migrations are outstanding.
 *
 * 3 exists for the studio, which has to tell "nothing there to talk to" (run
 * the job without the database, D16) from "a live database said no" (refuse
 * it). Both used to be 1 with the same `Failed query: ...` text, so the studio
 * could not tell them apart. The split is read from the driver's error codes in
 * `connection-failure.ts`, never from message text.
 */
export async function main(argv: string[]): Promise<number> {
  // Commands with flags of their own parse their own line.
  if (argv[0] === "diagram") return diagram(argv.slice(1));
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
        "cost-source": { type: "string" },
        gate: { type: "string" },
        "error-kind": { type: "string" },
        error: { type: "string" },
        limit: { type: "string" },
        id: { type: "string" },
        title: { type: "string" },
        goal: { type: "string" },
        "agent-session": { type: "string" },
        out: { type: "string" },
        strict: { type: "boolean", default: false },
        waive: { type: "string", multiple: true },
        reason: { type: "string", multiple: true },
        topic: { type: "string", multiple: true },
        module: { type: "string" },
        source: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        "blob-root": { type: "string" },
        fix: { type: "boolean", default: false },
        slug: { type: "string" },
        domain: { type: "string" },
        summary: { type: "string" },
        alias: { type: "string", multiple: true },
        "add-alias": { type: "string", multiple: true },
        "drop-alias": { type: "string", multiple: true },
        relate: { type: "string", multiple: true },
        to: { type: "string" },
        remove: { type: "boolean", default: false },
        manimkc: { type: "string", multiple: true },
        "restamp-diagrams-later": { type: "boolean", default: false },
        label: { type: "string" },
        description: { type: "string" },
        author: { type: "string" },
        "with-learner-data": { type: "boolean", default: false },
        "force-base": { type: "boolean", default: false },
        subset: { type: "boolean", default: false },
        course: { type: "string" },
        diagram: { type: "string" },
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
      case "index":
      case "import": {
        const dir = positionals[1];
        if (command === "index") {
          // The old name, from before phase 2's rename. stderr, once per run, so a --json
          // reader's stdout is the import's and nothing else.
          if (dir !== undefined) throw new Usage("index takes no directory: it is `import` of the repository. Use `import <dir>`.");
          process.stderr.write(INDEX_RENAMED);
        }
        const root = values["manimkc-root"];
        const only = values.only === undefined ? undefined : parseSources(values.only);
        await schemaCurrent();
        const result = await runImportCommand({
          dir: dir ?? REPO_ROOT,
          only,
          manimkcRoot: root === undefined ? undefined : path.resolve(root),
        });
        emit(result, formatIndex(result));
        break;
      }
      case "export": {
        if (values.out === undefined) throw new Usage("export needs --out <dir>");
        const only = exportTypes(values.only);
        const subset = exportSubset(values);
        if (subset !== undefined && only !== undefined) throw new Usage("export --subset writes every type; drop --only");
        await schemaCurrent();
        const result = await runExport({ out: values.out, only, subset });
        emit(result, formatExport(result));
        break;
      }
      case "parity": {
        const dir = positionals[1];
        if (dir === undefined) throw new Usage("parity needs a directory to compare against");
        const only = exportTypes(values.only);
        await schemaCurrent();
        const result = await runParity({ dir, only });
        emit(result, formatParity(result));
        if (!result.clean) return 1;
        break;
      }
      case "flip": {
        const type = positionals[1];
        if (type === undefined || !(CONTENT_TYPES as readonly string[]).includes(type)) {
          throw new Usage(`flip needs a content type: ${CONTENT_TYPES.join(", ")}`);
        }
        const waive = values.waive ?? [];
        const reasons = values.reason ?? [];
        if (waive.length !== reasons.length) {
          throw new Usage("flip: every --waive needs its own --reason, in the same order");
        }
        await schemaCurrent();
        const result = await runFlip({
          type: type as ContentType,
          strict: values.strict,
          waive: waive.map((rule, i) => ({ rule, reason: reasons[i] ?? "" })),
        });
        emit(result, formatFlip(result));
        break;
      }
      case "asset": {
        if (positionals[1] !== "upload") throw new Usage("asset takes one verb: upload");
        if (values["blob-root"] !== undefined) throw new Usage(BLOB_ROOT_GONE);
        const source = values.source;
        if (source === undefined || !(UPLOAD_SOURCES as readonly string[]).includes(source)) {
          throw new Usage(`asset upload needs --source: ${UPLOAD_SOURCES.join(", ")}`);
        }
        const reasons = values.reason ?? [];
        if (reasons.length > 1) throw new Usage("asset upload takes at most one --reason");
        const root = values["manimkc-root"];
        await schemaCurrent();
        const result = await runAssetUpload({
          source: source as UploadSource,
          dryRun: values["dry-run"],
          manimkcRoot: root === undefined ? undefined : path.resolve(root),
          reason: reasons[0],
        });
        emit(result, formatAssetUpload(result));
        if (result.refused > 0) return 1;
        break;
      }
      case "blob": {
        if (positionals[1] !== "audit") throw new Usage("blob takes one verb: audit");
        if (values["blob-root"] !== undefined) throw new Usage(BLOB_ROOT_GONE);
        await schemaCurrent();
        const result = await runBlobAudit({ fix: values.fix });
        emit(result, formatBlobAudit(result));
        if (result.outstanding > 0) return 1;
        break;
      }
      case "renumber": {
        const list = positionals[1];
        if (list === undefined || !(RENUMBER_LISTS as readonly string[]).includes(list)) {
          throw new Usage(`renumber needs a list: ${RENUMBER_LISTS.join(", ")}`);
        }
        const reasons = values.reason ?? [];
        if (reasons.length !== 1) throw new Usage("renumber takes exactly one --reason");
        if ((list === "concepts" || list === "modules") && values.topic?.length !== 1) {
          throw new Usage(`renumber ${list} needs one --topic <slug>`);
        }
        if (list === "items" && values.module === undefined) throw new Usage("renumber items needs --module <id>");
        await schemaCurrent();
        const result = await runRenumber({
          list: list as RenumberList,
          topic: values.topic?.[0],
          module: values.module,
          reason: reasons[0] as string,
        });
        emit(result, formatRenumber(result));
        break;
      }
      case "course": {
        const verb = positionals[1];
        const target = positionals[2];
        if (verb === "import") {
          if (target === undefined) throw new Usage("course import needs a course file");
          const reasons = values.reason ?? [];
          if (reasons.length !== 1) throw new Usage("course import takes exactly one --reason");
          await schemaCurrent();
          const result = await runCourseImport({
            file: target,
            reason: reasons[0] as string,
            dryRun: values["dry-run"],
            forceBase: values["force-base"],
          });
          emit(result, formatCourseImport(result));
        } else if (verb === "export") {
          if (target === undefined) throw new Usage("course export needs a course id");
          await schemaCurrent();
          const result = await runCourseExport({ id: target, out: values.out });
          emit(result, formatCourseExport(result));
        } else {
          throw new Usage("usage: course import <file> --reason <why> | course export <id> [--out FILE]");
        }
        break;
      }
      case "item": {
        const verb = positionals[1];
        const id = positionals[2];
        if (verb === undefined || !(ITEM_VERBS as readonly string[]).includes(verb) || id === undefined) {
          throw new Usage(`usage: item ${ITEM_VERBS.join("|")} <id> --reason <why>`);
        }
        const reasons = values.reason ?? [];
        if (reasons.length !== 1) throw new Usage(`item ${verb} takes exactly one --reason`);
        if (values["with-learner-data"] && verb !== "purge") {
          throw new Usage("--with-learner-data is for item purge only");
        }
        await schemaCurrent();
        const result = await runItem({
          verb: verb as ItemVerb,
          id,
          reason: reasons[0] as string,
          withLearnerData: values["with-learner-data"],
        });
        emit(result, formatItem(result));
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
        const kinds = values.kind === undefined ? undefined : parseKinds(values.kind);
        await schemaCurrent();
        const result = await runLs(positionals[1], { kinds });
        emit(result, formatLs(result));
        break;
      }
      case "show": {
        const target = positionals[1];
        if (target === undefined) throw new Usage("show needs a slug or an id");
        await schemaCurrent();
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
      case "session": {
        const result = await sessionCommand(positionals, values);
        emit(result, formatSession(result));
        break;
      }
      case "job": {
        const result = await job(positionals, values);
        emit(result, formatJob(result));
        break;
      }
      case "history": {
        const type = parseEntityType(positionals[1]);
        const id = positionals[2];
        if (id === undefined) throw new Usage(`history ${type} needs an id`);
        await schemaCurrent();
        const result = await runHistory(type, id);
        emit(result, formatHistory(result));
        break;
      }
      case "diff": {
        const first = parseRevisionId(positionals[1], "a first revision");
        const second =
          positionals[2] === undefined ? undefined : parseRevisionId(positionals[2], "the second revision");
        await schemaCurrent();
        const result = await runDiff(first, second);
        emit(result, formatDiff(result));
        break;
      }
      case "topic": {
        const result = await runTopic(positionals, values, schemaCurrent);
        emit(result, formatTopic(result));
        break;
      }
      case "tag": {
        const result = await runTag(positionals, values, schemaCurrent);
        emit(result, formatTag(result));
        break;
      }
      case "doctor": {
        const result = await runDoctor();
        emit(result, formatDoctor(result));
        // Exit 1 when the checks could not run (migrations outstanding) or the
        // database contradicts itself: an armed rule with a violator, or a
        // trigger the migration should have made. A disarmed rule with
        // violators is expected until its type flips, and exits 0.
        if (!result.ok) return 1;
        break;
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof Usage || error instanceof RevisionUsage || error instanceof TopicUsage) {
      process.stderr.write(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    return reportFailure(error, command, positionals[1], values.json);
  }
}

/** What `catalog index` says before it runs `catalog import` of the repository. */
const INDEX_RENAMED = "catalog index is now catalog import (with no directory, the repository). Running that.\n";

/**
 * `export --subset`: the named topics, one course, one session, one
 * diagram. Every flag is required, so a seed never comes out quietly
 * missing a type.
 */
function exportSubset(values: {
  subset: boolean;
  topic?: string[];
  course?: string;
  session?: string;
  diagram?: string;
}): ExportSubset | undefined {
  if (!values.subset) {
    const stray = (["course", "session", "diagram"] as const).filter((k) => values[k] !== undefined);
    if (stray.length > 0 || values.topic !== undefined) {
      throw new Usage(`export: --${[...(values.topic === undefined ? [] : ["topic"]), ...stray].join(", --")} only go with --subset`);
    }
    return undefined;
  }
  const topics = values.topic ?? [];
  if (topics.length === 0 || values.course === undefined || values.session === undefined || values.diagram === undefined) {
    throw new Usage("export --subset needs --topic SLUG (one or more), --course ID, --session ID and --diagram SLUG");
  }
  return { topics, course: values.course, session: values.session, diagram: values.diagram };
}

/** `--blob-root` was removed; the flag is still parsed so its use gets this sentence rather than "unknown option". */
const BLOB_ROOT_GONE =
  "--blob-root is gone: it wrote rows pointing at a store the web app never reads. Set SELF_LEARN_HOME=<dir> " +
  "for a scratch store instead; the catalog and the web app both read it, and blobs live under <dir>/blobs.";

/**
 * A command that failed, reported the one way every command reports it:
 * exit 4 for a database behind the journal, 3 for one that is not there, 1
 * for anything else, with the reason on stderr and, under `--json`, the
 * failure shape on stdout.
 */
function reportFailure(error: unknown, command: string, verb: string | undefined, json: boolean): number {
  const message = failureText(error);
  if (error instanceof MigrationsOutstanding) {
    if (json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, command, database: redactUrl(databaseUrl()), error: message, pending: error.pending }, null, 2)}\n`,
      );
    }
    process.stderr.write(`catalog ${command}: ${redactUrl(databaseUrl())} is behind this code. ${message}\n`);
    return EXIT_MIGRATIONS_OUTSTANDING;
  }
  const failure = classifyConnectionFailure(error);
  const reason = failure === null ? null : describeConnectionFailure(failure);
  if (json) {
    // The shape on stdout is unchanged: it is somebody's `--json`. The reason
    // goes to stderr, one line, where a person and the studio both read it.
    process.stdout.write(
      `${JSON.stringify({ ok: false, command, database: redactUrl(databaseUrl()), error: message }, null, 2)}\n`,
    );
    if (reason !== null) {
      const named = command === "job" || command === "session" || command === "diagram" ? verb : undefined;
      process.stderr.write(`catalog ${named === undefined ? command : `${command} ${named}`} failed: ${reason}\n`);
    }
  } else {
    process.stderr.write(
      `catalog ${command} failed against ${redactUrl(databaseUrl())}\n` +
        (reason === null ? "" : `  ${reason}\n`) +
        `  ${message}\n`,
    );
  }
  return failure?.unreachable === true ? EXIT_UNREACHABLE : 1;
}


/** `--only` for export and parity: content types with an export format. */
function exportTypes(raw: string | undefined): ExportType[] | undefined {
  if (raw === undefined) return undefined;
  const names = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const unknown = names.filter((n) => !(EXPORT_TYPES as readonly string[]).includes(n));
  if (unknown.length > 0) {
    throw new Usage(
      `unknown type(s): ${unknown.join(", ")}. Known: ${EXPORT_TYPES.join(", ")}` +
        (unknown.includes("manimkc") ? ". manimkc's videos never enter the export (D7)." : ""),
    );
  }
  return names as ExportType[];
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
  "cost-source"?: string;
  gate?: string;
  "error-kind"?: string;
  error?: string;
  id?: string;
  title?: string;
  goal?: string;
  "agent-session"?: string;
};

/**
 * `catalog session <verb>`. Two verbs: the row a job hangs off, and its end.
 *
 * `--id` rather than a positional, so a runner assembling an argv never has to
 * think about ordering, and the same flag means the same thing here as in
 * `learn session`.
 */
async function sessionCommand(
  positionals: string[],
  values: Values,
): Promise<SessionStartResult | SessionEndResult> {
  const verb = positionals[1];
  const id = values.id ?? positionals[2];
  if (id === undefined) throw new Usage(`session ${verb ?? "<verb>"} needs --id <id>`);

  switch (verb) {
    case "start":
      return runSessionStart({
        id,
        kind: values.kind,
        title: values.title,
        goal: values.goal,
        agentSessionId: values["agent-session"],
      });
    case "end": {
      if (values.state === undefined) throw new Usage("session end needs --state <state>");
      return runSessionEnd({
        id,
        state: values.state,
        errorKind: values["error-kind"],
        error: values.error,
      });
    }
    default:
      throw new Usage("usage: session start|end --id <id>");
  }
}

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
        costSource: values["cost-source"],
        gate: await jsonFile(values.gate, "--gate"),
        errorKind: values["error-kind"],
        error: values.error,
      });
    }
    case "accept":
      if (values.path !== undefined) {
        throw new Usage(
          "job accept no longer takes --path: a diagram lands through `catalog diagram put --job <id>`, " +
            "and accept records what that wrote",
        );
      }
      return runAccept({ jobId: needsJob() });
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

/** `catalog diagram <verb>`, whose flags are its own (`commands/diagram.ts`). */
async function diagram(argv: string[]): Promise<number> {
  const outcome = await runDiagramCommand(argv, {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
  if ("code" in outcome) return outcome.code;
  return reportFailure(outcome.error, "diagram", argv[0], outcome.json);
}

process.exitCode = await main(process.argv.slice(2));
