import type { ModuleAssets } from "@/lib/course-assets";
import type { ModulePathAssets, PathKbConcept } from "@/lib/module-path";

/**
 * What the server resolved per module, for the course page's client half.
 * React-free, so the server loader (`@/lib/course-home`) can name it without
 * importing a client module.
 */
export interface ModuleData {
  /** The concept the Guidebook opens, or null when no concept note covers the module. */
  guidebook: string | null;
  /** Null when the catalog could not be asked. */
  assets: ModuleAssets | null;
  /** The module topic's summary from the topic vocabulary, or null when it has none. */
  description: string | null;
  /** The module's concepts and their prerequisites, from the knowledge base; empty when it could not be read. */
  concepts: PathKbConcept[];
  /** What the module's path places; null when the catalog could not be asked. */
  path: ModulePathAssets | null;
  /** Concept slug to the checks its note holds; null when the catalog could not be asked. */
  checks: Record<string, number> | null;
}

export interface RelatedCourse {
  slug: string;
  code: string;
  title: string;
  /** The tags this course shares with the one on screen. */
  shared: string[];
}
