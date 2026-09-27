import { contentSource, type ContentType, indexRun } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { isExportType } from "./layout";
import type { ParityRecord } from "./ownership";
import { COMPLETENESS_RULES, setTriggers, WRITE_GUARDS, writeGuardName } from "./rules";

/**
 * `catalog flip <type>`: the moment the database starts owning a type
 * (docs/CONTENT-MIGRATION.md, phase 1 and D18, D21).
 *
 * In one transaction it writes the type's `content_source` row as `db`, arms
 * the write guard on each of the type's tables (D4: from then on a write that
 * did not come through the seam is refused), and with `--strict` arms the
 * type's completeness rules. Three refusals come first, each naming what to
 * run instead:
 *
 * - no clean `catalog parity` recorded for the type, or one older than the
 *   type's last import, since the plan's order is parity clean, then flip;
 * - with `--strict`, any violator of a rule the flip would arm, the same rows
 *   `catalog doctor` lists. The triggers are armed before that check, inside
 *   the transaction: arming takes each table's lock, so no writer can add a
 *   violator between the count and the commit;
 * - a `--waive` naming a rule that is not the type's, or with no reason.
 *
 * A waived rule is recorded on the row, reported by `catalog doctor`, left
 * disarmed, and not counted by `--strict`: the phase 3 escape hatch, with its
 * reason on file.
 */

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
}

export interface FlipResult {
  type: ContentType;
  source: "db";
  /** It was already `db`; the guards and rules were (re)armed and nothing else changed. */
  already: boolean;
  flippedAt: string;
  parity: ParityRecord;
  guardsArmed: string[];
  rulesArmed: string[];
  waivers: (Waiver & { at: string })[];
}

const SHOWN = 20;

export async function flip(db: CatalogDatabase, options: FlipOptions): Promise<FlipResult> {
  const { type } = options;
  if (!isExportType(type)) {
    throw new FlipRefused(
      `${type} has no export format and so no parity to check, until Track E defines what a ` +
        `video's parity is. It cannot be flipped yet.`,
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
    const [row] = await tx.select().from(contentSource).where(eq(contentSource.type, type)).for("update");
    const report = row?.parityReport as ParityRecord | null | undefined;
    if (report === null || report === undefined) {
      throw new FlipRefused(
        `${type} has no parity report. Run \`catalog parity --only ${type} <dir>\` against the files ` +
          `the type is read from today, and flip once it reports zero mismatches.`,
      );
    }
    if (!report.clean) {
      throw new FlipRefused(
        `the last \`catalog parity --only ${type}\` (${report.at}, against ${report.dir}) found ` +
          `${report.mismatches} mismatch(es). Fix them, run parity again, then flip.`,
      );
    }
    const [run] = await tx
      .select({ finishedAt: indexRun.finishedAt })
      .from(indexRun)
      .where(eq(indexRun.source, type));
    if (run !== undefined && run.finishedAt.getTime() > Date.parse(report.at)) {
      throw new FlipRefused(
        `${type} was imported again (${run.finishedAt.toISOString()}) after its last parity run ` +
          `(${report.at}), so that report no longer describes the database. Run parity again.`,
      );
    }

    // Arm first: each ALTER takes its table's lock, so the counts below cannot
    // go stale before this commits. A refusal rolls the arming back with it.
    const guards = WRITE_GUARDS[type].map((table) => [table, writeGuardName(table)] as const);
    await setTriggers(tx, guards, true);

    const waived = new Set(waive.map((w) => w.rule));
    const armedRules = options.strict === true ? rules.filter((rule) => !waived.has(rule.name)) : [];
    await setTriggers(tx, armedRules.flatMap((rule) => rule.triggers), true);
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
    const waivers = [
      ...previous.filter((w) => !waived.has(w.rule)),
      ...waive.map((w) => ({ rule: w.rule, reason: w.reason.trim(), at: now })),
    ];
    const already = row?.source === "db";
    const [written] = await tx
      .insert(contentSource)
      .values({ type, source: "db", flippedAt: sql`now()`, waivers })
      .onConflictDoUpdate({
        target: contentSource.type,
        set: {
          source: "db",
          // A second flip re-arms; it is not a new moment of ownership.
          flippedAt: sql`coalesce(${contentSource.flippedAt}, now())`,
          waivers,
          updatedAt: sql`now()`,
        },
      })
      .returning({ flippedAt: contentSource.flippedAt });

    return {
      type,
      source: "db",
      already,
      flippedAt: (written?.flippedAt ?? new Date()).toISOString(),
      parity: report,
      guardsArmed: guards.map(([table]) => table),
      rulesArmed: armedRules.map((rule) => rule.name),
      waivers,
    };
  });
}
