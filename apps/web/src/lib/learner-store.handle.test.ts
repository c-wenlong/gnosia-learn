import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The process holds one catalog handle. The first page after a start asks
 * for it from several reads at once (the layout's snapshot, the page's own
 * reads, the content seam's ownership read); each used to pass the "none
 * yet" check before the first open finished, and every handle but the last
 * stayed open for the life of the process.
 */

const connect = vi.hoisted(() => vi.fn());
vi.mock("@gnosia/catalog/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gnosia/catalog/state")>()),
  connect,
}));

beforeEach(() => {
  vi.resetModules();
  connect.mockReset();
});

describe("catalogDatabase", () => {
  it("opens one handle for concurrent first calls, and hands every caller that one", async () => {
    connect.mockImplementation(() => ({ db: { opened: connect.mock.calls.length }, close: async () => undefined }));
    const { catalogDatabase } = await import("@/lib/learner-store");
    const handles = await Promise.all(Array.from({ length: 5 }, () => catalogDatabase()));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(new Set(handles).size).toBe(1);
    expect(await catalogDatabase()).toBe(handles[0]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("tries again on the next call after an open that failed, rather than keeping the failure", async () => {
    connect.mockImplementationOnce(() => {
      throw new Error("unable to open database file");
    });
    connect.mockImplementation(() => ({ db: { opened: true }, close: async () => undefined }));
    const { catalogDatabase } = await import("@/lib/learner-store");
    const first = await Promise.allSettled([catalogDatabase(), catalogDatabase()]);
    expect(first.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(await catalogDatabase()).toEqual({ opened: true });
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
