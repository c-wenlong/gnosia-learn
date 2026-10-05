import type { OwnerScope } from "@self-learn/schema";
import { sql, type SQL } from "drizzle-orm";

import { andOwnedBy, type Owners, scopedRead } from "../content/scope";
import type { CatalogDatabase } from "../db";

/**
 * What a studio conversation made: the assets its jobs wrote, for the
 * deliverable cards in the conversation and its "Everything made in this
 * conversation" list (D89 of docs/STUDIO-CHAT-FIRST.md, after Manus's
 * deliverable card and "View all files in this task").
 *
 * The reverse of `assetParents`' conversation branch:
 *
 * ```
 *   draft ◄─ job.draft_id ─ job ◄─ asset_job.job_id ─ asset_job ─► asset
 * ```
 *
 * **Deliverables only.** A video job writes the video and its transcript,
 * chapters, captions and poster; a diagram job its SVG and its `.tldr`. The
 * card is for the thing a person opens, which is the video or the SVG; the
 * rest are the Library's companions of it, reached from its previewer.
 *
 * **One row per asset**, at the conversation's latest write of it: an extend
 * conversation that redrew its diagram twice made one diagram, the one the
 * Library holds now. Newest first, by that write.
 *
 * **Scoped at every hop** (the "A read that forgets its owner" gotcha): the
 * draft, its jobs, the `asset_job` rows, the asset and the poster must each
 * be readable, so another owner's conversation answers with nothing, and an
 * asset another owner's job wrote into this owner's draft is left out.
 */

/** The kinds a conversation's card is for. */
export const MADE_KINDS = ["video", "diagram_svg"] as const;
export type MadeKind = (typeof MADE_KINDS)[number];

export interface MadeAsset {
  id: string;
  kind: MadeKind;
  /** The asset's own title, or null when the row has none. */
  title: string | null;
  /**
   * The diagram's slug (its SVG's file name) or the video's slug, for the
   * studio's own verbs (Extend); null when the id or path does not say.
   */
  name: string | null;
  /** The job whose write this is. */
  jobId: string;
  /** ISO instant: when that job wrote it (`asset_job.written_at`). */
  madeAt: string;
  /**
   * Whether a picture can be shown: the diagram's SVG blob, or the video's
   * stored poster, is `present`. A card without one draws its glyph instead
   * of asking a route that would answer 404.
   */
  thumbnail: boolean;
}

interface MadeRow extends Record<string, unknown> {
  id: string;
  kind: MadeKind;
  title: string | null;
  path: string | null;
  job_id: string;
  written_at: Date | string;
  thumbnail: boolean | null;
}

/**
 * The assets the conversation `draftId` made, newest first. An unknown
 * draft, or one the reader may not read, answers with an empty list.
 */
export async function conversationMade(db: CatalogDatabase, draftId: string, scope: OwnerScope): Promise<MadeAsset[]> {
  const rows = await scopedRead(db, scope.readable, async (owners) => {
    const { rows } = await db.execute<MadeRow>(madeQuery(draftId, owners));
    return rows;
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    name: madeName(row.id, row.kind, row.path),
    jobId: row.job_id,
    madeAt: new Date(row.written_at).toISOString(),
    thumbnail: row.thumbnail === true,
  }));
}

/**
 * A diagram's slug from its SVG's path (`learn/assets/<slug>.svg`, the
 * logical name D11 keeps), a video's from its id (`video:<slug>`).
 */
export function madeName(id: string, kind: MadeKind, path: string | null): string | null {
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (kind === "diagram_svg") {
    const base = path?.split("/").at(-1)?.replace(/\.svg$/, "") ?? "";
    return slug.test(base) ? base : null;
  }
  const rest = id.startsWith("video:") ? id.slice("video:".length) : "";
  return slug.test(rest) ? rest : null;
}

/** `and <column> in (owners)`, or nothing on a database from before owners. */
function owned(column: string, owners: Owners): SQL {
  return andOwnedBy(sql.raw(column), owners);
}

function madeQuery(draftId: string, owners: Owners): SQL {
  const kinds = sql.join(
    MADE_KINDS.map((kind) => sql`${kind}`),
    sql`, `,
  );
  // `distinct on` keeps each asset's latest write in this conversation; the
  // outer order is newest first, ties broken by id in code-unit order so CI's
  // en_US database agrees with a Homebrew one (the "CI is Linux" gotcha).
  return sql`
    select * from (
      select distinct on (a.id)
             a.id, a.kind, a.title, a.path, aj.job_id, aj.written_at,
             case
               when a.kind = 'diagram_svg' then coalesce(b.state = 'present', false)
               else exists (
                 select 1
                 from asset_derivation ad
                 join asset p on p.id = ad.asset_id and p.kind = 'poster'${owned("p.owner_id", owners)}
                 join blob_object pb on pb.key = p.blob_key and pb.state = 'present'${owned("pb.owner_id", owners)}
                 where ad.source_asset_id = a.id
               )
             end as thumbnail
      from draft d
      join job j on j.draft_id = d.id${owned("j.owner_id", owners)}
      join asset_job aj on aj.job_id = j.id${owned("aj.owner_id", owners)}
      join asset a on a.id = aj.asset_id and a.kind in (${kinds})${owned("a.owner_id", owners)}
      left join blob_object b on b.key = a.blob_key${owned("b.owner_id", owners)}
      where d.id = ${draftId}${owned("d.owner_id", owners)}
      order by a.id, aj.written_at desc, aj.job_id collate "C"
    ) made
    order by written_at desc, id collate "C"`;
}
