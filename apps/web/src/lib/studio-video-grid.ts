import { NO_TOPIC } from "@/lib/studio-url";
import { videoAssetId } from "@/lib/studio-video-job";

/**
 * The studio videos on the grid: reading `GET /api/videos`, and filtering,
 * sorting and grouping them beside the diagrams (`studio-grid.ts` does the
 * same for the diagrams). Pure, like the rest of the studio's `lib/`.
 */

/**
 * One studio video on the grid, from `GET /api/videos`.
 *
 * The runner's route (step 2a of docs/STUDIO-MENTIONS.md) is planned as
 * `{ videos: [{ slug, title, topic, posterAssetId, updated }] }`, with
 * `posterAssetId` the video's own asset id (`video:<slug>`), which is what the
 * library's poster route takes. `readVideos` also reads `catalog video list
 * --json`'s richer shape, in case the route passes that through, and keeps
 * only studio videos either way.
 */
export interface StudioVideo {
  slug: string;
  title: string | null;
  topic: string | null;
  /** The asset id the poster route takes (`video:<slug>`), or null when there is no poster. */
  posterAssetId: string | null;
  durationSeconds: number | null;
  /** The last write, ISO, or "" when the runner sent none. */
  updated: string;
}

/**
 * Read `GET /api/videos` defensively, in the planned shape or the catalog's,
 * keeping only studio videos. Anything malformed is dropped, never thrown.
 */
