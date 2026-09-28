import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The tenancy seam (`@/lib/owner`): who a request reads and writes as.
 *
 * `isSignedIn` is the session check the proxy and the `(app)` layout already
 * make; it is stubbed here so the seam can be asked both ways without a
 * request scope. What is under test is what the seam does with the answer:
 * a signed-in request is `local`, the one owner there is, and a request
 * without a session is refused rather than given `local` by default.
 */

const signedIn = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => signedIn.value,
}));

const { COMMONS_OWNER, currentOwner, currentScope, NoOwnerError, readableOwners } = await import("@/lib/owner");
const { handler } = await import("@/lib/learner-api");

beforeEach(() => {
  signedIn.value = true;
});

describe("currentOwner", () => {
  it("is local for the signed-in owner, which is what every row already holds", async () => {
    await expect(currentOwner()).resolves.toBe("local");
    await expect(currentScope()).resolves.toEqual({ owner: "local", readable: ["local", "commons"] });
  });

  it("refuses a request with no session instead of defaulting to local", async () => {
    signedIn.value = false;
    await expect(currentOwner()).rejects.toBeInstanceOf(NoOwnerError);
    await expect(currentScope()).rejects.toBeInstanceOf(NoOwnerError);
  });
});

describe("readableOwners", () => {
  it("is the owner and the commons", () => {
    expect(COMMONS_OWNER).toBe("commons");
    expect(readableOwners("local")).toEqual(["local", "commons"]);
    expect(readableOwners("someone-else")).toEqual(["someone-else", "commons"]);
  });

  it("names the commons once for the commons itself", () => {
    expect(readableOwners(COMMONS_OWNER)).toEqual(["commons"]);
  });
});

describe("a learner write with no owner", () => {
  it("is a 401 before the body is read or the database is asked", async () => {
    signedIn.value = false;
    const write = vi.fn(async () => "written");
    const parse = vi.fn(() => ({}));
    const post = handler("owner-test", parse, write);
    const response = await post(
      new Request("http://localhost:3000/api/learner/x", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "localhost:3000", origin: "http://localhost:3000" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED", signIn: "/sign-in" });
    expect(parse).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
