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
}));

const { generateMetadata } = await import("./page");

const title = async (id: string) =>
  ((await generateMetadata({ params: Promise.resolve({ id: encodeURIComponent(id) }) })) as { title: string }).title;

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
});
