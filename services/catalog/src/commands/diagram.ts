import path from "node:path";
import { parseArgs } from "node:util";

import { AUTHOR_KINDS, type AuthorKind, LOCAL_LEARNER_ID } from "@self-learn/schema";

import { openBlobStore } from "../content/blob";
import {
  checkoutDiagram,
  checkoutState,
  commitDiagram,
  defaultWorkDir,
  DiagramError,
  listDiagrams,
  putDiagram,
  type CheckoutResult,
  type CommitResult,
  type DiagramSummary,
  type PutResult,
} from "../content/diagrams";
import { withDatabase } from "../db";
import { assertMigrated } from "../migrations";

/**
 * `catalog diagram <verb>`: diagrams in the database (Track D of
 * docs/CONTENT-MIGRATION.md).
 *
 * Its own argument parser, because its flags (`--tldr`, `--svg`, `--base`)
 * mean nothing to any other command, and `cli.ts` hands it the rest of the
 * line in one registration line.
 */

export const DIAGRAM_USAGE = `catalog diagram — diagrams in the database

Usage: npm run --silent catalog -- diagram <verb> [options] [--json]

Verbs:
  put --slug S --tldr FILE [--svg FILE] --reason TEXT [--job ID] [--base N|none]
      Store one diagram: the document as the diagram row, the SVG in the blob
      store, and the two asset rows, in one transaction after the SVG upload
      is confirmed. Without --svg the stored SVG is kept (and is stale once
      the document changed). Without --base the write goes on top of whatever
      is latest; the studio and commit always pass the revision they started
      from, and a write whose base moved is refused.
  checkout SLUG [--dir DIR] [--force]
      Write the document to DIR/SLUG.tldr (and its SVG beside it), recording
      the revision it came from. DIR defaults to $STUDIO_HOME/work. A checkout
      with uncommitted edits is never overwritten without --force. A slug with
      no diagram yet gets a record and no file: draw it there, then commit.
  commit SLUG --reason TEXT [--dir DIR] [--svg FILE | --keep-svg] [--job ID]
      Store the checkout, refused when the diagram moved past the revision it
      was checked out at; the file is kept either way. The checkout's own SVG
      is stored when it was exported after the document's last save.
  list    Every live diagram: slug, title, topic, concepts, shape count and
          whether its SVG is current, stale or missing.
  show SLUG [--dir DIR]
          One diagram, with where its checkout stands.

Options:
  --author NAME          Who is writing. Default: ${LOCAL_LEARNER_ID}.
  --author-kind KIND     ${AUTHOR_KINDS.join(" | ")}. Default: person.

Exit codes: 0 ok, 1 refused or failed, 2 wrong invocation, 3 database
unreachable, 4 migrations outstanding (the same as every catalog command).`;

export class DiagramUsage extends Error {}

export type DiagramCommandResult =
  | PutResult
  | CommitResult
  | CheckoutResult
  | { ok: true; diagrams: DiagramSummary[] }
  | { ok: true; diagram: DiagramSummary | null; checkout: Awaited<ReturnType<typeof checkoutState>> | null };

export interface ParsedDiagram {
  verb: "put" | "checkout" | "commit" | "list" | "show";
  json: boolean;
  run: () => Promise<DiagramCommandResult>;
}

function authorKind(value: string | undefined): AuthorKind {
  const kind = value ?? "person";
  if (!(AUTHOR_KINDS as readonly string[]).includes(kind)) {
    throw new DiagramUsage(`--author-kind must be one of ${AUTHOR_KINDS.join(", ")}, not "${kind}"`);
  }
  return kind as AuthorKind;
}

function one(values: string[] | undefined, flag: string, required: boolean): string | undefined {
  if (values === undefined || values.length === 0) {
    if (required) throw new DiagramUsage(`${flag} is required`);
    return undefined;
  }
  if (values.length > 1) throw new DiagramUsage(`${flag} takes one value`);
  const value = values[0] as string;
  if (value.trim() === "") throw new DiagramUsage(`${flag} cannot be empty`);
  return value;
}

