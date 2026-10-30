import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSET_NAME_MAX } from "@gnosia/schema/shared";

import { checkAssetName, markWatched, renameAsset, setFavorite } from "./asset-actions";

/**
 * The library's three client writes, against a stubbed `fetch`: what each
 * sends, and what each answers for a stored write, a refusal the route
 * explains, a bare error status, and no answer at all.
 */
const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sent = () => {
  const [path, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { path, method: init.method, body: JSON.parse(String(init.body)) };
};

describe("setFavorite", () => {
  it("posts the star and answers ok", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    expect(await setFavorite("note:a", true)).toEqual({ ok: true, value: null });
    expect(sent()).toEqual({ path: "/api/learner/favorite", method: "POST", body: { assetId: "note:a", favorite: true } });
  });

  it("answers the route's own words for a refusal, a status for a bare error, and says when nothing answered", async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { ok: false, error: "Unknown asset." }));
    expect(await setFavorite("x", false)).toEqual({ ok: false, message: "Unknown asset." });
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 503 }));
    expect(await setFavorite("x", false)).toEqual({ ok: false, message: "Not saved (HTTP 503)." });
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await setFavorite("x", false)).toEqual({ ok: false, message: "Not saved: the server could not be reached." });
  });

  it("treats a 200 that says ok: false as not stored", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: false, error: "Not now." }));
    expect(await setFavorite("x", true)).toEqual({ ok: false, message: "Not now." });
  });
});

describe("markWatched", () => {
  it("posts the asset id to the watched route", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    expect((await markWatched("video:v")).ok).toBe(true);
    expect(sent()).toEqual({ path: "/api/learner/watched", method: "POST", body: { assetId: "video:v" } });
  });
});

describe("renameAsset", () => {
  it("answers what the route stored", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, result: { title: "The TLB", name: "TLB notes" } }));
    expect(await renameAsset("note:tlb", "TLB notes")).toEqual({ ok: true, value: { title: "The TLB", name: "TLB notes" } });
    expect(sent().body).toEqual({ assetId: "note:tlb", name: "TLB notes" });
  });

  it("refuses an answer with no result", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    expect((await renameAsset("note:tlb", null)).ok).toBe(false);
  });
});

describe("checkAssetName", () => {
  it("cleans a name, takes an empty one as none, and refuses one past the limit before sending", () => {
    expect(checkAssetName("  TLB  notes ")).toEqual({ ok: true, value: expect.any(String) });
    expect(checkAssetName("   ")).toEqual({ ok: true, value: null });
    expect(checkAssetName(null)).toEqual({ ok: true, value: null });
    expect(checkAssetName("x".repeat(ASSET_NAME_MAX + 1))).toEqual({ ok: false, message: `At most ${ASSET_NAME_MAX} characters.` });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
