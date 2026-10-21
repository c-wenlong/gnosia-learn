import { loadVocabulary, type Vocabulary } from "../diagram/brief";
import { onCatalogWrite, videoList, type CatalogResult } from "../data/catalog";
import { listDiagrams, type DiagramListing } from "../canvas/diagrams";
import { Probe, type ProbeReading } from "./probe";

/**
 * The three lists `/studio` is drawn from, kept so a page load waits on none
 * of them: the diagrams, the topic vocabulary and the studio videos.
 *
 * Each is a `catalog` subprocess, about a second on an idle machine, and the
 * page asks for all three at once, which measured 2.2 to 2.7 s together (12
 * cores, the runner's own subprocesses contending). Every visit to the studio
 * paid that before it drew anything. Now each list is a `Probe`: the last
 * answer at once, and an answer older than `LISTING_TTL_MS` starts a read in
 * the background and is returned anyway. The response says when a read is
 * running (`cache.renewing`), and the page asks the server again once it has
 * landed, so a list changed outside the studio still shows within a few
 * seconds of the visit, without the visit waiting for it.
 *
 * A write this runner makes through the catalog (a diagram or a video landing,
 * a commit, a topic the planner proposed) drops all three (`onCatalogWrite`),
 * so the next page after it waits for a fresh read, as it did before, and
 * never shows the list from before its own write.
 *
 * Only these three routes read through here. A gate that checks a brief
 * against the vocabulary, and the panels that read one diagram, still read the
 * catalog each time: deciding on a list up to a TTL old is a different thing
 * from showing one.
 */

/** How long a list is current; older, it is served while a new read runs. */
export const LISTING_TTL_MS = 30_000;

/** A check that does not throw, so a failure is an answer the route can say, and is not kept. */
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settled<T>(read: () => Promise<T>): () => Promise<Outcome<T>> {
  return () => read().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

/** What a route adds to its answer: when the list was read, and whether a newer read is running. */
export interface ListingCache {
  checkedAt: string;
  renewing: boolean;
}

export class Listings {
  readonly diagrams: Probe<Outcome<DiagramListing>>;
  readonly vocabulary: Probe<Outcome<Vocabulary>>;
  readonly videos: Probe<CatalogResult>;
  private readonly unsubscribe: () => void;

  constructor({ ttlMs = LISTING_TTL_MS, now }: { ttlMs?: number; now?: () => number } = {}) {
    this.diagrams = new Probe(settled(listDiagrams), ttlMs, { now });
    this.vocabulary = new Probe(settled(loadVocabulary), ttlMs, { now });
    this.videos = new Probe(() => videoList(), ttlMs, { now });
    this.unsubscribe = onCatalogWrite(() => this.forget());
  }

  /** Start all three reads now, not awaited: at start, so the first page finds answers. */
  warm(): void {
    this.diagrams.warm();
    this.vocabulary.warm();
    this.videos.warm();
  }

  /** Drop all three, so the next read of each waits for the catalog. */
  forget(): void {
    this.diagrams.forget();
    this.vocabulary.forget();
    this.videos.forget();
  }

  /** Stop listening for writes. */
  close(): void {
    this.unsubscribe();
  }
}

/**
 * One list's reading, with a failure handed back once and not kept: the
 * next read asks the catalog again rather than repeating the failure for a
 * TTL. A failure is the route's to say, as it was before the lists were kept.
 * The routes count a list answered from the disk copy (the catalog down) as
 * one too: kept, it would stand for a TTL after the catalog came back.
 */
export async function readListing<T>(probe: Probe<T>, failed: (value: T) => boolean): Promise<{ value: T; cache: ListingCache }> {
  const reading: ProbeReading<T> = await probe.read();
  if (failed(reading.value)) probe.forget();
  return { value: reading.value, cache: { checkedAt: reading.checkedAt, renewing: reading.refreshing } };
}
