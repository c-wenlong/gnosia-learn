import { LOCAL_LEARNER_ID } from "@self-learn/schema";

import { addTag, checkTagInput, editTag, TagError, type TagWriteResult } from "../content/tags";
import {
  addTopic,
  type AddTopicResult,
  archiveTopic,
  type By,
  checkAddInput,
  checkEditInput,
  checkSlugs,
  editTopic,
  listTopics,
  type NearMatch,
  parseRelate,
  relateTopic,
  relationKind,
  type RelateResult,
  renameTopic,
  type RenameResult,
  restoreTopic,
  TopicError,
  type TopicList,
  type TopicWriteResult,
} from "../content/topics";
import type { ExportedType } from "../content/write-through";
import { withDatabase as connected } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog topic <verb>` and `catalog tag <verb>`: parsing the flags, the
 * connection, and the printing. What each verb does, and what it refuses, is
 * in `../content/topics.ts` and `../content/tags.ts`.
 *
 * Every write is authored by the local learner as a person unless `--author`
 * says otherwise: a person ran the command, or pressed the studio button that
 * ran it (D16).
 */

/** A verb that was called wrong. The CLI turns it into exit code 2. */
export class TopicUsage extends Error {}

export interface TopicFlags {
  slug?: string;
  title?: string;
  domain?: string;
  summary?: string;
  alias?: string[];
  "add-alias"?: string[];
  "drop-alias"?: string[];
  relate?: string[];
  reason?: string[];
  "dry-run"?: boolean;
  from?: string;
  to?: string;
  remove?: boolean;
  "restamp-diagrams-later"?: boolean;
  id?: string;
  label?: string;
  description?: string;
  author?: string;
}

export type TopicCommandResult =
  | ({ database: string; verb: "add" } & AddTopicResult)
  | ({ database: string; verb: "edit" | "archive" | "restore" } & TopicWriteResult)
  | ({ database: string; verb: "relate" } & RelateResult)
  | ({ database: string; verb: "rename" } & RenameResult)
  | ({ database: string; verb: "ls" } & TopicList);

export type TagCommandResult = { database: string; verb: "add" | "edit" } & TagWriteResult;

function by(flags: TopicFlags, dryRun = false): By {
  const reasons = flags.reason ?? [];
  if (reasons.length > 1) throw new TopicUsage("give one --reason");
  const reason = reasons[0]?.trim() ?? "";
  if (reason === "" && !dryRun) {
    throw new TopicUsage("every topic and tag write needs --reason: it is what catalog history shows beside the revision");
  }
  return { author: flags.author?.trim() || LOCAL_LEARNER_ID, authorKind: "person", reason };
}

/**
 * Run a check that needs no database, and turn a malformed value into a usage
 * error: exit 2, before the connection, so an unreachable database cannot hide
 * a bad invocation behind exit 3.
 */
function shape<T>(check: () => T): T {
  try {
    return check();
  } catch (error) {
    if ((error instanceof TopicError || error instanceof TagError) && error.code === "invalid") {
      throw new TopicUsage(error.message);
    }
    throw error;
  }
}

function positional(positionals: string[], at: number, what: string): string {
  const value = positionals[at];
  if (value === undefined) throw new TopicUsage(what);
  return value;
}

/**
 * `ready` runs once the arguments are known good and before the first query:
 * the CLI passes its check that the database is not behind the journal, so a
 * wrong invocation is exit 2 whatever state the database is in.
 */
export async function runTopic(
  positionals: string[],
  flags: TopicFlags,
  ready: () => Promise<void> = async () => {},
): Promise<TopicCommandResult> {
  const verb = positionals[1];
  const database = redactUrl(databaseUrl());
  const withDatabase = async <T>(fn: Parameters<typeof connected<T>>[0]) => {
    await ready();
    return connected(fn);
  };
  switch (verb) {
    case "add": {
      if (flags.slug === undefined || flags.title === undefined || flags.domain === undefined) {
        throw new TopicUsage("topic add needs --slug, --title and --domain");
      }
      const dryRun = flags["dry-run"] === true;
      const author = by(flags, dryRun);
      const input = shape(() => {
        const raw = {
          slug: flags.slug as string,
          title: flags.title as string,
          domain: flags.domain as string,
          summary: flags.summary,
          aliases: flags.alias ?? [],
          relations: (flags.relate ?? []).map(parseRelate),
        };
        checkAddInput(raw);
        return raw;
      });
      return withDatabase(async ({ db }) => ({
        database,
        verb: "add" as const,
        ...(await addTopic(db, input, author, { dryRun })),
      }));
    }
    case "edit": {
      const slug = positional(positionals, 2, "topic edit needs the topic's slug");
      const author = by(flags);
      const input = {
        slug,
        title: flags.title,
        summary: flags.summary,
        domain: flags.domain,
        aliases: flags.alias,
        addAliases: flags["add-alias"],
        dropAliases: flags["drop-alias"],
      };
      shape(() => checkEditInput(input));
      return withDatabase(async ({ db }) => ({ database, verb: "edit" as const, ...(await editTopic(db, input, author)) }));
    }
    case "rename": {
      if (flags.from === undefined || flags.to === undefined) throw new TopicUsage("topic rename needs --from and --to");
      shape(() => checkSlugs([flags.from, "--from"], [flags.to, "--to"]));
      if (flags.from.trim() === flags.to.trim()) throw new TopicUsage("--from and --to are the same slug");
      const author = by(flags);
      const input = { from: flags.from, to: flags.to, restampDiagramsLater: flags["restamp-diagrams-later"] === true };
      return withDatabase(async ({ db }) => ({ database, verb: "rename" as const, ...(await renameTopic(db, input, author)) }));
    }
    case "relate": {
      const from = positional(positionals, 2, "topic relate needs <slug> <kind> <other-slug>");
      const kind = shape(() => relationKind(positional(positionals, 3, "topic relate needs <slug> <kind> <other-slug>")));
      const to = positional(positionals, 4, "topic relate needs <slug> <kind> <other-slug>");
      shape(() => checkSlugs([from, "the topic"], [to, "the other topic"]));
      if (from === to) throw new TopicUsage(`"${from}" cannot relate to itself`);
      const author = by(flags);
      return withDatabase(async ({ db }) => ({
        database,
        verb: "relate" as const,
        ...(await relateTopic(db, { from, kind, to, remove: flags.remove === true }, author)),
      }));
    }
    case "archive":
    case "restore": {
      const slug = positional(positionals, 2, `topic ${verb} needs the topic's slug`);
      shape(() => checkSlugs([slug, "the topic"]));
      const author = by(flags);
      const run = verb === "archive" ? archiveTopic : restoreTopic;
      return withDatabase(async ({ db }) => ({ database, verb, ...(await run(db, slug, author)) }));
    }
    case "ls":
      return withDatabase(async ({ db }) => ({
        database,
        verb: "ls" as const,
        ...(await listTopics(db, { domain: flags.domain })),
      }));
    default:
      throw new TopicUsage("usage: topic add|edit|rename|relate|archive|restore|ls");
  }
}

