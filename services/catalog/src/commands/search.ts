import { asset, assetName, concept, topic } from "@gnosia/schema";
import { sql, type SQL } from "drizzle-orm";

import { CLI_OWNER } from "../content/scope";
import { withDatabase } from "../db";
import { assetNamesExist } from "../state/assets";

/**
 * `catalog search <term>` — the way in when you do not know the slug.
 *
 * ILIKE over three things: topic titles and their aliases, concept titles, and
 * asset titles. Aliases are the reason this is more than a `grep` over `ls`:
 * "reservation stations" and "common data bus" both find
 * `tomasulo-algorithm`, and neither appears in its title.
 *
 * Capped at 20 rows, ordered so exact and prefix matches come first. The cap is
 * the point of the command — a search that can return everything is a second
 * way to dump the catalog into an agent's context, and `ls` already exists for
 * looking at the whole of something small.
 *
 * `%` and `_` in the term are escaped. Not for safety (the value is bound, not
 * interpolated) but for sense: searching for `100%` should look for `100%`.
 */

export const SEARCH_LIMIT = 20;

export interface SearchHit {
  type: "topic" | "concept" | "asset";
  id: string;
  title: string;
  /** Where the term was found: the title, or the alias that matched. */
  matched: string;
  /** The topic slug, the concept's topic, or the asset's path. Enough to act on. */
  context: string | null;
}

export interface SearchResult {
  term: string;
  hits: SearchHit[];
  /** True when the cap cut the list short. */
  truncated: boolean;
}

function escapeLike(term: string): string {
  return term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function runSearch(term: string, limit = SEARCH_LIMIT): Promise<SearchResult> {
  const trimmed = term.trim();
  if (trimmed === "") return { term, hits: [], truncated: false };
  const pattern = `%${escapeLike(trimmed)}%`;
  const prefix = `${escapeLike(trimmed)}%`;

  return withDatabase(async ({ db }) => {
    const names = await assetNamesExist(db);
    // One statement over three tables. `rank` puts an exact match first, then a
    // prefix match, then anything containing the term; the type order after
    // that is deliberate — a topic is the thing you can then `ls`, a concept is
    // the thing that carries mastery, an asset is a file.
    const rows = await db.execute<{
      type: "topic" | "concept" | "asset";
      id: string;
      title: string;
      matched: string;
      context: string | null;
      rank: number;
      type_rank: number;
    }>(sql`
      with hits as (
        select 'topic' as type, ${topic.slug} as id, ${topic.title} as title,
               ${topic.title} as matched, ${topic.domain} as context, 0 as type_rank
          from ${topic} where ${topic.title} ilike ${pattern}
        union all
        select 'topic', ${topic.slug}, ${topic.title}, alias.value, ${topic.domain}, 0
          from ${topic}, lateral jsonb_array_elements_text(${topic.aliases}) as alias(value)
         where alias.value ilike ${pattern}
        union all
        select 'concept', ${concept.slug}, ${concept.title}, ${concept.title}, ${concept.topicSlug}, 1
          from ${concept} where ${concept.title} ilike ${pattern}
        union all
        ${names ? namedAssetHits(pattern) : plainAssetHits(pattern)}
      )
      select distinct on (type, id) type, id, title, matched, context, type_rank,
             case when lower(matched) = lower(${trimmed}) then 0
                  when matched ilike ${prefix} then 1
                  else 2 end as rank
        from hits
       order by type, id, rank
    `);

    // The DISTINCT ON had to order by (type, id) to deduplicate, so the real
    // ordering happens here. Sorting a capped-at-a-few-hundred list in memory
    // costs nothing and keeps the SQL to one statement.
    const sorted = [...rows.rows].sort(
      (a, b) => a.rank - b.rank || a.type_rank - b.type_rank || a.id.localeCompare(b.id),
    );

    return {
      term: trimmed,
      hits: sorted.slice(0, limit).map((row) => ({
        type: row.type,
        id: row.id,
        title: row.title,
        matched: row.matched,
        context: row.context,
      })),
      truncated: sorted.length > limit,
    };
  });
}

export function formatSearch(result: SearchResult): string {
  if (result.hits.length === 0) return `nothing matches "${result.term}"`;
  const lines = [`${result.hits.length} hit${result.hits.length === 1 ? "" : "s"} for "${result.term}"`, ""];
  const width = Math.max(...result.hits.map((h) => h.id.length));
  for (const hit of result.hits) {
    const alias = hit.matched === hit.title ? "" : `  (matched "${hit.matched}")`;
    lines.push(`  ${hit.type.padEnd(7)} ${hit.id.padEnd(width)}  ${hit.title}${alias}`);
  }
  if (result.truncated) {
    lines.push("", `showing the first ${result.hits.length}; narrow the term for the rest`);
  }
  return lines.join("\n");
}

/** Asset hits under the source's title, on a database from before `asset_name` (0024). */
function plainAssetHits(pattern: string): SQL {
  return sql`select 'asset', ${asset.id}, coalesce(${asset.title}, ${asset.id}),
               coalesce(${asset.title}, ${asset.id}), coalesce(${asset.path}, ${asset.url}), 2
          from ${asset} where ${asset.title} ilike ${pattern}`;
}

/**
 * Asset hits under the CLI owner's own name, as every page shows it. The
 * source's title still finds a renamed asset, which is then listed under the
 * name it now shows.
 */
function namedAssetHits(pattern: string): SQL {
  // Spelled with their table: `asset_name` has a `title` too.
  const shown = sql`coalesce(n.title, "asset"."title", "asset"."id")`;
  const named = sql`left join ${assetName} n on n.asset_id = "asset"."id" and n.learner_id = ${CLI_OWNER}`;
  const where = sql`coalesce("asset"."path", "asset"."url")`;
  return sql`select 'asset', "asset"."id", ${shown}, ${shown}, ${where}, 2
          from ${asset} ${named} where n.title ilike ${pattern}
        union all
        select 'asset', "asset"."id", ${shown}, "asset"."title", ${where}, 2
          from ${asset} ${named} where "asset"."title" ilike ${pattern}`;
}
