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
const SessionFocus = vi.hoisted(() => vi.fn<(props: unknown) => string>(() => "the check"));
vi.mock("@/components/session/SessionFocus", () => ({ SessionFocus }));

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
    SessionFocus.mockClear();
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

  it("renders the check with the module's props when the read is ready", async () => {
    loadWeekCheck.mockResolvedValue({ state: "ok", plan: { modelAvailable: true }, reason: null });
    const html = await render({ slug: "cp4284", module: "m1-llm-foundations-recap" });
    expect(html).toContain("the check");
    expect(SessionFocus).toHaveBeenCalledTimes(1);
    expect(SessionFocus.mock.calls[0]?.[0]).toMatchObject({
      slug: "cp4284-m1",
      mode: "module",
      modelAvailable: true,
      nothingToAsk: false,
      weekCheck: { moduleId: "cp4284-m1", moduleHref: "/courses/cp4284/m1-llm-foundations-recap", reason: null },
    });
  });

  it("tells the check there is nothing to ask when the read gives a reason", async () => {
    loadWeekCheck.mockResolvedValue({ state: "ok", plan: { modelAvailable: false }, reason: "Nothing to ask" });
    await render({ slug: "cp4284", module: "m1-llm-foundations-recap" });
    expect(SessionFocus.mock.calls[0]?.[0]).toMatchObject({ nothingToAsk: true, weekCheck: { reason: "Nothing to ask" } });
  });

  it("is a 404 for a module or a course nobody has", async () => {
    await expect(render({ slug: "cp4284", module: "nope" })).rejects.toMatchObject({
      digest: expect.stringMatching(/;404$/),
    });
    await expect(render({ slug: "nope", module: "m1-llm-foundations-recap" })).rejects.toMatchObject({
      digest: expect.stringMatching(/;404$/),
    });
  });

  it("names itself after the course and module outside an outage", async () => {
    await expect(
      page.generateMetadata({ params: Promise.resolve({ slug: "cp4284", module: "m1-llm-foundations-recap" }) }),
    ).resolves.toEqual({ title: "CP4284 · Module check · LLM Foundations Recap" });
  });
});
