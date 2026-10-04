import { contentSource, type ContentType, type RevisionEntityType } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { renderType } from "./export";
import { databaseIdentity, recordedRoot } from "./import-root";
import { exportHash, isExportType, readTypeFiles, type ExportType } from "./layout";
import { mayRecord, type ParityRecord, recordExport } from "./ownership";
import { parity } from "./parity";
import { lockTypes } from "./revisions";
import { COMPLETENESS_RULES, setTriggers, WRITE_GUARDS, writeGuardName } from "./rules";
import { readyTypes } from "./source";

/**
 * `catalog flip <type>`: the moment the database starts owning a type
 * (docs/CONTENT-MIGRATION.md, phase 1 and D18, D21).
 *
 * In one transaction it writes the type's `content_source` row as `db`, arms
 * the write guard on each of the type's tables (D4: from then on a write that
 * did not come through the seam is refused), and with `--strict` arms the
 * type's completeness rules. The refusals come first, each naming what to do
 * instead:
 *
 * - the type's database reader is not built yet (`DB_READERS`): readers
 *   follow the row, and every one of them would fail;
 * - parity is not clean between the database and the files the type was last
 *   imported from, checked here and now rather than taken from a report, so
 *   an edit made to those files since the import, or a report taken against
 *   some other directory, cannot slip through. The type's revision locks are
 *   held first, so no import or seam write moves the rows under the check;
 * - with `--strict`, any violator of a rule the flip would arm, the same rows
 *   `catalog doctor` lists. The triggers are armed before that count, inside
 *   the transaction: arming takes each table's lock, so no writer can add a
 *   violator between the count and the commit;
 * - a `--waive` naming a rule that is not the type's, or with no reason.
 *
 * Once it flips it also records the tree's export hash on the row, the hash
 * the next import checks the files against (edge case 12): they just passed
 * parity, so they are the database's export, and without it every import of
 * the type is refused until someone exports into the tree. The root parity
 * runs against must be one this database recorded itself, not one a
 * `createdb -T` copy inherited (`import-root.ts`).
 *
 * A waived rule is recorded on the row, reported by `catalog doctor`, not
 * counted by `--strict`, and disarmed, including when an earlier strict flip
 * had armed it: the phase 3 escape hatch, with its reason on file.
 */

/**
 * The types whose database reader works, from each reader's own `ready` flag
 * (`readers/<type>.ts`). A track that fills in its reader flips the flag in
 * its own file, and this follows.
 */
export const DB_READERS: ReadonlySet<ContentType> = readyTypes();

export class FlipRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlipRefused";
  }
}

export interface Waiver {
  rule: string;
  reason: string;
}

export interface FlipOptions {
  type: ContentType;
  strict?: boolean;
  waive?: readonly Waiver[];
  /**
   * The types whose database reader works. Defaults to `DB_READERS`; the
   * tests pass their own, to flip types on a scratch database before any
   * track has built a reader.
   */
  readers?: ReadonlySet<ContentType>;
  /**
   * For a type the database already owns: arm its guards and, with
   * `strict`, its rules, without reading the tree it was last imported from.
   * That tree is a past copy once the database owns the type, so parity
   * against it means nothing, and a rule added by a later migration could
   * otherwise only be armed by importing stale files over the database's own
   * edits. Refused for a type still on files.
   */
  rearm?: boolean;
}

export interface FlipResult {
  type: ContentType;
  source: "db";
  /** It was already `db`; the guards and rules were (re)armed and nothing else changed. */
  already: boolean;
  /** `--rearm`: armed without reading a tree, so `parity` is null and no export hash was recorded. */
  rearmed: boolean;
  flippedAt: string;
  parity: ParityRecord | null;
  guardsArmed: string[];
  rulesArmed: string[];
  waivers: (Waiver & { at: string })[];
  /**
   * The tree's export hash, recorded on the row so the next import skips the
   * files (false on a copy), and the files a fresh export would write in
   * other bytes: the same content, since parity was clean.
   */
  export: { hash: string; recorded: boolean; rewrites: string[] };
}

const SHOWN = 20;

/** The revision types a content type's rows are, whose locks an import of it takes. */
const LOCKS: Readonly<Record<ExportType, readonly RevisionEntityType[]>> = {
  topics: ["topic"],
  tags: ["tag"],
  courses: ["collection", "curriculum_item", "asset"],
  concepts: ["concept", "asset"],
  sessions: ["asset"],
  diagrams: ["diagram", "asset"],
};

