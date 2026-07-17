export type ResourceType = "paper" | "docs" | "video" | "book" | "other";

export type TagId =
  | "hci"
  | "agentic-ai"
  | "transformers"
  | "generative-models"
  | "graphics"
  | "classical-ai"
  | "recommenders"
  | "product";

export interface Resource {
  id: string;
  title: string;
  url: string;
  type: ResourceType;
}

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
  topics: Topic[];
  resources: Resource[];
}

export interface Course {
  id: string;
  slug: string;
  code: string;
  title: string;
  credits: number;
  prereq?: string;
  track?: string;
  notes?: string;
  inferred: boolean;
  tags: TagId[];
  modules: Module[];
  capstone: string;
}

export interface UserResource {
  id: string;
  title: string;
  url: string;
}

export type ThemeMode = "light" | "dark";

export interface LearnerState {
  version: 1;
  theme: ThemeMode;
  completed: Record<string, true>;
  notes: Record<string, string>;
  userResources: Record<string, UserResource[]>;
  /** Bumps when progress is reset so local UI state can remount. */
  epoch: number;
  lastVisited?: {
    courseSlug: string;
    moduleSlug?: string;
    at: string;
  };
}

export interface ProgressCounts {
  completed: number;
  total: number;
  percent: number;
}

export interface TagMeta {
  id: TagId;
  label: string;
  description: string;
}