export function readVideos(body: unknown): StudioVideo[] {
  const list = (body as { videos?: unknown } | null)?.videos;
  if (!Array.isArray(list)) return [];
  const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
  return list.flatMap((entry): StudioVideo[] => {
    if (entry === null || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    // The catalog's shape carries manimkc renders too, which have no slug.
    if (raw.origin !== undefined && raw.origin !== "studio") return [];
    const slug = text(raw.slug);
    if (slug === null) return [];
    const poster = raw.poster as { assetId?: unknown } | null | undefined;
    const posterAssetId =
      typeof raw.posterAssetId === "string"
        ? text(raw.posterAssetId)
        : raw.posterAssetId === null
          ? null
          : poster !== null && typeof poster === "object"
            ? (text(raw.assetId) ?? videoAssetId(slug))
            : poster === null
              ? null
              : videoAssetId(slug);
    return [
      {
        slug,
        title: text(raw.title),
        topic: text(raw.topic),
        posterAssetId,
        durationSeconds: typeof raw.durationSeconds === "number" ? raw.durationSeconds : null,
        updated: text(raw.updated) ?? text(raw.updatedAt) ?? "",
      },
    ];
  });
}

/**
 * The studio videos a filter keeps: the same topic chips and search the
 * diagrams obey, and none when the kind filter says diagrams.
 */
export function filterVideos(
  videos: readonly StudioVideo[],
  view: { topics: readonly string[]; query: string; kind?: "all" | "diagram" | "video" },
): StudioVideo[] {
  if (view.kind === "diagram") return [];
  const query = view.query.trim().toLowerCase();
  return videos.filter((video) => {
    if (view.topics.length > 0 && !view.topics.includes(video.topic ?? NO_TOPIC)) return false;
    if (query === "") return true;
    return [video.title ?? "", video.slug, video.topic ?? ""].some((field) => field.toLowerCase().includes(query));
  });
}

/**
 * The grid's order, by the view's Sort as the diagrams are: title, or the
 * last write for both Modified and Created (a video row has no creation
 * time). Undated videos go last whichever way the arrow points.
 */
export function sortVideos(
  videos: readonly StudioVideo[],
  view: { sort: "modified" | "title" | "created"; direction: "asc" | "desc" } = { sort: "modified", direction: "desc" },
): StudioVideo[] {
  const sign = view.direction === "asc" ? 1 : -1;
  const titleOf = (video: StudioVideo): string => video.title ?? video.slug;
  return [...videos].sort((a, b) => {
    if (view.sort === "title") return sign * titleOf(a).localeCompare(titleOf(b));
    const at = Date.parse(a.updated);
    const bt = Date.parse(b.updated);
    if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0;
    if (!Number.isFinite(at)) return 1;
    if (!Number.isFinite(bt)) return -1;
    return sign * (at - bt);
  });
}

/**
 * Which of the grid's groups a video sits in, keyed as `groupDiagrams` keys
 * them: `all` with no grouping, else its topic or its topic's domain, `none`
 * when it has neither.
 */
export function videoGroupKey(
  video: Pick<StudioVideo, "topic">,
  group: "none" | "topic" | "domain",
  domains: ReadonlyMap<string, string> = new Map(),
): string {
  if (group === "none") return "all";
  if (video.topic === null) return NO_TOPIC;
  if (group === "topic") return video.topic;
  return domains.get(video.topic) ?? NO_TOPIC;
}

/** One section of the grid: a group's diagrams and its studio videos together. */
export interface GridSection<D> {
  key: string;
  label: string;
  diagrams: D[];
  videos: StudioVideo[];
}

/**
 * The grid's sections, diagrams and videos in the same groups: with no
 * grouping one section; by topic or domain one per key either kind has,
 * ordered as `groupDiagrams` orders them (by label, the no-topic section
 * last), so a topic with only videos takes its place among the rest rather
 * than jumping the queue. `videos` arrive already sorted.
 */
export function gridSections<D>(
  diagramGroups: readonly { key: string; label: string; items: D[] }[],
  videos: readonly StudioVideo[],
  group: "none" | "topic" | "domain",
  titles: ReadonlyMap<string, string> = new Map(),
  domains: ReadonlyMap<string, string> = new Map(),
): GridSection<D>[] {
  const sections = new Map<string, GridSection<D>>();
  for (const entry of diagramGroups) sections.set(entry.key, { key: entry.key, label: entry.label, diagrams: [...entry.items], videos: [] });
  for (const video of videos) {
    const key = videoGroupKey(video, group, domains);
    const held = sections.get(key);
    if (held !== undefined) {
      held.videos.push(video);
      continue;
    }
    const label =
      key === "all" ? "" : key === NO_TOPIC ? (group === "topic" ? "No topic" : "No domain") : group === "topic" ? (titles.get(key) ?? key) : key;
    sections.set(key, { key, label, diagrams: [], videos: [video] });
  }
  const list = [...sections.values()];
  if (group === "none") return list;
  return list.sort((a, b) => (a.key === NO_TOPIC ? 1 : b.key === NO_TOPIC ? -1 : a.label.localeCompare(b.label)));
}

/** One tile in a section: a diagram or a studio video. */
export type SectionItem<D> = { kind: "diagram"; item: D } | { kind: "video"; item: StudioVideo };

/**
 * A section's diagrams and videos as one list, in the view's Sort.
 *
 * Rendering the two lists one after the other put every video ahead of every
 * diagram whatever Sort said, so a new sort changed nothing in the first row
 * and read as a control that does nothing. `keyOf` gives a diagram's title and
 * the time Sort compares (its modified or created time); a video's is its
 * title and its last write, as `sortVideos` has it. Undated goes last whichever
 * way the arrow points, and ties keep the order they came in.
 */
export function sectionItems<D>(
  section: Pick<GridSection<D>, "diagrams" | "videos">,
  view: { sort: "modified" | "title" | "created"; direction: "asc" | "desc" },
  keyOf: (diagram: D) => { title: string; time: string | null },
): SectionItem<D>[] {
  const sign = view.direction === "asc" ? 1 : -1;
  const keyed = [
    ...section.videos.map((video) => ({
      entry: { kind: "video", item: video } as SectionItem<D>,
      title: video.title ?? video.slug,
      time: Date.parse(video.updated),
    })),
    ...section.diagrams.map((diagram) => {
      const { title, time } = keyOf(diagram);
      return { entry: { kind: "diagram", item: diagram } as SectionItem<D>, title, time: time === null ? NaN : Date.parse(time) };
    }),
  ];
  keyed.sort((a, b) => {
    if (view.sort === "title") return sign * a.title.localeCompare(b.title);
    const aDated = Number.isFinite(a.time);
    const bDated = Number.isFinite(b.time);
    if (!aDated && !bDated) return 0;
    if (!aDated) return 1;
    if (!bDated) return -1;
    return sign * (a.time - b.time);
  });
  return keyed.map(({ entry }) => entry);
}