export async function flip(db: CatalogDatabase, options: FlipOptions): Promise<FlipResult> {
  const { type } = options;
  if (!isExportType(type)) {
    throw new FlipRefused(
      `${type} has no export format and so no parity to check, until Track E defines what a ` +
        `video's parity is. It cannot be flipped yet.`,
    );
  }
  if (!(options.readers ?? DB_READERS).has(type)) {
    throw new FlipRefused(
      `${type} has no database reader yet: its track fills in readers/${type}.ts and sets ready, and until then ` +
        `every reader that follows the content_source row would fail. Flip it in that track's PR.`,
    );
  }
  const rules = COMPLETENESS_RULES.filter((rule) => rule.type === type);
  const waive = options.waive ?? [];
  for (const waiver of waive) {
    const rule = COMPLETENESS_RULES.find((r) => r.name === waiver.rule);
    if (rule === undefined) {
      throw new FlipRefused(
        `--waive ${waiver.rule}: no such rule. Rules: ${COMPLETENESS_RULES.map((r) => r.name).join(", ")}.`,
      );
    }
    if (rule.type !== type) {
      throw new FlipRefused(`--waive ${waiver.rule}: that rule is armed by ${rule.type}, not ${type}.`);
    }
    if (waiver.reason.trim() === "") {
      throw new FlipRefused(`--waive ${waiver.rule} needs a --reason: a waiver is a decision someone has to be able to read.`);
    }
  }

  return db.transaction(async (tx) => {
    await lockTypes(tx, LOCKS[type]);
    const [row] = await tx.select().from(contentSource).where(eq(contentSource.type, type)).for("update");
    if (options.rearm === true) {
      if (row?.source !== "db") {
        throw new FlipRefused(
          `--rearm is for a type the database already owns, and ${type} is not owned yet: flip it without --rearm, ` +
            `which checks parity against the files it was imported from first.`,
        );
      }
      return arm(tx, { type, strict: options.strict === true, waive, rules, row, rearmed: true, parity: null });
    }
    const recorded = await recordedRoot(tx, type);
    if (recorded === null) {
      throw new FlipRefused(
        `${type} has not been imported since 0.5, so nothing records which files it came from. ` +
          `Run \`catalog import [<dir>]\`, then flip.`,
      );
    }
    // A root another database recorded is a tree this one never read: a
    // `createdb -T` copy inherits its template's (content/import-root.ts).
    const here = await databaseIdentity(tx);
    if (recorded.database !== here) {
      throw new FlipRefused(
        `${type} was last imported from ${recorded.root} by ` +
          (recorded.database === null ? "an import that did not record its database" : `another database (${recorded.database})`) +
          `, not by this one (${here}), so parity against it would check a tree this database never read. ` +
          `Run \`catalog import [<dir>]\` against this database, then flip.`,
      );
    }
    const root = recorded.root;
    // Read once: parity compares these bytes and the hash recorded below is
    // of these bytes, so a save landing after the read cannot be recorded as
    // an export that passed.
    const disk = await readTypeFiles(root, type);
    const checked = await parity(tx, root, [type], { [type]: disk });
    const result = checked.types[0];
    const mismatches = checked.mismatches;
    const report: ParityRecord = {
      at: new Date().toISOString(),
      dir: checked.dir,
      clean: checked.clean,
      expected: result?.expected ?? 0,
      actual: result?.actual ?? 0,
      mismatches,
    };
    if (!checked.clean) {
      const lines = [
        ...(result?.error === null || result?.error === undefined ? [] : [result.error]),
        ...(result?.mismatches ?? []).map((m) => `${m.kind} ${m.id}: ${m.detail}`),
      ];
      throw new FlipRefused(
        `${type} is not the same in the database as in ${checked.dir}, the files it was last ` +
          `imported from (${mismatches} mismatch(es)). Import them, or put them back, then flip:\n  - ` +
          lines.slice(0, SHOWN).join("\n  - "),
      );
    }

    return arm(tx, { type, strict: options.strict === true, waive, rules, row, rearmed: false, parity: report, disk });
  });
}

interface ArmInput {
  type: ExportType;
  strict: boolean;
  waive: readonly Waiver[];
  rules: typeof COMPLETENESS_RULES;
  row: typeof contentSource.$inferSelect | undefined;
  rearmed: boolean;
  /** The parity the flip just checked; null for a re-arm, which checks none. */
  parity: ParityRecord | null;
  /** The tree's files parity read, whose hash the flip records; absent for a re-arm. */
  disk?: Awaited<ReturnType<typeof readTypeFiles>>;
}

