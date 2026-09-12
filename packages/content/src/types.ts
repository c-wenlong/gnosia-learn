/**
 * The shape of the authored content under `content/`.
 *
 * These types live here rather than in the web app because two consumers read
 * the same files: the Next app renders them, and `catalog index` turns them
 * into rows. When the shape lived in `src/lib/types.ts` and the indexer had its
 * own private `YamlCourse` interface, the two could drift a field at a time and
 * nothing would say so. One declaration, one parser, one meaning.
 */

export type ResourceType = "paper" | "docs" | "video" | "book" | "other";

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
}

/**
 * One checklist row inside a module. `id` is permanent: learner progress,
 * notes and recaps are keyed by it, and concept notes link back through it.
 */
export interface Topic {
  id: string;
  title: string;
  subtopics: string[];
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

/** One entry in the shared topic vocabulary, from `content/topics.yaml`. */
export interface TopicEntry {
  slug: string;
  title: string;
  domain: string;
  summary: string | null;
  aliases: string[];
  maps: {
    /** manimkc topic folders, `topics/`-relative. */
    manimkc: string[];
    /** Course *module* ids, e.g. `cp4284-m3`. */
    courses: string[];
    /** Concept note ids. */
    concepts: string[];
  };
}
