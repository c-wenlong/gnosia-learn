/**
 * The shape of the authored content under `content/`.
 *
 * These types live here rather than in the web app because two consumers read
 * the same files: the Next app renders them, and `catalog index` turns them
 * into rows. When the shape lived in `src/lib/types.ts` and the indexer had its
 * own private `YamlCourse` interface, the two could drift a field at a time and
 * nothing would say so. One declaration, one parser, one meaning.
 */

export type ResourceType = "paper" | "docs" | "video" | "book" | "other" | "practice";

/**
 * A cross-course theme id, e.g. `hci`. Deliberately a plain string: the set is
 * authored in `content/tags.yaml`, so a literal union here would be a second
 * place to edit and a second place to get wrong.
 */
export type TagId = string;

export interface Resource {
  id: string;
  title: string;
  url: string;
  type: ResourceType;
  /**
   * The lessons (item ids of the same module) this reading goes with, in the
   * order written. Absent when the file lists none, which makes the reading
   * module material (docs/proposals/module-learning-path.md). Stored as
   * `curriculum_item_asset` rows.
   */
  lessons?: string[];
}

/**
 * One checklist row inside a module. `id` is permanent: learner progress,
 * notes and recaps are keyed by it, and concept notes link back through it.
 */
export interface Topic {
  id: string;
  title: string;
  /**
   * The concept notes this row teaches, in teaching order. Empty when the
   * course file lists none, in which case the row is a checklist tick and
   * nothing else. Each id must be listed under the module topic's
   * `maps.concepts` in `content/topics.yaml`; that the note itself exists is
   * the catalog's check, since only the indexer reads `learn/concepts/`.
   */
  concepts: string[];
  /** The reading list under the row. Display only, never joined on. */
  subtopics: string[];
  /**
   * Videos this lesson lists, by catalog asset id, in the order written.
   * Absent when it lists none. A reference, not a link: nothing checks the
   * asset exists at import, since a video tool may be indexed after the
   * course or not at all (docs/proposals/module-learning-path.md).
   */
  videos?: string[];
}

export interface Module {
  id: string;
  slug: string;
  title: string;
  order: number;
  /** Slug from the shared vocabulary in `content/topics.yaml`. */
  topic: string;
  topics: Topic[];
  resources: Resource[];
  /** Videos the module lists, by catalog asset id, as `Topic.videos`. Absent when none. */
  videos?: string[];
}

/**
 * A course's cover photo, as the export format names it: the image file
 * beside the course file, and its credit. In the database the image is a blob
 * (`collection.cover_blob_key`) and the credit is `metadata.coverCredit`;
 * the file name is derived from the course code and the image type, so it is
 * the same on every export.
 */
export interface CourseCover {
  /** `<code>.cover.<webp|jpg|png>`, in lowercase, in the course file's own directory. */
  file: string;
  /** Who took it, as the source credits them. */
  photographer: string;
  /** The page the photo came from, an http(s) URL. */
  source: string;
  /** The licence it is used under, e.g. `Unsplash License`. */
  licence: string;
}

export interface Course {
  id: string;
  slug: string;
  code: string;
  title: string;
  credits: number;
  /**
   * Where the course sits in the shortlist. The home page and the sidebar
   * render in this order, and it is authored rather than derived because the
   * shortlist is curated: sorting ten files by name is not the same reading
   * order, and nothing would say so.
   */
  order: number;
  prereq?: string;
  track?: string;
  notes?: string;
  /** The card's cover photo and its credit, when the course has one. */
  cover?: CourseCover;
  inferred: boolean;
  tags: TagId[];
  modules: Module[];
  capstone: string;
}

/** One cross-course theme, from `content/tags.yaml`. */
export interface TagMeta {
  id: TagId;
  label: string;
  description: string;
}

/**
 * How one topic relates to another (docs/CONTENT-MIGRATION.md, `topic_relation`).
 * `broader`: `to` is the wider subject. `related`: symmetric. `precedes`:
 * learn this topic before `to`.
 */
export type TopicRelationKind = "broader" | "related" | "precedes";

/** One typed edge from a topic's `relations:` list. */
export interface TopicRelation {
  kind: TopicRelationKind;
  /** The other topic's slug. */
  to: string;
}

/** One entry in the shared topic vocabulary, from `content/topics.yaml`. */
export interface TopicEntry {
  slug: string;
  title: string;
  domain: string;
  summary: string | null;
  aliases: string[];
  /**
   * Typed edges to other topics, in the order the list is written. Empty when
   * the entry has no `relations:` key, which is every topic until Track A.
   */
  relations: TopicRelation[];
  maps: {
    /** manimkc topic folders, `topics/`-relative. */
    manimkc: string[];
    /** Course *module* ids, e.g. `cp4284-m3`. */
    courses: string[];
    /** Concept note ids. */
    concepts: string[];
  };
}
