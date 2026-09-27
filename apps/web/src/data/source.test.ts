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

const { getCourse, getCourses } = await import("@/data/courses");
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
