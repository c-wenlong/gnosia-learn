import { Readable } from "node:stream";

import { BlobNotFoundError, BlobRangeError } from "@gnosia/blob";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupFailed, logLookupFailure, serveBlobRange } from "./asset-response";
import { NoOwnerError } from "./owner";

/** The store, faked: ten bytes `0123456789`, sliced the way `fs` slices them. */
const { openBlob } = vi.hoisted(() => ({ openBlob: vi.fn() }));
vi.mock("@/lib/asset-files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-files")>()),
  openBlob,
}));

const BODY = "0123456789";

/**
 * The asset routes' answer to a lookup that threw. What is held here is the
 * log line: the failure's code, never a driver error's message, which is the
 * failed SQL with its bind parameters (the asset id, the owner scope).
 */
describe("lookupFailed", () => {
  afterEach(() => vi.restoreAllMocks());

  /** What drizzle throws: the SQL and its parameters as the message, the driver's error as the cause. */
  const driverFailure = () =>
    new Error("Failed query: select * from asset where id = ? params: video:secret-asset,owner-7", {
      cause: Object.assign(new Error("unable to open database file"), { code: "SQLITE_CANTOPEN" }),
    });

  it("answers 503 catalog-unreachable and logs the code alone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = lookupFailed("asset file", driverFailure());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("catalog-unreachable");
    const line = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(line).toContain("asset file");
    expect(line).toContain("SQLITE_CANTOPEN");
    expect(line).not.toContain("secret-asset");
    expect(line).not.toContain("Failed query");
  });

  it("answers a request with no owner as a 401 and logs nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(lookupFailed("asset file", new NoOwnerError()).status).toBe(401);
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs the same line for the status route, which answers its own body", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logLookupFailure("asset status", driverFailure());
    expect(warn).toHaveBeenCalledWith("asset status: catalog unreachable (SQLITE_CANTOPEN)");
  });
});

/**
 * The ranged responder the file and cover routes share. The store is faked and
 * the Range parsing is real, so a helper that stops parsing, or mislabels a
 * slice, fails here.
 */
describe("serveBlobRange", () => {
  const headers = { "Content-Type": "image/webp", ETag: '"abc"', "Accept-Ranges": "bytes" };

  beforeEach(() => {
    openBlob.mockReset();
    openBlob.mockImplementation(async (_key: string, range?: { start: number; end: number }) => {
      const start = range?.start ?? 0;
      const end = range?.end ?? BODY.length - 1;
      return { body: Readable.from([Buffer.from(BODY.slice(start, end + 1))]), size: BODY.length, start, end };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const serve = (range: string | null) => serveBlobRange("owner/key.webp", BODY.length, headers, range);

  it("sends the whole object as a 200 when no Range was asked", async () => {
    const response = await serve(null);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(BODY);
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(openBlob).toHaveBeenCalledWith("owner/key.webp");
  });

  it("keeps the caller's headers on every answer", async () => {
    const response = await serve("bytes=2-4");
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("ETag")).toBe('"abc"');
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("answers a valid range as a 206 with the slice", async () => {
    const response = await serve("bytes=2-4");
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("234");
    expect(response.headers.get("Content-Range")).toBe("bytes 2-4/10");
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(openBlob).toHaveBeenCalledWith("owner/key.webp", { start: 2, end: 4 });
  });

  it("clamps an end past the last byte to the last byte", async () => {
    const response = await serve("bytes=7-99");
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("789");
    expect(response.headers.get("Content-Range")).toBe("bytes 7-9/10");
  });

  it("answers an open-ended range (bytes=N-) from N to the end", async () => {
    const response = await serve("bytes=6-");
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("6789");
    expect(response.headers.get("Content-Range")).toBe("bytes 6-9/10");
    expect(response.headers.get("Content-Length")).toBe("4");
  });

  it("answers a suffix range (bytes=-N) with the last N bytes", async () => {
    const response = await serve("bytes=-3");
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("789");
    expect(response.headers.get("Content-Range")).toBe("bytes 7-9/10");
  });

  it("answers a range past the end as a 416 with Content-Range: bytes */size, reading nothing", async () => {
    const response = await serve("bytes=10-20");
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
    expect(response.headers.get("ETag")).toBe('"abc"');
    expect(await response.text()).toBe("");
    expect(openBlob).not.toHaveBeenCalled();
  });

  it("answers an empty suffix (bytes=-0) as a 416", async () => {
    const response = await serve("bytes=-0");
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
  });

  it("ignores a malformed Range and sends the whole object", async () => {
    for (const bad of ["garbage", "bytes=a-b", "items=0-4", "bytes=", "bytes=-"]) {
      openBlob.mockClear();
      const response = await serve(bad);
      expect(response.status, bad).toBe(200);
      expect(await response.text(), bad).toBe(BODY);
      expect(openBlob).toHaveBeenCalledWith("owner/key.webp");
    }
  });

  it("ignores a multi-range header and sends the whole object", async () => {
    const response = await serve("bytes=0-1,4-5");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(BODY);
    expect(response.headers.get("Content-Range")).toBeNull();
  });

  it("answers a range the store itself refuses as a 416", async () => {
    openBlob.mockRejectedValueOnce(new BlobRangeError("past the end"));
    const response = await serve("bytes=2-4");
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
  });

  it("answers any other store failure as the blob store's problem", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    openBlob.mockRejectedValueOnce(new BlobNotFoundError("owner/key.webp"));
    const lost = await serve(null);
    expect(lost.status).toBe(404);
    expect((await lost.json()).code).toBe("not-uploaded");

    openBlob.mockRejectedValueOnce(new Error("disk on fire"));
    const down = await serve("bytes=0-1");
    expect(down.status).toBe(503);
    expect((await down.json()).code).toBe("blob-store-unavailable");
  });
});
