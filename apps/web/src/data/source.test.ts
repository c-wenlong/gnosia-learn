import type { ContentSource, SelectedSource, SelectSourceOptions } from "@self-learn/content";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The content accessors ask the source once per request, not once per call
 * and not once per process.
 *
 * vitest runs React's client build, whose `cache` never memoises, and the
 * server build memoises only inside a render Next sets up. So `cache` is
 * replaced here by the contract the accessors rely on: inside a request, one
 * result per function and arguments; outside one, a plain call. `inRequest`
 * opens and closes that scope. What is under test is the wiring (every
 * accessor goes through `cache`, and `contentSource()` is itself one per
 * request), and the spies count the reads that reach the source.
 */

const request = vi.hoisted(() => ({ scope: null as Map<unknown, Map<string, unknown>> | null }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        const scope = request.scope;
        if (scope === null) return fn(...args);
        let memo = scope.get(fn);
        if (memo === undefined) scope.set(fn, (memo = new Map()));
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key) as R;
      },
  };
});

const reads = vi.hoisted(() => ({ select: 0, topics: 0, tags: 0, courses: 0 }));

vi.mock("@self-learn/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@self-learn/content")>();
  return {
    ...actual,
    selectSource: (options: SelectSourceOptions): SelectedSource => {
      reads.select += 1;
      const real = actual.selectSource(options);
      const counted = <K extends "topics" | "tags" | "courses">(key: K): ContentSource[K] =>
        (() => {
          reads[key] += 1;
          return real[key]();
        }) as ContentSource[K];
      return { ...real, topics: counted("topics"), tags: counted("tags"), courses: counted("courses") };
    },
  };
});

/**
 * The `content_source` rows, as the catalog would answer them. A function the
 * tests swap, so one request can see rows, an outage, or nothing.
 */
const catalog = vi.hoisted(() => ({
  ownership: async (): Promise<Record<string, string>> => ({}),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase: async () => ({}) }));
vi.mock("@self-learn/catalog/state", () => ({
  contentOwnership: () => catalog.ownership(),
  dbSource: () => {
    throw new Error("no database in this test");
  },
}));

const { getCourse, getCourses } = await import("@/data/courses");
const { contentSource } = await import("@/data/source");
const { getTags } = await import("@/data/content");
const { getTopics } = await import("@/data/topics");

async function inRequest<T>(run: () => Promise<T>): Promise<T> {
  request.scope = new Map();
  try {
    return await run();
  } finally {
    request.scope = null;
  }
}

beforeEach(() => {
  reads.select = reads.topics = reads.tags = reads.courses = 0;
  catalog.ownership = async () => ({});
});

describe("the content accessors", () => {
  it("read each type once in a request, however many callers ask", async () => {
    await inRequest(async () => {
      const [a, b, one, none] = await Promise.all([
        getCourses(),
        getCourses(),
        getCourse("cs2111"),
        getCourse("nope"),
      ]);
      expect(a).toBe(b);
      expect(one?.code).toBe("CS2111");
      expect(none).toBeUndefined();
      await Promise.all([getTopics(), getTopics(), getTags(), getTags()]);
    });
    expect(reads).toEqual({ select: 1, topics: 1, tags: 1, courses: 1 });
  });

  it("read again on the next request, so a change is seen without a restart", async () => {
    const first = await inRequest(() => getCourses());
    const second = await inRequest(() => getCourses());
    expect(reads.courses).toBe(2);
    expect(reads.select).toBe(2);
    expect(second).toEqual(first);
  });

  it("keep nothing between calls outside a request", async () => {
    await getTopics();
    await getTopics();
    expect(reads.topics).toBe(2);
  });
});

describe("who owns each type", () => {
  it("follows the content_source rows", async () => {
    catalog.ownership = async () => ({ topics: "db", courses: "files" });
    const resolved = await inRequest(() => contentSource().resolution());
    expect(resolved.topics).toEqual({ kind: "db", from: "row" });
    expect(resolved.courses).toEqual({ kind: "files", from: "row" });
    expect(resolved.tags).toEqual({ kind: "files", from: "default" });
  });

  it("reads files when the rows cannot be read, and says so once per outage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      catalog.ownership = async () => {
        throw new Error('relation "content_source" does not exist');
      };
      for (let i = 0; i < 3; i += 1) {
        const resolved = await inRequest(() => contentSource().resolution());
        expect(resolved.topics).toEqual({ kind: "files", from: "default" });
      }
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/content_source" does not exist/);

      // The database answers again, then goes away again: a new outage, a new line.
      catalog.ownership = async () => ({});
      await inRequest(() => contentSource().resolution());
      catalog.ownership = async () => {
        throw new Error("connection refused");
      };
      await inRequest(() => contentSource().resolution());
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});
