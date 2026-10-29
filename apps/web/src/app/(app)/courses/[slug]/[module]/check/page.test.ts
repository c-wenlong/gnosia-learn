import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The week check page in an outage. A catalog that does not answer refuses
 * the course read before the check's own, so the page has to catch that read
 * to show its own "cannot start" rather than the error boundary.
 */
const outage = vi.hoisted(() => ({ on: false }));
vi.mock("@/data/source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/source")>();
  const { fileContentSource } = await import("@/test/content-files");
  return {
    ...actual,
    contentSource: () => {
      const source = fileContentSource();
      if (!outage.on) return source;
      return {
        ...source,
        courses: async () => {
          throw new actual.ContentUnavailableError("unreachable", null, "The catalog database could not be read.", {
            cause: Object.assign(new Error("unable to open database file"), { code: "SQLITE_CANTOPEN" }),
          });
        },
      };
    },
  };
});

const loadWeekCheck = vi.hoisted(() => vi.fn());
vi.mock("@/lib/week-check-page", () => ({ loadWeekCheck }));
vi.mock("@/components/session/SessionFocus", () => ({ SessionFocus: () => "the check" }));

type Params = { slug: string; module: string };

let page: typeof import("./page");

async function render(params: Params): Promise<string> {
  return renderToStaticMarkup(await page.default({ params: Promise.resolve(params) }));
}

describe("the week check page", () => {
  // The page's import graph is large, and on a loaded machine its first
  // import alone can outlast a test's timeout.
  beforeAll(async () => {
    page = await import("./page");
  }, 120_000);

  beforeEach(() => {
    outage.on = false;
    loadWeekCheck.mockReset();
  });

  it("says it cannot start when the catalog does not answer, linking back to the module", async () => {
    outage.on = true;
    const html = await render({ slug: "cp4284", module: "m1-llm-foundations-recap" });
    expect(html).toContain("The module check cannot start");
    expect(html).toContain('href="/courses/cp4284/m1-llm-foundations-recap"');
    expect(html).toContain("npm run catalog -- status");
    expect(html).not.toContain("Postgres");
    expect(loadWeekCheck).not.toHaveBeenCalled();
  });

  it("keeps a plain title in an outage rather than throwing", async () => {
    outage.on = true;
    await expect(page.generateMetadata({ params: Promise.resolve({ slug: "cp4284", module: "x" }) })).resolves.toEqual({
      title: "Module check",
    });
  });

  it("says it cannot start when the knowledge base alone is unreadable", async () => {
    loadWeekCheck.mockResolvedValue({ state: "unreachable" });
    const html = await render({ slug: "cp4284", module: "m1-llm-foundations-recap" });
    expect(html).toContain("The module check cannot start");
  });
});