export async function runTag(
  positionals: string[],
  flags: TopicFlags,
  ready: () => Promise<void> = async () => {},
): Promise<TagCommandResult> {
  const verb = positionals[1];
  const database = redactUrl(databaseUrl());
  const withDatabase = async <T>(fn: Parameters<typeof connected<T>>[0]) => {
    await ready();
    return connected(fn);
  };
  switch (verb) {
    case "add": {
      if (flags.id === undefined || flags.label === undefined || flags.description === undefined) {
        throw new TopicUsage("tag add needs --id, --label and --description");
      }
      const author = by(flags);
      const input = { id: flags.id, label: flags.label, description: flags.description };
      shape(() => checkTagInput(input));
      return withDatabase(async ({ db }) => ({ database, verb: "add" as const, ...(await addTag(db, input, author)) }));
    }
    case "edit": {
      const id = positional(positionals, 2, "tag edit needs the tag's id");
      for (const [value, flag] of [[flags.label, "--label"], [flags.description, "--description"]] as const) {
        if (value !== undefined && value.trim() === "") throw new TopicUsage(`${flag} cannot be empty`);
      }
      const author = by(flags);
      const input = { id, label: flags.label, description: flags.description };
      return withDatabase(async ({ db }) => ({ database, verb: "edit" as const, ...(await editTag(db, input, author)) }));
    }
    default:
      throw new TopicUsage("usage: tag add|edit");
  }
}

