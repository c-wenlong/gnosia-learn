import type { BlobStore } from "@self-learn/blob";
import type { CatalogDatabase } from "@self-learn/catalog/state";
import type { SelectedSource } from "@self-learn/content";
import type { OwnerScope } from "@self-learn/schema/shared";

/** The process environment, or whatever map a test hands in. */
export type Env = Record<string, string | undefined>;

/**
 * The seams the asset reads need once the caller holds the database itself.
 * `resolveAsset` and the readers built on it take this beside `db`, because
 * the asset routes in the web app already have `db` in scope and the sidecar
 * holds the same three seams in one place.
 */
export interface AssetSeams {
  /** The requesting owner's rows and the commons' (phase 4). */
  scope: OwnerScope;
  /** The selected seam, not the plain interface: the reads need `resolution()`. */
  source: SelectedSource;
  blobStore: BlobStore;
}

/**
 * Everything a tutor endpoint's read path needs, resolved once per request.
 *
 * `db` is the pool handle as a promise, not a resolved connection: a database
 * that is down rejects it, and each reader's own degradation decides what
 * that costs — a chat answers 503 for a missing concept, but saved keys fall
 * back to the server's env keys and the turn still runs. Resolving it eagerly
 * here would let the slowest read decide for all of them.
 */
export interface TutorDeps extends AssetSeams {
  db: Promise<CatalogDatabase>;
  owner: string;
  env: Env;
  /**
   * The functions a turn delegates to, overridable so a host binds them to
   * the seams its own tests mock. The web app binds each to the shim that
   * re-exports this package (`@/lib/concept-workspace` and friends), which is
   * what its route tests stub; the sidecar leaves them unset and the package
   * implementations answer.
   */
  seams?: TurnSeams;
}

/**
 * A turn's seams. Every field defaults to this package's own implementation
 * when unset; each takes `deps` so an override can still read the owner's
 * identity and scope off the same object.
 */
export interface TurnSeams {
  courses?: () => Promise<import("../types").Course[]>;
  readWorkspace?: (deps: TutorDeps, slug: string) => Promise<import("./concept-workspace").ConceptWorkspaceRead>;
  tutorStyle?: (deps: TutorDeps) => Promise<import("../preferences").TutorStyle>;
  credentials?: (deps: TutorDeps) => Promise<import("../providers").ChainStep[]>;
  complete?: (
    messages: import("../providers").ChatMessage[],
    steps: readonly import("../providers").ChainStep[],
  ) => Promise<import("../providers").CompleteOutcome>;
  assetDetail?: (deps: TutorDeps, id: string) => Promise<import("./asset-detail").AssetDetail>;
  assetText?: (deps: TutorDeps, db: CatalogDatabase, id: string, limit?: number) => Promise<string | null>;
  keyCredential?: (deps: TutorDeps, provider: import("@self-learn/schema/shared").ProviderName) => Promise<import("../providers").ProviderCredential | null>;
  entryCredential?: (
    deps: TutorDeps,
    provider: import("@self-learn/schema/shared").ProviderName,
    model?: string,
  ) => Promise<import("../providers").ProviderCredential | null>;
  chain?: (deps: TutorDeps) => Promise<import("../providers").ChainEntry[]>;
  modelList?: (owner: string, credential: import("../providers").ProviderCredential) => Promise<import("../providers").ModelListResult & { cached: boolean }>;
  testKey?: (credential: import("../providers").ProviderCredential) => Promise<import("../providers").KeyTestResult>;
}
