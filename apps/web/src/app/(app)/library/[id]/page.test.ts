import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * `/library/[id]`'s tab title, which says what the body says: an asset the
 * catalog does not hold is "not found", and one it could not be asked about
 * is not.
 */
const loadAssetDetail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/asset-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-library")>()),
  loadAssetDetail,
  // The page asks these alongside the detail even on its not-found paths.
  loadFavorite: vi.fn(async () => null),
  loadLastWatched: vi.fn(async () => null),
  loadPlayback: vi.fn(async () => null),
}));

vi.mock("@/lib/learner-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learner-store")>()),
  loadKnowledgeBase: vi.fn(async () => ({ kb: { concepts: [] }, reachable: true })),
}));

const { default: AssetPage, generateMetadata } = await import("./page");

const title = async (id: string) =>
  ((await generateMetadata({ params: Promise.resolve({ id: encodeURIComponent(id) }) })) as { title: string }).title;

const render = async (id: string) =>
  renderToStaticMarkup(
    await AssetPage({ params: Promise.resolve({ id: encodeURIComponent(id) }), searchParams: Promise.resolve({}) }),
  );

describe("the asset page's title", () => {
  it("says the asset was not found when the catalog answered without it", async () => {
    loadAssetDetail.mockResolvedValue({ asset: null, reachable: true });
    expect(await title("note:gone")).toBe("Asset not found");
  });

  it("does not say not found when the catalog did not answer", async () => {
    loadAssetDetail.mockResolvedValue({ asset: null, reachable: false });
    expect(await title("note:anything")).toBe("Library");
    expect(loadAssetDetail).toHaveBeenLastCalledWith("note:anything");
  });

  it("names the tab after the asset and says what kind it is when one is found", async () => {
    loadAssetDetail.mockResolvedValue({ asset: { id: "note:x", kind: "note", title: "The TLB" }, reachable: true });
    await expect(generateMetadata({ params: Promise.resolve({ id: encodeURIComponent("note:x") }) })).resolves.toEqual({
      title: "The TLB",
      description: "Note in the Hermes library.",
    });
  });

  it("hands a malformed percent escape to the catalog rather than throwing on it", async () => {
    // "%E0%A4%A" is a truncated UTF-8 sequence; decodeAssetId gives it back as
    // it came (library.test.ts), and the row lookup takes it as the id it is.
    loadAssetDetail.mockResolvedValue({ asset: null, reachable: true });
    await expect(generateMetadata({ params: Promise.resolve({ id: "%E0%A4%A" }) })).resolves.toBeDefined();
    expect(loadAssetDetail).toHaveBeenLastCalledWith("%E0%A4%A");
  });
});

describe("the asset page's body", () => {
  it("is a 404 for an asset a reachable catalog does not hold", async () => {
    loadAssetDetail.mockResolvedValue({ asset: null, reachable: true });
    await expect(render("note:gone")).rejects.toMatchObject({ digest: expect.stringMatching(/;404$/) });
  });

  it("says the catalog is unreachable rather than calling the asset missing", async () => {
    loadAssetDetail.mockResolvedValue({ asset: null, reachable: false });
    const html = await render("note:anything");
    expect(html).toContain("The catalog is unreachable");
    expect(html).toContain("npm run catalog -- status");
  });
});