function exportedLines(exported: readonly ExportedType[]): string[] {
  return exported.map((e) => {
    const files = [...e.written, ...e.removed.map((p) => `${p} (removed)`)];
    return `files     ${files.length === 0 ? `${e.type}: unchanged` : files.join(", ")} under ${e.root}` +
      (e.recorded ? "" : " (a copy: export hash not recorded)");
  });
}

function nearLines(near: readonly NearMatch[], threshold?: number): string[] {
  if (near.length === 0) return [];
  return [
    `similar   ${near.length} existing topic(s) look like this one${threshold === undefined ? "" : ` (similarity >= ${threshold})`}:`,
    ...near.map((m) => `          ${m.slug}  "${m.title}"  ${m.score} on ${m.field} "${m.value}" vs "${m.against}"`),
  ];
}

export function formatTopic(result: TopicCommandResult): string {
  const lines = [`database  ${result.database}`];
  switch (result.verb) {
    case "add":
      lines.push(
        `${result.dryRun ? "would add" : "added"}  ${result.entry.slug}  "${result.entry.title}"  in ${result.entry.domain}` +
          `${result.newDomain ? " (a new domain)" : ""} at position ${result.position}`,
      );
      for (const r of result.entry.relations) lines.push(`relation  ${result.entry.slug} ${r.kind} ${r.to}`);
      lines.push(...nearLines(result.nearMatches, result.threshold));
      break;
    case "ls":
      lines.push(`${result.counts.topics} topics in ${result.counts.domains} domains, ${result.counts.aliases} aliases, ${result.counts.relations} relations`);
      for (const t of result.topics) {
        lines.push(`  ${t.domain.padEnd(24)} ${t.slug}  "${t.title}"`);
        for (const r of t.relations) lines.push(`  ${"".padEnd(24)}   ${r.kind} ${r.to}`);
      }
      return lines.join("\n");
    case "rename":
      lines.push(`renamed   ${result.from} -> ${result.to}; "${result.from}" is now an alias`);
      if (result.jobs.length > 0) lines.push(`jobs      briefs rewritten: ${result.jobs.join(", ")}`);
      for (const file of result.restamp) lines.push(`restamp   ${file}: still stamps "${result.from}"`);
      for (const file of result.staleSvgs) {
        lines.push(`stale svg ${file}: still says "${result.from}"; export it again from its .tldr and put it`);
      }
      break;
    case "relate":
      lines.push(`${result.changed ? "recorded" : "unchanged"}  ${result.stored.from} ${result.stored.kind} ${result.stored.to} (stored under ${result.slug})`);
      break;
    default:
      lines.push(`${result.changed ? `${result.verb === "edit" ? "edited" : `${result.verb}d`}` : "unchanged"}  ${result.slug}`);
      lines.push(...nearLines(result.nearMatches));
  }
  for (const r of result.revisions) lines.push(`revision  ${r.revisionId}  ${r.type} ${r.id}  ${r.op ?? ""}`);
  lines.push(...exportedLines(result.exported));
  return lines.join("\n");
}

export function formatTag(result: TagCommandResult): string {
  const lines = [
    `database  ${result.database}`,
    `${result.changed ? (result.verb === "add" ? "added" : "edited") : "unchanged"}  ${result.tag.id}  "${result.tag.label}"`,
  ];
  for (const r of result.revisions) lines.push(`revision  ${r.revisionId}  ${r.type} ${r.id}  ${r.op ?? ""}`);
  lines.push(...exportedLines(result.exported));
  return lines.join("\n");
}