/** Parse `diagram ...` into a runnable command. Throws `DiagramUsage` on a wrong invocation. */
export function parseDiagram(argv: string[]): ParsedDiagram {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      slug: { type: "string", multiple: true },
      tldr: { type: "string", multiple: true },
      svg: { type: "string", multiple: true },
      "keep-svg": { type: "boolean", default: false },
      reason: { type: "string", multiple: true },
      job: { type: "string", multiple: true },
      base: { type: "string", multiple: true },
      dir: { type: "string", multiple: true },
      force: { type: "boolean", default: false },
      author: { type: "string", multiple: true },
      "author-kind": { type: "string", multiple: true },
    },
  });
  const verb = positionals[0];
  const author = one(values.author, "--author", false) ?? LOCAL_LEARNER_ID;
  const kind = authorKind(one(values["author-kind"], "--author-kind", false));
  const dir = path.resolve(one(values.dir, "--dir", false) ?? defaultWorkDir());
  const slugArg = (): string => {
    const slug = positionals[1];
    if (slug === undefined || slug.trim() === "") throw new DiagramUsage(`diagram ${verb} needs a slug`);
    if (positionals.length > 2) throw new DiagramUsage(`diagram ${verb} takes one slug`);
    return slug.trim();
  };
  const json = values.json;

  switch (verb) {
    case "put": {
      const slug = one(values.slug, "--slug", true) as string;
      const tldr = path.resolve(one(values.tldr, "--tldr", true) as string);
      const svgGiven = one(values.svg, "--svg", false);
      const reason = one(values.reason, "--reason", true) as string;
      const jobId = one(values.job, "--job", false);
      const rawBase = one(values.base, "--base", false);
      let base: number | null | undefined;
      if (rawBase === undefined) base = undefined;
      else if (rawBase === "none") base = null;
      else if (/^[1-9]\d*$/.test(rawBase)) base = Number(rawBase);
      else throw new DiagramUsage(`--base is a revision id or "none", not "${rawBase}"`);
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            return putDiagram(db, openBlobStore(), {
              slug,
              tldr,
              svg: svgGiven === undefined ? null : path.resolve(svgGiven),
              reason,
              author,
              authorKind: kind,
              ...(base === undefined ? {} : { base }),
              ...(jobId === undefined ? {} : { jobId }),
            });
          }),
      };
    }
    case "checkout": {
      const slug = slugArg();
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            return checkoutDiagram(db, openBlobStore(), slug, dir, { force: values.force });
          }),
      };
    }
    case "commit": {
      const slug = slugArg();
      const reason = one(values.reason, "--reason", true) as string;
      const svgGiven = one(values.svg, "--svg", false);
      if (svgGiven !== undefined && values["keep-svg"]) throw new DiagramUsage("--svg and --keep-svg contradict each other");
      const jobId = one(values.job, "--job", false);
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            return commitDiagram(db, openBlobStore(), {
              slug,
              dir,
              reason,
              author,
              authorKind: kind,
              ...(svgGiven !== undefined ? { svg: path.resolve(svgGiven) } : values["keep-svg"] ? { svg: null } : {}),
              ...(jobId === undefined ? {} : { jobId }),
            });
          }),
      };
    }
    case "list":
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            return { ok: true as const, diagrams: await listDiagrams(db) };
          }),
      };
    case "show": {
      const slug = slugArg();
      return {
        verb,
        json,
        run: () =>
          withDatabase(async ({ db }) => {
            await assertMigrated(db);
            const [found] = await listDiagrams(db, slug);
            return {
              ok: true as const,
              diagram: found ?? null,
              checkout: await checkoutState(db, slug, dir),
            };
          }),
      };
    }
    default:
      throw new DiagramUsage(`usage: diagram put|checkout|commit|list|show (got ${verb === undefined ? "nothing" : `"${verb}"`})`);
  }
}

export function formatDiagram(verb: ParsedDiagram["verb"], result: DiagramCommandResult): string {
  if ("diagrams" in result) {
    if (result.diagrams.length === 0) return "no diagrams in the database";
    return result.diagrams
      .map((d) => `${d.slug}  ${d.topic}  ${d.shapes} shapes  svg ${d.svgState}  r${d.revision ?? "-"}  ${d.title ?? ""}`)
      .join("\n");
  }
  if ("diagram" in result) {
    const d = result.diagram;
    const lines =
      d === null
        ? [`no diagram ${result.checkout?.slug ?? ""}`]
        : [
            `${d.slug}  ${d.title ?? "(untitled)"}`,
            `  topic     ${d.topic}`,
            `  concepts  ${d.concepts.join(", ") || "(none)"}`,
            `  shapes    ${d.shapes}`,
            `  svg       ${d.svgState}${d.svg === null ? "" : ` (${d.svg.bytes} bytes, ${d.svg.key})`}`,
            `  revision  ${d.revision ?? "none"}${d.revisionJob === null ? "" : ` by job ${d.revisionJob}`}`,
          ];
    const c = result.checkout;
    if (c !== null && c.record !== null) {
      lines.push(
        `  checkout  ${c.paths.tldr} at ${c.record.revision ?? "no revision"}` +
          `${c.dirty ? ", edited" : ""}${c.behind ? `, behind (latest ${c.latest ?? "none"})` : ""}`,
      );
    }
    return lines.join("\n");
  }
  if ("written" in result && "exists" in result) return result.note;
  const put = result as PutResult | CommitResult;
  const lines = [
    `${put.changed ? (verb === "commit" ? "committed" : "stored") : "unchanged"} ${put.slug} at revision ${put.revision}`,
    `  topic     ${put.topic}`,
    `  concepts  ${put.concepts.join(", ") || "(none)"}`,
    `  svg       ${put.svg === null ? "none" : `${put.svg.key}${put.svg.current ? "" : " (stale: exported from an earlier document)"}`}`,
  ];
  if (put.job !== null) lines.push(`  job       ${put.job}`);
  if (put.files.length > 0) lines.push(`  files     ${put.files.join(", ")}`);
  for (const note of put.notes) lines.push(`  note      ${note}`);
  return lines.join("\n");
}

/** The whole command, for `cli.ts`: parse, run, print. Returns the exit code. */
export async function runDiagramCommand(
  argv: string[],
  io: { stdout: (s: string) => void; stderr: (s: string) => void },
): Promise<{ code: number } | { error: unknown; json: boolean }> {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    (argv.length === 0 ? io.stderr : io.stdout)(`${DIAGRAM_USAGE}\n`);
    return { code: argv.length === 0 ? 2 : 0 };
  }
  let parsed: ParsedDiagram;
  try {
    parsed = parseDiagram(argv);
  } catch (error) {
    if (error instanceof DiagramUsage || (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      io.stderr(`${(error as Error).message}\n\n${DIAGRAM_USAGE}\n`);
      return { code: 2 };
    }
    throw error;
  }
  try {
    const result = await parsed.run();
    io.stdout(parsed.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatDiagram(parsed.verb, result)}\n`);
    return { code: 0 };
  } catch (error) {
    if (error instanceof DiagramError) {
      if (parsed.json) io.stdout(`${JSON.stringify({ ok: false, code: error.code, error: error.message }, null, 2)}\n`);
      io.stderr(`catalog diagram ${parsed.verb}: ${error.message}\n`);
      return { code: 1 };
    }
    return { error, json: parsed.json };
  }
}
