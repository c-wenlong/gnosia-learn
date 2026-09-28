import { COMMONS_OWNER, type RevisionEntityType } from "@self-learn/schema";
import { getTableColumns, getTableName, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type { CatalogDatabase } from "../db";
import { ENTITIES, LINK_FAR_ENDS, ROW_FAR_ENDS } from "./entities";

/**
 * Links and owners (D24 of docs/CONTENT-MIGRATION.md): what `catalog doctor`
 * reports, and the one repair it makes.
 *
 * A link belongs to its parent's owner. `topic_relation` and `manimkc_topic`
 * carry an `owner_id` of their own, and it must equal their topic's; the seam
 * stamps it on every write, so a row that disagrees ("mixed") was put there
 * around the seam. `doctor --fix` restamps it through the seam, one revision
 * per topic.
 *
 * Separately, a link or a row whose far end is another owner's (not the
 * commons') points at something its own reader cannot open. The seam refuses
 * a new one; one that exists is only reported, never deleted, since deleting
 * it is a decision about somebody's content.
 */

export interface MixedLink {
  table: string;
  parent: string;
  far: string;
  owner: string;
  parentOwner: string;
}

export interface UnreadableLink {
  /** The link table, or `<table>.<column>` for a row's own column. */
  table: string;
  parent: string;
  far: string;
  parentOwner: string;
  farOwner: string;
}

export interface LinkOwnerReport {
  mixed: MixedLink[];
  unreadable: UnreadableLink[];
}

/** A column's SQL name, from the table's own definition. */
function sqlName(table: PgTable, key: string): string {
  const found = (getTableColumns(table) as Record<string, { name: string } | undefined>)[key];
  if (found === undefined) throw new Error(`table ${getTableName(table)} has no column "${key}"`);
  return found.name;
}

const ident = (name: string): SQL => sql.raw(`"${name.replaceAll('"', '""')}"`);

export async function linkOwners(db: CatalogDatabase): Promise<LinkOwnerReport> {
  const { rows: mixed } = await db.execute<{ link: string; parent: string; far: string; owner: string; parent_owner: string }>(sql`
    select 'topic_relation' as link, r.from_slug as parent, r.to_slug as far, r.owner_id as owner, t.owner_id as parent_owner
    from topic_relation r join topic t on t.slug = r.from_slug
    where r.owner_id <> t.owner_id
    union all
    select 'manimkc_topic', m.topic_slug, m.path, m.owner_id, t.owner_id
    from manimkc_topic m join topic t on t.slug = m.topic_slug
    where m.owner_id <> t.owner_id
    order by 1, 2, 3`);

  const probes: SQL[] = [];
  for (const [type, spec] of Object.entries(ENTITIES) as [RevisionEntityType, (typeof ENTITIES)[RevisionEntityType]][]) {
    const parentTable = ident(getTableName(spec.table));
    const parentKey = ident(sqlName(spec.table, spec.key));
    for (const end of ROW_FAR_ENDS[type] ?? []) {
      const target = ENTITIES[end.target];
      const column = sqlName(spec.table, end.column);
      probes.push(sql`
        select ${`${getTableName(spec.table)}.${column}`} as link, p.${parentKey}::text as parent, f.${ident(sqlName(target.table, target.key))}::text as far,
          p.owner_id as parent_owner, f.owner_id as far_owner
        from ${parentTable} p join ${ident(getTableName(target.table))} f on f.${ident(sqlName(target.table, target.key))} = p.${ident(column)}
        where f.owner_id <> p.owner_id and f.owner_id <> ${COMMONS_OWNER}`);
    }
    for (const link of spec.links) {
      for (const end of LINK_FAR_ENDS[link.name] ?? []) {
        const target = ENTITIES[end.target];
        probes.push(sql`
          select ${link.name} as link, p.${parentKey}::text as parent, f.${ident(sqlName(target.table, target.key))}::text as far,
            p.owner_id as parent_owner, f.owner_id as far_owner
          from ${ident(link.name)} l
          join ${parentTable} p on p.${parentKey} = l.${ident(sqlName(link.table, link.parent))}
          join ${ident(getTableName(target.table))} f on f.${ident(sqlName(target.table, target.key))} = l.${ident(sqlName(link.table, end.column))}
          where f.owner_id <> p.owner_id and f.owner_id <> ${COMMONS_OWNER}`);
      }
    }
  }
  const unreadable: UnreadableLink[] = [];
  for (const probe of probes) {
    const { rows } = await db.execute<{ link: string; parent: string; far: string; parent_owner: string; far_owner: string }>(probe);
    for (const row of rows) {
      unreadable.push({ table: row.link, parent: row.parent, far: row.far, parentOwner: row.parent_owner, farOwner: row.far_owner });
    }
  }
  unreadable.sort((a, b) => (a.table + a.parent + a.far < b.table + b.parent + b.far ? -1 : 1));
  return {
    mixed: mixed.map((row) => ({ table: row.link, parent: row.parent, far: row.far, owner: row.owner, parentOwner: row.parent_owner })),
    unreadable,
  };
}
