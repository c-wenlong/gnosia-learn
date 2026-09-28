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
 * The `content_source` rows, as the catalog would answer them, and the rows
 * behind them. Functions the tests swap, so one request can see rows, an
 * outage, or nothing. Every type is owned by the database unless a test says
 * otherwise, which is the state the app is built for after phase 2.
 */
const ALL_DB = { topics: "db", tags: "db", courses: "db", concepts: "db", sessions: "db", diagrams: "db" };
const catalog = vi.hoisted(() => ({
  ownership: async (): Promise<Record<string, string>> => ({}),
}));

const COURSE = { slug: "cs2111", code: "CS2111", modules: [] };
const rowsSource: ContentSource = {
  topics: async () => [],
  tags: async () => [],
  courses: async () => [COURSE as never],
  concept: async () => null,
  sessionLog: async () => null,
  diagram: async () => null,
};

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase: async () => ({}) }));
vi.mock("@self-learn/catalog/state", () => ({
  contentOwnership: () => catalog.ownership(),
  dbSource: () => rowsSource,
}));

const { getCourse, getCourses } = await import("@/data/courses");
const { ContentUnavailableError, contentSource } = await import("@/data/source");
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
  catalog.ownership = async () => ALL_DB;
  delete process.env.CONTENT_SOURCE;
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

describe("a type the database does not own", () => {
  /** The refusal a read hit, so a test can look at its reason and words. */
  async function refusal(read: () => Promise<unknown>): Promise<InstanceType<typeof ContentUnavailableError>> {
    const error = await inRequest(read).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ContentUnavailableError);
    return error as InstanceType<typeof ContentUnavailableError>;
  }

  it("is refused by name when its row still says files, and the refusal names the flip", async () => {
    catalog.ownership = async () => ({ ...ALL_DB, courses: "files" });
    const error = await refusal(() => getCourses());
    expect(error.reason).toBe("not-flipped");
    expect(error.type).toBe("courses");
    expect(error.message).toContain("still says files");
    expect(error.message).toContain("npm run catalog -- flip courses");
    // The other types still read: one unflipped type does not take the rest down.
    await expect(inRequest(() => getTopics())).resolves.toEqual([]);
  });

  it("reads the database when no row names it: the default since the cut-over", async () => {
    catalog.ownership = async () => ({});
    await expect(inRequest(() => getTopics())).resolves.toEqual([]);
  });

  it("is refused for a single note, log or diagram read too", async () => {
    catalog.ownership = async () => ({ ...ALL_DB, concepts: "files" });
    const error = await refusal(() => contentSource().concept("dot-product"));
    expect(error.type).toBe("concepts");
    expect(error.message).toContain("flip concepts");
  });

  it("names CONTENT_SOURCE when that is what sent the type to files", async () => {
    process.env.CONTENT_SOURCE = "tags=files";
    try {
      const error = await refusal(() => getTags());
      expect(error.message).toContain("CONTENT_SOURCE sends tags to files");
    } finally {
      delete process.env.CONTENT_SOURCE;
    }
  });
});

describe("who owns each type", () => {
  it("follows the content_source rows", async () => {
    catalog.ownership = async () => ({ topics: "db", courses: "files" });
    const resolved = await inRequest(() => contentSource().resolution());
    expect(resolved.topics).toEqual({ kind: "db", from: "row" });
    expect(resolved.courses).toEqual({ kind: "files", from: "row" });
    expect(resolved.tags).toEqual({ kind: "db", from: "default" });
  });

  it("lets Next's own dynamic-usage signal through instead of calling it an outage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // What `connection()` throws during a prerender: Next recognises it by
      // its digest, and `unstable_rethrow` hands it back.
      const bailout = Object.assign(new Error("Dynamic server usage: Route /courses used `connection`"), {
        digest: "DYNAMIC_SERVER_USAGE",
      });
      catalog.ownership = async () => {
        throw bailout;
      };
      await expect(inRequest(() => contentSource().resolution())).rejects.toBe(bailout);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses every read when the rows cannot be read, instead of reading files", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      catalog.ownership = async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      };
      const error = await inRequest(() => getCourses()).catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(ContentUnavailableError);
      expect((error as InstanceType<typeof ContentUnavailableError>).reason).toBe("unreachable");
      expect((error as Error).message).toContain("ECONNREFUSED");
      expect(reads.courses).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("reports a new cause even while an outage is already reported, and the same cause once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await inRequest(() => contentSource().resolution());
      const causes = [
        "connect ECONNREFUSED 127.0.0.1:5432",
        "connect ECONNREFUSED 127.0.0.1:5432",
        'relation "content_source" does not exist',
        'relation "content_source" does not exist',
        "permission denied for table content_source",
      ];
      for (const message of causes) {
        catalog.ownership = async () => {
          throw new Error(message);
        };
        await expect(inRequest(() => contentSource().resolution())).rejects.toBeInstanceOf(ContentUnavailableError);
      }
      expect(warn.mock.calls.map((call) => String(call[0]).replace(/^.*could not be read\. /, ""))).toEqual([
        "connect ECONNREFUSED 127.0.0.1:5432",
        'relation "content_source" does not exist',
        "permission denied for table content_source",
      ]);

      // The database answers again, then goes away again with an old cause: a new outage, a new line.
      catalog.ownership = async () => ALL_DB;
      await inRequest(() => contentSource().resolution());
      catalog.ownership = async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      };
      await expect(inRequest(() => contentSource().resolution())).rejects.toBeInstanceOf(ContentUnavailableError);
      expect(warn).toHaveBeenCalledTimes(4);
    } finally {
      warn.mockRestore();
    }
  });

  it("names the driver's code when the wrapped error says only which query failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const refused = Object.assign(new Error(""), { code: "ECONNREFUSED" });
      catalog.ownership = async () => {
        throw new Error('Failed query: select "type", "source" from "content_source"', { cause: refused });
      };
      const error = await inRequest(() => getTopics()).catch((thrown: unknown) => thrown);
      expect((error as Error).message).toContain('from "content_source" (ECONNREFUSED)');
    } finally {
      warn.mockRestore();
    }
  });
});
