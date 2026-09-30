import { afterEach, describe, expect, it, vi } from "vitest";

import { orderCredentials, type ProviderCredential } from "@/lib/agent/providers";
import { cachedModelList, clearModelListCache, MODEL_LIST_TTL_MS } from "@/lib/tutor-models/model-list";

/**
 * The model list cache (docs/TUTOR-MODELS.md, T2): per owner and provider,
 * a few minutes, missed under a different key or base URL, and never caching
 * a failure. `fetch` is stubbed; no test calls a provider.
 */

afterEach(() => {
  clearModelListCache();
  vi.unstubAllGlobals();
});

const KEY_A = "nvapi-FirstKeyExample0123456789abcdef";
const KEY_B = "nvapi-SecondKeyExample0123456789abcdef";

function nvidia(key: string, env: Record<string, string> = {}): ProviderCredential {
  return orderCredentials({ nvidia: key }, env)[0]!;
}

function listing(ids: string[]) {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 });
}

describe("cachedModelList", () => {
  it("fetches once per owner and provider within the TTL, then again after it", async () => {
    let clock = 1_000;
    const now = () => clock;
    const fetchMock = vi.fn().mockImplementation(async () => listing(["a/one"]));
    vi.stubGlobal("fetch", fetchMock);

    expect(await cachedModelList("local", nvidia(KEY_A), now)).toEqual({ ok: true, models: [{ id: "a/one" }], cached: false });
    expect(await cachedModelList("local", nvidia(KEY_A), now)).toMatchObject({ ok: true, cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Another owner has a list of their own.
    expect(await cachedModelList("owner-b", nvidia(KEY_A), now)).toMatchObject({ cached: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    clock += MODEL_LIST_TTL_MS;
    expect(await cachedModelList("local", nvidia(KEY_A), now)).toMatchObject({ cached: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("misses when the key or the base URL changed, so a replaced key shows its own account's list", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => listing(["a/one"]));
    vi.stubGlobal("fetch", fetchMock);
    await cachedModelList("local", nvidia(KEY_A));
    expect(await cachedModelList("local", nvidia(KEY_B))).toMatchObject({ cached: false });
    expect(await cachedModelList("local", nvidia(KEY_B, { NVIDIA_BASE_URL: "http://127.0.0.1:9/v1" }))).toMatchObject({ cached: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not cache a failure, and hands back its message redacted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(`bad key ${KEY_A}`, { status: 401 }))
      .mockResolvedValueOnce(listing(["a/one"]));
    vi.stubGlobal("fetch", fetchMock);
    const first = await cachedModelList("local", nvidia(KEY_A));
    expect(first).toEqual({ ok: false, status: 401, message: "bad key [redacted]", cached: false });
    expect(await cachedModelList("local", nvidia(KEY_A))).toMatchObject({ ok: true, cached: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