/**
 * The second half of a flip, inside its transaction: arm the guards and the
 * rules, count the violators, write the row. Shared by a flip, which reached
 * here through parity, and by `--rearm`, which skipped it.
 */
async function arm(tx: CatalogDatabase, input: ArmInput): Promise<FlipResult> {
  const { type, strict, waive, rules, row, rearmed, parity: report, disk } = input;
    // Arm first: each ALTER takes its table's lock, so the counts below cannot
    // go stale before this commits. A refusal rolls the arming back with it.
    const guards = WRITE_GUARDS[type].map((table) => [table, writeGuardName(table)] as const);
    await setTriggers(tx, guards, true);

    const waived = new Set(waive.map((w) => w.rule));
    const armedRules = strict ? rules.filter((rule) => !waived.has(rule.name)) : [];
    await setTriggers(tx, armedRules.flatMap((rule) => rule.triggers), true);
    // A rule an earlier strict flip armed and this one waives goes off: a
    // waiver on record for a rule still refusing writes would be a lie.
    await setTriggers(tx, rules.filter((rule) => waived.has(rule.name)).flatMap((rule) => rule.triggers), false);
    const violators: string[] = [];
    for (const rule of armedRules) {
      const { rows } = await tx.execute<{ id: string; detail: string }>(rule.violators);
      for (const found of rows) violators.push(`${rule.name}: ${found.id} (${found.detail})`);
    }
    if (violators.length > 0) {
      throw new FlipRefused(
        `--strict would arm rules that ${violators.length} row(s) break. \`catalog doctor\` lists ` +
          `them all; fix them, or pass --waive <rule> --reason "...":\n  - ` +
          violators.slice(0, SHOWN).join("\n  - ") +
          (violators.length > SHOWN ? `\n  - and ${violators.length - SHOWN} more` : ""),
      );
    }

    const now = new Date().toISOString();
    const previous = Array.isArray(row?.waivers) ? (row.waivers as (Waiver & { at: string })[]) : [];
    // A waiver this flip renews is rewritten below; one for a rule this flip
    // arms comes off the record, since a waiver on record for a rule that is
    // refusing writes would be the lie the disarm above avoids, in reverse.
    // `catalog doctor` read one such row as "armed ... waived" once.
    const armed = new Set(armedRules.map((rule) => rule.name));
    const waivers = [
      ...previous.filter((w) => !waived.has(w.rule) && !armed.has(w.rule)),
      ...waive.map((w) => ({ rule: w.rule, reason: w.reason.trim(), at: now })),
    ];
    // The files just passed parity, so they are the database's export, and
    // their hash is what the next import checks them against (edge case 12).
    // Without it every import of the type is refused until someone runs an
    // export into the tree. They may differ from a fresh export in bytes only
    // (a `.tldr` in tldrawkc's key order, a comment): those are listed, and
    // the next export into the tree rewrites them.
    // A re-arm read no tree, so it has no export to record.
    let rewrites: string[] = [];
    let hash = "";
    let exportRecorded = false;
    if (disk !== undefined) {
      const rendered = new Map((await renderType(tx, type)).map((f) => [f.path, f.bytes]));
      rewrites = [...new Set([...disk.map((f) => f.path), ...rendered.keys()])]
        .filter((p) => {
          const want = rendered.get(p);
          const got = disk.find((f) => f.path === p)?.bytes;
          return want === undefined || got === undefined || !want.equals(got);
        })
        .sort();
      hash = exportHash(disk);
      exportRecorded = await mayRecord(tx);
    }

    const already = row?.source === "db";
    const [written] = await tx
      .insert(contentSource)
      .values({ type, source: "db", flippedAt: sql`now()`, waivers, parityReport: report })
      .onConflictDoUpdate({
        target: contentSource.type,
        set: {
          source: "db",
          // A re-arm checked nothing, so the last flip's parity report stays.
          ...(rearmed ? {} : { parityReport: report }),
          // A second flip re-arms; it is not a new moment of ownership.
          flippedAt: sql`coalesce(${contentSource.flippedAt}, now())`,
          waivers,
          updatedAt: sql`now()`,
        },
      })
      .returning({ flippedAt: contentSource.flippedAt });
    if (exportRecorded) await recordExport(tx, type, hash);

    return {
      type,
      source: "db",
      already,
      rearmed,
      flippedAt: (written?.flippedAt ?? new Date()).toISOString(),
      parity: report,
      guardsArmed: guards.map(([table]) => table),
      rulesArmed: armedRules.map((rule) => rule.name),
      waivers,
      export: { hash, recorded: exportRecorded, rewrites },
    };
}
