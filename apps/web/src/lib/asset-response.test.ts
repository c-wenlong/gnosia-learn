import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupFailed, logLookupFailure } from "./asset-response";
import { NoOwnerError } from "./owner";

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
