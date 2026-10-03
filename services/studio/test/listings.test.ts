import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOPICS } from "./vocabulary";

/**
 * The grid's three lists, kept by the runner so a visit to `/studio` waits on
 * none of them (`listings.ts`): served from memory while current, served and
 * renewed in the background once old, and dropped by a write this runner
 * makes through the catalog.
 *
 * The CLI is faked at `run`, below `catalog.ts`, so the write hook under test
 * is the real one each catalog verb goes through.
 */

const proc = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../src/proc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/proc")>();
  return { ...actual, run: proc.run };
});

const { diagramPut, topicAdd } = await import("../src/catalog");
const { Listings, readListing } = await import("../src/listings");

const summary = (slug: string) => ({
  slug,
  path: `learn/assets/${slug}.tldr`,
  svgPath: `learn/assets/${slug}.svg`,
  title: slug,
  topic: "vector-and-linear-algebra-basics",
  concepts: [],
  source: null,
  created: null,
  shapes: 1,
  documentBytes: 10,
  svg: null,
  svgState: "missing",
  revision: 1,
  updatedAt: "2026-10-01T00:00:00.000Z",
  svgUpdatedAt: null,
});

/** What the fake catalog lists now; a test changes it to stand for a write. */
let slugs: string[] = [];
let videosAnswer: "ok" | "down" = "ok";

const done = (json: unknown) => ({ code: 0, signal: null, stdout: JSON.stringify(json), stderr: "", json, timedOut: false });

/** How many times the CLI was asked `<noun> <verb>`. */
function calls(noun: string, verb: string): number {
  return proc.run.mock.calls.filter(([, args]) => (args as string[]).includes(noun) && (args as string[]).includes(verb)).length;
}

let home = "";
let listings: InstanceType<typeof Listings> | null = null;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "studio-listings-"));
  process.env.STUDIO_HOME = home;
  slugs = ["dot-product"];
  videosAnswer = "ok";
  proc.run.mockReset().mockImplementation(async (_bin: string, args: string[]) => {
    const has = (noun: string, verb: string) => args.includes(noun) && args.includes(verb);
    if (has("diagram", "list")) return done({ ok: true, diagrams: slugs.map(summary) });
    if (has("topic", "ls")) return done({ verb: "ls", topics: TOPICS });
    if (has("video", "list")) {
      return videosAnswer === "ok"
        ? done({ videos: [{ slug: "a", origin: "studio" }] })
        : { code: 3, signal: null, stdout: "", stderr: "connect ECONNREFUSED", json: null, timedOut: false };
    }
    return done({ ok: true });
  });
});

afterEach(async () => {
  listings?.close();
  listings = null;
  if (home !== "") await rm(home, { recursive: true, force: true });
  home = "";
  delete process.env.STUDIO_HOME;
});

const diagramsOk = (outcome: { ok: boolean }) => !outcome.ok;

describe("a list the runner keeps", () => {
  it("answers a second visit from memory while it is current", async () => {
    listings = new Listings();
    const first = await readListing(listings.diagrams, diagramsOk);
    const second = await readListing(listings.diagrams, diagramsOk);

    expect(calls("diagram", "list")).toBe(1);
    expect(second.value).toEqual(first.value);
    expect(second.cache.renewing).toBe(false);
  });

  it("serves an old list at once and renews it behind the answer", async () => {
    let clock = 1_000_000;
    listings = new Listings({ ttlMs: 30_000, now: () => clock });
    await readListing(listings.diagrams, diagramsOk);
    slugs = ["dot-product", "made-elsewhere"];
    clock += 30_000;

    // Old the moment it landed: the visit gets it, and a read starts.
    const served = await readListing(listings.diagrams, diagramsOk);
    expect(served.value.ok && served.value.value.diagrams.map((entry) => entry.name)).toEqual(["dot-product"]);
    expect(served.cache.renewing).toBe(true);

    // The renewal already running, awaited rather than a second one started.
    await listings.diagrams.refresh();
    expect(calls("diagram", "list")).toBe(2);
    const after = await readListing(listings.diagrams, diagramsOk);
    expect(after.value.ok && after.value.value.diagrams.map((entry) => entry.name)).toEqual(["dot-product", "made-elsewhere"]);
  });

  it("is dropped by a write this runner makes, so the next visit sees it", async () => {
    listings = new Listings();
    await readListing(listings.diagrams, diagramsOk);
    await readListing(listings.vocabulary, diagramsOk);
    await readListing(listings.videos, (result) => !result.ok);

    slugs = ["dot-product", "just-accepted"];
    await diagramPut({ slug: "just-accepted", tldr: "/x.tldr", svg: null, jobId: "j1", base: null, reason: "accept" });

    const after = await readListing(listings.diagrams, diagramsOk);
    expect(after.value.ok && after.value.value.diagrams.map((entry) => entry.name)).toEqual(["dot-product", "just-accepted"]);
    expect(calls("diagram", "list")).toBe(2);
    // All three go: a topic or a video landing is told apart from a diagram by nobody.
    await readListing(listings.vocabulary, diagramsOk);
    expect(calls("topic", "ls")).toBe(2);
  });

  it("drops the lists after a write the catalog refused too", async () => {
    listings = new Listings();
    await readListing(listings.vocabulary, diagramsOk);
    proc.run.mockImplementationOnce(async () => ({ code: 1, signal: null, stdout: "", stderr: "refused", json: null, timedOut: false }));
    const added = await topicAdd({ slug: "new-topic", title: "New topic", domain: "mathematics", summary: null, aliases: [], relations: [] }, "a reason");
    expect(added.ok).toBe(false);

    await readListing(listings.vocabulary, diagramsOk);
    expect(calls("topic", "ls")).toBe(2);
  });

  it("hands a failure back once and asks again on the next visit", async () => {
    listings = new Listings();
    videosAnswer = "down";
    const failed = await readListing(listings.videos, (result) => !result.ok);
    expect(failed.value.ok).toBe(false);

    videosAnswer = "ok";
    const next = await readListing(listings.videos, (result) => !result.ok);
    expect(next.value.ok).toBe(true);
    expect(calls("video", "list")).toBe(2);
  });

  it("stops listening for writes once closed", async () => {
    listings = new Listings();
    await readListing(listings.diagrams, diagramsOk);
    listings.close();
    await diagramPut({ slug: "x", tldr: "/x.tldr", svg: null, jobId: "j1", base: null, reason: "accept" });
    await readListing(listings.diagrams, diagramsOk);
    expect(calls("diagram", "list")).toBe(1);
  });
});

describe("a list answered from the disk copy", () => {
  it("is not kept, so the catalog's return shows on the next visit", async () => {
    listings = new Listings();
    // One good read writes the copy; then the catalog goes away.
    await readListing(listings.diagrams, diagramsOk);
    listings.forget();
    proc.run.mockImplementationOnce(async () => ({ code: 3, signal: null, stdout: "", stderr: "connect ECONNREFUSED", json: null, timedOut: false }));
    const fromCopy = await readListing(listings.diagrams, (outcome) => !outcome.ok || outcome.value.stale);
    expect(fromCopy.value.ok && fromCopy.value.value.stale).toBe(true);

    slugs = ["dot-product", "after-recovery"];
    const next = await readListing(listings.diagrams, (outcome) => !outcome.ok || outcome.value.stale);
    expect(next.value.ok && next.value.value.diagrams.map((entry) => entry.name)).toEqual(["dot-product", "after-recovery"]);
  });
});
